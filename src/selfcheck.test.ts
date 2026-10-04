// Selfcheck: no model calls. The compactor is a fake, the data dirs are temp dirs.
import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { browseHtml } from "./browse.ts";
import { openChat } from "./chat.ts";
import { type Job, type Summarize, buildFree, createPump } from "./compactor.ts";
import { CAP, MASTER_EFFORT, MASTER_MODEL, MASTER_PERMISSION, MASTER_TOOLS, NODE, TRIES } from "./config.ts";
import { TOOLS, date, zoom } from "./mcp.ts";
import { importOptmem, parseOptmem } from "./import.ts";
import { acquireLock, appendMessage, appendNode, committer, loadChat, newMsg } from "./store.ts";
import { COMPACT_FILE, SCALE, type CallInfo, blocks, cut, makeSummarizer } from "./summarize.ts";
import { type Sent, cap, createMapper, createSession, masterArgs, mcpConfig, writeSystemPrompt } from "./turn.ts";
import { type Mem, built, bytes, coords, dayOf, freeText, getNode, label, newMem, ready, setNode, span } from "./tree.ts";
import { PLACEHOLDER, addMessage, addNode, allBuilt, context, cutBlocks, first, refold, render, settle } from "./view.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));
const until = async (ok: () => boolean, ms = 3000) => { for (const t = Date.now(); !ok(); await sleep(2)) if (Date.now() - t > ms) throw new Error("timeout"); };
const user = (i: number, size: number) => newMsg(i, "user", "a".repeat(size - "user: ".length)); // "user: …" is exactly `size` bytes
const node = (l: number, i: number, size: number) => ({ l, i, text: "n".repeat(size), size });
const tmp = () => mkdtempSync(`${tmpdir()}/optchat-test-`);
const mergeable = (mem: Mem) => mem.view.some((a, k) => { const b = mem.view[k + 1]; return b && a.l === b.l && a.i % 2 === 0 && b.i === a.i + 1 && built(mem, a.l + 1, a.i / 2); });

const FAKE = `${import.meta.dir}/fake-claude.ts`;
const alive = (pid: number) => { try { return process.kill(pid, 0); } catch { return false; } };
// a fake `claude` for the code under test (see fake-claude.ts for the script format)
function fake(script: object) {
  const dir = tmp(), log = `${dir}/log.jsonl`;
  writeFileSync(log, "");
  writeFileSync(`${dir}/script.json`, JSON.stringify(script));
  Object.assign(process.env, { OPTCHAT_CLAUDE: FAKE, FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_SCRIPT: `${dir}/script.json` });
  const entries = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { starts: () => entries().filter((e) => e.argv), messages: () => entries().filter((e) => e.message).map((e) => e.message.message.content) };
}
afterEach(() => { for (const k of ["OPTCHAT_CLAUDE", "FAKE_CLAUDE_LOG", "FAKE_CLAUDE_SCRIPT"]) delete process.env[k]; });

describe("tree", () => {
  test("id+n names a node by its first message and the messages it covers", () => {
    expect(span({ l: 3, i: 5 })).toEqual({ id: 40, n: 8 });
    expect(label({ l: 0, i: 7 })).toBe("7+1");
    expect(coords(40, 8, 100)).toEqual({ l: 3, i: 5 });
    expect(coords(96, 8, 104)).toEqual({ l: 3, i: 12 });
  });
  test("rejects what is not a node", () => {
    for (const [id, n, T] of [[40, 3, 100], [6, 4, 100], [96, 8, 100], [0, 0, 9], [-8, 8, 100], [0.5, 1, 9], [0, 2.5, 9], [NaN, 1, 9]])
      expect(coords(id, n, T)).toBeNull();
  });
  test("free node: a message that fits NODE is its own node, bytes not characters", () => {
    const mem = newMem();
    mem.root.push(user(0, NODE), user(1, NODE + 1), newMsg(2, "talk", "é".repeat(300)));
    expect(bytes(freeText(mem, 0, 0)!)).toBe(NODE);
    expect(freeText(mem, 0, 0)).toBe("user: " + "a".repeat(NODE - 6));
    expect(freeText(mem, 0, 1)).toBeNull();
    expect(mem.root[2].size).toBe(bytes("talk: " + "é".repeat(300)));
    expect(freeText(mem, 0, 2)).toBeNull(); // 300 characters, 606 bytes
  });
  test("free node: two built lines merge for free when both and the newline fit", () => {
    const mem = newMem();
    [255, 256, 256, 256].forEach((size, i) => setNode(mem, node(0, i, size)));
    expect(freeText(mem, 1, 0)).toBe("n".repeat(255) + "\n" + "n".repeat(256)); // exactly 512
    expect(freeText(mem, 1, 1)).toBeNull(); // 513
    expect(ready(mem, 1, 0) && ready(mem, 1, 1) && !ready(mem, 1, 2)).toBe(true);
  });
});

