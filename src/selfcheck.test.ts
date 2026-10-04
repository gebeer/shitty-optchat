// Few tests, only for real failure scenarios (SPEC §10). No model calls: the compactor is a fake, `claude` is src/fake-claude.ts.
import { afterAll, afterEach, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { openChat } from "./chat.ts";
import { createPump } from "./compactor.ts";
import { importOptmem, parseOptmem } from "./import.ts";
import { createKeys } from "./repl.ts";
import { acquireLock, appendMessage, loadChat, newMsg } from "./store.ts";
import { makeSummarizer } from "./summarize.ts";
import { aggregate, hit, isoWeek } from "./usage.ts";
import { type Mem, built, bytes, dayOf, getNode, label, newMem, span } from "./tree.ts";
import { createMapper, createSession, masterArgs, mcpConfig, writeSystemPrompt } from "./turn.ts";
import { PLACEHOLDER, addMessage, addNode, cutBlocks, first, refold, stats } from "./view.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));
const until = async (ok: () => boolean, ms = 3000) => { for (const t = Date.now(); !ok(); await sleep(2)) if (Date.now() - t > ms) throw new Error("timeout"); };
const user = (i: number, size: number) => newMsg(i, "user", "a".repeat(size - "user: ".length)); // "user: …" is exactly `size` bytes
const dirs: string[] = []; // every temp dir of the run, removed at the end (from inside bun)
const tmp = () => (dirs[dirs.push(mkdtempSync(`${tmpdir()}/optchat-test-`)) - 1]);
const mergeable = (mem: Mem) => mem.view.some((a, k) => { const b = mem.view[k + 1]; return b && a.l === b.l && a.i % 2 === 0 && b.i === a.i + 1 && built(mem, a.l + 1, a.i / 2); });

// A fake `claude` for the code under test (fake-claude.ts has the script format). Outside fake() OPTCHAT_CLAUDE is /bin/false:
// not even a stray, late spawn can start the real claude.
const FAKE = `${import.meta.dir}/fake-claude.ts`, NO_CLAUDE = "/bin/false";
process.env["OPTCHAT_CLAUDE"] = NO_CLAUDE;
const alive = (pid: number) => { try { return process.kill(pid, 0); } catch { return false; } };
const logs: string[] = []; // the log of every fake() of the running test: it names the pid of each fake claude started
const cleanups: (() => void)[] = []; // what a test started and has to stop: sessions, chats
function fake(script: object) {
  const dir = tmp(), log = `${dir}/log.jsonl`;
  writeFileSync(log, "");
  writeFileSync(`${dir}/script.json`, JSON.stringify(script));
  logs.push(log);
  Object.assign(process.env, { OPTCHAT_CLAUDE: FAKE, FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_SCRIPT: `${dir}/script.json` });
  const entries = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { starts: () => entries().filter((e) => e.argv), messages: () => entries().filter((e) => e.message).map((e) => e.message.message.content) };
}
// No test leaves a child behind. First stop what the test started, then every fake it ran has to be gone: a leaked one is
// killed here and fails the test (an orphaned fake once spun at 100% CPU for 11 minutes, SPEC §15).
afterEach(async () => {
  cleanups.splice(0).forEach((stop) => stop());
  const leaked: number[] = [];
  for (const log of logs.splice(0))
    for (const { pid } of readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"argv"')).map((l) => JSON.parse(l))) {
      try { await until(() => !alive(pid), 2000); } catch { process.kill(pid, "SIGKILL"); leaked.push(pid); }
    }
  process.env["OPTCHAT_CLAUDE"] = NO_CLAUDE;
  for (const k of ["FAKE_CLAUDE_LOG", "FAKE_CLAUDE_SCRIPT"]) delete process.env[k];
  expect(leaked).toEqual([]);
});
// and none survives the run: every fake claude is a child of this process
const fakes = () => Bun.spawnSync(["pgrep", "-P", String(process.pid), "-f", "fake-claude.ts"]).stdout.toString().trim().split("\n").filter(Boolean).map(Number);
afterAll(async () => {
  try { await until(() => fakes().length === 0, 2000); } catch { fakes().forEach((pid) => process.kill(pid, "SIGKILL")); throw new Error("a fake claude outlived the test run"); }
  finally { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); }
});

