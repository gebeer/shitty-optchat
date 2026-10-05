// The pump (gist §4.1): starts every node that is ready and whose whole context is summarized,
// up to JOBS at once. Free nodes need no model call. `summarize` is injected: the real one is
// a `claude -p` call, selfcheck uses a fake.
import { JOBS, RETRY } from "./config.ts";
import { type Coord, type Mem, type Msg, type Node, built, bytes, freeText, getNode, key, label, ready } from "./tree.ts";
import { context, first } from "./view.ts";

export type Job = { l: number; i: number; ctx: string[] } & ({ msg: Msg } | { a: string; b: string });
export type Summarize = (job: Job) => Promise<string>;
// a model call of the pump, for the TUI's /summaries: started, then done with its line or failed with the error (and started again after the wait)
export type JobEvent = { label: string; state: "start" | "done" | "failed"; text?: string };

export function makeJob(mem: Mem, l: number, i: number): Job {
  if (l === 0) return { l, i, ctx: context(mem, i), msg: mem.root[i] };
  return { l, i, ctx: context(mem, (i + 1) * 2 ** l), a: getNode(mem, l - 1, 2 * i)!.text, b: getNode(mem, l - 1, 2 * i + 1)!.text };
}

// ponytail: every pass scans all nodes, O(T) per call; fine to ~1e5 messages, then keep a per-level cursor
const each = (mem: Mem, f: (c: Coord) => boolean | void) => {
  for (let l = 0; 2 ** l <= mem.root.length; l++)
    for (let i = 0; (i + 1) * 2 ** l <= mem.root.length; i++) if (f({ l, i })) return;
};

// free nodes, bottom-up: no model call, so no JOBS slot and no rule 3
export function buildFree(mem: Mem, commit: (n: Node) => void) {
  each(mem, ({ l, i }) => {
    if (built(mem, l, i) || !ready(mem, l, i)) return;
    const text = freeText(mem, l, i);
    if (text !== null) commit({ l, i, text, size: bytes(text) });
  });
}

export function createPump(o: {
  mem: Mem;
  commit: (n: Node) => void; // persist, then add to mem and refit the view
  summarize: Summarize;
  jobs?: number;
  retryMs?: number;
  report?: (msg: string) => void;
  onJob?: (e: JobEvent) => void;
}) {
  const { mem, commit, summarize } = o;
  const jobs = o.jobs ?? JOBS, retryMs = o.retryMs ?? RETRY, report = o.report ?? (() => {}), onJob = o.onJob ?? (() => {});
  const busy = new Set<string>(), failed = new Set<string>(), timers = new Set<Timer>();
  let stopped = false;

  function pump() {
    if (stopped) return;
    buildFree(mem, commit);
    const head = first(mem);
    each(mem, ({ l, i }) => {
      if (busy.size >= jobs) return true;
      const end = l === 0 ? i : (i + 1) * 2 ** l;
      if (built(mem, l, i) || busy.has(key(l, i)) || !ready(mem, l, i) || end > head) return;
      start({ l, i });
    });
  }

  function start(c: Coord) {
    const k = key(c.l, c.i), job = makeJob(mem, c.l, c.i); // the job sees the state this pump decided on
    busy.add(k);
    const ev = { label: label(c) }; // id+n: n = 2^level
    onJob({ ...ev, state: "start" });
    Promise.resolve()
      .then(() => summarize(job))
      .then((text) => {
        if (stopped) return;
        text = text.trim();
        if (!text) throw new Error("empty summary");
        commit({ ...c, text, size: bytes(text) });
        onJob({ ...ev, state: "done", text });
        busy.delete(k), failed.delete(k);
        pump();
      })
      .catch((err) => {
        if (stopped) return;
        if (!failed.has(k)) (failed.add(k), report(`${label(c)}: ${err?.message ?? err}`)); // only the first failure
        onJob({ ...ev, state: "failed", text: String(err?.message ?? err) });
        const t = setTimeout(() => (timers.delete(t), busy.delete(k), pump()), retryMs); // fixed wait, forever
        timers.add(t);
      });
  }

  const stop = () => ((stopped = true), timers.forEach(clearTimeout), timers.clear());
  return { pump, stop, busy };
}
