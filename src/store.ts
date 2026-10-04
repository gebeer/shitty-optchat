// Storage (gist §2): two append-only JSONL streams, split by local day, one write + fsync per
// line, torn-line repair at load, and a unix-socket lock for the life of the process.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { connect, createServer } from "node:net";
import { type Mem, type Msg, type Node, KINDS, bytes, dayOf, msgText, newMem, setNode } from "./tree.ts";
import { addNode, refold } from "./view.ts";

function write(path: string, text: string) {
  const buf = Buffer.from(text);
  const isNew = !existsSync(path);
  const fd = openSync(path, "a");
  try {
    if (writeSync(fd, buf) !== buf.length) throw new Error(`short write to ${path}`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (isNew) { // make the new file's directory entry durable too
    const d = openSync(path.slice(0, path.lastIndexOf("/")), "r");
    try { fsyncSync(d); } finally { closeSync(d); }
  }
}
const append = (dir: string, stream: "main" | "tree", when: Date, rec: Msg | Node) => {
  mkdirSync(`${dir}/chat/${stream}`, { recursive: true });
  write(`${dir}/chat/${stream}/${dayOf(when)}.jsonl`, JSON.stringify(rec) + "\n");
};
export const appendMessage = (dir: string, m: Msg) => append(dir, "main", new Date(m.date), m);
export const appendNode = (dir: string, n: Node) => append(dir, "tree", new Date(), n);
// persist a built node, then add it to memory and refit the view
export const committer = (dir: string, mem: Mem) => (n: Node) => (appendNode(dir, n), addNode(mem, n));

export const newMsg = (i: number, kind: Msg["kind"], text: string, date = new Date()): Msg =>
  ({ i, kind, text, size: bytes(msgText({ kind, text })), date: date.toISOString() });

const int = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
const isMsg = (r: any): r is Msg => int(r?.i) && KINDS.includes(r.kind) && typeof r.text === "string" && typeof r.date === "string";
const isNode = (r: any): r is Node => int(r?.l) && int(r?.i) && typeof r.text === "string";

// read every record of one stream; bad lines are skipped and listed in `problems`.
// The writer (repair) gives a file that doesn't end in "\n" one, so its next write starts on its own line.
// A reader must not touch the files, and can't tell a torn last line from a write in progress: it stays quiet.
function readStream<T>(dir: string, stream: string, ok: (r: any) => r is T, problems: string[], repair: boolean): T[] {
  const folder = `${dir}/chat/${stream}`;
  if (!existsSync(folder)) return [];
  const out: T[] = [];
  for (const f of readdirSync(folder).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort()) {
    const path = `${folder}/${f}`, text = readFileSync(path, "utf8"), lines = text.split("\n");
    const open = text !== "" && !text.endsWith("\n"); // the last line has no newline
    lines.forEach((line, n) => {
      if (!line) return;
      try {
        const r = JSON.parse(line);
        if (ok(r)) return void out.push(r);
      } catch {}
      if (repair || !open || n < lines.length - 1) problems.push(`${stream}/${f}:${n + 1}: not a valid record, skipped`);
    });
    if (repair && open) write(path, "\n");
  }
  return out;
}

// load the chat and fold the view; throws if the message ids are not 0, 1, 2, ...
// `repair: false` for read-only callers (view, browse, mcp): they never write; `view: false` skips the fold
export function loadChat(dir: string, o: { budget?: number; repair?: boolean; view?: boolean } = {}) {
  const problems: string[] = [], repair = o.repair ?? true;
  const mem: Mem = newMem(o.budget);
  mem.root = readStream(dir, "main", isMsg, problems, repair).sort((a, b) => a.i - b.i);
  mem.root.forEach((m, k) => { if (m.i !== k) throw new Error(`chat/main: expected message ${k}, found ${m.i}`); });
  for (const n of readStream(dir, "tree", isNode, problems, repair)) setNode(mem, { ...n, size: bytes(n.text) });
  if (o.view ?? true) refold(mem);
  return { mem, problems };
}

// one writer per chat: listen on `lock`; a live owner means exit, a dead one left a stale socket (gist §2)
export async function acquireLock(dir: string): Promise<() => void> {
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/lock`;
  const listen = () => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const s = createServer((c) => c.destroy());
    s.once("error", reject);
    s.listen(path, () => (s.off("error", reject), resolve(s)));
  });
  const alive = () => new Promise<boolean>((resolve) => {
    const c = connect(path);
    c.once("connect", () => (c.destroy(), resolve(true)));
    c.once("error", () => resolve(false));
  });
  let server;
  try {
    server = await listen();
  } catch (e: any) {
    if (e.code !== "EADDRINUSE") throw e;
    if (await alive()) throw new Error(`another optchat is already running on ${dir}`);
    // ponytail: two processes taking over the same stale socket at the same instant can both win
    try { unlinkSync(path); } catch {}
    server = await listen();
  }
  server.unref(); // the lock must not keep the process alive
  return () => server.close();
}