// ---- view, pump -------------------------------------------------------------------------------------------------------

test("cutBlocks cuts after the last line end before each mark and skips marks past the end", () => {
  const lines = (n: number) => Array.from({ length: n }, () => "x".repeat(99) + "\n").join(""); // 100 chars per line
  expect(cutBlocks(lines(12), [500, 800, 1000]).map((b) => b.length)).toEqual([500, 300, 200, 200]);
  expect(cutBlocks(lines(12), [450]).map((b) => b.length)).toEqual([400, 800]); // mark inside a line
  expect(cutBlocks(lines(7), [500, 800, 1000]).map((b) => b.length)).toEqual([500, 200]); // 800 and 1000 are past the end
  expect(cutBlocks("x".repeat(600), [500])).toEqual(["x".repeat(600)]); // no line end before the mark
  const big = Array.from({ length: 1200 }, (_, i) => `${i}+1|${"y".repeat(80 + (i % 40))}\n`).join("");
  const blocks = cutBlocks(big); // default marks 50k / 80k / 100k
  expect(blocks.length).toBe(4);
  expect(blocks.join("")).toBe(big);
  let at = 0;
  blocks.slice(0, 3).forEach((b, k) => { at += b.length; expect(at).toBeLessThanOrEqual([50_000, 80_000, 100_000][k]); expect(b.endsWith("\n")).toBe(true); });
  expect(at).toBeGreaterThan(99_000);
});

test("stats: time span and last activity, view fill against the budget, the summarizer backlog", () => {
  const mem = newMem(1000);
  expect(stats(mem)).toEqual(["0 messages"]);
  for (let i = 0; i < 3; i++) addMessage(mem, newMsg(i, "user", "x".repeat(44), new Date(2026, 9, 1 + i, 12))); // 50 bytes each
  addNode(mem, { l: 0, i: 0, text: "x".repeat(100), size: 100 });
  expect(stats(mem, new Date(2026, 9, 3, 14, 30))).toEqual([
    "3 messages, 2026-10-01 → 2026-10-03, last 2h ago",
    "view 0.2/1 KB (16%), 3 lines · 3 summaries pending, 2 view lines unsummarized", // 100 + 2 placeholders of 29; unbuilt 0:1, 0:2, 1:0
  ]);
});

test("the view tiles [0,T), is under budget once parents exist, never splits, and refold equals the live fold (1200 random messages)", async () => {
  const mem = newMem(6000);
  const p = createPump({ mem, commit: (n) => addNode(mem, n), summarize: async (j) => `${j.l}:${j.i}`.padEnd(200, ".") });
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let prev = new Set<number>(), prevT = 0, merges = 0;
  for (let i = 0; i < 1200; i++) {
    addMessage(mem, user(i, rand() < 0.3 ? 40 + Math.floor(rand() * 100) : 600 + Math.floor(rand() * 900)));
    p.pump();
    await tick();
    const fail = (why: string) => { throw new Error(`${why} after message ${i}`); };
    let at = 0, size = 0;
    for (const part of mem.view) {
      if (span(part).id !== at) fail(`gap at ${at}`);
      at += span(part).n;
      size += getNode(mem, part.l, part.i)?.size ?? fail("unbuilt part");
    }
    if (at !== mem.root.length) fail("view does not end at T");
    if (size > mem.budget && mergeable(mem)) fail("over budget with a mergeable pair");
    const bounds = new Set(mem.view.map((q) => span(q).id));
    for (const b of bounds) if (b < prevT && !prev.has(b)) fail(`split at ${b}`); // a boundary inside an old part
    merges += prev.size + 1 - bounds.size > 0 ? 1 : 0;
    (prev = bounds), (prevT = mem.root.length);
    if (i % 100 === 99) {
      const live = JSON.stringify(mem.view), copy: Mem = { ...mem, view: [], waiters: new Set() };
      refold(copy);
      if (JSON.stringify(copy.view) !== live) fail("refold differs from the live fold");
    }
  }
  p.stop();
  expect(merges).toBeGreaterThan(100);
  expect(mem.view.length).toBeLessThan(80); // 6000 bytes of ~200-byte lines, plus the ramp
});

