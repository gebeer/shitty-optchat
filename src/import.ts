// import-optmem (SPEC §10). LOG.txt holds fixed-width 320-byte records, space padded:
//   #<n> <YYYY-MM-DD> <text>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { buildFree } from "./compactor.ts";
import { acquireLock, appendMessage, committer, loadChat, newMsg } from "./store.ts";
import { commitData } from "./persist.ts";
import type { Msg } from "./tree.ts";
import { addMessage } from "./view.ts";

export const OPTMEM_LOG = `${homedir()}/.optmem/memory/LOG.txt`;

// every record or an error, so a file that doesn't parse whole writes nothing
export function parseOptmem(raw: string) {
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.reduce((notes, line, k) => {
    const m = /^#(\d+) (\d{4})-(\d{2})-(\d{2}) (.*)$/.exec(line);
    if (!m) throw new Error(`line ${k + 1} is not "#<n> <YYYY-MM-DD> <text>"`);
    const [n, y, mo, d] = [+m[1], +m[2], +m[3], +m[4]];
    if (n !== k) throw new Error(`line ${k + 1}: ids must be contiguous from 0, expected #${k}, found #${n}`);
    const date = new Date(y, mo - 1, d, 12); // 12:00 local: a fixed time, recognizably synthetic
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) throw new Error(`line ${k + 1}: bad date ${y}-${m[3]}-${m[4]}`);
    return notes.concat({ n, date, text: m[5].trim() });
  }, [] as { n: number; date: Date; text: string }[]);
}

// OptMem appends only and writes fixed-width records, so whole records are a prefix of the file
const LOG_REC = 320;
export const readOptmem = (path: string) => {
  const buf = readFileSync(path);
  return buf.subarray(0, buf.length - (buf.length % LOG_REC)).toString("utf8"); // a partial last record is being written: next time
};

// the next OptMem id to import: past the highest `src: "optmem:<n>"`, or, in a chat from before the tags,
// past the untagged notes it starts with (the first import made them messages i = n)
export function cursor(root: Msg[]) {
  const tagged = root.flatMap((m) => /^optmem:(\d+)$/.exec(m.src ?? "")?.[1] ?? []).map(Number);
  if (tagged.length) return { next: Math.max(...tagged) + 1, msgOf: (n: number) => root.find((m) => m.src === `optmem:${n}`) };
  let k = 0;
  while (k < root.length && root[k].kind === "note") k++;
  return { next: k, msgOf: (n: number) => root[n] };
}

// append the notes OptMem has gained since the last import, as kind note dated their own day (12:00 local).
// Run again it adds nothing. The free nodes are built right away, so the chat is readable at once.
export async function importOptmem(dir: string, path = OPTMEM_LOG) {
  const notes = parseOptmem(readOptmem(path));
  const release = await acquireLock(dir);
  try {
    const { mem } = loadChat(dir);
    const { next, msgOf } = cursor(mem.root);
    if (next > notes.length) throw new Error(`${path} has ${notes.length} notes, but the chat already imported ${next}: not the log it came from`);
    // a replaced or reset log would add wrong notes without a word: the last imported one must still be there
    if (next && msgOf(next - 1)?.text !== notes[next - 1].text) throw new Error(`${path}: note #${next - 1} differs from the imported one: not the log it came from`);
    const added = notes.slice(next);
    for (const n of added) {
      const m = { ...newMsg(mem.root.length, "note", n.text, n.date), src: `optmem:${n.n}` };
      appendMessage(dir, m);
      addMessage(mem, m);
    }
    buildFree(mem, committer(dir, mem));
    if (added.length) await commitData(dir, `chore(chat): import ${added.length} OptMem notes`);
    return { mem, added: added.length };
  } finally {
    release();
  }
}
