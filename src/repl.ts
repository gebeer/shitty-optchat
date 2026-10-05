// The terminal side of optchat (SPEC §10). On a terminal the chat is the TUI (tui.ts); with stdin or stdout not a terminal it
// is this plain line mode: one message per input line, output that leaves the scrollback alone. Both share the startup here:
// the lock, the system prompt, the session, the data dir committed after each turn, and quit.
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { openChat } from "./chat.ts";
import { reapChildren } from "./claude.ts";
import { MASTER_MODEL } from "./config.ts";
import { commitData } from "./persist.ts";
import type { Mem } from "./tree.ts";
import { type Out, createSession, mcpConfig, writeSystemPrompt } from "./turn.ts";
import { render, stats } from "./view.ts";

export const plain = (s: string) => s.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ""); // all but \n and \t: what the model or a tool printed must not drive the terminal

const TAIL = 5; // user and talk lines shown at startup
// the startup header (SPEC §10): the last user and talk lines of the view (`optchat view` shows them all), then stats()
export function header(mem: Mem) {
  const lines = render(mem).split("\n").slice(1, -1), view = mem.view;
  const tail = lines.filter((_, k) => view[k].l === 0 && ["user", "talk"].includes(mem.root[view[k].i].kind)).slice(-TAIL).map(plain);
  return { earlier: lines.length - tail.length, tail, stats: stats(mem) };
}

// What both front ends share. `out` gets everything the session and the compactor show; `onIdle` runs after each turn loop
// (after the data dir commit was started). `quit` cancels what runs, logs what was not taken, commits and exits.
export async function boot(dir: string, out: Out, onIdle: () => void, o: Parameters<typeof openChat>[1] = {}) {
  reapChildren(); // a signal at any time ends the process cleanly, the exit hook below included
  const { chat, problems } = await openChat(dir, { report: (m) => out.info(`compactor: ${m}`), ...o }); // throws if another optchat holds the lock
  const system = writeSystemPrompt(dir);
  process.on("exit", () => rmSync(dirname(system), { recursive: true, force: true })); // also after a signal or an uncaught error
  let gitError: string | null = null, quitting = false;
  const persist = async () => {
    const err = await commitData(dir, `chore(chat): ${chat.mem.root.length} messages`);
    if (err && err !== gitError) out.info(`git: ${err}`); // once per distinct error
    gitError = err;
  };
  const session = createSession({ chat, out, system, mcp: mcpConfig(dir), onIdle: () => { void persist(); onIdle(); } });
  async function quit() {
    if (quitting) return;
    quitting = true;
    session.stop(); // cancels the call; the messages it never took are logged before the turn loop ends
    await session.whenIdle();
    chat.close();
    await persist();
    process.exit(0);
  }
  return { chat, problems, session, quit };
}

// `o` goes to openChat (a test passes a `summarize` of its own)
export async function repl(dir: string, o: Parameters<typeof openChat>[1] = {}) {
  if (process.stdin.isTTY && process.stdout.isTTY) return (await import("./tui.ts")).tui(dir, o);
  const color = !!process.stdout.isTTY, w = (s: string) => process.stdout.write(s);
  let col0 = true; // the cursor is at the start of a line
  const put = (s: string, dimmed = false, line = false) => {
    if (!(s = plain(s))) return;
    if (line && !col0) w("\n");
    w(dimmed && color ? `\x1b[2m${s}\x1b[22m` : s);
    if (line) w("\n");
    col0 = line || s.endsWith("\n");
  };
  const out: Out = { text: (s) => put(s), thinking: (s) => put(s, true), info: (s) => put(s, true, true) };
  const { chat, problems, session, quit } = await boot(dir, out, () => {}, o);

  problems.forEach((p) => console.error(p));
  const h = header(chat.mem);
  if (h.earlier > 0) out.info(`… ${h.earlier} earlier view lines (optchat view)`);
  h.tail.forEach((l) => put(l.replace(/\t/g, " "), false, true));
  out.info(`optchat: ${h.stats[0]}`);
  if (h.stats[1]) out.info(h.stats[1]);
  out.info(`${dir} · master ${MASTER_MODEL}`);
  for await (const line of console) if (line.trim()) { put(`> ${line.trim()}`, false, true); session.input(line.trim()); } // at the end of the input the turn is finished, then we are done
  await session.whenIdle();
  return quit();
}
