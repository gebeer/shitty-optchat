// Selfcheck: no model calls. The compactor is a fake, the data dirs are temp dirs.
import { describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createPump } from "./compactor.ts";
import { NODE } from "./config.ts";
import { acquireLock, appendMessage, appendNode, dayOf, loadChat, newMsg } from "./store.ts";
import { type Mem, built, bytes, coords, freeText, getNode, label, newMem, ready, setNode, span } from "./tree.ts";
import { PLACEHOLDER, addMessage, addNode, allBuilt, context, cutBlocks, first, refold, render, settle } from "./view.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));
const until = async (ok: () => boolean, ms = 3000) => { for (const t = Date.now(); !ok(); await sleep(2)) if (Date.now() - t > ms) throw new Error("timeout"); };
const user = (i: number, size: number) => newMsg(i, "user", "a".repeat(size - "user: ".length)); // "user: …" is exactly `size` bytes
const node = (l: number, i: number, size: number) => ({ l, i, text: "n".repeat(size), size });
const tmp = () => mkdtempSync(`${tmpdir()}/optchat-test-`);
const mergeable = (mem: Mem) => mem.view.some((a, k) => { const b = mem.view[k + 1]; return b && a.l === b.l && a.i % 2 === 0 && b.i === a.i + 1 && built(mem, a.l + 1, a.i / 2); });

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
