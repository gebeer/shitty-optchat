// Logging pass-through for ANTHROPIC_BASE_URL. Logs ONLY payload structure
// (block types, lengths, hashes, cache_control positions), response usage and the
// anthropic-ratelimit-* response headers. No other header is ever logged (no auth, no ids).
// Usage: LOG=file.jsonl PORT=8399 bun dev/wire-proxy.ts
// Two records per request, same id: {phase:"req", ts, path, req:<shape>} on arrival, then
// {phase:"res", tsEnd, status, usage, error, rl, aborted?} when the response ends. If the client
// goes away first (a killed priming call), the upstream request is cancelled too and `aborted` is
// true; `usage` is then what had arrived (message_start carries the input usage).
import { appendFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";

const UP = "https://api.anthropic.com";
const LOG = process.env.LOG ?? "proxy.jsonl";
const SYSDIR = process.env.SYSDIR; // optional: dump system/tool text for stability diffs
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
let n = 0;

const blk = (b: any) => {
  const text = typeof b === "string" ? b : b.text ?? JSON.stringify(b.content ?? b.input ?? b);
  return { type: b.type ?? "str", len: text.length, hash: h(text), cc: b.cache_control ?? undefined,
           head: b.type === "text" ? (text.length < 1500 && !text.includes("@") ? text.slice(0, 400) : text.slice(0, 40)) : undefined };
};

function shape(body: any) {
  const content = (m: any) => (typeof m.content === "string" ? [{ type: "str", len: m.content.length, hash: h(m.content) }] : m.content.map(blk));
  return {
    keys: Object.keys(body),
    model: body.model,
    top_cache_control: body.cache_control,
    system: Array.isArray(body.system) ? body.system.map(blk) : body.system ? [blk({ type: "text", text: body.system })] : [],
    tools: (body.tools ?? []).map((t: any) => ({ name: t.name, len: JSON.stringify(t).length, hash: h(JSON.stringify(t)), cc: t.cache_control })),
    messages: (body.messages ?? []).map((m: any) => ({ role: m.role, blocks: content(m) })),
  };
}

Bun.serve({
  hostname: "127.0.0.1", // loopback only: the proxy forwards the caller's OAuth token upstream
  port: Number(process.env.PORT ?? 8399),
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const id = ++n;
    const raw = await req.arrayBuffer();
    let rec: any = { id, ts: Date.now(), method: req.method, path: url.pathname };
    if (raw.byteLength) {
      try {
        const body = JSON.parse(new TextDecoder().decode(raw));
        rec.req = shape(body);
        if (SYSDIR && body.system) {
          // full body (no headers), long text blocks replaced by len+hash
          const red = JSON.stringify(body, (k, v) => (k === "text" && typeof v === "string" && v.length > 3000 ? `<${v.length} chars ${h(v)}>` : v), 1);
          writeFileSync(`${SYSDIR}/req-${id}.json`, red);
        }
      } catch { rec.req = { nonjson: raw.byteLength }; }
    }
    appendFileSync(LOG, JSON.stringify({ ...rec, phase: "req" }) + "\n");
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.set("accept-encoding", "identity");
    const ac = new AbortController();
    const res = await fetch(UP + url.pathname + url.search, { method: req.method, headers, body: raw.byteLength ? raw : undefined, decompress: true, signal: ac.signal } as any);
    rec.status = res.status;
    // ONLY the anthropic-ratelimit-* response headers are logged (the billing question of SPEC §14), never any other header
    rec.rl = Object.fromEntries([...res.headers].filter(([k]) => k.startsWith("anthropic-ratelimit-")));
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    const done = (aborted?: true) => appendFileSync(LOG, JSON.stringify({ id, phase: "res", tsEnd: Date.now(), status: rec.status, usage: rec.usage, error: rec.error, rl: rec.rl, aborted }) + "\n");
    if (!res.body) { done(); return new Response(null, { status: res.status, headers: out }); }
    // Relay the stream and keep a copy to read the usage from. When the client goes away the upstream request is
    // cancelled too, as it is on a direct connection: a tee() would keep reading to the end and hide what a kill does.
    const reader = res.body.getReader(), chunks: Uint8Array[] = [];
    let ended = false;
    const finish = (aborted?: true) => {
      if (ended) return;
      ended = true;
      const usage: any = {};
      for (const line of Buffer.concat(chunks).toString().split("\n")) {
        if (!line.startsWith("data:") && !line.startsWith("{")) continue;
        try {
          const ev = JSON.parse(line.replace(/^data:\s*/, ""));
          const u = ev.message?.usage ?? ev.usage;
          if (u) Object.assign(usage, Object.fromEntries(Object.entries(u).filter(([, v]) => typeof v === "number" || typeof v === "object")));
          if (ev.type === "error" || ev.error) rec.error = (ev.error?.message ?? "").slice(0, 300);
        } catch {}
      }
      rec.usage = usage;
      done(aborted);
    };
    const body = new ReadableStream({
      async pull(ctrl) {
        try {
          const { value, done: eof } = await reader.read();
          if (eof) { ctrl.close(); finish(); return; }
          chunks.push(value);
          ctrl.enqueue(value);
        } catch (e: any) {
          rec.error ??= String(e?.message ?? e).slice(0, 300);
          ctrl.error(e);
          finish();
        }
      },
      cancel() { ac.abort(); finish(true); },
    });
    return new Response(body, { status: res.status, headers: out });
  },
});
console.log("proxy up");