test("pump rule 3: messages one at a time in order, merges alongside, at most JOBS at once", async () => {
  const mem = newMem(), bad: string[] = [], starts: string[] = [];
  let running = 0, peak = 0, mergeDuringMessage = false, messageRunning = false;
  const p = createPump({
    mem, jobs: 3, commit: (n) => addNode(mem, n), report: (m) => bad.push(`failed: ${m}`),
    summarize: async (j) => {
      const f = first(mem), end = (j.i + 1) * 2 ** j.l;
      if (j.l === 0 && j.i !== f) bad.push(`message ${j.i} started while first is ${f}`);
      if (j.l > 0 && end > f) bad.push(`merge ${label(j)} started past first ${f}`);
      if (j.ctx.some((line) => /^\d+\+\d+\|/.test(line) || line === PLACEHOLDER)) bad.push(`context of ${label(j)} is not bare summaries`);
      if (j.l > 0 && messageRunning) mergeDuringMessage = true;
      starts.push(label(j));
      peak = Math.max(peak, ++running);
      messageRunning = j.l === 0;
      await sleep(3 + (j.i % 3));
      running--;
      messageRunning = false;
      return label(j).padEnd(120, ".");
    },
  });
  for (let i = 0; i < 12; i++) (addMessage(mem, user(i, 2000)), p.pump());
  await until(() => mem.tree.size === 12 + 6 + 3 + 1);
  p.stop();
  expect(bad).toEqual([]);
  expect(starts.filter((s) => s.endsWith("+1")).map((s) => parseInt(s))).toEqual([...Array(12).keys()]); // messages in order
  expect(mergeDuringMessage).toBe(true);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(3);
  expect(built(mem, 3, 0) && !built(mem, 4, 0)).toBe(true); // [0,8) yes, [0,16) needs 16 messages
});

test("a compactor call that hangs times out and is reported once; the node is retried after the wait and gets built", async () => {
  fake({ processes: [[{ hang: true }], [{ reply: "a summary" }]] });
  const mem = newMem(), reports: string[] = [];
  const p = createPump({ mem, retryMs: 20, commit: (n) => addNode(mem, n), report: (m) => reports.push(m), summarize: makeSummarizer({ timeoutMs: 150 }) });
  addMessage(mem, user(0, 2000));
  p.pump();
  await until(() => built(mem, 0, 0));
  p.stop();
  expect(reports).toEqual(["0+1: no result after 0.15s"]);
  expect(getNode(mem, 0, 0)?.text).toBe("a summary");
});

// ---- store, lock, import ----------------------------------------------------------------------------------------------

test("a torn last line is skipped and reported, the file gets its newline, the next write is clean", () => {
  const dir = tmp(), d1 = new Date(2026, 9, 4, 12), [m0, m1] = [newMsg(0, "user", "a", d1), newMsg(1, "user", "b", d1)];
  const file = `${dir}/chat/main/2026-10-04.jsonl`;
  appendMessage(dir, m0);
  appendFileSync(file, JSON.stringify(m1).slice(0, 30)); // crash mid-write: no newline
  const { mem, problems } = loadChat(dir);
  expect(mem.root).toEqual([m0]);
  expect(problems).toEqual(["main/2026-10-04.jsonl:2: not a valid record, skipped"]);
  expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true);
  appendMessage(dir, m1); // the lost message gets written again, on its own line
  const again = loadChat(dir);
  expect(again.mem.root).toEqual([m0, m1]);
  expect(again.problems.length).toBe(1);
  rmSync(dir, { recursive: true });
});

