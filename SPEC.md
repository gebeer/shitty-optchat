# OptChat on Claude Code: implementation spec

This is the build spec for OptChat, an endless chat whose history is its memory,
using Claude Code (`claude -p`, subscription login) as the model engine.

- **Base spec:** `docs/optchat-gist.md` (Victor Taelin's OptChat gist, cited
  below as "gist §N"). It is the source of truth for everything not changed
  here. Read it fully before you start. It explains the reasons behind each
  rule, and most "obvious" shortcuts are listed there as mistakes.
- **This document:** what the gist leaves open for Claude Code, every
  deliberate deviation from it with its reason, and the measured facts behind
  those choices.
- **Evidence:** `docs/probes/cc-round1.md` and `docs/probes/cc-round2.md`, wire
  captures and usage tables from real `claude -p` runs (Claude Code 2.1.289,
  2026-10-04). Facts marked **[measured]** come from there. Facts marked
  **[verify]** are not tested yet; check them in Phase 0 before relying on them.

Follow the gist exactly unless this document says otherwise. When you have to
deviate, write the reason down in "Deviations" (§11).

---

## 1. Shape of the system

One long-running **Bun + TypeScript** process (the harness) that owns the
memory, plus short-lived `claude -p` child processes that do the model work:

```
optchat (harness, plain terminal REPL)
├─ store      chat/main + chat/tree JSONL, fsync, torn-line repair, socket lock
├─ tree       node(l,i), free nodes, id+n addressing
├─ view       append + fit (most-due merge), refold at load, render, settle()
├─ compactor  pump (rule 3), JOBS=8 `claude -p` processes, size retries
├─ turn       priming call + one `claude -p` per turn, stream-json in/out, logging
├─ mcp        `optchat mcp`: read-only stdio MCP server with zoom/date
└─ cli        REPL, `browse` (HTML export), `import-optmem`, `view`
```

No other runtime dependencies. Use only Bun built-ins and `node:` modules.
The only possible exception is `@modelcontextprotocol/sdk` for the MCP server,
and only if a hand-written JSON-RPC stdio loop turns out to be impractical;
prefer the hand-written loop, it is about 60 lines.

### Repo and data layout

```
~/.claude/optchat/           this repo (code)
  SPEC.md  docs/  dev/wire-proxy.ts
  src/*.ts  prompts/{master,view_doc,compact,subagent?}.txt

~/.optchat/                  data dir ($OPTCHAT_DIR overrides), its own git repo
  chat/main/YYYY-MM-DD.jsonl
  chat/tree/YYYY-MM-DD.jsonl
  lock                       unix socket (gist §2)
  instructions.md            the user's own instructions (gist §7.2 "user's AGENTS.md")
```

The data dir is a git repo of its own. The harness commits it after every turn
(gist §10). Never put chat data inside this code repo.

## 2. Constants

All gist §1 constants are unchanged: `NODE=512` bytes, `VIEW=128000` bytes,
`JOBS=8`, `TRIES=5`, `RETRY=10s`, `CAP=30000` chars, `MARKS=50000/80000/100000`
chars. Sizes are UTF-8 bytes; marks are characters.

Additional configuration, in one `config.ts` (plain constants, with env
overrides only where noted):

| name | default | notes |
|---|---|---|
| `MASTER_MODEL` | `opus` | env `OPTCHAT_MODEL`. Priming MUST use the same value. |
| `MASTER_EFFORT` | `high` | passed as `--effort` |
| `MASTER_TOOLS` | `Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch` | fixed list. No `Task`/`Agent` (no subagents in v1). |
| `COMPACT_MODEL` | `sonnet` | |
| `COMPACT_EFFORT` | `medium` | gist §4.2: low effort overshoots far more |
| `PRIME_MAX_AGE` | 270 s | re-prime when the last prime is older (5 min cache TTL minus margin) |

## 3. Storage, tree, view, compactor ordering

Implement gist §2, §3, §4.1, §4.3, §5 and §6 **exactly**. Summary of the
must-haves:

- `main` record `{i, kind, text, size, date}`, `tree` record `{l, i, text, size}`,
  one `write` plus `fsync` per line, files split by local day, ids global.
- At load: skip and report non-JSON lines, and append a missing final `\n`.
- Unix-socket lock for the process lifetime. A second process that can connect
  exits; a socket that refuses connections is stale and gets taken over.
- Free nodes: level 0 is `kind + ": " + text` if it fits in `NODE`; level > 0 is
  `childA + "\n" + childB` if that fits. No model call in either case.
