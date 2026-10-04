// browse (gist §10): the whole memory as one self-contained HTML page: the view, ROOT (every
// message) and each level of the tree, each entry with its range, time span and size.
import { type Coord, type Mem, bytes, getNode, localTime, span } from "./tree.ts";
import { PLACEHOLDER } from "./view.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const CSS = `:root{color-scheme:light dark}body{font:13px/1.45 ui-monospace,monospace;margin:1.5rem auto;max-width:1200px;padding:0 1rem}
details{margin:.8rem 0}summary{cursor:pointer;font-weight:bold}table{border-collapse:collapse;width:100%;margin-top:.4rem}
td,th{border-top:1px solid #8884;padding:2px 8px;text-align:left;vertical-align:top}td.n{text-align:right}td:last-child{white-space:pre-wrap;word-break:break-word}`;

export function browseHtml(mem: Mem): string {
  const when = (c: Coord) => {
    const { id, n } = span(c), a = localTime(mem.root[id].date), b = localTime(mem.root[id + n - 1].date);
    return a === b ? a : `${a} → ${b}`;
  };
  const row = (idn: string, range: string, time: string, size: number, text: string) =>
    `<tr><td>${esc(idn)}</td><td>${esc(range)}</td><td>${esc(time)}</td><td class="n">${size}</td><td>${esc(text)}</td></tr>`;
  const section = (title: string, rows: string[], open = false) =>
    `<details${open ? " open" : ""}><summary>${esc(title)}</summary><table><tr><th>id+n</th><th>messages</th><th>time</th><th>bytes</th><th>text</th></tr>${rows.join("")}</table></details>`;
  const nodeRow = (c: Coord, text: string, size: number) => {
    const { id, n } = span(c);
    return row(`${id}+${n}`, n === 1 ? `${id}` : `${id}–${id + n - 1}`, when(c), size, text);
  };

  const view = mem.view.map((p) => {
    const node = getNode(mem, p.l, p.i);
    return nodeRow(p, node?.text ?? PLACEHOLDER, node?.size ?? bytes(PLACEHOLDER));
  });
  const levels = new Map<number, Coord[]>();
  for (const n of mem.tree.values()) levels.set(n.l, [...(levels.get(n.l) ?? []), n]);
  const tree = [...levels.keys()].sort((a, b) => a - b).map((l) => {
    const nodes = levels.get(l)!.sort((a, b) => a.i - b.i);
    return section(`Level ${l} · ${nodes.length} nodes`, nodes.map((c) => nodeRow(c, getNode(mem, c.l, c.i)!.text, getNode(mem, c.l, c.i)!.size)));
  });
  const root = mem.root.map((m) => row(`${m.i}+1`, `${m.i}`, localTime(m.date), m.size, `${m.kind}: ${m.text}`));

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OptChat</title><style>${CSS}</style>
<h1>OptChat</h1><p>${mem.root.length} messages · ${mem.tree.size} tree nodes · view ${mem.view.length} lines, ${mem.view.reduce((s, p) => s + (getNode(mem, p.l, p.i)?.size ?? 0), 0)} of ${mem.budget} bytes</p>
${section(`View · ${view.length} lines`, view, true)}${section(`ROOT · ${root.length} messages`, root)}${tree.join("")}\n`;
}
