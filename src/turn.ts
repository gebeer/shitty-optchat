// The turn (SPEC §5): one `claude -p` per user message, the rendered view as its input, and
// everything it does logged as it happens. The event -> log mapping is a pure function.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Chat } from "./chat.ts";
import { type Block, type Claude, baseArgs, spawnClaude } from "./claude.ts";
import { CAP, MASTER_EFFORT, MASTER_MODEL, MASTER_PERMISSION, MASTER_TOOLS, PRIME_IDLE } from "./config.ts";
import { createPrimer } from "./prime.ts";
import { type Kind, built } from "./tree.ts";
import { allBuilt, cutBlocks, render, settle } from "./view.ts";

const PROMPTS = new URL("../prompts/", import.meta.url).pathname;
const CLI = new URL("./cli.ts", import.meta.url).pathname;

// MASTER + VIEW_DOC + the user's instructions, written once: byte-identical for the life of the process (SPEC §8)
export function writeSystemPrompt(dir: string) {
  const read = (f: string) => readFileSync(`${PROMPTS}${f}`, "utf8");
  const mine = existsSync(`${dir}/instructions.md`) ? readFileSync(`${dir}/instructions.md`, "utf8") : "";
  const path = `${mkdtempSync(`${tmpdir()}/optchat-`)}/system.txt`;
  writeFileSync(path, `${read("master.txt")}\n\n${read("view_doc.txt")}\n\n${mine}`);
  return path;
}
// the MCP server claude starts for zoom and date (SPEC §9); inline JSON, stable for the life of the process
export const mcpConfig = (dir: string) =>
  JSON.stringify({ mcpServers: { optchat: { command: process.execPath, args: [CLI, "mcp"], env: { OPTCHAT_DIR: dir } } } });
// one argv for the master and the priming call, so they can't drift apart (SPEC §6)
export const masterArgs = (system: string, mcp: string) => [
  ...baseArgs(MASTER_MODEL, MASTER_EFFORT, system, MASTER_TOOLS),
  "--mcp-config", mcp, "--permission-mode", MASTER_PERMISSION, "--replay-user-messages",
];

