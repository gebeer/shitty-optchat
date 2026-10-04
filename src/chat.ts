// The running chat: the lock, the memory and the pump, wired together.
import { type Summarize, createPump } from "./compactor.ts";
import { acquireLock, appendMessage, committer, loadChat, newMsg } from "./store.ts";
import { type Kind, type Mem } from "./tree.ts";
import { addMessage } from "./view.ts";
import { makeSummarizer } from "./summarize.ts";

export type Chat = { dir: string; mem: Mem; pump: () => void; log: (kind: Kind, text: string) => void; close: () => void };

// takes the lock (throws if another optchat holds it), loads, starts the pump
export async function openChat(dir: string, o: { summarize?: Summarize; report?: (m: string) => void; jobs?: number; retryMs?: number } = {}) {
  const release = await acquireLock(dir);
  try {
    const { mem, problems } = loadChat(dir);
    const p = createPump({ mem, commit: committer(dir, mem), summarize: o.summarize ?? makeSummarizer(), report: o.report, jobs: o.jobs, retryMs: o.retryMs });
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