- Pump with rule 3 (`first()`), JOBS concurrency, a fixed 10 s retry forever,
  and only the first failure reported. No exponential backoff.
- View: append `part(0,i)` and `fit()` while over budget, merging the most-due
  built pair (`due = (T - start) / 2^(l+2)`). Never split. Refold from message 0
  at load. Render as `id+n|text` with newlines turned into spaces, wrapped in
  `<chat>\n…\n</chat>`.
- `settle(signal)`: resolves when every view part is built.

Write the tree/view logic as **pure functions** over in-memory arrays, so
`src/selfcheck.test.ts` can drive them with a fake compactor. See §10.

## 4. Claude Code invocation: common facts [measured]

Base flags for every `claude -p` call:

```
claude -p --model <M> --effort <E>
  --input-format stream-json --output-format stream-json --verbose
  --include-partial-messages
  --no-session-persistence --setting-sources "" --strict-mcp-config
  --system-prompt-file <F> --tools <fixed list>
```

Env for every call: `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`. Without it, Claude Code
uses 1 h marks on subscriptions, and a 5 m mark after a 1 h mark is a 400. The
5 m TTL also follows gist §8 ("don't use 1-hour entries").

What Claude Code puts on the wire with a custom system prompt (`*` = cache mark):

```
system:   [billing header, not cache-keyed] [*"You are a Claude agent, built on…" (forced with OAuth)] [*<system-prompt-file>]
messages: user:   [<system-reminder> userEmail]  [your content blocks…]
          system: [*env: cwd, OS, model, today's date]          ← after your content
          step≥2: assistant[* last block], user tool_result[* last block]  ← rolling marks
```

Consequences:

- Everything before your content is byte-stable across processes: tools,
  system prompt, userEmail. `--system-prompt-file` suppresses the volatile
  gitStatus block. The date sits after your content, so it never breaks the
  view prefix.
- The API allows 4 cache marks per request. Claude Code uses 3 in step 1 and 4
  from step 2 on. **Never put your own marks into a call where Claude Code's
  marks are active.** It works in step 1, then step 2 fails with `400 Found 5`.
- `DISABLE_PROMPT_CACHING=1` (or `DISABLE_PROMPT_CACHING_<MODEL>=1`) removes
  **all** of Claude Code's marks and keeps yours. Measured with the `_SONNET`
  variant; **[verify]** that the generic variable behaves the same for opus.
- Cache keys ignore `cache_control` placement and the billing header. A request
  without marks reads entries written by a request with marks, through the
  20-block lookback. This is what makes priming work (§6).
- `--bare` refuses OAuth: don't use it.
- **[verify] `--safe-mode` vs MCP:** the probes used `--safe-mode` (it disables
  hooks, CLAUDE.md, plugins and MCP). The master needs the `optchat` MCP server
  for zoom/date, so it can't use `--safe-mode` if that blocks `--mcp-config`.
  In Phase 0, check with the wire proxy that, *without* `--safe-mode`,
  `--setting-sources "" --strict-mcp-config` keeps hooks, plugins, CLAUDE.md
  and skills out of the request, and the request start stays byte-identical
  across two processes. If anything leaks, find the flag that removes it and
  record it here.
- Claude Code version upgrades change the request and invalidate the cache
  once. That's acceptable.

## 5. The turn (deviates from gist §7 in the mechanics only)

### 5.1 Request content

The master call's single user message has these content blocks, in order:

1. the view, rendered, cut into **4 text blocks** at the last line end before
   50k, 80k and 100k chars (skip marks past the end, so there are fewer blocks
   for short views), with **no cache marks**;
2. the new message(s): `join(texts, "\n\n")`.

The system prompt file holds MASTER + VIEW_DOC + `instructions.md`, written
once at startup and byte-identical for the life of the process (§8). The view
blocks must be byte-identical to what the priming call sent (§6).

### 5.2 Flow

```
turn():
  while queue not empty:
    if not settle(signal): log queued texts as `user` (unanswered); break   # gist §6: user cancelled
    view = render(view)                          # BEFORE logging the new messages
    await prime(view)                            # §6, skipped when already fresh
    texts = queue.take_all(); for t: log("user", t)
    spawn master `claude -p` (base flags + --mcp-config <optchat mcp> --replay-user-messages)
    write ONE stream-json user message: [view blocks…, join(texts)]
    sent = []                                    # mid-run messages written to stdin, in order
    read events (§5.3) until the first `result`
    kill the process (SIGTERM) right at that first `result`
    for each message in `sent` that was never replayed: queue.push_front(it)
    git commit the data dir
```

