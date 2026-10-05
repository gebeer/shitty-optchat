// The running chat: the lock, the memory and the pump, wired together.
import { type Summarize, createPump } from "./compactor.ts";
import { acquireLock, appendMessage, committer, loadChat, newMsg } from "./store.ts";
import { type Kind, type Mem } from "./tree.ts";
import { addMessage } from "./view.ts";
import { COMPACT_OPENROUTER } from "./config.ts";
import { makeOpenrouterSummarizer, openrouterKey } from "./openrouter.ts";
import { type CallInfo, makeSummarizer } from "./summarize.ts";
import { logUsage } from "./usage.ts";

// OpenRouter when configured and a key is found, else `claude -p` (SPEC §7.1); every call's usage is logged
function compactor(dir: string, report?: (m: string) => void): Summarize {
  const onCall = (c: CallInfo) => { const e = logUsage(dir, "compact", c.model, c.usage); if (e) report?.(e); };
  const key = COMPACT_OPENROUTER && openrouterKey();
  if (COMPACT_OPENROUTER && !key) report?.("no OPENROUTER_API_KEY, compacting with claude -p");
  return COMPACT_OPENROUTER && key ? makeOpenrouterSummarizer(key, COMPACT_OPENROUTER, { onCall }) : makeSummarizer({ onCall });
}

export type Chat ={ dir: string; mem: Mem; pump: () => void; log: (kind: Kind, text: string) => void; close: () => void };

// takes the lock (throws if another optchat holds it), loads, starts the pump
export async function openChat(dir: string, o: { summarize?: Summarize; report?: (m: string) => void; jobs?: number; retryMs?: number } = {}) {
  const release = await acquireLock(dir);
  try {
    const { mem, problems } = loadChat(dir);
    const p = createPump({ mem, commit: committer(dir, mem), summarize: o.summarize ?? compactor(dir, o.report), report: o.report, jobs: o.jobs, retryMs: o.retryMs });
    const log = (kind: Kind, text: string) => { // every message is logged and fsynced, then the pump looks for work (gist §7)
      const m = newMsg(mem.root.length, kind, text);
      appendMessage(dir, m);
      addMessage(mem, m);
      p.pump();
    };
    p.pump(); // catch up: the free nodes and whatever the last run left unbuilt
    const chat: Chat = { dir, mem, pump: p.pump, log, close: () => (p.stop(), release()) };
    return { chat, problems };
  } catch (e) {
    release();
    throw e;
  }
}
