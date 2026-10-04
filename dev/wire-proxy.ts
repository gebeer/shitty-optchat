// Logging pass-through for ANTHROPIC_BASE_URL. Logs ONLY payload structure
// (block types, lengths, hashes, cache_control positions) and response usage.
// Never logs request/response headers. Usage: LOG=file.jsonl PORT=8399 bun proxy.ts
// Two records per request, same id: {phase:"req", ts, path, req:<shape>} on arrival, then
// {phase:"res", tsEnd, status, usage, error} when the response ends (late, or never, if the client died).
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
    const res = await fetch(UP + url.pathname + url.search, { method: req.method, headers, body: raw.byteLength ? raw : undefined, decompress: true } as any);
    rec.status = res.status;
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    const done = () => appendFileSync(LOG, JSON.stringify({ id, phase: "res", tsEnd: Date.now(), status: rec.status, usage: rec.usage, error: rec.error }) + "\n");
    if (!res.body) { done(); return new Response(null, { status: res.status, headers: out }); }
    const [a, b] = res.body.tee();
    (async () => {
      const txt = await new Response(b).text();
      const usage: any = {};
      for (const line of txt.split("\n")) {
        if (!line.startsWith("data:") && !line.startsWith("{")) continue;
        try {
          const ev = JSON.parse(line.replace(/^data:\s*/, ""));
          const u = ev.message?.usage ?? ev.usage;
          if (u) Object.assign(usage, Object.fromEntries(Object.entries(u).filter(([, v]) => typeof v === "number" || typeof v === "object")));
          if (ev.type === "error" || ev.error) rec.error = (ev.error?.message ?? "").slice(0, 300);
        } catch {}
      }
      rec.usage = usage;
      done();
    })();
    return new Response(a, { status: res.status, headers: out });
  },
});
console.log("proxy up");