Mid-run user input (`on user input while a call runs`): write it to the
child's stdin as a stream-json user message and append it to `sent`.
**[measured]** If it arrives while a tool runs, Claude Code delivers it in the
same turn, right after that tool's result (as a `role:"system"` wrapper, cached
normally). If it arrives during the final text step, Claude Code would start a
*follow-up turn in the same conversation* about 20 ms after `result`. That would
break gist rule 11 (a fresh call per message), which is why the harness kills
the process at the first `result` and requeues whatever wasn't replayed. The
next loop iteration then gives it a fresh call with a new view.

User cancel during a turn (Ctrl-C): kill the child. Messages in `sent` that
weren't replayed are logged as `user`, unanswered (gist §7 "nothing is lost").

### 5.3 Event → log mapping

Use `--replay-user-messages`. Event order per step: `stream_event
message_start` → `content_block_*` deltas → one `assistant` event per completed
content block → `message_delta`/`message_stop` → for tools, a `user` event with
the `tool_result`. A replayed user message is a `{"type":"user","isReplay":true}`
event, emitted when Claude Code takes the message.

| event | action |
|---|---|
| `stream_event` text deltas | print live (no logging) |
| `stream_event` thinking deltas | print live, dimmed; **never log** (gist §2) |
| `assistant` with a `text` block | `log("talk", text)` |
| `assistant` with a `tool_use` block | `log("tool", name + " " + JSON.stringify(input))` |
| `assistant` with a `thinking` block | ignore |
| `user` with `tool_result` | `log("echo", cap(text of the result))`. Join text parts and render images as `[image]`. |
| `user` with `isReplay` | the first replay is the turn's own opening message (already logged): skip it. Later replays match `sent` in order: `log("user", text)` and mark them as taken. |
| `result` | end of the turn: kill, then requeue (§5.2). If `stop_reason` is `refusal`, print it; nothing extra is logged. |

`cap(s)`: if `s.length > CAP`, keep the head and tail (`CAP/2` chars each) with
`"\n[… N chars cut …]\n"` between them. **Deviation:** Claude Code shows the model
its own (already truncated) tool output; the harness can only cap what it
*logs*. That's fine: the cap exists to bound the permanent log and the
compactor's input.

Log each entry right when its event arrives, in stream order. After each log,
call `pump()` (gist §7).

## 6. Priming (new; not in the gist)

**Why:** with Claude Code's marks active and no view marks, the view would be
rewritten to the cache (~36k tokens) on every turn. A priming call writes the
view into the cache with the spec's own breakpoints first. The real turn then
reads it through the 20-block lookback. **[measured]**: the real turn's step 1
read the full primed view in 6 of 6 runs, including the next turn after the
view's tail changed. In steady state that saved ~35k input-token equivalents
per turn (−73 % on step 1, −55 % on a 3-step turn); a cold turn costs +10 %.

**How:**

```
prime(view):
  if last_prime.view == view and now - last_prime.at < PRIME_MAX_AGE: return
  spawn `claude -p` with EXACTLY the master's model, effort, flags, tools,
        system prompt file and --mcp-config
        + env DISABLE_PROMPT_CACHING=1
  write one user message: [view block 1*][block 2*][block 3*][block 4*] ["ok"]
        (* = cache_control {type:"ephemeral"}; the 4th mark is on the last view block,
         i.e. at the view's end; fewer blocks → fewer marks)
  on the first `stream_event` of type `message_start`: kill the process
  last_prime = {view, at: now}
```

- The view blocks must be split exactly as in §5.1. Only the cache marks differ.
- Killing at `message_start` already leaves the cache entry written
  **[measured]**. Assume the request is billed for its full input.
- Hide the latency, about 2–3 s: also call `prime(render(view))` in the
  background whenever the harness is idle and `fit()` leaves the view fully
  built. Debounce it, about 1 s. The `await prime()` in `turn()` is then usually
  a no-op.
- If priming fails (non-zero exit before `message_start`), report it once and
  continue the turn without it. Priming is a cost optimization, never a
  correctness requirement.

## 7. Compactor calls (adapts gist §4.2)

One `claude -p` process per node, at most `JOBS` at once:

```
claude -p --model sonnet --effort medium <stream-json flags as §4>
  --no-session-persistence --setting-sources "" --strict-mcp-config
  --system-prompt-file prompts/compact.txt --tools ""
env: DISABLE_PROMPT_CACHING=1  CLAUDE_CODE_PROMPT_CACHE_TTL=5m
```

