// The terminal side of optchat (SPEC §10): plain output that leaves the scrollback alone, one input line that may be a
// bracketed paste, Ctrl-C to cancel, and the data dir committed after each turn.
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { openChat } from "./chat.ts";
import { reapChildren } from "./claude.ts";
import { MASTER_MODEL } from "./config.ts";
import { commitData } from "./persist.ts";
import { type Out, createSession, mcpConfig, writeSystemPrompt } from "./turn.ts";
import { render, stats } from "./view.ts";

export type Key = "enter" | "backspace" | "clear" | "eof" | "interrupt" | "suspend";
const KEYS: Record<string, Key> = { "\r": "enter", "\n": "enter", "\x7f": "backspace", "\b": "backspace", "\x15": "clear", "\x04": "eof", "\x03": "interrupt", "\x1a": "suspend" };
const SEQ = /^\x1b(?:\[[0-?]*[ -/]*[@-~]|O.|.)/s; // a whole escape sequence: CSI, SS3 or Alt+key
const PART = /^\x1b(?:\[[0-?]*[ -/]*|O)?$/; // the start of one, cut off by the end of the chunk

// What a terminal in raw mode sends with bracketed paste on: typed text, a few keys, and a paste as ONE text with its newlines
// kept. A paste or an escape sequence may arrive in pieces: feed the chunks in order. Anything else is dropped.
export function createKeys(on: { text(s: string): void; key(k: Key): void }) {
  let held = "", pasting = false, cr = false;
  return (chunk: string) => {
    const s = held + chunk;
    let run = "", k = 0;
    held = "";
    const flush = () => { if (run) on.text(run); run = ""; };
    while (k < s.length) {
      const c = s[k];
      if (c === "\x1b") {
        const rest = s.slice(k);
        if (PART.test(rest)) { held = rest; break; }
        const seq = SEQ.exec(rest)?.[0] ?? c;
        if (seq === "\x1b[200~" || seq === "\x1b[201~") { flush(); pasting = seq === "\x1b[200~"; }
        k += seq.length;
        continue;
      }
      k++;
      if (pasting) {
        if (c === "\n" && cr) { cr = false; continue; } // the second half of a CRLF
        cr = c === "\r";
        if (cr) run += "\n";
        else if (c >= " " || c === "\n" || c === "\t") run += c;
      } else if (KEYS[c]) { flush(); on.key(KEYS[c]); }
      else if (c >= " ") run += c;
    }
    flush();
  };
}

const TAIL = 5; // user and talk lines shown at startup
// `s` cut to `cols` terminal columns, an ellipsis marking the cut
function row(s: string, cols: number) {
  s = s.replace(/\t/g, " ");
  if (Bun.stringWidth(s) <= cols) return s;
  let out = "", used = 1; // the ellipsis takes one column
  for (const ch of s) { const cw = Bun.stringWidth(ch); if (used + cw > cols) break; out += ch; used += cw; }
  return `${out}…`;
}
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const plain = (s: string) => s.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ""); // all but \n and \t: what the model or a tool printed must not drive the terminal

// `o` goes to openChat (a test passes a `summarize` of its own)
export async function repl(dir: string, o: Parameters<typeof openChat>[1] = {}) {
  const tty = !!process.stdin.isTTY, color = !!process.stdout.isTTY, w = (s: string) => process.stdout.write(s);
  // Where the cursor is: at the start of a line (`col0`), on the input line (`onInput`: the prompt and what is typed) or in the
  // middle of model output. Model output makes the input line give way and brings it back after the next finished line.
  // `working`: a message was handed to the session and its turn loop has not ended yet (the session's own state is not set early enough)
  let buf = "", col0 = true, onInput = false, armed = false, live = false, quitting = false, grabbed = false, working = false;
  let session: ReturnType<typeof createSession>;

  const draw = () => { if (!col0) w("\n"); w(`> ${buf}`); col0 = false; onInput = true; };
  const show = () => { if (live && !onInput && (buf || !working)) draw(); }; // a prompt while idle, the typed text while busy
  const put = (s: string, dimmed = false, line = false) => {
    if (!(s = plain(s))) return;
    if (onInput) { w("\r\x1b[2K"); onInput = false; col0 = true; } // ponytail: erases the last row only, a pasted block stays above
    if (line && !col0) w("\n");
    w(dimmed && color ? dim(s) : s);
    if (line) w("\n");
    col0 = line || s.endsWith("\n");
    if (col0) show();
  };
  const out: Out = { text: (s) => put(s), thinking: (s) => put(s, true), info: (s) => put(s, true, true) };

  const type = (s: string) => { armed = false; buf += s; if (onInput) w(s); else draw(); };
  const back = () => {
    armed = false;
    const chars = [...buf];
    if (!chars.length || chars.at(-1) === "\n") return; // a pasted newline can't be un-echoed without moving the cursor
    buf = chars.slice(0, -1).join("");
    if (onInput) w("\b \b"); else draw(); // ponytail: wide characters take two columns
  };
  const clear = () => {
    armed = false;
    buf = "";
    if (onInput) { w("\r\x1b[2K"); onInput = false; col0 = true; }
    show();
  };
  const enter = () => {
    armed = false;
    const text = buf.trim();
    if (text && !onInput) draw(); // model output pushed the line away: the message still belongs in the scrollback
    if (onInput) w("\n");
    onInput = false, col0 = true, buf = "";
    if (!text) return show();
    working = true;
    session.input(text);
  };

  let gitError: string | null = null;
  const persist = async () => {
    const err = await commitData(dir, `chore(chat): ${chat.mem.root.length} messages`);
    if (err && err !== gitError) out.info(`git: ${err}`); // once per distinct error
    gitError = err;
  };
  async function quit() {
    if (quitting) return;
    quitting = true, live = false;
    session.stop(); // cancels the call; the messages it never took are logged before the turn loop ends
    await session.whenIdle();
    chat.close();
    await persist();
    process.exit(0);
  }
  const interrupt = () => {
    if (armed) return void quit();
    armed = true;
    if (working) { session.cancel(); out.info("cancelled (Ctrl-C again exits)"); } else { buf = ""; out.info("Ctrl-C again, or Ctrl-D, exits"); }
  };
  const suspend = () => { // as the terminal's own Ctrl-Z would: stop the whole job (the claude children too), take the terminal back when it goes on
    release();
    process.kill(0, "SIGTSTP"); // returns after the shell's `fg`, or at once if nobody could continue us (an orphaned group ignores the stop)
    grab();
    onInput = false, col0 = true;
    show();
  };
  const keys = { enter, backspace: back, clear, eof: () => { if (!buf) void quit(); }, interrupt, suspend };

  const grab = () => {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    w("\x1b[?2004h"); // bracketed paste
    grabbed = true;
  };
  const release = () => {
    if (!grabbed) return;
    grabbed = false;
    try {
      w(`\x1b[?2004l${col0 ? "" : "\n"}`);
      process.stdin.setRawMode(false);
    } catch {} // the terminal may be gone already (SIGHUP when its window closes)
  };

  reapChildren(); // a signal at any time ends the process cleanly, the exit hook below included
  const { chat, problems } = await openChat(dir, { report: (m) => out.info(`compactor: ${m}`), ...o }); // throws if another optchat holds the lock
  const system = writeSystemPrompt(dir);
  process.on("exit", () => { rmSync(dirname(system), { recursive: true, force: true }); release(); }); // also after a signal or an uncaught error
  session = createSession({ chat, out, system, mcp: mcpConfig(dir), onIdle: () => { working = false; void persist(); show(); } });

  problems.forEach((p) => console.error(p));
  // the last user and talk lines of the view, one terminal row each; `optchat view` shows them all
  const lines = render(chat.mem).split("\n").slice(1, -1), view = chat.mem.view;
  const tail = lines.filter((_, k) => view[k].l === 0 && ["user", "talk"].includes(chat.mem.root[view[k].i].kind)).slice(-TAIL);
  if (lines.length > tail.length) out.info(`… ${lines.length - tail.length} earlier view lines (optchat view)`);
  w(tail.map((l) => `${row(plain(l), process.stdout.columns || 80)}\n`).join(""));
  const [when, fill] = stats(chat.mem);
  out.info(`optchat: ${when}`);
  if (fill) out.info(fill);
  out.info(`${dir} · master ${MASTER_MODEL}${tty ? " · Ctrl-C cancels, Ctrl-D exits" : ""}`);

  if (!tty) { // one message per line; at the end of the input the turn is finished, then we are done
    for await (const line of console) if (line.trim()) { type(line); enter(); }
    await session.whenIdle();
    return quit();
  }
  grab();
  live = true;
  show();
  const feed = createKeys({ text: type, key: (k) => keys[k]() });
  process.stdin.on("data", feed);
}
