// The log, the summary tree and the in-memory state they live in (gist §2, §3).
// Plain data and pure functions, no I/O, so selfcheck can drive them with a fake compactor.
import { NODE, VIEW } from "./config.ts";

export type Kind = "user" | "talk" | "tool" | "echo" | "note";
export const KINDS: readonly Kind[] = ["user", "talk", "tool", "echo", "note"];
export type Msg = { i: number; kind: Kind; text: string; size: number; date: string; src?: string }; // src: "optmem:<n>" for imported notes
export type Node = { l: number; i: number; text: string; size: number };
export type Coord = { l: number; i: number }; // node (l, i) covers messages [i·2^l, (i+1)·2^l)
export type Mem = {
  root: Msg[]; // every message, by id
  tree: Map<string, Node>; // built nodes
  view: Coord[]; // the parts, oldest first (view.ts)
  budget: number; // bytes
  waiters: Set<() => void>; // settle() callers (view.ts)
};

export const bytes = (s: string) => Buffer.byteLength(s, "utf8");
export const msgText = (m: Pick<Msg, "kind" | "text">) => `${m.kind}: ${m.text}`;
const two = (n: number) => String(n).padStart(2, "0");
export const dayOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; // local day
export const localTime = (iso: string) => { const d = new Date(iso); return `${dayOf(d)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
export const newMem = (budget = VIEW): Mem => ({ root: [], tree: new Map(), view: [], budget, waiters: new Set() });

export const key = (l: number, i: number) => `${l}:${i}`;
export const getNode = (mem: Mem, l: number, i: number) => mem.tree.get(key(l, i));
export const built = (mem: Mem, l: number, i: number) => mem.tree.has(key(l, i));
export const setNode = (mem: Mem, n: Node) => void (built(mem, n.l, n.i) || mem.tree.set(key(n.l, n.i), n)); // built nodes never change

// addressing: node (l, i) is "id+n", the real id of its first message and how many it covers
export const span = (c: Coord) => ({ id: c.i * 2 ** c.l, n: 2 ** c.l });
export const label = (c: Coord) => `${span(c).id}+${span(c).n}`;
export function coords(id: number, n: number, T: number): Coord | null {
  if (!Number.isInteger(id) || !Number.isInteger(n) || n < 1 || !Number.isInteger(Math.log2(n))) return null;
  if (id < 0 || id % n !== 0 || id + n > T) return null;
  return { l: Math.log2(n), i: id / n };
}

// a node can be built once its sources exist: the message, or both children
export const ready = (mem: Mem, l: number, i: number) =>
  l === 0 ? i < mem.root.length : built(mem, l - 1, 2 * i) && built(mem, l - 1, 2 * i + 1);

// free node: when the source fits in NODE it IS the node, no model call. Requires ready().
export function freeText(mem: Mem, l: number, i: number): string | null {
  const text = l === 0 ? msgText(mem.root[i]) : `${getNode(mem, l - 1, 2 * i)!.text}\n${getNode(mem, l - 1, 2 * i + 1)!.text}`;
  return bytes(text) <= NODE ? text : null;
}