`--safe-mode` is fine here: the compactor uses no MCP.

**User message blocks** (gist §4.2 content, Claude Code-specific block layout):

- **Context blocks:** the text `<chat>\n` followed by the bare context lines
  (text only, no ids, one per line; gist §4.2 says what the context covers for
  level 0 and for merges). Split at the last line end before 50k, 80k and 100k
  chars, with a cache mark on each of those (up to 3) blocks.
- **Tail:** everything after the last mark. **Layout A** (build this first):
  one block with a 4th mark, containing the rest of the lines plus `</chat>`.
  **[measured]** Each next level-0 call reads through the 100k mark (~34k
  tokens) and writes ~3.7k: about 10.5k eq per call.
- **Step block** (no mark): the SCALE text plus the instruction plus the
  message or the two child lines, exactly as gist §4.2.
- **Layout B** (an optimization; switch to it only after measuring): put each
  tail *line* in its own block, mark the last one, and move `</chat>` to the
  start of the step block. **[measured, increment-sized blocks]** The next call
  finds the previous call's end mark 1–2 blocks back and writes only ~200 tokens:
  about 6.5k eq per call, −38 %. **[verify]** that one block per line behaves
  the same and that ~100+ blocks per request are accepted. Lookback reaches only
  20 blocks, but the previous call's entry is 1–2 lines back.

**Size retries** (gist §4.3): stay in the same process. Write a stream-json
follow-up user message with the gist's exact retry text and wait for the next
`result`. **[measured]** Retries read the whole context and write nothing: about
6.3k eq each.

The reply text is the `result` event's `result` field (or the joined text blocks
of the last `assistant` event), trimmed. Kill the process when the node is done.
A refusal, an empty reply or a non-zero exit fails the node and goes into the
10 s retry loop.

**SCALE:** the gist requires "a realistic summary line of exactly 512 bytes".
Write one by hand into `prompts/scale.txt`: dense, multi-item, tagged
`user:`/`talk:`/`tool:`/`echo:`, about a plausible coding session. Assert in
`selfcheck` that it is exactly 512 UTF-8 bytes with no trailing newline.

## 8. Prompts

Files in `prompts/`, loaded at startup. The agent name is "OptChat".

- `compact.txt`: gist §4.4 **verbatim**.
- `view_doc.txt`: gist §7.2 VIEW_DOC **verbatim**.
- `master.txt`: gist §7.2 MASTER **without its third paragraph** (subagents and
  computer tasks) and without the sentence "Use subagents only when the user
  asks for them." **Deviation:** v1 has no `spawn`/`tell`. Describing
  background reports that can never arrive would mislead the model. Restore
  both when §9 of the gist gets built.
