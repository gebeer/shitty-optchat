// The compactor's model call (gist §4.2, §4.3, SPEC §7): one `claude -p` per node, no tools,
// the view as cached context (layout A), size retries in the same process.
import { readFileSync } from "node:fs";
import { type Block, baseArgs, spawnClaude } from "./claude.ts";
import type { Job, Summarize } from "./compactor.ts";
import { CALL_TIMEOUT, COMPACT_EFFORT, COMPACT_MODEL, MARKS, NODE, TRIES } from "./config.ts";
import { bytes, msgText } from "./tree.ts";
import { cutBlocks, flat } from "./view.ts";

const PROMPTS = new URL("../prompts/", import.meta.url).pathname;
export const COMPACT_FILE = `${PROMPTS}compact.txt`;
export const SCALE = readFileSync(`${PROMPTS}scale.txt`, "utf8"); // a hand-written line of exactly NODE bytes

export type CallInfo = { job: Job; attempt: number; model: string | undefined; usage: any; ms: number };

const step = (job: Job) =>
  `For scale, this line is exactly ${NODE} bytes:\n${SCALE}\n\n` +
  ("msg" in job
    ? `Compress this message into one line, in at most ${NODE} bytes:\n${msgText(job.msg)}`
    : `Merge these two lines into one, in at most ${NODE} bytes:\n${flat(job.a)}\n${flat(job.b)}`);

// <chat> + the bare view lines cut at the 50k/80k/100k marks, every piece marked (the last one is the tail,
// it ends with </chat>), then the unmarked step. No ids anywhere: the model would copy them (gist §4.2).
export function blocks(job: Job): Block[] {
  const chat = `<chat>\n${job.ctx.map((l) => `${l}\n`).join("")}</chat>`;
  const pieces = cutBlocks(chat, MARKS).map((text): Block => ({ type: "text", text, cache_control: { type: "ephemeral" } }));
  return [...pieces, { type: "text", text: step(job) }];
}

// the line cut to its first NODE bytes, without splitting a UTF-8 character
export const cut = (line: string) => Buffer.from(line).subarray(0, NODE).toString("utf8").replace(/�$/, "");
const retry = (line: string) => `That line is ${bytes(line)} bytes; the limit is ${NODE}. It must end where it is cut here:\n${cut(line)}| ← LIMIT`;

export function makeSummarizer(o: { timeoutMs?: number; onCall?: (c: CallInfo) => void } = {}): Summarize {
  const timeoutMs = o.timeoutMs ?? CALL_TIMEOUT;
  return async (job) => {
    const claude = spawnClaude([...baseArgs(COMPACT_MODEL, COMPACT_EFFORT, COMPACT_FILE, ""), "--safe-mode"], { DISABLE_PROMPT_CACHING: "1" });
    let timedOut = false;
    const timer = setTimeout(() => ((timedOut = true), claude.kill()), timeoutMs); // a hung call must free its slot
    const tries: string[] = [];
    try {
      claude.send(blocks(job));
      for (;;) {
        const t0 = Date.now(), r = await claude.result();
        o.onCall?.({ job, attempt: tries.length + 1, model: claude.model(), usage: r.usage, ms: Date.now() - t0 });
        if (r.is_error) throw new Error(`claude: ${String(r.result ?? r.subtype).slice(0, 300)}`);
        if (r.stop_reason === "refusal") throw new Error("refused");
        const line = String(r.result ?? "").trim();
        if (!line) throw new Error("empty reply");
        tries.push(line);
        if (bytes(line) <= NODE || tries.length >= TRIES) return tries.reduce((a, b) => (bytes(b) < bytes(a) ? b : a)); // the shortest try
        claude.send([{ type: "text", text: retry(line) }]);
      }
    } catch (e) {
      throw timedOut ? new Error(`no result after ${timeoutMs / 1000}s`) : e;
    } finally {
      clearTimeout(timer);
      claude.kill();
    }
  };
}