describe("view", () => {
  test("renders id+n|text, newlines as spaces, the placeholder while unbuilt", () => {
    const mem = newMem();
    expect(render(mem)).toBe("<chat>\n</chat>");
    addMessage(mem, newMsg(0, "user", "hi"));
    addMessage(mem, newMsg(1, "talk", "yo"));
    addNode(mem, { l: 0, i: 0, text: "a\r\nb\nc", size: 5 });
    expect(render(mem)).toBe(`<chat>\n0+1|a b c\n1+1|${PLACEHOLDER}\n</chat>`);
    expect(allBuilt(mem)).toBe(false);
    expect(first(mem)).toBe(1);
    expect(context(mem, 1)).toEqual(["a b c"]);
    expect(() => context(mem, 2)).toThrow(/rule 3/);
    addNode(mem, { l: 0, i: 1, text: "b", size: 1 });
    expect(allBuilt(mem) && first(mem) === 2).toBe(true);
  });
  test("merges the most due pair first: age / 2^(l+2)", () => {
    const mem = newMem(700);
    for (let i = 0; i < 8; i++) (setNode(mem, node(0, i, 100)), addMessage(mem, user(i, 600)));
    for (let i = 0; i < 4; i++) addNode(mem, node(1, i, 150)); // 800 bytes > 700: two merges, oldest first
    expect(mem.view.map(label)).toEqual(["0+2", "2+2", "4+1", "5+1", "6+1", "7+1"]);
  });
  test("only merges into parents that are built, and waits otherwise", () => {
    const mem = newMem(300);
    for (let i = 0; i < 4; i++) (setNode(mem, node(0, i, 100)), addMessage(mem, user(i, 600)));
    expect(mem.view.length).toBe(4); // 400 > 300, no parent yet
    addNode(mem, node(1, 1, 150)); // the newer pair first: it is the only one available
    expect(mem.view.map(label)).toEqual(["0+1", "1+1", "2+2"]);
  });
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
  test("settle waits for every part and honors abort", async () => {
    const mem = newMem();
    expect(await settle(mem)).toBe(true);
    addMessage(mem, user(0, 2000));
    let got: boolean | undefined;
    const waiting = settle(mem).then((v) => (got = v));
    await sleep(3);
    expect(got).toBeUndefined();
    addNode(mem, node(0, 0, 100));
    await waiting;
    expect(got).toBe(true);
    addMessage(mem, user(1, 2000));
    const ac = new AbortController(), w = settle(mem, ac.signal);
    ac.abort();
    expect(await w).toBe(false);
    expect(mem.waiters.size).toBe(0);
    expect(await settle(mem, ac.signal)).toBe(false);
  });
});