// what a tool result is worth in the log: the head and the tail (gist §7)
export const cap = (s: string) => (s.length <= CAP ? s : `${s.slice(0, CAP / 2)}\n[… ${s.length - CAP} chars cut …]\n${s.slice(-CAP / 2)}`);
const resultText = (c: unknown) => (typeof c === "string" ? c : ((c as any[]) ?? []).map((p) => (p.type === "text" ? p.text : `[${p.type}]`)).join("\n"));
const clip = (s: string, n = 160) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n)}…` : one; };

export type Out = { text(s: string): void; thinking(s: string): void; info(s: string): void };
export type Sent = { text: string; taken: boolean };

// SPEC §5.3. Thoughts are shown, never logged (gist §2). Today the stream carries no thinking text, only an
// estimate of its size (SPEC §14 T1): the text is shown if it ever arrives, else one dim line per thought.
export function createMapper(o: { log: (kind: Kind, text: string) => void; out: Out; sent: Sent[] }) {
  let replays = 0, thought = 0;
  return (ev: any) => {
    if (ev.type === "system" && ev.subtype === "init") {
      if (!ev.mcp_servers?.some((s: any) => s.name === "optchat" && s.status === "connected")) o.out.info("warning: the optchat MCP server is not connected, zoom and date are unavailable");
    } else if (ev.type === "stream_event") {
      const d = ev.event?.type === "content_block_delta" ? ev.event.delta : null;
      if (d?.type === "text_delta") o.out.text(d.text);
      else if (d?.type === "thinking_delta") {
        if (d.thinking) o.out.thinking(d.thinking);
        if (typeof d.estimated_tokens === "number") thought = d.estimated_tokens;
      }
    } else if (ev.type === "assistant") {
      for (const b of ev.message.content) {
        if (b.type === "thinking") { if (!b.thinking) o.out.info(`thought for ~${thought} tokens`); thought = 0; } // never logged
        else if (b.type === "text" && b.text.trim()) o.log("talk", b.text);
        else if (b.type === "tool_use") { o.log("tool", `${b.name} ${JSON.stringify(b.input)}`); o.out.info(`→ ${clip(`${b.name} ${JSON.stringify(b.input)}`)}`); }
      }
    } else if (ev.type === "user" && ev.isReplay) {
      if (replays++ === 0) return; // the turn's own opening message, already logged
      const s = o.sent.find((s) => !s.taken); // a message the user sent mid-run, taken by claude
      if (s) { s.taken = true; o.log("user", s.text); }
    } else if (ev.type === "user") {
      for (const b of ev.message.content) if (b.type === "tool_result") { const t = resultText(b.content); o.log("echo", cap(t)); o.out.info(`← ${clip(t)}`); }
    }
  };
}

const n = (x: number) => (x ?? 0).toLocaleString("en-US");
const usageLine = (r: any) => `(${n(r.usage?.input_tokens)} in · ${n(r.usage?.cache_read_input_tokens)} read · ${n(r.usage?.cache_creation_input_tokens)} write · ${n(r.usage?.output_tokens)} out · ${((r.duration_ms ?? 0) / 1000).toFixed(1)}s)`;

// `prime`: SPEC §6, on by default; `false` runs the turns without it, `idleMs` is the debounce of the background priming.
// `onIdle`: called each time a turn loop ends (the REPL commits the data dir and shows the prompt there)
export function createSession(o: { chat: Chat; out: Out; system: string; mcp: string; tap?: string; prime?: { idleMs: number } | false; onIdle?: () => void }) {
  const { chat, out } = o, args = masterArgs(o.system, o.mcp), queue: string[] = [];
  const primer = o.prime === false ? null : createPrimer({ args, report: (m) => out.info(m) }), idleMs = (o.prime || { idleMs: PRIME_IDLE }).idleMs;
  let call: Claude | null = null, sent: Sent[] = [], cancelled = false, stopped = false, abort: AbortController | null = null, loop: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // SPEC §6: the view changed (fit() calls this after every change, and a turn calls it when it ends); once it has stayed quiet
  // and nothing runs, prime it in the background. Nothing is primed at startup: a REPL opened only to look costs nothing.
  const idle = () => {
    clearTimeout(timer);
    if (!primer) return;
    timer = setTimeout(() => { if (!stopped && !loop && allBuilt(chat.mem)) void primer.prime(render(chat.mem)); }, idleMs);
    timer.unref();
  };
  chat.mem.waiters.add(idle); // stays until stop()
  const cancel = () => { cancelled = true; abort?.abort(); call?.kill(); };

  async function ask(view: string[], text: string) {
    sent = [];
    const claude = (call = spawnClaude(args, {}, o.tap));
    const map = createMapper({ log: chat.log, out, sent });
    let result: any;
    try {
      claude.send([...view.map((t): Block => ({ type: "text", text: t })), { type: "text", text }]); // the view, then the message: no marks (SPEC §5.1)
      for (let ev; (ev = await claude.next()); ) {
        map(ev);
        if (ev.type === "result") { result = ev; break; } // the first one ends the turn; killing stops a follow-up turn in the same session
      }
    } finally {
      claude.kill();
      call = null;
    }
    const left = sent.filter((s) => !s.taken).map((s) => s.text);
    if (!result) { // cancelled, or claude died: nothing is lost, the unanswered messages are logged as they are
      left.forEach((t) => chat.log("user", t));
      if (!cancelled) out.info(`claude ended without a result (code ${await claude.exited}): ${clip((await claude.stderr()) || "no error output", 300)}`);
      return;
    }
    if (result.is_error) out.info(`error: ${clip(String(result.result), 300)}`);
    if (result.stop_reason === "refusal") out.info("the model refused this request (stop_reason: refusal)");
    out.info(usageLine(result));
    queue.unshift(...left); // not taken in time: a fresh call, with a new view
  }

  async function turn() {
    try {
      while (queue.length) {
        const ac = (abort = new AbortController());
        if (stopped) ac.abort(); // stop() came while the last call was ending: no new call, the queued messages stay in the log
        cancelled = false;
        const waiting = chat.mem.view.filter((p) => !built(chat.mem, p.l, p.i)).length;
        if (waiting) out.info(`waiting for ${waiting} summaries…`);
        let view: string | null = null; // the view as it is BEFORE the new messages are logged
        if (await settle(chat.mem, ac.signal)) {
          view = render(chat.mem);
          // SPEC §6: into the cache first (usually a no-op, the background priming did it); a cancel ends the wait, the priming goes on
          if (primer) await Promise.race([primer.prime(view), new Promise((r) => ac.signal.addEventListener("abort", r, { once: true }))]);
        }
        if (!view || ac.signal.aborted) { // the user cancelled: the messages stay in the log, unanswered
          queue.splice(0).forEach((t) => chat.log("user", t));
          break;
        }
        const texts = queue.splice(0);
        texts.forEach((t) => chat.log("user", t));
        await ask(cutBlocks(view), texts.join("\n\n")); // the blocks that were primed
      }
    } catch (e: any) {
      out.info(`error: ${e.message}`);
    } finally {
      abort = null;
    }
  }

  return {
    // a message while a call runs goes to its stdin (claude takes it at the next tool boundary); otherwise it starts a turn
    input(text: string) {
      if (stopped) return;
      if (call) { sent.push({ text, taken: false }); call.send([{ type: "text", text }]); return; }
      queue.push(text);
      loop ??= turn().finally(() => ((loop = null), idle(), o.onIdle?.()));
    },
    cancel,
    // the end of the session (the REPL exiting): cancel what runs, take no more input, drop the background priming
    stop() { stopped = true; cancel(); clearTimeout(timer); chat.mem.waiters.delete(idle); primer?.stop(); },
    whenIdle: () => loop ?? Promise.resolve(),
  };
}