- The system prompt file written at startup is `master + "\n\n" + view_doc +
  "\n\n" + instructions.md` (empty if missing). Write it to a temp file once.
  **No dates, cwd or other volatile content** (gist §7.2, mistake #9).

## 9. MCP server: `optchat mcp`

A stdio JSON-RPC MCP server started by Claude Code through `--mcp-config`
(server name `optchat`, so the tools appear as `mcp__optchat__zoom` and
`mcp__optchat__date`).

- **Read-only.** It loads `chat/main` and `chat/tree` from disk on each call
  (or on file change) and never takes the lock. Load at most once per call;
  the files are small enough.
- `zoom(id, n)` and `date(id)`: exactly as gist §7.1, with its verbatim tool
  descriptions. Validate: integers, `n` a power of 2, `id % n == 0`,
  `id + n <= T`, and the node built; otherwise return `No line id+n.`.
  `zoom(id,1)` returns `id+0|kind: text` in full, newlines kept.
- Its output reaches the log as an `echo` like any tool result, so it is capped
  there.
- `date(id)`: local date and time of message `id`, e.g. `2026-10-04 14:03`.

The `--mcp-config` JSON is generated once at startup and must be
byte-identical for priming and real calls, because it is part of the cached
tool list.

## 10. CLI, import, browse, checks

- `optchat`: take the lock, load, fold the view, start the pump, **print the
  view** (gist §10), then read lines from stdin. Plain output with no TUI
  redraws, so the terminal scrollback works.
  - While a turn runs, typed lines become mid-run messages (§5.2).
  - While waiting in `settle`, show `waiting for N summaries…`.
  - Ctrl-C cancels the current wait or turn; a second Ctrl-C while idle exits.
- `optchat view`: print the current view (read-only, no lock).
- `optchat browse [out.html]`: one self-contained HTML page with the view,
  ROOT and each tree level, each entry with its range, time span and size
  (gist §10). Escape all text.
- `optchat import-optmem [path]` (default `~/.optmem/memory/LOG.txt`): only
  into an **empty** chat. LOG.txt has fixed-width 320-byte records, each
  `#<n> <YYYY-MM-DD> <text>` padded with spaces, ending in `\n`. Import record
  `n` as message `i = n`, kind `note`, text trimmed, date = that day at
  **12:00 local time** (a fixed time, so imported times are recognizably
  synthetic). Refuse if the ids aren't contiguous from 0.
- `src/selfcheck.test.ts` (`bun test`), with no model calls:
  - tree addressing, free nodes;
  - pump rule-3 ordering with a fake async compactor;
  - the fit invariants: view tiles `[0,T)`, under budget once parents exist,
    never splits, refold equals live fold;
  - torn-line recovery;
  - `cap()`;
  - SCALE is 512 bytes;
  - the view-block split points;
  - the event→log mapping against a recorded stream-json fixture.
- `dev/wire-proxy.ts`: a logging pass-through for `ANTHROPIC_BASE_URL`. It
  records only payload structure (block lengths, hashes, cache marks) and
  usage, never headers. Use it in Phase 0 and to check cache behavior later.
  Logs can contain short text heads: keep them out of git.

## 11. Deviations from the gist (keep this list current)

| # | Deviation | Reason |
|---|---|---|
| D1 | Engine is `claude -p` (subscription), one process per turn | Anthropic API pricing for third-party harnesses is too expensive; `claude -p` is ordinary Claude Code use |
| D2 | Master view carries no cache marks; a priming call writes them instead (§6) | Claude Code uses all 4 marks from step 2 on; view marks crash the turn [measured] |
| D3 | Process is killed at the first `result`; unreplayed mid-run messages are requeued | Otherwise Claude Code continues the same conversation, breaking "fresh call per message" |
| D4 | CAP applies to the log only | Claude Code owns the model-facing tool output |
| D5 | MASTER prompt without the subagent paragraph | No spawn/tell in v1 |
| D6 | Compactor runs with `DISABLE_PROMPT_CACHING=1` and the spec's own 4 marks | Retries are tiny, so losing Claude Code's rolling marks costs nothing, and the spec's layout caches the view prefix across calls [measured] |
| D7 | The request carries Claude Code's fixed identity line and userEmail block before our content | Forced by Claude Code with OAuth; constant, so harmless for caching |
| D8 | zoom/date via a stdio MCP server, not HTTP | Simpler; no subagents need to share it yet |

Out of scope for v1: gist §9 (spawn/tell/computer), importing old agent sessions
other than OptMem notes, fail-closed handling of disk errors beyond what fsync
gives.

## 12. Build order

0. **Phase 0, verification (before any feature work):** run the wire proxy and
   settle every **[verify]** item: `--safe-mode` vs MCP for the master,
   `DISABLE_PROMPT_CACHING` for opus, and layout B's per-line blocks if you get
   to it. Write the findings into this file and adjust the plan.
1. `store`, `tree`, `view` plus `selfcheck` (pure; fake compactor).
2. `import-optmem`, `view`, `browse`. Import the 116 notes into a scratch data
   dir and inspect them.
3. `compactor` with real `claude -p` calls on the imported notes. Check the
   per-call usage against §7's numbers through the stream-json `result` usage
   fields (`cache_read_input_tokens`, `cache_creation_input_tokens`).
4. `mcp` (zoom/date), then `turn` without priming. End-to-end on a scratch data
   dir.
5. `prime`. Confirm with the wire proxy or the `result` usage that step 1 reads
   the view (read ≈ view tokens, write ≈ new message + env).
6. REPL polish, git commit per turn, mid-run messages, Ctrl-C paths.

Each step ends with `bun test` green. No step introduces new dependencies.

## 13. Gotchas collected during the probes

- The safety classifier refused 3 of 10 probe turns that used a synthetic
  word-salad view (`stop_reason: "refusal"`). Real views are expected to be
  fine. Surface refusals visibly; don't retry them blindly in the master.
- A `result` alone doesn't mean idle when stdin got more messages. The rule
  "kill at the first `result`" (§5.2) avoids having to detect that.
- `message_start` already carries the final input usage, which is useful for
  priming and for logging the cost per request.
- Keep the tool list, system prompt file, MCP config, model and effort
  byte-identical between the priming call and the real call, and across turns.
  Any difference silently costs the whole view in cache writes.
