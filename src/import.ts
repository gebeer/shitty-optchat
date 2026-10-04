// import-optmem (SPEC §10). LOG.txt holds fixed-width 320-byte records, space padded:
//   #<n> <YYYY-MM-DD> <text>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { buildFree } from "./compactor.ts";
import { acquireLock, appendMessage, committer, loadChat, newMsg } from "./store.ts";
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

// notes become messages i = n of kind note; the free nodes are built right away, so the chat is readable
export async function importOptmem(dir: string, path = OPTMEM_LOG) {
  const notes = parseOptmem(readFileSync(path, "utf8"));
  const release = await acquireLock(dir);
  try {
    const { mem } = loadChat(dir);
    if (mem.root.length) throw new Error(`${dir} already holds ${mem.root.length} messages: import only into an empty chat`);
    for (const n of notes) {
      const m = newMsg(n.n, "note", n.text, n.date);
      appendMessage(dir, m);
      addMessage(mem, m);
    }
    buildFree(mem, committer(dir, mem));
    return mem;
  } finally {
    release();
  }
}
