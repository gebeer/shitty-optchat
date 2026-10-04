// The view (gist §5, §6): a list of tree nodes that tiles [0, T), changed only by
// appending at the end and merging the most due pair. Pure functions over Mem.
import { MARKS } from "./config.ts";
import { type Coord, type Mem, type Msg, type Node, built, bytes, dayOf, getNode, setNode, span } from "./tree.ts";

export const PLACEHOLDER = "(not summarized yet: zoom it)"; // display and fail-safe only, no call ever sees it
const partText = (mem: Mem, p: Coord) => getNode(mem, p.l, p.i)?.text ?? PLACEHOLDER;
const partSize = (mem: Mem, p: Coord) => getNode(mem, p.l, p.i)?.size ?? bytes(PLACEHOLDER);
export const flat = (s: string) => s.replace(/\r\n|\r|\n/g, " ");

// merge the most due built pair while over budget (gist §5.2); T is the message count at that time
export function fit(mem: Mem, T = mem.root.length) {
  let size = mem.view.reduce((s, p) => s + partSize(mem, p), 0);
  while (size > mem.budget) {
    let best = -1, bestDue = -Infinity;
    for (let k = 0; k + 1 < mem.view.length; k++) {
      const a = mem.view[k], b = mem.view[k + 1];
      if (a.l !== b.l || a.i % 2 !== 0 || b.i !== a.i + 1 || !built(mem, a.l + 1, a.i / 2)) continue;
      const due = (T - span(a).id) / 2 ** (a.l + 2); // OptMem's age rule; exact in binary floating point
      if (due > bestDue) { best = k; bestDue = due; }
    }
    if (best < 0) break; // wait until a parent is built
    const [a, b] = [mem.view[best], mem.view[best + 1]], parent = { l: a.l + 1, i: a.i / 2 };
    size += partSize(mem, parent) - partSize(mem, a) - partSize(mem, b);
    mem.view.splice(best, 2, parent);
  }
  for (const wake of [...mem.waiters]) wake();
}

export function addMessage(mem: Mem, m: Msg) {
  if (m.i !== mem.root.length) throw new Error(`message id ${m.i}, expected ${mem.root.length}`);
  mem.root.push(m);
  mem.view.push({ l: 0, i: m.i });
  fit(mem);
}
export function addNode(mem: Mem, n: Node) {
  setNode(mem, n);
  fit(mem);
}

// the view is not saved: fold it again from message 0 (gist §5.2 "At load")
export function refold(mem: Mem) {
  mem.view = [];
  for (let i = 0; i < mem.root.length; i++) {
    mem.view.push({ l: 0, i });
    fit(mem, i + 1);
  }
}

export const render = (mem: Mem) =>
  ["<chat>", ...mem.view.map((p) => `${span(p).id}+${span(p).n}|${flat(partText(mem, p))}`), "</chat>"].join("\n");

// cut the rendered view after the last line end before each mark; marks past the end are skipped (SPEC §5.1)
export function cutBlocks(s: string, marks: readonly number[] = MARKS): string[] {
  const out: string[] = [];
  let from = 0;
  for (const m of marks) {
    if (m >= s.length) continue;
    const end = s.lastIndexOf("\n", m - 1) + 1;
    if (end <= from) continue;
    out.push(s.slice(from, end));
    from = end;
  }
  out.push(s.slice(from));
  return out;
}

// the startup header (SPEC §10): time span, view fill, summarizer backlog. Pending counts every unbuilt node over a full pair,
// an upper bound on the calls to come (a node whose children turn out small is built free).
export function stats(mem: Mem, now = new Date()): string[] {
  const T = mem.root.length;
  if (!T) return ["0 messages"];
  const ago = (ms: number) => { const m = Math.floor(ms / 60_000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
  const last = new Date(Math.max(...mem.root.map((m) => Date.parse(m.date)))) /* imported notes keep their older day */, size = mem.view.reduce((s, p) => s + partSize(mem, p), 0);
  let pending = 0;
  for (let l = 0; 2 ** l <= T; l++) for (let i = 0; (i + 1) * 2 ** l <= T; i++) if (!built(mem, l, i)) pending++;
  const open = mem.view.filter((p) => !built(mem, p.l, p.i)).length, kb = (b: number) => (b / 1000).toFixed(1).replace(/\.0$/, "");
  return [
    `${T} messages, ${dayOf(new Date(mem.root[0].date))} → ${dayOf(last)}, last ${ago(now.getTime() - last.getTime())}`,
    `view ${kb(size)}/${kb(mem.budget)} KB (${Math.round((100 * size) / mem.budget)}%), ${mem.view.length} lines · ${pending ? `${pending} ${pending === 1 ? "summary" : "summaries"} pending${open ? `, ${open} view line${open === 1 ? "" : "s"} unsummarized` : ""}` : "all summarized"}`,
  ];
}

export const allBuilt = (mem: Mem) => mem.view.every((p) => built(mem, p.l, p.i));

// first message whose view line is unbuilt, else the message count (gist §4.1 `first`)
export function first(mem: Mem) {
  const p = mem.view.find((p) => !built(mem, p.l, p.i));
  return p ? span(p).id : mem.root.length;
}

// the bare lines (no ids) of the parts that end at or before `limit`: what a compactor call sees (gist §4.2)
export function context(mem: Mem, limit: number) {
  const lines: string[] = [];
  for (const p of mem.view) {
    const { id, n } = span(p);
    if (id + n > limit) break;
    if (!built(mem, p.l, p.i)) throw new Error(`unbuilt line ${id}+${n} before ${limit}: rule 3 broken`);
    lines.push(flat(partText(mem, p)));
  }
  return lines;
}

// resolves true when every view part is built, false if aborted (gist §6)
export function settle(mem: Mem, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (allBuilt(mem)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v: boolean) => (mem.waiters.delete(check), signal?.removeEventListener("abort", abort), resolve(v));
    const check = () => allBuilt(mem) && done(true);
    const abort = () => done(false);
    mem.waiters.add(check);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