describe("fit invariants with an instant compactor", () => {
  test("view tiles [0,T), is under budget once parents exist, never splits, refold equals live", async () => {
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
});

describe("pump", () => {
  test("rule 3: messages one at a time in order, merges alongside, at most JOBS at once", async () => {
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
  test("free nodes cost no call, even past a message that is still being summarized", async () => {
    const mem = newMem();
    let calls = 0;
    const p = createPump({ mem, commit: (n) => addNode(mem, n), summarize: async () => (calls++, "m".repeat(150)) });
    [40, 40, 2000, 40].forEach((size, i) => addMessage(mem, user(i, size)));
    p.pump();
    expect([built(mem, 0, 0), built(mem, 0, 1), built(mem, 1, 0), built(mem, 0, 2), built(mem, 0, 3)]).toEqual([true, true, true, false, true]); // synchronous
    await until(() => built(mem, 2, 0)); // message 2 done: [2,4) and [0,4) are free merges
    expect(calls).toBe(1);
    expect(mem.tree.size).toBe(7);
    p.stop();
  });
  test("a failing node is reported once, retried after the wait, and an empty reply counts as failure", async () => {
    const mem = newMem(), reports: string[] = [];
    let tries = 0;
    const p = createPump({
      mem, retryMs: 4, commit: (n) => addNode(mem, n), report: (m) => reports.push(m),
      summarize: async () => { if (++tries <= 2) throw new Error("boom"); if (tries === 3) return "  \n"; return "done ".repeat(30); },
    });
    addMessage(mem, user(0, 2000));
    p.pump();
    await until(() => built(mem, 0, 0));
    expect(tries).toBe(4);
    expect(reports).toEqual(["0+1: boom"]); // the empty reply is a second failure of the same node: not reported again
    expect(p.busy.size).toBe(0);
  });
  test("stop() ends the retries", async () => {
    const mem = newMem();
    let tries = 0;
    const p = createPump({ mem, retryMs: 3, commit: (n) => addNode(mem, n), summarize: async () => { tries++; throw new Error("x"); } });
    addMessage(mem, user(0, 2000));
    p.pump();
    await until(() => tries >= 2);
    p.stop();
    const seen = tries;
    await sleep(20);
    expect(tries).toBe(seen);
  });
});

describe("store", () => {
  const d1 = new Date(2026, 9, 4, 12), d2 = new Date(2026, 9, 5, 12);
  const file = (dir: string, day = "2026-10-04") => `${dir}/chat/main/${day}.jsonl`;

  test("round trip: files by local day, nodes, view folded at load", () => {
    const dir = tmp();
    const msgs = [newMsg(0, "user", "hello", d1), newMsg(1, "talk", "é".repeat(400), d1), newMsg(2, "user", "next day", d2)];
    msgs.forEach((m) => appendMessage(dir, m));
    appendNode(dir, { l: 0, i: 0, text: "user: hello", size: 11 });
    expect(dayOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(readdirSync(`${dir}/chat/main`).sort()).toEqual(["2026-10-04.jsonl", "2026-10-05.jsonl"]);
    expect(readdirSync(`${dir}/chat/tree`)).toEqual([`${dayOf(new Date())}.jsonl`]);
    const { mem, problems } = loadChat(dir);
    expect(problems).toEqual([]);
    expect(mem.root).toEqual(msgs);
    expect(getNode(mem, 0, 0)?.text).toBe("user: hello");
    expect(mem.view.map(label)).toEqual(["0+1", "1+1", "2+1"]);
    rmSync(dir, { recursive: true });
  });
  test("a torn last line is skipped and reported, the file gets its newline, the next write is clean", () => {
    const dir = tmp(), [m0, m1] = [newMsg(0, "user", "a", d1), newMsg(1, "user", "b", d1)];
    appendMessage(dir, m0);
    appendFileSync(file(dir), JSON.stringify(m1).slice(0, 30)); // crash mid-write: no newline
    const { mem, problems } = loadChat(dir);
    expect(mem.root).toEqual([m0]);
    expect(problems).toEqual(["main/2026-10-04.jsonl:2: not a valid record, skipped"]);
    expect(readFileSync(file(dir), "utf8").endsWith("\n")).toBe(true);
    appendMessage(dir, m1); // the lost message gets written again, on its own line
    const again = loadChat(dir);
    expect(again.mem.root).toEqual([m0, m1]);
    expect(again.problems.length).toBe(1);
    rmSync(dir, { recursive: true });
  });
  test("a complete last line without a newline is kept; a garbage line in the middle is skipped", () => {
    const dir = tmp(), [m0, m1] = [newMsg(0, "user", "a", d1), newMsg(1, "user", "b", d1)];
    appendMessage(dir, m0);
    appendFileSync(file(dir), "{not json}\n" + JSON.stringify(m1));
    const { mem, problems } = loadChat(dir);
    expect(mem.root).toEqual([m0, m1]);
    expect(problems.length).toBe(1);
    expect(readFileSync(file(dir), "utf8").endsWith("\n")).toBe(true);
    rmSync(dir, { recursive: true });
  });
  test("message ids must be 0, 1, 2, ...", () => {
    const dir = tmp();
    (appendMessage(dir, newMsg(0, "user", "a", d1)), appendMessage(dir, newMsg(2, "user", "c", d1)));
    expect(() => loadChat(dir)).toThrow(/expected message 1, found 2/);
    rmSync(dir, { recursive: true });
  });
  test("a node is never replaced: the first record wins", () => {
    const dir = tmp();
    appendMessage(dir, user(0, 2000)), appendNode(dir, node(0, 0, 10)), appendNode(dir, { l: 0, i: 0, text: "later", size: 5 });
    expect(getNode(loadChat(dir).mem, 0, 0)?.text).toBe("n".repeat(10));
    rmSync(dir, { recursive: true });
  });
});

describe("lock", () => {
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
});

describe("import-optmem, view, browse", () => {
  // a LOG.txt record: "#<n> <day> <text>" padded with spaces to 319 bytes + newline = 320 bytes
  const rec = (n: number, day: string, text: string) => {
    const head = `#${n} ${day} `;
    return head + text + " ".repeat(319 - bytes(head + text)) + "\n";
  };
  const texts = ["first note", "caf\u00e9 \u00e9t\u00e9: non-ASCII, padded by bytes", "L".repeat(300), "M".repeat(300), "<script>alert(1)</script> & \"quotes\" 'x'"];
  const days = ["2026-08-08", "2026-08-09", "2026-08-09", "2026-10-04", "2026-10-04"];
  const log = texts.map((t, n) => rec(n, days[n], t)).join("");
  const logFile = () => { const f = `${tmp()}/LOG.txt`; writeFileSync(f, log); return f; };

  test("parses fixed-width records: ids, 12:00 local dates, trimmed text", () => {
    expect(log.split("\n").slice(0, -1).every((l) => bytes(l) === 319)).toBe(true);
    const notes = parseOptmem(log);
    expect(notes.map((n) => n.text)).toEqual(texts);
    expect(notes.map((n) => n.n)).toEqual([0, 1, 2, 3, 4]);
    notes.forEach((n, k) => expect([dayOf(n.date), n.date.getHours(), n.date.getMinutes()]).toEqual([days[k], 12, 0]));
    expect(parseOptmem(log.trimEnd()).length).toBe(5); // no final newline is fine
    expect(parseOptmem("")).toEqual([]);
  });
  test("refuses what is not a clean log", () => {
    expect(() => parseOptmem(rec(0, "2026-08-08", "a") + rec(2, "2026-08-08", "c"))).toThrow(/contiguous from 0, expected #1, found #2/);
    expect(() => parseOptmem(rec(1, "2026-08-08", "a"))).toThrow(/expected #0, found #1/);
    expect(() => parseOptmem("hello\n")).toThrow(/line 1 is not/);
    expect(() => parseOptmem(rec(0, "2026-08-08", "a") + "\n" + rec(1, "2026-08-08", "b"))).toThrow(/line 2 is not/);
    expect(() => parseOptmem(rec(0, "2026-13-45", "a"))).toThrow(/bad date/);
  });
  test("imports into an empty chat only; the free nodes are built; a bad file writes nothing", async () => {
    const dir = tmp(), file = logFile();
    const mem = await importOptmem(dir, file);
    const again = loadChat(dir);
    expect(again.problems).toEqual([]);
    expect(again.mem.root.map((m) => [m.i, m.kind, m.text])).toEqual(texts.map((t, i) => [i, "note", t]));
    expect(again.mem.root.map((m) => dayOf(new Date(m.date)))).toEqual(days);
    expect(again.mem.root[1].size).toBe(bytes("note: " + texts[1]));
    expect(getNode(again.mem, 0, 3)?.text).toBe("note: " + texts[3]); // free level 0
    expect(getNode(again.mem, 1, 0)?.text).toBe(`note: ${texts[0]}\nnote: ${texts[1]}`); // free merge of two short notes
    expect(built(again.mem, 1, 1)).toBe(false); // 306 + 1 + 306 bytes needs the model; (2,0) waits for it
    expect(again.mem.tree.size).toBe(mem.tree.size);
    expect(again.mem.tree.size).toBe(5 + 1); // 5 notes and the merge (1,0)
    expect(allBuilt(again.mem)).toBe(true);
    await expect(importOptmem(dir, file)).rejects.toThrow(/already holds 5 messages/);
    (await acquireLock(dir))(); // the lock was released, also after the failure

    const bad = tmp();
    writeFileSync(`${bad}/LOG.txt`, rec(0, "2026-08-08", "a") + "junk\n");
    await expect(importOptmem(bad, `${bad}/LOG.txt`)).rejects.toThrow(/line 2/);
    expect(existsSync(`${bad}/chat`)).toBe(false);
  });
  test("a reader never repairs: a torn last line stays untouched and quiet, a garbage line is reported", () => {
    const dir = tmp(), m0 = newMsg(0, "user", "a", new Date(2026, 9, 4, 12)), m1 = newMsg(1, "user", "b", new Date(2026, 9, 4, 12));
    appendMessage(dir, m0);
    const f = `${dir}/chat/main/2026-10-04.jsonl`;
    appendFileSync(f, JSON.stringify(m1).slice(0, 30));
    const before = readFileSync(f, "utf8");
    const r = loadChat(dir, { repair: false });
    expect([r.mem.root.length, r.problems]).toEqual([1, []]);
    expect(readFileSync(f, "utf8")).toBe(before);
    appendFileSync(f, "\n{garbage}\n");
    expect(loadChat(dir, { repair: false }).problems.length).toBe(2); // the earlier torn line is now a complete bad line
  });
  test("browse: one self-contained page, all text escaped, with ranges, time spans and sizes", async () => {
    const dir = tmp();
    const html = browseHtml(await importOptmem(dir, logFile()));
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#34;quotes&#34; &#39;x&#39;");
    expect(html).not.toMatch(/<script|<link|<img|src=|href=|https?:\/\//i);
    expect(html).toContain("View · 5 lines");
    expect(html).toContain("ROOT · 5 messages");
    expect(html).toContain("Level 0 · 5 nodes");
    expect(html).toContain("Level 1 · 1 nodes");
    expect(html).toContain("<td>0+2</td><td>0\u20131</td><td>2026-08-08 12:00 \u2192 2026-08-09 12:00</td>"); // range and time span of the merge
    expect(html).toContain(`<td class="n">${bytes("note: " + texts[3])}</td>`);
  });
  test("cli: import, view and browse end to end; view on an empty dir creates nothing", () => {
    const dir = `${tmp()}/d`, cli = `${import.meta.dir}/cli.ts`, out = `${tmp()}/page.html`;
    const run = (...args: string[]) => Bun.spawnSync(["bun", cli, ...args], { env: { ...process.env, OPTCHAT_DIR: dir } });
    const text = (r: { stdout: Buffer }) => r.stdout.toString();
    expect(text(run("view"))).toBe("<chat>\n</chat>\n");
    expect(existsSync(dir)).toBe(false);
    const imp = run("import-optmem", logFile());
    expect(imp.exitCode).toBe(0);
    expect(text(imp)).toContain("imported 5 notes");
    const view = text(run("view"));
    expect(view.startsWith("<chat>\n0+1|note: first note\n1+1|note: caf\u00e9")).toBe(true);
    expect(view.endsWith("</chat>\n")).toBe(true);
    expect(run("browse", out).exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("<title>OptChat</title>");
    expect(run("import-optmem", logFile()).exitCode).toBe(1); // not empty any more
    expect(run("nope").exitCode).toBe(2);
  });
});

describe("compactor calls (fake claude, no model)", () => {
  const msgJob = (text = "hi", ctx: string[] = []): Job => ({ l: 0, i: ctx.length, ctx, msg: newMsg(ctx.length, "user", text) });
  const mergeJob = (a: string, b: string, ctx: string[] = []): Job => ({ l: 1, i: 0, ctx, a, b });
  test("SCALE is exactly NODE bytes with no newline, compact.txt is the gist's COMPACT prompt verbatim", () => {
    expect(bytes(SCALE)).toBe(NODE);
    expect(SCALE.includes("\n")).toBe(false);
    expect(readFileSync(`${import.meta.dir}/../prompts/scale.txt`).length).toBe(NODE);
    const gist = readFileSync(`${import.meta.dir}/../docs/optchat-gist.md`, "utf8");
    const fenced = /```\n([\s\S]*?)\n```/.exec(gist.slice(gist.indexOf("### 4.4 The compactor prompt (COMPACT), verbatim")))![1];
    expect(readFileSync(COMPACT_FILE, "utf8")).toBe(fenced);
  });
  test("blocks: a short chat is one marked block, the step comes after it unmarked", () => {
    const b = blocks(msgJob("hello\nworld", ["line one", "line two"]));
    expect(b.length).toBe(2);
    expect(b[0]).toEqual({ type: "text", text: "<chat>\nline one\nline two\n</chat>", cache_control: { type: "ephemeral" } });
    expect(b[1].cache_control).toBeUndefined();
    expect(b[1].text).toBe(`For scale, this line is exactly 512 bytes:\n${SCALE}\n\nCompress this message into one line, in at most 512 bytes:\nuser: hello\nworld`);
  });
  test("blocks: a merge flattens the two lines; an empty chat is still one block", () => {
    const b = blocks(mergeJob("a\nb", "c d"));
    expect(b[0].text).toBe("<chat>\n</chat>");
    expect(b[1].text.endsWith("Merge these two lines into one, in at most 512 bytes:\na b\nc d")).toBe(true);
  });
  test("blocks: a long chat is cut at the 50k/80k/100k marks, every piece marked, the step not", () => {
    const ctx = Array.from({ length: 700 }, (_, i) => `${i} ${"y".repeat(248)}`);
    const b = blocks(msgJob("x", ctx));
    expect(b.length).toBe(5);
    expect(b.slice(0, 4).every((x) => x.cache_control?.type === "ephemeral")).toBe(true);
    expect(b[4].cache_control).toBeUndefined();
    expect(b.slice(0, 4).map((x) => x.text).join("")).toBe(`<chat>\n${ctx.join("\n")}\n</chat>`);
    let at = 0;
    [50_000, 80_000, 100_000].forEach((mark, k) => {
      at += b[k].text.length;
      expect(at).toBeLessThanOrEqual(mark);
      expect(at).toBeGreaterThan(mark - 300); // the last line end before the mark
      expect(b[k].text.endsWith("\n")).toBe(true);
    });
    expect(b[3].text.endsWith("</chat>")).toBe(true);
  });
  test("cut keeps whole UTF-8 characters", () => {
    expect(bytes(cut("a".repeat(600)))).toBe(512);
    expect(cut("é".repeat(300))).toBe("é".repeat(256)); // 512 is a character boundary
    const split = cut("x" + "é".repeat(300)); // 512 falls inside the 256th é
    expect([split.includes("�"), bytes(split)]).toEqual([false, 511]);
    expect(cut("short")).toBe("short");
  });

  test("one call: flags, env, blocks, trimmed reply, usage hook, and the process is gone afterwards", async () => {
    const f = fake([{ reply: "  a summary line \n" }]), calls: CallInfo[] = [];
    const job = msgJob("hi", ["one"]);
    expect(await makeSummarizer({ onCall: (c) => calls.push(c) })(job)).toBe("a summary line");
    const [start] = f.starts();
    expect(start.argv).toEqual(["-p", "--model", "sonnet", "--effort", "medium", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--include-partial-messages", "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config", "--system-prompt-file", COMPACT_FILE, "--tools", "", "--safe-mode"]);
    expect(start.env).toEqual({ DISABLE_PROMPT_CACHING: "1", CLAUDE_CODE_PROMPT_CACHE_TTL: "5m" });
    expect(f.messages()).toEqual([blocks(job)]);
    expect(calls.map((c) => [c.attempt, c.usage.output_tokens])).toEqual([[1, 5]]);
    await until(() => !alive(start.pid), 2000);
  });
  test("size retries stay in the same process and show the cut; the shortest try wins", async () => {
    const w = (n: number) => "w".repeat(n), f = fake([{ reply: w(600) }, { reply: w(530) }, { reply: w(400) }]);
    expect(await makeSummarizer()(msgJob())).toBe(w(400));
    const sent = f.messages();
    expect(sent.length).toBe(3);
    expect(sent[1]).toEqual([{ type: "text", text: `That line is 600 bytes; the limit is 512. It must end where it is cut here:\n${w(512)}| ← LIMIT` }]);
    expect(sent[2][0].text.startsWith("That line is 530 bytes;")).toBe(true);
    expect(f.starts().length).toBe(1);
  });
  test("after TRIES attempts a stubborn node keeps its shortest try", async () => {
    const f = fake([540, 530, 520, 525, 515, 100].map((n) => ({ reply: "a".repeat(n) })));
    expect(bytes(await makeSummarizer()(msgJob()))).toBe(515);
    expect(f.messages().length).toBe(TRIES);
  });
  test("a refusal, an empty reply, an error result, an early exit and an empty retry fail the node", async () => {
    const fails = async (script: object[], why: RegExp) => { fake(script); await expect(makeSummarizer()(msgJob())).rejects.toThrow(why); };
    await fails([{ reply: "", stop_reason: "refusal" }], /refused/);
    await fails([{ reply: "  \n" }], /empty reply/);
    await fails([{ is_error: true, reply: "API Error: overloaded" }], /overloaded/);
    await fails([{ exit: 3, stderr: "boom: not logged in" }], /code 3.*boom: not logged in/);
    await fails([{ reply: "a".repeat(600) }, { reply: "" }], /empty reply/);
  });
  test("a call that never answers times out; a missing binary fails the node, not the process", async () => {
    fake([{ hang: true }]);
    await expect(makeSummarizer({ timeoutMs: 150 })(msgJob())).rejects.toThrow(/no result after 0.15s/);
    process.env["OPTCHAT_CLAUDE"] = "/nonexistent/claude";
    await expect(makeSummarizer()(msgJob())).rejects.toThrow();
  });
  test("pump + summarizer: nodes get built and each call sees only the earlier summaries", async () => {
    const f = fake([{ reply: "summary line" }]), mem = newMem(), reports: string[] = [];
    const p = createPump({ mem, jobs: 2, commit: (n) => addNode(mem, n), summarize: makeSummarizer(), report: (m) => reports.push(m) });
    [2000, 2000, 2000].forEach((size, i) => addMessage(mem, user(i, size)));
    p.pump();
    await until(() => built(mem, 0, 2) && built(mem, 1, 0), 10_000); // (1,0) is a free merge of two 12-byte summaries
    p.stop();
    expect(reports).toEqual([]);
    expect(f.messages().map((c) => c[0].text).sort()).toEqual(["<chat>\n</chat>", "<chat>\nsummary line\n</chat>", "<chat>\nsummary line\nsummary line\n</chat>"]);
  });
});

describe("mcp tools", () => {
  const four = () => {
    const m = newMem();
    ["one", "two", "three\nlines", "four"].forEach((t, i) => addMessage(m, newMsg(i, i % 2 ? "talk" : "user", t, new Date(2026, 9, 4, 10 + i, 7))));
    return m;
  };
  const built4 = () => { const m = four(); buildFree(m, (n) => addNode(m, n)); return m; }; // 4 lines, (1,0), (1,1), (2,0)

  test("zoom opens a line into the two lines under it, and gives the message whole at n = 1", () => {
    const m = built4();
    expect(zoom(m, 0, 1)).toBe("0+0|user: one");
    expect(zoom(m, 2, 1)).toBe("2+0|user: three\nlines"); // newlines kept
    expect(zoom(m, 0, 2)).toBe("0+1|user: one\n1+1|talk: two");
    expect(zoom(m, 2, 2)).toBe("2+1|user: three lines\n3+1|talk: four"); // lines flattened like the view
    expect(zoom(m, 0, 4)).toBe("0+2|user: one talk: two\n2+2|user: three lines talk: four");
  });
  test("zoom says 'No line id+n.' for anything that is not a built line", () => {
    const m = built4();
    for (const [id, n] of [[1, 2], [0, 3], [0, 8], [4, 1], [-1, 1], [0, 0], [0.5, 1], ["0", 1], [undefined, 1]]) expect(zoom(m, id, n)).toBe(`No line ${id}+${n}.`);
    const bare = four(); // no nodes built yet
    expect(zoom(bare, 0, 2)).toBe("No line 0+2.");
    expect(zoom(bare, 0, 1)).toBe("0+0|user: one"); // a message can always be opened
  });
  test("date is the local time of the message", () => {
    const m = built4();
    expect(date(m, 1)).toBe("2026-10-04 11:07");
    for (const id of [4, -1, 1.5, "1", undefined]) expect(date(m, id)).toBe(`No message ${id}.`);
  });
  test("the tool descriptions are the gist's, verbatim", () => {
    const gist = readFileSync(`${import.meta.dir}/../docs/optchat-gist.md`, "utf8").replace(/\n\s+/g, " ");
    for (const t of TOOLS) expect(gist).toContain(`- ${t.name}: "${t.description}"`);
    expect(TOOLS.map((t) => t.name)).toEqual(["zoom", "date"]);
  });
  test("the stdio server: initialize, list, call; it reads the disk afresh and never takes the lock", async () => {
    const dir = tmp(), { mem } = loadChat(dir);
    ["one", "two", "three", "four"].forEach((t, i) => { const m = newMsg(i, "user", t, new Date(2026, 9, 4, 10 + i, 7)); appendMessage(dir, m); addMessage(mem, m); });
    buildFree(mem, committer(dir, mem));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // bun test runs in UTC, a child would use the system zone
    const proc = Bun.spawn(["bun", `${import.meta.dir}/cli.ts`, "mcp"], { env: { ...process.env, OPTCHAT_DIR: dir, TZ: tz }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const reader = proc.stdout.getReader(), dec = new TextDecoder();
    let buf = "";
    const rpc = async (req: object) => {
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...req }) + "\n");
      proc.stdin.flush();
      while (!buf.includes("\n")) { const r = await reader.read(); if (r.done) throw new Error("the server closed its output"); buf += dec.decode(r.value); }
      const line = buf.slice(0, buf.indexOf("\n"));
      buf = buf.slice(line.length + 1);
      return JSON.parse(line);
    };
    const text = (r: any) => r.result.content[0].text, call = (name: string, args: object) => ({ method: "tools/call", params: { name, arguments: args } });
    try {
      expect((await rpc({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).result).toEqual({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "optchat", version: "1" } });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"); // a notification gets no answer
      expect((await rpc({ id: 2, method: "tools/list" })).result.tools).toEqual(TOOLS);
      expect(text(await rpc({ id: 3, ...call("zoom", { id: 0, n: 2 }) }))).toBe("0+1|user: one\n1+1|user: two");
      expect(text(await rpc({ id: 4, ...call("date", { id: 2 }) }))).toBe("2026-10-04 12:07");
      appendMessage(dir, newMsg(4, "talk", "five", new Date(2026, 9, 5, 8, 30))); // written after the server started
      expect(text(await rpc({ id: 5, ...call("zoom", { id: 4, n: 1 }) }))).toBe("4+0|talk: five");
      const bad = await rpc({ id: 6, ...call("nope", {}) });
      expect([bad.result.isError, text(bad)]).toEqual([true, "error: unknown tool nope"]);
      expect((await rpc({ id: 7, method: "bogus" })).error.code).toBe(-32601);
      expect((await rpc({ id: 8, method: "ping" })).result).toEqual({});
      expect(existsSync(`${dir}/lock`)).toBe(false);
    } finally {
      proc.kill();
      rmSync(dir, { recursive: true });
    }
  });
});

const read = (f: string) => readFileSync(`${import.meta.dir}/../prompts/${f}`, "utf8");
const fixture = (name: string): any[] => readFileSync(`${import.meta.dir}/fixtures/${name}.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const collector = () => {
  const seen = { texts: [] as string[], thoughts: [] as string[], infos: [] as string[] };
  return { seen, out: { text: (s: string) => void seen.texts.push(s), thinking: (s: string) => void seen.thoughts.push(s), info: (s: string) => void seen.infos.push(s) } };
};
function mapAll(events: any[], sent: Sent[] = []) {
  const logs: [string, string][] = [], { seen, out } = collector();
  const map = createMapper({ log: (k, t) => void logs.push([k, t]), out, sent });
  events.forEach(map);
  return { logs, ...seen };
}

describe("turn pieces", () => {
  test("cap keeps the head and the tail of a long tool result", () => {
    expect(cap("x".repeat(CAP))).toBe("x".repeat(CAP));
    expect(cap("a".repeat(20_000) + "b".repeat(20_000))).toBe(`${"a".repeat(15_000)}\n[… 10000 chars cut …]\n${"b".repeat(15_000)}`);
  });
  test("master.txt is the gist's MASTER without the subagent paragraph and sentence; view_doc.txt is VIEW_DOC verbatim", () => {
    const gist = readFileSync(`${import.meta.dir}/../docs/optchat-gist.md`, "utf8"), sec = gist.slice(gist.indexOf("### 7.2 The system prompt"));
    const [p1, p2] = /MASTER:\n```\n([\s\S]*?)\n```/.exec(sec)![1].split("\n\n");
    expect(read("master.txt")).toBe(`${p1.replace("\nUse subagents only when the user asks for them.", "")}\n\n${p2}`);
    expect(read("master.txt")).not.toContain("ubagent");
    expect(read("view_doc.txt")).toBe(/VIEW_DOC:\n```\n([\s\S]*?)\n```/.exec(sec)![1]);
  });
  test("the system prompt file is MASTER + VIEW_DOC + the user's instructions", () => {
    const dir = tmp();
    expect(readFileSync(writeSystemPrompt(dir), "utf8")).toBe(`${read("master.txt")}\n\n${read("view_doc.txt")}\n\n`);
    writeFileSync(`${dir}/instructions.md`, "Be brief.");
    expect(readFileSync(writeSystemPrompt(dir), "utf8")).toBe(`${read("master.txt")}\n\n${read("view_doc.txt")}\n\nBe brief.`);
  });
  test("masterArgs: the base flags, then mcp, permission mode and replay; mcpConfig names the server and the data dir", () => {
    expect(JSON.parse(mcpConfig("/data/x"))).toEqual({ mcpServers: { optchat: { command: process.execPath, args: [`${import.meta.dir}/cli.ts`, "mcp"], env: { OPTCHAT_DIR: "/data/x" } } } });
    const args = masterArgs("/tmp/sys.txt", "{}");
    expect(args).toEqual(["-p", "--model", MASTER_MODEL, "--effort", MASTER_EFFORT, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--include-partial-messages", "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config", "--system-prompt-file", "/tmp/sys.txt", "--tools", MASTER_TOOLS,
      "--mcp-config", "{}", "--permission-mode", MASTER_PERMISSION, "--replay-user-messages"]);
    expect(args).not.toContain("--safe-mode"); // it would drop the MCP server (SPEC §14 P1)
  });
});

describe("event to log mapping (recorded streams)", () => {
  test("zoom, date and Bash in a real stream: tool/echo pairs, then the answer; the streamed text is the logged text", () => {
    const r = mapAll(fixture("turn-tools"));
    expect(r.logs.map(([k]) => k)).toEqual(["tool", "echo", "tool", "echo", "tool", "echo", "talk"]);
    expect(r.logs[0]).toEqual(["tool", 'mcp__optchat__zoom {"id":10,"n":1}']);
    expect(r.logs[1][1].startsWith("10+0|note: Fixed the retry wrapper")).toBe(true);
    expect(r.logs[3]).toEqual(["echo", "2026-10-02 15:59"]);
    expect(r.logs[5]).toEqual(["echo", "Linux"]);
    expect(r.logs[6][1]).toContain("`uname -s` returned `Linux`");
    expect(r.texts.join("")).toBe(r.logs[6][1]);
    expect(r.infos.filter((i) => i.startsWith("→")).length).toBe(3);
    expect(r.infos.some((i) => i.startsWith("warning"))).toBe(false); // the optchat MCP server is connected
  });
  test("a thinking block carries no text: one dim line, never logged", () => {
    const r = mapAll(fixture("turn-thinking"));
    expect(r.logs).toEqual([["talk", "142"]]);
    expect(r.thoughts).toEqual([]);
    expect(r.infos.filter((i) => /^thought for ~\d+ tokens$/.test(i)).length).toBe(1);
    const shown = mapAll([{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm", estimated_tokens: 3 } } }]);
    expect(shown.thoughts).toEqual(["hmm"]); // text is shown if it ever arrives
    expect(shown.logs).toEqual([]);
  });
  test("the opening replay is skipped, a later one logs the message the user sent mid-run; results join text parts, images become [image]", () => {
    const replay = (text: string) => ({ type: "user", isReplay: true, message: { role: "user", content: [{ type: "text", text }] } });
    const sent: Sent[] = [{ text: "also this", taken: false }, { text: "and that", taken: false }];
    const r = mapAll([
      replay("the view and the opening message"),
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: [{ type: "text", text: "a.txt" }, { type: "image", source: {} }] }] } },
      replay("also this"),
      { type: "assistant", message: { content: [{ type: "text", text: "  " }, { type: "text", text: "done" }] } },
    ], sent);
    expect(r.logs).toEqual([["tool", 'Bash {"command":"ls"}'], ["echo", "a.txt\n[image]"], ["user", "also this"], ["talk", "done"]]);
    expect(sent.map((s) => s.taken)).toEqual([true, false]);
  });
  test("an MCP server that is not connected is reported", () => {
    expect(mapAll([{ type: "system", subtype: "init", mcp_servers: [{ name: "optchat", status: "failed" }] }]).infos[0]).toContain("not connected");
  });
});

describe("the turn (fake claude)", () => {
  const init = { type: "system", subtype: "init", mcp_servers: [{ name: "optchat", status: "connected" }] };
  const said = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
  const result = { type: "result", subtype: "success", is_error: false, result: "", stop_reason: "end_turn", usage: {}, duration_ms: 1000 };
  async function rig(script: object, o: { seed?: string[]; summarize?: Summarize } = {}) {
    const dir = tmp(), seed = o.seed ?? ["alpha", "beta", "gamma"];
    seed.forEach((t, i) => appendMessage(dir, newMsg(i, "note", t, new Date(2026, 9, 4, 9 + i))));
    const f = fake(script);
    const { chat } = await openChat(dir, { summarize: o.summarize ?? (async () => "a summary") });
    const { seen, out } = collector(), system = writeSystemPrompt(dir), mcp = mcpConfig(dir);
    const session = createSession({ chat, out, system, mcp });
    return { chat, session, f, seen, system, mcp, kinds: () => chat.mem.root.slice(seed.length).map((m) => `${m.kind}: ${m.text}`) };
  }

  test("a turn: the view as it was before the message, then the message; all the model does is logged; the process is killed at the result", async () => {
    const r = await rig({ processes: [[{ events: fixture("turn-tools") }]] });
    const before = render(r.chat.mem);
    r.session.input("hello");
    await r.session.whenIdle();
    expect(r.f.starts().length).toBe(1);
    expect(r.f.starts()[0].argv).toEqual(masterArgs(r.system, r.mcp));
    expect(r.f.messages()).toEqual([[{ type: "text", text: before }, { type: "text", text: "hello" }]]); // view first, no cache marks
    expect(before).not.toContain("hello");
    expect(r.chat.mem.root.slice(3).map((m) => m.kind)).toEqual(["user", "tool", "echo", "tool", "echo", "tool", "echo", "talk"]);
    expect(r.seen.infos.at(-1)).toMatch(/^\(4 in · 6,851 read · 7,205 write · 324 out · \d+\.\ds\)$/);
    await until(() => !alive(r.f.starts()[0].pid), 2000);
    expect(r.session.busy()).toBe(false);
    r.chat.close();
  });
  test("messages queued together run as one call and are logged one by one", async () => {
    const r = await rig({ processes: [[{ reply: "ok" }]] });
    r.session.input("first");
    r.session.input("second");
    await r.session.whenIdle();
    expect(r.f.messages().map((c) => c.at(-1).text)).toEqual(["first\n\nsecond"]);
    expect(r.kinds()).toEqual(["user: first", "user: second"]);
    r.chat.close();
  });
  test("a message sent while a tool runs goes to the running call and is logged as user", async () => {
    const tool = { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "sleep 1" } }] } };
    const done = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] } };
    const r = await rig({ processes: [[{ events: [init, { $replay: true }, tool, { $wait: true }, done, { $replay: true }, said("all done"), result] }]] });
    r.session.input("go");
    await until(() => r.f.messages().length === 1);
    r.session.input("also this");
    await r.session.whenIdle();
    expect(r.f.starts().length).toBe(1);
    expect(r.kinds()).toEqual(["user: go", 'tool: Bash {"command":"sleep 1"}', "echo: done", "user: also this", "talk: all done"]);
    r.chat.close();
  });
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
    r.chat.close();
  });
  test("cancel kills the call; what the user sent mid-run and was not taken is logged as it is", async () => {
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
    expect(r.f.starts().length).toBe(1);
    r.chat.close();
  });
  test("a crash is reported, nothing is requeued, and the user's message stays in the log", async () => {
    const r = await rig({ processes: [[{ exit: 1, stderr: "boom: not logged in" }]] });
    r.session.input("go");
    await r.session.whenIdle();
    expect(r.f.starts().length).toBe(1);
    expect(r.kinds()).toEqual(["user: go"]);
    expect(r.seen.infos.some((i) => /ended without a result \(code 1\): boom: not logged in/.test(i))).toBe(true);
    r.chat.close();
  });
  test("a refusal and an error result are reported, and only the user's messages are logged", async () => {
    const r = await rig({ processes: [[{ reply: "", stop_reason: "refusal" }], [{ is_error: true, reply: "API Error: overloaded" }]] });
    r.session.input("a");
    await r.session.whenIdle();
    r.session.input("b");
    await r.session.whenIdle();
    expect(r.kinds()).toEqual(["user: a", "user: b"]);
    expect(r.seen.infos.some((i) => i.includes("stop_reason: refusal"))).toBe(true);
    expect(r.seen.infos.some((i) => i.includes("error: API Error: overloaded"))).toBe(true);
    r.chat.close();
  });
  test("the turn waits for unsummarized lines; a cancel while waiting leaves the message unanswered", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r)), long = ["x".repeat(2000)]; // not a free node: it needs a summary
    const waits = await rig({ processes: [[{ reply: "ok" }]] }, { seed: long, summarize: async () => (await gate, "a summary") });
    waits.session.input("go");
    await sleep(50);
    expect(waits.seen.infos).toContain("waiting for 1 summaries…");
    expect(waits.f.starts().length).toBe(0);
    release();
    await waits.session.whenIdle();
    expect(waits.f.starts().length).toBe(1);
    expect(waits.f.messages()[0][0].text).toContain("0+1|a summary");
    waits.chat.close();

    const never = await rig({ processes: [[{ reply: "ok" }]] }, { seed: long, summarize: () => new Promise(() => {}) });
    never.session.input("go");
    await sleep(20);
    never.session.cancel();
    await never.session.whenIdle();
    expect(never.kinds()).toEqual(["user: go"]);
    expect(never.f.starts().length).toBe(0);
    never.chat.close();
  });
});
