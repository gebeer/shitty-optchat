// The compactor on OpenRouter instead of `claude -p` (SPEC §7.1), and its API key.
// Key lookup order: OPENROUTER_API_KEY in the repo's .env (read by path: Bun's own .env loading
// depends on the cwd), then the process environment, else undefined (the caller falls back
// or skips). The key never goes into config.ts, a log, a report or git (.env is gitignored).
import { existsSync, readFileSync } from "node:fs";
import type { Block } from "./claude.ts";
import type { Summarize } from "./compactor.ts";
import { CALL_TIMEOUT, type COMPACT_OPENROUTER } from "./config.ts";
import { type CallInfo, type Reply, blocks, fit } from "./summarize.ts";

const REPO_ENV = new URL("../.env", import.meta.url).pathname;

export function openrouterKey(envFile = REPO_ENV, env: Record<string, string | undefined> = process.env): string | undefined {
  if (existsSync(envFile))
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/);
      const v = m?.[1].replace(/^(["'])(.*)\1$/, "$2");
      if (v) return v;
    }
  return env.OPENROUTER_API_KEY || undefined;
}

// The prompt pair written for DeepSeek V4.1 (docs/probes/compact-v41-prompt-v2.1.md): the system file, and a
// reminder after the step. `claude -p` keeps compact.txt.
const PROMPTS = new URL("../prompts/", import.meta.url).pathname;
const SYSTEM = readFileSync(`${PROMPTS}compact-v2.1.txt`, "utf8");
const REMINDER = readFileSync(`${PROMPTS}compact-v2.1-step.txt`, "utf8").trim();

// OpenRouter usage in the stream's field names, which usage.ts sums; cost (USD) and provider kept as well.
// `us` holds every request of one try: a refetched empty reply is billed too.
const usage = (us: any[], provider: string | undefined) => {
  const n = (f: (u: any) => number | undefined) => us.reduce((s, u) => s + (f(u) ?? 0), 0);
  const read = n((u) => u.prompt_tokens_details?.cached_tokens), write = n((u) => u.prompt_tokens_details?.cache_write_tokens);
  return { input_tokens: n((u) => u.prompt_tokens) - read - write, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: n((u) => u.completion_tokens), cost: n((u) => u.cost), provider };
};

// blocks() and fit() as for `claude -p`, one chat-completions request per try, the conversation kept here
export function makeOpenrouterSummarizer(key: string, model: NonNullable<typeof COMPACT_OPENROUTER>, o: { timeoutMs?: number; onCall?: (c: CallInfo) => void } = {}): Summarize {
  const timeoutMs = o.timeoutMs ?? CALL_TIMEOUT;
  return async (job) => {
    const signal = AbortSignal.timeout(timeoutMs); // the whole job, like the `claude -p` timer
    const messages: any[] = [{ role: "system", content: SYSTEM }];
    const ask = async (b: Block[]): Promise<Reply> => {
      messages.push({ role: "user", content: b });
      const us: any[] = [];
      for (let again = true; ; again = false) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "optchat" },
          body: JSON.stringify({ ...model, messages, usage: { include: true }, max_tokens: 16_000 }),
        });
        const j: any = await res.json().catch(() => ({}));
        if (j.usage) us.push(j.usage);
        if (!res.ok || j.error) return { line: "", usage: usage(us, j.provider), model: j.model, fail: `openrouter: ${res.status} ${JSON.stringify(j.error ?? j).slice(0, 300)}` };
        const line = String(j.choices?.[0]?.message?.content ?? "").trim();
        if (!line && again) continue; // a reply of reasoning only (seen once mid-retry on Novita) is asked once more
        messages.push({ role: "assistant", content: line });
        return { line, usage: usage(us, j.provider), model: j.model };
      }
    };
    const first = blocks(job), step = first.pop()!;
    try {
      return await fit(job, [...first, { ...step, text: `${step.text}\n\n${REMINDER}` }], ask, o.onCall);
    } catch (e) {
      throw signal.aborted ? new Error(`no result after ${timeoutMs / 1000}s`) : e;
    }
  };
}