test("a live owner refuses the second process, release frees it, a stale socket is taken over", async () => {
  const dir = tmp();
  const release = await acquireLock(dir);
  await expect(acquireLock(dir)).rejects.toThrow(/already running/);
  release();
  await sleep(10);
  (await acquireLock(dir))();
  // an owner that dies without cleanup leaves the socket file behind
  const child = Bun.spawn(["bun", "-e", `require("node:net").createServer().listen(${JSON.stringify(dir + "/lock")});setInterval(() => {}, 1000)`]);
  try {
    await until(() => existsSync(`${dir}/lock`));
    await sleep(50);
  } finally {
    child.kill(9);
    await child.exited;
  }
  expect(existsSync(`${dir}/lock`)).toBe(true);
  (await acquireLock(dir))();
  rmSync(dir, { recursive: true });
});

test("LOG.txt: fixed-width records give ids, 12:00 local dates and trimmed text, and a log with a gap is refused", () => {
  const rec = (n: number, day: string, text: string) => { // "#<n> <day> <text>" padded with spaces to 319 bytes + newline = 320 bytes
    const head = `#${n} ${day} `;
    return head + text + " ".repeat(319 - bytes(head + text)) + "\n";
  };
  const texts = ["first note", "café été: non-ASCII, padded by bytes", "L".repeat(300), "M".repeat(300), "<script>alert(1)</script> & \"quotes\" 'x'"];
  const days = ["2026-08-08", "2026-08-09", "2026-08-09", "2026-10-04", "2026-10-04"];
  const log = texts.map((t, n) => rec(n, days[n], t)).join("");
  const notes = parseOptmem(log);
  expect(notes.map((n) => n.text)).toEqual(texts);
  expect(notes.map((n) => n.n)).toEqual([0, 1, 2, 3, 4]);
  notes.forEach((n, k) => expect([dayOf(n.date), n.date.getHours(), n.date.getMinutes()]).toEqual([days[k], 12, 0]));
  expect(() => parseOptmem(rec(0, "2026-08-08", "a") + rec(2, "2026-08-08", "c"))).toThrow(/contiguous from 0, expected #1, found #2/);
});

test("import-optmem appends only new notes: a rerun adds nothing, a partial record waits, a changed log is refused", async () => {
  const rec = (n: number, text: string) => { const head = `#${n} 2026-10-0${1 + (n % 3)} `; return head + text + " ".repeat(319 - bytes(head + text)) + "\n"; };
  const dir = tmp(), log = `${dir}/LOG.txt`;
  writeFileSync(log, rec(0, "a") + rec(1, "b"));
  // a chat from before the tags: the first import made notes 0, 1 into messages 0, 1, then the chat went on
  [newMsg(0, "note", "a"), newMsg(1, "note", "b"), newMsg(2, "user", "hi")].forEach((m) => appendMessage(dir, m));
  expect((await importOptmem(dir, log)).added).toBe(0);
  appendFileSync(log, rec(2, "c") + rec(3, "d") + rec(4, "e").slice(0, 100)); // OptMem is still writing #4
  const { mem, added } = await importOptmem(dir, log);
  expect(added).toBe(2);
  expect(mem.root.slice(3).map((m) => [m.i, m.kind, m.text, m.src, dayOf(new Date(m.date))])).toEqual([[3, "note", "c", "optmem:2", "2026-10-03"], [4, "note", "d", "optmem:3", "2026-10-01"]]);
  expect((await importOptmem(dir, log)).added).toBe(0);
  writeFileSync(log, rec(0, "a") + rec(1, "b") + rec(2, "c") + rec(3, "other") + rec(4, "e"));
  await expect(importOptmem(dir, log)).rejects.toThrow(/note #3 differs/);
  expect(loadChat(dir).mem.root.length).toBe(5);
  rmSync(dir, { recursive: true });
});

// ---- the turn: recorded streams, then fake claude ---------------------------------------------------------------------

const fixture = (name: string): any[] => readFileSync(`${import.meta.dir}/fixtures/${name}.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const collector = () => {
  const seen = { texts: [] as string[], thoughts: [] as string[], infos: [] as string[] };
  return { seen, out: { text: (s: string) => void seen.texts.push(s), thinking: (s: string) => void seen.thoughts.push(s), info: (s: string) => void seen.infos.push(s) } };
};
function mapAll(events: any[]) {
  const logs: [string, string][] = [], { seen, out } = collector();
  events.forEach(createMapper({ log: (k, t) => void logs.push([k, t]), out, sent: [] }));
  return { logs, ...seen };
}

test("a real stream with zoom, date and Bash: tool/echo pairs, then the answer; the streamed text is the logged text", () => {
  const r = mapAll(fixture("turn-tools"));
  expect(r.logs.map(([k]) => k)).toEqual(["tool", "echo", "tool", "echo", "tool", "echo", "talk"]);
  expect(r.logs[0]).toEqual(["tool", 'mcp__optchat__zoom {"id":10,"n":1}']);
  expect(r.logs[1][1].startsWith("10+0|note: Fixed the retry wrapper")).toBe(true);
  expect(r.logs[3]).toEqual(["echo", "2026-10-02 15:59"]);
  expect(r.logs[6][1]).toContain("`uname -s` returned `Linux`");
  expect(r.texts.join("")).toBe(r.logs[6][1]);
  expect(r.infos.some((i) => i.startsWith("warning"))).toBe(false); // the optchat MCP server is connected
});

test("a real stream with a thinking block: it carries no text, one dim line is shown, nothing of it is logged", () => {
  const r = mapAll(fixture("turn-thinking"));
  expect(r.logs).toEqual([["talk", "142"]]);
  expect(r.thoughts).toEqual([]);
  expect(r.infos.filter((i) => /^thought for ~\d+ tokens$/.test(i)).length).toBe(1);
});

const init = { type: "system", subtype: "init", mcp_servers: [{ name: "optchat", status: "connected" }] };
const said = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const result = { type: "result", subtype: "success", is_error: false, result: "", stop_reason: "end_turn", usage: {}, duration_ms: 1000 };
const accepted = { events: [{ type: "stream_event", event: { type: "message_start", message: { usage: {} } } }, { $hang: true }] }; // the API took a priming request; claude goes on until it is killed
const reply = { reply: "ok" };
// a chat of three notes and a session on it; the turns run without priming unless `prime` is given
async function rig(script: object, prime: { idleMs: number } | false = false) {
  const dir = tmp(), seed = ["alpha", "beta", "gamma"];
  seed.forEach((t, i) => appendMessage(dir, newMsg(i, "note", t, new Date(2026, 9, 4, 9 + i))));
  const f = fake(script);
  const { chat } = await openChat(dir, { summarize: async () => "a summary" });
  const { seen, out } = collector(), system = writeSystemPrompt(dir), mcp = mcpConfig(dir);
  dirs.push(dirname(system)); // writeSystemPrompt makes a temp dir of its own
  const session = createSession({ chat, out, system, mcp, prime });
  cleanups.push(() => (session.stop(), chat.close()));
  return { chat, session, f, seen, system, mcp, kinds: () => chat.mem.root.slice(seed.length).map((m) => `${m.kind}: ${m.text}`) };
}

test("a message that arrives too late is requeued and gets a fresh call with a new view", async () => {
  const r = await rig({ processes: [
    [{ events: [init, { $replay: true }, said("first answer"), { $wait: true }, result] }], // takes the second message off stdin, never replays it
    [{ events: [init, { $replay: true }, said("second answer"), result] }],
  ] });
  r.session.input("one");
  await until(() => r.f.messages().length === 1);
  r.session.input("two");
  await r.session.whenIdle();
  expect(r.f.starts().length).toBe(2);
  expect(r.kinds()).toEqual(["user: one", "talk: first answer", "user: two", "talk: second answer"]);
  const second = r.f.messages()[2]; // process 0 got the opening message and "two", process 1 got its opening message
  expect(second.at(-1).text).toBe("two");
  expect(second[0].text).toContain("talk: first answer"); // the new view knows the first answer
  expect(second[0].text).not.toContain("user: two"); // and was rendered before "two" was logged
});

test("a cancel kills the call; what the user sent mid-run and was not taken stays in the log, unanswered", async () => {
  const r = await rig({ processes: [[{ events: [init, { $replay: true }, said("thinking out loud"), { $wait: true }, { $hang: true }] }]] });
  r.session.input("go");
  await until(() => r.f.messages().length === 1);
  r.session.input("never seen");
  await until(() => r.f.messages().length === 2 && r.kinds().includes("talk: thinking out loud"));
  r.session.cancel();
  await r.session.whenIdle();
  expect(r.kinds()).toEqual(["user: go", "talk: thinking out loud", "user: never seen"]);
  expect(r.seen.infos.join("\n")).not.toContain("ended without a result");
  await until(() => !alive(r.f.starts()[0].pid), 2000);
});

// ---- priming ----------------------------------------------------------------------------------------------------------

test("a turn primes the view first with the master's own flags and the very blocks it then sends; a changed view is primed in the background, once", async () => {
  const r = await rig({ processes: [[accepted], [reply], [accepted], [reply]] }, { idleMs: 40 });
  r.session.input("hello");
  await r.session.whenIdle();
  const [prime, turn] = r.f.messages(), [a, b] = r.f.starts();
  expect(a.argv).toEqual(masterArgs(r.system, r.mcp));
  expect(b.argv).toEqual(a.argv); // any difference is a cache miss
  expect([a.env.DISABLE_PROMPT_CACHING, b.env.DISABLE_PROMPT_CACHING]).toEqual(["1", undefined]);
  expect(prime.at(-1)).toEqual({ type: "text", text: "ok" });
  expect(prime.slice(0, -1).map((x: any) => x.cache_control)).toEqual([{ type: "ephemeral" }]); // a view this short is one block
  expect(prime.slice(0, -1).map((x: any) => x.text)).toEqual(turn.slice(0, -1).map((x: any) => x.text)); // byte for byte, or the view is rewritten
  expect(turn.some((x: any) => x.cache_control)).toBe(false);
  await until(() => !alive(a.pid), 2000); // killed at message_start, it was never going to finish
  // the turn changed the view: once it stays quiet it is primed in the background, and the next turn doesn't prime it again
  await until(() => r.f.starts().length === 3);
  await sleep(120);
  expect(r.f.starts().length).toBe(3);
  r.session.input("again");
  await r.session.whenIdle();
  expect(r.f.starts().length).toBe(4); // the master only
  const [, , idle, again] = r.f.messages();
  expect(idle.slice(0, -1).map((x: any) => x.text)).toEqual(again.slice(0, -1).map((x: any) => x.text));
});

test("a failing priming is reported once and the turns go on without it", async () => {
  const r = await rig({ processes: [[{ exit: 1, stderr: "boom: not logged in" }], [reply], [{ exit: 1, stderr: "boom" }], [reply]] }, { idleMs: 60_000 });
  r.session.input("one");
  await r.session.whenIdle();
  r.session.input("two");
  await r.session.whenIdle();
  expect(r.f.starts().length).toBe(4);
  expect(r.kinds()).toEqual(["user: one", "user: two"]);
  expect(r.seen.infos.filter((i) => i.startsWith("priming failed"))).toEqual([expect.stringContaining("boom: not logged in")]);
});

test("a cancel while the view is being primed leaves the message unanswered and starts no call", async () => {
  const r = await rig({ processes: [[{ hang: true }]] }, { idleMs: 60_000 });
  r.session.input("go");
  await until(() => r.f.messages().length === 1);
  r.session.cancel();
  await r.session.whenIdle();
  expect(r.kinds()).toEqual(["user: go"]);
  expect(r.f.starts().length).toBe(1);
});

// ---- children never outlive their parent ------------------------------------------------------------------------------

// A process that starts a claude through spawnClaude, then waits for a line on its stdin. Bun.spawn without `env` passes
// the environment the test run started with, not this process.env: pass it explicitly, or `claude` would be the real one.
const harness = (bin: string) => {
  const code = `import { spawnClaude } from ${JSON.stringify(`${import.meta.dir}/claude.ts`)};
    if (!process.env["OPTCHAT_CLAUDE"]) throw new Error("this would start the real claude");
    spawnClaude(["-p"]).send([{ type: "text", text: "hi" }]);
    for await (const _ of console) break;
    process.exit(0);`;
  return Bun.spawn([process.execPath, "-e", code], { env: { ...process.env, OPTCHAT_CLAUDE: bin }, stdin: "pipe", stdout: "ignore", stderr: "inherit" });
};

test("a harness that exits or is terminated takes its claude along, even one that never reads stdin", async () => {
  const dir = tmp(), pidfile = `${dir}/pid`, deaf = `${dir}/deaf`;
  writeFileSync(deaf, `#!/bin/sh\necho $$ > ${pidfile}\nexec sleep 60\n`, { mode: 0o755 }); // only a signal ends it
  for (const end of ["exit", "SIGTERM"]) {
    rmSync(pidfile, { force: true });
    const h = harness(deaf);
    await until(() => existsSync(pidfile) && readFileSync(pidfile, "utf8").trim() !== "");
    const pid = Number(readFileSync(pidfile, "utf8"));
    cleanups.push(() => alive(pid) && process.kill(pid, "SIGKILL"));
    if (end === "exit") (h.stdin.write("go\n"), h.stdin.flush());
    else h.kill("SIGTERM");
    await h.exited;
    await until(() => !alive(pid), 2000);
  }
});

test("a hung fake claude ends when its harness is killed: its stdin closes, it does not spin as an orphan", async () => {
  const f = fake([{ hang: true }]), h = harness(FAKE);
  await until(() => f.messages().length === 1);
  h.kill("SIGKILL"); // no exit hook runs
  await h.exited;
  await until(() => !alive(f.starts()[0].pid), 2000);
});

// ---- the terminal input -----------------------------------------------------------------------------------------------

test("a bracketed paste is ONE message wherever the terminal cuts its chunks (markers, CR, CRLF); Enter outside a paste sends", () => {
  const input = "\x1b[A\x1b[200~alpha\r\nbeta\rgamma\nπ\x1b[201~\rnext\r"; // an arrow key, a paste with every kind of newline, Enter, a typed line
  const every = Array.from({ length: input.length - 1 }, (_, k) => k + 1);
  for (const cuts of [[], ...every.map((k) => [k]), every]) { // whole, cut once anywhere, cut everywhere
    const sent: string[] = [];
    let line = "";
    const feed = createKeys({ text: (s) => (line += s), key: (k) => { if (k === "enter") { sent.push(line); line = ""; } } });
    [0, ...cuts].forEach((from, k, all) => feed(input.slice(from, all[k + 1])));
    expect(sent).toEqual(["alpha\nbeta\ngamma\nπ", "next"]);
  }
});

test("usage aggregation: local days and ISO weeks, legacy lines are turns, bad lines skipped", () => {
  const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString(); // local times, October 2026
  const u = (input: number, read: number, write: number, output: number) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: output });
  const text = [
    { date: at(4, 23), usage: u(10, 80, 10, 5) }, // before kinds: a turn
    { date: at(4, 1), kind: "compact", model: "m", usage: u(0, 50, 50, 7) },
    { date: at(4, 2), kind: "prime", model: "m", usage: null },
    { date: at(1, 12), kind: "turn", usage: u(1, 2, 3, 4) }, // Thursday of the previous ISO week
    { date: at(1, 12), kind: "turn", usage: u(1, 0, 0, 0) },
  ].map((e) => JSON.stringify(e)).join("\n") + "\nnot json\n";
  const { day, week } = aggregate(text, new Date(2026, 9, 4, 23, 30), 3, 2);
  expect(day.map((r) => r.period)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  expect(day[2]).toMatchObject({ calls: { turn: 1, compact: 1, prime: 1 }, input: 10, read: 130, write: 60, output: 12 });
  expect(hit(day[2])).toBe("65.0%");
  expect(hit(day[0])).toBe("–");
  expect(week.map((r) => r.period)).toEqual(["2026-W39", "2026-W40"]);
  expect(week[1].calls).toEqual({ turn: 3, compact: 1, prime: 1 }); // Sun 4 Oct and Thu 1 Oct: both W40
  expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
  expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
});
