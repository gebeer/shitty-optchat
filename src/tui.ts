// The chat on a terminal (SPEC §10): a pi-style TUI on @earendil-works/pi-tui, in the main screen so the terminal keeps the
// scrollback. Top to bottom: the startup header, the chat (user messages, assistant text, tool boxes, dim info lines), the
// editor (its top border shows the spinner while a turn runs), the footer. The session and the data dir are repl.ts's boot().
import {
  type AutocompleteProvider, Box, CombinedAutocompleteProvider, type Component, Container, Editor, type EditorTheme, type MarkdownTheme, Markdown, ProcessTerminal, Spacer, Text,
  TuiMainScreen, backgroundAnsi, foregroundAnsi, getTerminalColorMode, matchesKey, parseColor, truncateToWidth, visibleWidth,
} from "@earendil-works/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { openChat } from "./chat.ts";
import { MASTER_EFFORT, MASTER_MODEL } from "./config.ts";
import { boot, header, plain } from "./repl.ts";
import type { Out } from "./turn.ts";
import { aggregate, table, type Row } from "./usage.ts";
import { stats } from "./view.ts";

// pi's "dark" theme (theme/dark.json), converted once
const mode = getTerminalColorMode();
const fg = (c: string) => { const a = foregroundAnsi(parseColor(c), mode); return (s: string) => `${a}${s}\x1b[39m`; };
const bg = (c: string) => { const a = backgroundAnsi(parseColor(c), mode); return (s: string) => `${a}${s}\x1b[49m`; };
const T = {
  text: fg("okhsl(234 3% 89%)"), muted: fg("okhsl(229 6% 67%)"), dim: fg("okhsl(229 8% 56%)"), accent: fg("okhsl(295 50% 67%)"),
  error: fg("okhsl(20 72% 67%)"), thinking: fg("okhsl(226 7% 65%)"), borderMuted: fg("okhsl(229 8% 53%)"),
  yellow: fg("okhsl(83 88% 67%)"), blue: fg("okhsl(232 54% 67%)"), green: fg("okhsl(159 59% 67%)"),
  userBg: bg("okhsl(233 41% 24%)"), toolPending: bg("okhsl(229 5% 24%)"), toolSuccess: bg("okhsl(158 46% 25%)"), toolError: bg("okhsl(19 54% 25%)"),
};
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`, italic = (s: string) => `\x1b[3m${s}\x1b[23m`;
const md: MarkdownTheme = {
  heading: (s) => T.yellow(bold(s)), link: T.blue, linkUrl: T.muted, code: T.accent, codeBlock: T.green, codeBlockBorder: T.muted,
  quote: T.muted, quoteBorder: T.muted, hr: T.muted, listBullet: T.accent, bold, italic,
  strikethrough: (s) => `\x1b[9m${s}\x1b[29m`, underline: (s) => `\x1b[4m${s}\x1b[24m`,
};
const editorTheme: EditorTheme = {
  borderColor: T.borderMuted,
  selectList: { selectedPrefix: T.accent, selectedText: T.accent, description: T.muted, scrollInfo: T.muted, noMatch: T.muted },
};
const clean = (s: string) => plain(s).replace(/\t/g, "    "); // what the model or a tool printed: no control characters, no tabs
const tilde = (p: string) => (p.startsWith(homedir()) ? `~${p.slice(homedir().length)}` : p);
const PREVIEW = 10; // tool output lines shown until Ctrl-O expands them

// one line, cut to the width with an ellipsis
const row = (text: () => string): Component => ({ render: (w) => [truncateToWidth(text(), w, "…")], invalidate() {} });

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// the editor, its top border showing "── ⠧ Working ─────" while a turn runs
class ChatEditor extends Editor {
  working: string | null = null;
  frame = 0;
  protected renderTopBorder(width: number, hidden: number) {
    if (!this.working) return super.renderTopBorder(width, hidden);
    const label = `${T.accent(SPIN[this.frame % SPIN.length])} ${T.muted(this.working)}`, lw = visibleWidth(label);
    if (width < lw + 5) return super.renderTopBorder(width, hidden);
    return `${this.borderColor("── ")}${label}${this.borderColor(` ${"─".repeat(width - lw - 4)}`)}`;
  }
}

// the /stats overlay: a bordered, scrollable panel; ↑↓ PgUp PgDn Home End scroll, Esc or q closes
class StatsPanel implements Component {
  top = 0;
  constructor(private lines: string[], private rows: () => number, private close: () => void, private redraw: () => void) {}
  height() { return Math.max(3, Math.min(this.lines.length, this.rows() - 4)); } // body rows: the screen less the borders and a margin
  render(w: number) {
    const h = this.height(), max = Math.max(0, this.lines.length - h), b = T.borderMuted;
    this.top = Math.min(Math.max(0, this.top), max);
    const inner = Math.max(1, w - 4), pad = (s: string) => { const t = truncateToWidth(s, inner, "…"); return `${b("│")} ${t}${" ".repeat(Math.max(0, inner - visibleWidth(t)))} ${b("│")}`; };
    const edge = (l: string, label: string, r: string) => { const t = truncateToWidth(label, Math.max(0, w - 4), ""); return b(`${l}─`) + t + b(`${"─".repeat(Math.max(0, w - 3 - visibleWidth(t)))}${r}`); };
    const where = max ? T.muted(` ${this.top + 1}–${this.top + h} of ${this.lines.length} · ↑↓ scroll · Esc/q closes `) : T.muted(" Esc/q closes ");
    return [edge("╭", T.accent(bold(" stats ")), "╮"), ...this.lines.slice(this.top, this.top + h).map(pad), edge("╰", where, "╯")];
  }
  handleInput(d: string) {
    const h = this.height();
    if (matchesKey(d, "escape") || d === "q" || matchesKey(d, "ctrl+c")) return this.close();
    if (matchesKey(d, "up")) this.top--;
    else if (matchesKey(d, "down")) this.top++;
    else if (matchesKey(d, "pageUp")) this.top -= h;
    else if (matchesKey(d, "pageDown") || d === " ") this.top += h;
    else if (matchesKey(d, "home")) this.top = 0;
    else if (matchesKey(d, "end")) this.top = this.lines.length;
    this.redraw();
  }
  invalidate() {}
}

// what `optchat stats` prints, styled: header accent, rows text, `no model calls` dim
const usageTable = (title: string, rows: Row[]) => {
  const t = table(title, rows, (s) => s).split("\n");
  return t.length === 1 ? [T.dim(t[0])] : t.map((l, i) => (i ? T.text(l) : T.accent(l)));
};

const k = (n: number) => (n < 1000 ? `${n}` : n < 10_000 ? `${(n / 1000).toFixed(1)}k` : n < 1e6 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`);

export async function tui(dir: string, o: Parameters<typeof openChat>[1] = {}) {
  const term = new ProcessTerminal(), ui = new TuiMainScreen(term);
  const head = new Container(), chatBox = new Container(), editor = new ChatEditor(ui, editorTheme, { paddingX: 1 });
  let working = false, armed = false, running = false, spinner: ReturnType<typeof setInterval> | undefined;
  let mem: Parameters<typeof stats>[0] | null = null, fill = "", fillDirty = true;
  const total = { turns: 0, input: 0, output: 0, read: 0, write: 0 };
  let hit: number | null = null;

  // the chat: each block after a blank line, as pi does; a streamed run (text or thinking) grows until anything else comes
  let run: { kind: "text" | "thinking"; md: Markdown; text: string } | null = null;
  const add = (c: Component) => { run = null; chatBox.addChild(new Spacer(1)); chatBox.addChild(c); ui.requestRender(); };
  const stream = (kind: "text" | "thinking", s: string) => {
    if (run?.kind !== kind) {
      const m = kind === "text" ? new Markdown("", 1, 0, md) : new Markdown("", 1, 0, md, { color: T.thinking, italic: true });
      add(m);
      run = { kind, md: m, text: "" };
    }
    run.text += s;
    run.md.setText(clean(run.text).trim());
    ui.requestRender();
  };
  const line = (s: string, color: (s: string) => string) => add(new Text(color(clean(s)), 1, 0));
  // a message sent while claude works waits above the editor, as in pi; it moves into the chat when it belongs there (out.user),
  // so a streamed answer is never split by it
  const pending: string[] = [];
  const queued: Component = { render: (w) => pending.length ? ["", ...pending.map((t) => truncateToWidth(T.dim(`queued: ${clean(t).replace(/\s+/g, " ")}`), w, T.dim("…")))] : [], invalidate() {} };

  // tool boxes: collapsed (title and output cut to a preview) or, after Ctrl-O, all of them expanded, as pi's app.tools.expand
  let expanded = false;
  const tools = new Map<string, { box: Box; draw: () => void; body?: string[]; isError?: boolean }>();
  const boxes: (() => void)[] = []; // each box redraws its texts for the current `expanded`
  const out: Required<Out> = {
    text: (s) => stream("text", s),
    thinking: (s) => stream("thinking", s),
    info: (s) => line(s, T.dim),
    error: (s) => line(s, T.error),
    thought: (n) => line(n ? `thought for ~${n} tokens` : "thought", (s) => T.thinking(italic(s))),
    tool(id, name, input) {
      const box = new Box(1, 1, T.toolPending), args = input as any, short = name.replace(/^mcp__optchat__/, "");
      const cmd = typeof args?.command === "string" ? clean(args.command).split("\n") : null, json = clean(JSON.stringify(input));
      const head = new Text("", 0, 0), gap = new Spacer(0), body = new Text("", 0, 0);
      const t = { box, draw: () => {} } as { box: Box; draw: () => void; body?: string[]; isError?: boolean };
      t.draw = () => {
        const title = name === "Bash" && cmd // collapsed, a heredoc or a whole file must not fill the screen
          ? bold(`$ ${(expanded ? cmd : cmd.slice(0, 5)).join("\n")}${!expanded && cmd.length > 5 ? " …" : ""}`)
          : `${bold(short)} ${T.muted(!expanded && json.length > 300 ? `${json.slice(0, 300)}…` : json)}`;
        head.setText(title);
        const lines = t.body ?? [], more = expanded ? 0 : lines.length - PREVIEW, color = t.isError ? T.error : T.muted;
        const text = (expanded ? lines : lines.slice(0, PREVIEW)).map((l) => color(l)).join("\n")
          + (more > 0 ? `\n${T.muted(`... (${more} more lines, Ctrl-O to expand)`)}` : "");
        gap.setLines(text.trim() ? 1 : 0);
        body.setText(text.trim() ? text : "");
      };
      box.addChild(head), box.addChild(gap), box.addChild(body);
      t.draw();
      boxes.push(t.draw);
      tools.set(id, t);
      add(box);
    },
    result(id, text, isError) {
      const t = tools.get(id);
      tools.delete(id);
      if (!t) return line(`← ${text}`, T.dim); // a result without its call: not expected
      t.body = clean(text).replace(/\n+$/, "").split("\n");
      t.isError = isError;
      t.box.setBgFn(isError ? T.toolError : T.toolSuccess);
      t.draw();
      run = null;
      ui.requestRender();
    },
    user(s) {
      const at = pending.indexOf(s);
      if (at >= 0) pending.splice(at, 1);
      add(new Markdown(s, 1, 1, md, { color: T.text, bgColor: T.userBg }));
    },
    usage(r) {
      const u = r.usage ?? {}, i = u.input_tokens ?? 0, rd = u.cache_read_input_tokens ?? 0, wr = u.cache_creation_input_tokens ?? 0;
      total.turns++, total.input += i, total.output += u.output_tokens ?? 0, total.read += rd, total.write += wr;
      hit = i + rd + wr ? (100 * rd) / (i + rd + wr) : null;
      ui.requestRender();
    },
  };

  const footer: Component = {
    render(w) {
      if (mem && fillDirty) (fill = stats(mem)[1] ?? ""), (fillDirty = false);
      const left = [total.input && `↑${k(total.input)}`, total.output && `↓${k(total.output)}`, total.read && `R${k(total.read)}`, total.write && `W${k(total.write)}`, hit !== null && `CH${hit.toFixed(1)}%`].filter(Boolean).join(" ");
      const right = `${MASTER_MODEL} • ${MASTER_EFFORT}`, gap = w - visibleWidth(left) - visibleWidth(right);
      return [
        truncateToWidth(T.dim(`${tilde(dir)}${fill ? ` · ${fill}` : ""}`), w, T.dim("…")),
        gap >= 2 ? T.dim(left + " ".repeat(gap) + right) : truncateToWidth(T.dim(left || right), w, T.dim("…")),
      ];
    },
    invalidate() {},
  };

  const busy = (on: boolean) => {
    working = on;
    editor.working = on ? "Working" : null;
    clearInterval(spinner);
    if (on) spinner = setInterval(() => { editor.frame++; ui.requestRender(); }, 80);
    ui.requestRender();
  };
  const stop = () => { if (running) (running = false), clearInterval(spinner), ui.stop(); };

  const { chat, problems, session, quit } = await boot(dir, out, () => { busy(false); fillDirty = true; }, o);
  process.on("exit", stop); // the terminal back to normal after a signal or an uncaught error too
  mem = chat.mem;
  chat.mem.waiters.add(() => { fillDirty = true; }); // the view changed: the footer recomputes its stats() on the next frame
  const exit = () => { stop(); void quit(); };

  problems.forEach((p) => console.error(p));
  const h = header(chat.mem);
  if (h.earlier > 0) head.addChild(row(() => T.dim(`… ${h.earlier} earlier view lines (optchat view)`)));
  for (const l of h.tail) head.addChild(row(() => l.replace(/\t/g, " ")));
  head.addChild(new Spacer(1));
  head.addChild(row(() => T.dim(`optchat: ${h.stats[0]}`)));
  head.addChild(row(() => T.dim("Enter sends · Esc cancels · Ctrl-O expands tools · /stats · Ctrl-C twice/Ctrl-D exits · Ctrl-Z suspends · ↑↓ history")));

  // /stats: never sent to the model
  let panel: StatsPanel | null = null;
  const openStats = () => {
    const f = `${dir}/usage.jsonl`, { day, week } = aggregate(existsSync(f) ? readFileSync(f, "utf8") : "", new Date());
    const n = (x: number) => x.toLocaleString("en-US"), all = total.input + total.read + total.write;
    const head = (s: string) => T.yellow(bold(s));
    const lines = [
      head("View"), ...(mem ? stats(mem) : []).map(T.text), "",
      head("This session"),
      T.text(total.turns ? `${total.turns} turn${total.turns === 1 ? "" : "s"} · input ${n(total.input)} · cache read ${n(total.read)} · cache write ${n(total.write)} · output ${n(total.output)} · hit ${all ? ((100 * total.read) / all).toFixed(1) : "–"}%` : "no turns yet"),
      "", head("Usage per day (usage.jsonl, all model calls)"), ...usageTable("day", day),
      "", head("Usage per ISO week"), ...usageTable("week", week),
    ];
    const width = Math.min(term.columns - 2, Math.max(...lines.map(visibleWidth)) + 4);
    const h = ui.showOverlay(panel = new StatsPanel(lines, () => term.rows, () => { h.hide(); panel = null; }, () => ui.requestRender()), { width, maxHeight: "100%" });
  };
  const base = new CombinedAutocompleteProvider([{ name: "stats", description: "usage per day and week, view and session stats" }], process.cwd(), null);
  editor.setAutocompleteProvider({ // slash commands only: no file completion
    getSuggestions: (lines, l, c, opt) => (l === 0 && lines[0].slice(0, c).startsWith("/") && !lines[0].slice(0, c).includes(" ") ? base.getSuggestions(lines, l, c, opt) : Promise.resolve(null)),
    applyCompletion: (...a) => base.applyCompletion(...a),
    shouldTriggerFileCompletion: () => false,
  } satisfies AutocompleteProvider);

  editor.onSubmit = (text) => {
    if (!text.trim()) return;
    editor.addToHistory(text);
    if (text.trim() === "/stats") return openStats();
    if (!working) busy(true);
    pending.push(text);
    session.input(text); // while a turn runs, it goes to the running call; out.user moves it into the chat (at once when it opens a turn)
    ui.requestRender();
  };
  const suspend = () => { // as the terminal's own Ctrl-Z would: stop the whole job (the claude children too), take the terminal back when it goes on
    ui.stop();
    process.kill(0, "SIGTSTP"); // returns after the shell's `fg`, or at once if nobody could continue us (an orphaned group ignores the stop)
    ui.start();
    ui.requestRender(true);
  };
  ui.addInputListener((data) => {
    if (panel) return undefined; // the overlay has the keys
    if (matchesKey(data, "ctrl+c")) {
      if (armed) return exit(), { consume: true };
      armed = true;
      if (working) { session.cancel(); out.info("cancelled (Ctrl-C again exits)"); } else { editor.setText(""); out.info("Ctrl-C again, or Ctrl-D, exits"); }
      return { consume: true };
    }
    armed = false;
    if (matchesKey(data, "escape") && working && !editor.isShowingAutocomplete()) { session.cancel(); out.info("cancelled"); return { consume: true }; }
    if (matchesKey(data, "ctrl+d") && editor.getText() === "") return exit(), { consume: true };
    if (matchesKey(data, "ctrl+z")) return suspend(), { consume: true };
    if (matchesKey(data, "ctrl+o")) { expanded = !expanded; boxes.forEach((d) => d()); ui.requestRender(); return { consume: true }; }
    return undefined;
  });

  ui.addChild(head);
  ui.addChild(chatBox);
  ui.addChild(queued);
  ui.addChild(new Spacer(1));
  ui.addChild(editor);
  ui.addChild(footer);
  ui.setFocus(editor);
  ui.start();
  running = true;
}
