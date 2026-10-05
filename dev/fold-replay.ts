// Fold replay (no model calls): how many view bytes does the next prime rewrite, per fold watermark?
// Read-only on the chat: loadChat(repair: false), no lock, no writes there. Replays every message through a fit()
// with hysteresis (fold down to LOW once over the budget, then append freely), with the final tree (all stored
// parents built; a pair whose parent is not stored yet stays unmerged, as in refold).
//   bun dev/fold-replay.ts [--dir ~/.optchat] [--marks 100,95,90,85,80]
// Columns per watermark:
//   rewrite: bytes of the rendered view from the first byte that differs from the previous view to the end, 0 when
//            the new view only appends (the closing </chat> line is left out of the compare)
//   prime:   what a prime writes with the real cache marks (cutBlocks): from the last block cut that both views share
//            and that lies before the first difference, to the end; an append still rewrites the last block
//   per message (mean, total) and per user message (view after each user message vs the one after the previous)
import { homedir } from "node:os";
import { MARKS, VIEW } from "../src/config.ts";
import { loadChat } from "../src/store.ts";
import { type Mem, built, bytes, getNode, span } from "../src/tree.ts";
import { cutBlocks, render } from "../src/view.ts";

const arg = (k: string, d: string) => { const j = process.argv.indexOf(`--${k}`); return j > 0 ? process.argv[j + 1] : d; };
const dir = arg("dir", `${homedir()}/.optchat`), pcts = arg("marks", "100,95,90,85,80").split(",").map(Number);
const { mem: full } = loadChat(dir, { repair: false, view: false });
let T = 0; // the newest messages may have no l0 node yet: replay the built prefix
while (T < full.root.length && built(full, 0, T)) T++;

const size = (mem: Mem) => mem.view.reduce((s, p) => s + getNode(mem, p.l, p.i)!.size, 0);
function fitH(mem: Mem, T: number, low: number, st: { folding: boolean; blocked: number }) {
  let s = size(mem), merged = 0;
  if (s > mem.budget) st.folding = true;
  while (st.folding && s > low) {
    let best = -1, bestDue = -Infinity;
    for (let k = 0; k + 1 < mem.view.length; k++) {
      const a = mem.view[k], b = mem.view[k + 1];
      if (a.l !== b.l || a.i % 2 !== 0 || b.i !== a.i + 1 || !built(mem, a.l + 1, a.i / 2)) continue;
      const due = (T - span(a).id) / 2 ** (a.l + 2);
      if (due > bestDue) { best = k; bestDue = due; }
    }
    if (best < 0) { st.blocked++; break; }
    const [a, b] = [mem.view[best], mem.view[best + 1]], parent = { l: a.l + 1, i: a.i / 2 };
    s += getNode(mem, parent.l, parent.i)!.size - getNode(mem, a.l, a.i)!.size - getNode(mem, b.l, b.i)!.size;
    mem.view.splice(best, 2, parent);
    merged++;
  }
  if (s <= low) st.folding = false;
  return merged;
}
const common = (a: string, b: string) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
const strict = (prev: string, cur: string) => {
  const a = prev.slice(0, prev.lastIndexOf("\n</chat>")), b = cur.slice(0, cur.lastIndexOf("\n</chat>")), p = common(a, b);
  return p === a.length ? 0 : bytes(b.slice(p));
};
const cuts = (s: string) => { let at = 0; return cutBlocks(s, MARKS).slice(0, -1).map((x) => (at += x.length)); };
const prime = (prev: string, cur: string) => {
  const p = common(prev, cur), old = new Set(cuts(prev));
  const c = Math.max(0, ...cuts(cur).filter((c) => c <= p && old.has(c)));
  return bytes(cur.slice(c));
};

type R = { pct: number; msgStrict: number[]; msgPrime: number[]; userStrict: number[]; userPrime: number[]; userAt: number[]; folds: number; merges: number; sizes: number[]; blocked: number; lines: number[]; views: string[] };
const results: R[] = [];
for (const pct of pcts) {
  const mem: Mem = { ...full, view: [], waiters: new Set(), folding: false }, st = { folding: false, blocked: 0 };
  const r: R = { pct, msgStrict: [], msgPrime: [], userStrict: [], userPrime: [], userAt: [], folds: 0, merges: 0, sizes: [], blocked: 0, lines: [], views: [] };
  let prev = render(mem), prevUser: string | null = null;
  for (let i = 0; i < T; i++) {
    mem.view.push({ l: 0, i });
    const m = fitH(mem, i + 1, Math.floor((VIEW * pct) / 100), st);
    if (m) (r.folds++, (r.merges += m));
    const cur = render(mem);
    r.msgStrict.push(strict(prev, cur)), r.msgPrime.push(prime(prev, cur)), r.sizes.push(size(mem)), r.lines.push(mem.view.length);
    if (full.root[i].kind === "user") {
      if (prevUser !== null) r.userStrict.push(strict(prevUser, cur)), r.userPrime.push(prime(prevUser, cur)), r.userAt.push(i);
      prevUser = cur;
    }
    r.views.push(cur);
    prev = cur;
  }
  r.blocked = st.blocked;
  results.push(r);
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0), mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const kb = (n: number) => (n / 1000).toFixed(1);
const firstFull = results[0].sizes.findIndex((s, k) => k > 0 && results[0].msgStrict[k] > 0);
console.log(`chat ${dir}: ${T} of ${full.root.length} messages replayed, ${full.tree.size} stored nodes, ${results[0].userPrime.length + 1} user messages; VIEW ${VIEW}, marks ${MARKS.join("/")}; first fold at message ${firstFull}`);
console.log("all sizes in KB (1000 bytes); 'msg' = per message, 'turn' = per user message; 'from' = means from the first fold on");
console.log("| low | folds | merges | rewrite/msg mean | rewrite/msg total | rewrite/turn mean | turns w/o rewrite | prime/turn mean | prime/turn mean from | view mean | view mean from | lines mean from |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const from = (a: number[]) => a.slice(firstFull), late = r.userPrime.filter((_, k) => r.userAt[k] >= firstFull);
  console.log(`| ${r.pct}% | ${r.folds} | ${r.merges} | ${kb(mean(r.msgStrict))} | ${kb(sum(r.msgStrict))} | ${kb(mean(r.userStrict))} | ${r.userStrict.filter((x) => !x).length}/${r.userStrict.length} | ${kb(mean(r.userPrime))} | ${kb(mean(late))} (${late.length}) | ${kb(mean(r.sizes))} | ${kb(mean(from(r.sizes)))} | ${mean(from(r.lines)).toFixed(0)} |`);
  if (r.blocked) console.log(`  ${r.blocked} fits stopped on an unstored parent`);
}

// the real chat has few, long turns: replay a prime every k messages instead, from the first fold on
const ks = [2, 4, 8, 16, 32];
console.log("\nprime write mean per prime (KB) if a prime came every k messages, from the first fold on");
console.log(`| low | ${ks.map((k) => `k=${k}`).join(" | ")} |`);
console.log(`|---|${ks.map(() => "---").join("|")}|`);
for (const r of results) {
  const cells = ks.map((k) => { const w: number[] = []; for (let i = firstFull + k; i < r.views.length; i += k) w.push(prime(r.views[i - k], r.views[i])); return kb(mean(w)); });
  console.log(`| ${r.pct}% | ${cells.join(" | ")} |`);
}
