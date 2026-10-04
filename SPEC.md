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
  **[phase 0]** were measured when the build started (same day and Claude Code
  version, with `dev/wire-proxy.ts`); their evidence is in §14.

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
  SPEC.md  docs/  dev/{wire-proxy,wire}.ts
  src/*.ts (map in §16.2)  src/fixtures/*.jsonl  prompts/{master,view_doc,compact}.txt  prompts/scale.txt

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
| `MASTER_PERMISSION` | `bypassPermissions` | env `OPTCHAT_PERMISSION_MODE`; `--permission-mode` of the master and of priming. See §4 and §14 P4: `claude -p` can't ask, so the default mode denies most tools. `dontAsk` plus an allowlist of the tools above also works. |
| `COMPACT_MODEL` | `sonnet` | |
| `COMPACT_EFFORT` | `medium` | gist §4.2: low effort overshoots far more |
| `PRIME_MAX_AGE` | 270 s | re-prime when the last prime is older (5 min cache TTL minus margin) |
| `PRIME_TIMEOUT` | 30 s | a priming call the API hasn't accepted by then is given up on |
| `PRIME_IDLE` | 1 s | how long the view must stay unchanged before it is primed in the background |
| `KILL_GRACE` | 5 s | a killed `claude` gets SIGTERM, then SIGKILL after this (§5.2) |

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

**As built** (decisions the code made; the tests pin them):

- Free nodes are written to `chat/tree` like any other node, so readers and the MCP
  server need no free-node logic. `buildFree` builds them (bottom-up, no JOBS slot,
  no rule 3) at pump start, after every commit and inside `import-optmem`.
- `loadChat` reads every day file, sorts the messages by id and **throws** unless the
  ids are 0, 1, 2, …; for tree nodes the first record wins and `size` is recomputed
  from the text. Only the lock holder repairs files. `view`, `browse` and the MCP
  server pass `repair: false` and stay quiet about an unterminated last line (a
  reader can't tell a torn line from a write in progress). `view: false` skips the
  fold (the MCP server does).
- View size = the sum of the node text bytes (no `id+n|` prefix). Ties in `due` go to
  the leftmost pair. `refold` uses `T = i+1` at each step with the *final* tree, so it
  equals the live fold only when the compactor kept up (the selfcheck asserts that case).
- Dates: `date` is ISO UTC; a message's file is its local day; `localTime()` formats
  `YYYY-MM-DD HH:MM` local (what `date(id)` returns).
- The pump builds a job's context snapshot synchronously when it decides to start the
  node, so a job sees exactly the state rule 3 checked; `context()` throws if it meets
  an unbuilt line (a rule-3 bug must be loud). `stop()` ignores later completions and
  clears the retry timers. Every pass scans all nodes (O(T)); a per-level cursor is the
  upgrade path past ~1e5 messages.
- The lock is a unix socket, `unref`'d so it doesn't keep the process alive. Two
  processes taking over one stale socket in the same instant can both win (accepted).
  Socket paths are limited to ~107 characters: keep data dirs short in tests and
  scratch work.

## 4. Claude Code invocation: common facts [measured]

Base flags for every `claude -p` call:

```
claude -p --model <M> --effort <E>
  --input-format stream-json --output-format stream-json --verbose
  --include-partial-messages
  --no-session-persistence --setting-sources "" --strict-mcp-config
  --system-prompt-file <F> --tools <fixed list>
```

The master and the priming call add `--mcp-config <F> --permission-mode <P>
--replay-user-messages` (identical for both, §6). The compactor adds `--safe-mode`
and no MCP. **Never `--safe-mode` on the master or priming** (below).

Env for every call: `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`. Without it, Claude Code
uses 1 h marks on subscriptions, and a 5 m mark after a 1 h mark is a 400. The
5 m TTL also follows gist §8 ("don't use 1-hour entries").

What Claude Code puts on the wire with a custom system prompt (`*` = cache mark):

```
system:   [billing header, not cache-keyed] [*"You are a Claude agent, built on…" (forced with OAuth)] [*<system-prompt-file>]
messages: user:   [<system-reminder> userEmail] [<system-reminder> git attribution*]  [your content blocks…]
          system: [*env: cwd, OS, model, today's date]          ← after your content
          step≥2: assistant[* last block], user tool_result[* last block]  ← rolling marks
tools:    the `--tools` list plus the MCP tools, sorted by name, no marks
```

(*) Not sent with `--tools ""` (the compactor); sent when `Bash` is among the tools.

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
  variant in the probes, and **[phase 0]** with the generic variable on opus:
  no marks on `system` or on the env message, the caller's marks untouched, no
  400 (§14 P5).
- Cache keys ignore `cache_control` placement and the billing header. A request
  without marks reads entries written by a request with marks, through the
  20-block lookback. This is what makes priming work (§6).
- `--bare` refuses OAuth: don't use it.
- **`--safe-mode` vs MCP [phase 0]:** `--safe-mode` also disables servers passed
  with `--mcp-config` (`init.mcp_servers: []`, no `mcp__optchat__*` tools), so the
  master and priming can't use it. Without it, `--setting-sources ""
  --strict-mcp-config` is enough: hooks, plugins, skills, CLAUDE.md and
  auto-memory stay out of the request (checked against a user config that has all
  of them), and everything before the trailing env message is byte-identical
  across processes and working directories (§14 P1–P3). The compactor has no MCP
  and keeps `--safe-mode`.
- **Permissions [phase 0]:** `claude -p` has nobody to answer prompts. In the
  default mode it auto-denies `Bash` commands with output redirection, writes
  outside the allowed paths and every MCP tool (`system/permission_denied`
  events, the turn goes on without the result). The master runs with
  `--permission-mode <MASTER_PERMISSION>` (§2). The flag doesn't change the
  request (§14 P4).
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

**As built** (`createSession` in `turn.ts`): `input(text)` writes to the running
call's stdin if there is one, otherwise it joins the queue and starts a turn.
Messages that arrive before the turn takes the queue (while it waits in `settle` or in
the priming of §6) join the same call: logged one by one, sent joined with a
blank line. `cancel()` aborts the wait and kills the call. Untaken mid-run messages
are requeued **only if the call ended with a `result`**; after a cancel or a crash
they are logged as unanswered `user` messages (requeueing after a crash would loop
forever). A crash, a failed spawn, an `is_error` result and a refusal are printed
with `out.info`, never retried; the user's message is already in the log. After each
call a dim usage line is printed from `result.usage`. The session takes an `Out`
(`{text, thinking, info}`); the REPL provides it. `stop()` is the end of the session
(cancel what runs, take no more input, drop the background priming).

**Children never outlive the harness** (`claude.ts`): every running `claude -p` is
registered; on exit and on SIGINT/SIGTERM/SIGHUP each gets SIGTERM, and `kill()` sends
SIGKILL when a child is still there after `KILL_GRACE` (5 s). The harness's own SIGKILL
can't be hooked: the children then end when their stdin closes (the fake `claude` does;
a real one is not measured). Every spawn site kills in a `finally`.

### 5.3 Event → log mapping

Use `--replay-user-messages`. Event order per step: `stream_event
message_start` → `content_block_*` deltas → one `assistant` event per completed
content block → `message_delta`/`message_stop` → for tools, a `user` event with
the `tool_result`. A replayed user message is a `{"type":"user","isReplay":true}`
event, emitted when Claude Code takes the message.

| event | action |
|---|---|
| `stream_event` text deltas | print live (no logging) |
| `stream_event` thinking deltas | print live, dimmed; **never log** (gist §2). Today they carry no text (§14 T1): print the text if it ever arrives, else one dim line `thought for ~N tokens` when the thinking block completes |
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

As built: empty or whitespace text blocks are not logged; the parts of a tool result
are joined with `\n` and parts that are not text become `[type]`; each tool call and
result also prints one clipped line (`→ …`, `← …`); the `system/init` event is
checked and a warning printed if `optchat` is not a connected MCP server (§13).
`--include-partial-messages` is on for the master (live text) and, being a shared
flag, for the compactor too (unused there).

## 6. Priming (new; not in the gist)

**Why:** with Claude Code's marks active and no view marks, the view would be
rewritten to the cache (~36k tokens) on every turn. A priming call writes the
view into the cache with the spec's own breakpoints first. The real turn then
reads it through the 20-block lookback. **[measured]**: the real turn's step 1
read the full primed view in 6 of 6 runs, including the next turn after the
view's tail changed. In steady state that saved ~35k input-token equivalents
per turn (−73 % on step 1, −55 % on a 3-step turn); a cold turn costs +10 %.
**[step 5]** At full scale (a 128 KB view, ~48k tokens, opus) a one-request turn costs
61.3k eq without priming and 23.8k with it after a tail change (−61 %), 67.0k cold
(+9 %); the real turn read the whole primed view every time (§14 F1).

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
  **[measured]**, also when the upstream request is really cancelled (§14 F2).
  Whether a killed request is billed is not known (§14 F6): assume it is billed
  for its full input.
- Hide the latency, about 2–3 s: also call `prime(render(view))` in the
  background whenever the harness is idle and `fit()` leaves the view fully
  built. Debounce it, about 1 s. The `await prime()` in `turn()` is then usually
  a no-op.
- If priming fails (non-zero exit before `message_start`), report it once and
  continue the turn without it. Priming is a cost optimization, never a
  correctness requirement.

**As built** (`prime.ts`, and `createSession` in `turn.ts`):

- `createPrimer({args, report})` returns `{prime(view), stop()}`. `args` is the
  master's `masterArgs()`; `prime` takes the *rendered view string* and cuts it with
  `cutBlocks`, and the turn sends `cutBlocks(view)` of the same string, so the primed
  and the sent blocks are the same strings by construction (a test pins it). Calls
  queue up on one promise chain, so a view is never primed twice at once and the
  chain can't be broken by a failure. A view primed less than `PRIME_MAX_AGE` ago is
  skipped.
- Failure means: a `result` event before `message_start`, the process ending, or no
  `message_start` within `PRIME_TIMEOUT` (30 s). It is reported once per streak
  (`priming failed, the turn goes on without it: …`, reset by the next success).
- In `turn()` the priming sits between `settle`/`render` and logging the new
  messages. A cancel ends the wait (the queued messages stay in the log, unanswered,
  as for a cancel in `settle`); the priming call itself goes on and `stop()` kills it.
  Messages that arrive while it runs join the same call.
- Idle priming: a persistent listener in `mem.waiters` (so after every `fit()`) and the
  end of every turn restart a `PRIME_IDLE` (1 s) timer; when it fires with no turn
  running and the view fully built, it primes `render(mem)`. **Nothing is primed at
  startup**: a REPL opened only to look costs nothing.
- `createSession({…, prime})`: on by default; `prime: {idleMs}` changes the debounce and
  `prime: false` runs the turns without priming (the old tests do).

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
  tokens) and writes ~3.7k: about 10.5k eq per call. **[step 3]** Confirmed with
  the real code on a 105k-char chat: the write is the size of the tail piece plus
  the new line, so it is smaller when the tail is short (§14 S3).
- **Step block** (no mark): the SCALE text plus the instruction plus the
  message or the two child lines, exactly as gist §4.2.
- **Layout B** (an optimization; switch to it only after measuring): put each
  tail *line* in its own block, mark the last one, and move `</chat>` to the
  start of the step block. **[measured, increment-sized blocks]** The next call
  finds the previous call's end mark 1–2 blocks back and writes only ~200 tokens:
  about 6.5k eq per call, −38 %. **[phase 0]** One block per line behaves the
  same: 305–334 blocks per request were accepted, and a call that adds 2 lines
  reads the whole previous chat and writes ~30 tokens. The lookback is 20 blocks:
  a call that adds 25 lines falls back to the 100k mark and rewrites its whole
  tail (§14 P7). So B pays only while consecutive calls add ≤ ~20 lines to the
  tail. Measure it on real runs before switching.

**Size retries** (gist §4.3): stay in the same process. Write a stream-json
follow-up user message with the gist's exact retry text and wait for the next
`result`. **[measured]** Retries read the whole context and write nothing: about
6.3k eq each.

The reply text is the `result` event's `result` field (or the joined text blocks
of the last `assistant` event), trimmed. Kill the process when the node is done.
A refusal, an empty reply, an `is_error` result, a non-zero exit or no `result`
within `CALL_TIMEOUT` (5 min, so a hung call frees its JOBS slot) fails the node and
goes into the 10 s retry loop.

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

As built: `zoom` of an unbuilt node answers like an invalid one (`No line id+n.`),
but `zoom(id, 1)` works for any existing message, because the view's placeholder
tells the model to zoom it. `date` of an invalid id answers `No message N.`. The
server speaks `initialize` (echoing the client's protocol version), `ping`,
`tools/list` and `tools/call`, answers unknown methods with `-32601` and tool
errors with `isError`. The tool input schemas have no property descriptions. The
data dir reaches the server as `OPTCHAT_DIR` in the config entry; the config is an
inline JSON string built once (`mcpConfig(dir)`) that launches `bun src/cli.ts mcp`.

## 10. CLI, import, browse, checks

- `optchat`: take the lock, load, fold the view, start the pump, **print the
  view** (gist §10), then read messages from stdin. Plain output with no TUI
  redraws, so the terminal scrollback works.
  - **Multi-line input:** line-based reading would turn a pasted block into one
    message per line. On a TTY, switch the terminal to bracketed paste mode
    (`ESC[?2004h` at start; `ESC[?2004l` on exit and before suspending): text
    between `ESC[200~` and `ESC[201~` stays ONE message with its newlines kept,
    and Enter outside a paste sends the message. When stdin is not a TTY, each
    line is a message.
  - While a turn runs, typed messages become mid-run messages (§5.2).
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
- As built: `view`, `browse` and `mcp` never write (`repair: false`). `browse`
  writes `./optchat.html` unless given a path. `import-optmem` parses the whole
  file before writing anything (a bad file writes nothing), refuses a non-empty
  chat, takes the lock, and builds the free nodes so the chat is readable at once.
  The real `LOG.txt` has 128 notes (2026-08-08 … 2026-10-04, 32 days, 123–280
  bytes each, ids contiguous from 0, 24 with non-ASCII text, so the padding is by
  bytes): 255 nodes, 173 free, 82 need the model.
- `src/selfcheck.test.ts` (`bun test`), with no model calls:
  - tree addressing, free nodes;
  - pump rule-3 ordering with a fake async compactor;
  - the fit invariants: view tiles `[0,T)`, under budget once parents exist,
    never splits, refold equals live fold;
  - torn-line recovery;
  - `cap()`;
  - SCALE is 512 bytes;
  - the view-block split points;
  - the event→log mapping against a recorded stream-json fixture;
  - the compactor calls and the whole turn against a fake `claude`
    (`src/fake-claude.ts`, §16.4), and the MCP server over stdio.
- `dev/wire-proxy.ts`: a logging pass-through for `ANTHROPIC_BASE_URL`, loopback only.
  It records only payload structure (block lengths, hashes, cache marks), usage and
  the `anthropic-ratelimit-*` response headers; **no other header is ever logged**
  (no auth, no ids). A `req` record when the request arrives (so a killed priming
  request still leaves its shape) and a `res` record with status, usage, `rl` (the
  rate-limit headers) and `aborted` when the response ends. When the client goes
  away (a priming call killed at `message_start`) the proxy cancels the upstream
  request too, as a direct connection would; it used to keep reading it to the end,
  which made every "killed" request of Phase 0 a completed one upstream (§14 F2).
  Use it to check cache behavior; `bun dev/wire.ts <log>` prints it readably. Logs
  can contain short text heads: keep them out of git (`.gitignore` covers its
  default output).

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
| D9 | The master and the priming call run with `--permission-mode bypassPermissions`; `OPTCHAT_PERMISSION_MODE` overrides it (`MASTER_PERMISSION`, §2) | `claude -p` has nobody to answer permission prompts, and its default mode denies Bash redirects, writes and every MCP tool (§14 P4). The gist is silent on permissions. Approved by the user. |

Out of scope for v1: gist §9 (spawn/tell/computer), importing old agent sessions
other than OptMem notes, fail-closed handling of disk errors beyond what fsync
gives.

## 12. Build order

0. **Phase 0, verification (before any feature work): done 2026-10-04, §14.**
   It settled the three **[verify]** items (`--safe-mode` vs MCP,
   `DISABLE_PROMPT_CACHING` on opus, layout B's per-line blocks) and found the
   permission-mode gap (§4). Nothing breaks the design; the plan below stands.
1. `store`, `tree`, `view` plus `selfcheck` (pure; fake compactor). **Done** (0045b07).
2. `import-optmem`, `view`, `browse`. Import the notes into a scratch data dir and
   inspect them. **Done** (37546fa; the log has 128 notes now, not 116).
3. `compactor` with real `claude -p` calls on the imported notes. Check the
   per-call usage against §7's numbers through the stream-json `result` usage
   fields (`cache_read_input_tokens`, `cache_creation_input_tokens`). **Done**
   (d74a2a2, §14 S1–S4).
4. `mcp` (zoom/date), then `turn` without priming. End-to-end on a scratch data
   dir. Also record how thinking blocks appear in stream-json (§14). **Done**
   (269d2cf, §14 T1–T3). The handover (§16) was written here, and the build waited
   for the user's go-ahead.
5. `prime`. Confirm with the wire proxy or the `result` usage that step 1 reads
   the view (read ≈ view tokens, write ≈ new message + env). Measure it at full
   scale on opus against the no-priming baseline, and the billing of a killed
   priming request (§14). **Done** (§6 as built, §14 F1–F6). Again the handover (§16)
   and then a wait for the user's go-ahead before step 6.
6. REPL polish, git commit per turn, mid-run messages, Ctrl-C paths. Detailed
   plan: §16.7.

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
- With a proxy in between, a request whose client was killed keeps running
  upstream, so its `res` record (usage) arrives seconds late. The `message_start`
  event carries the same usage right away; read that for priming.
- `--safe-mode` silently drops `--mcp-config` servers: the master would start
  without zoom/date and nothing would fail (§14 P1). The turn's `system/init`
  event lists the MCP servers with their status; check that `optchat` is
  `connected` and warn if not.
- Claude Code 2.1.289 CLI facts (from `claude --help` and the request dumps):
  `--system-prompt-file` is not listed by `--help` but works (every run uses it);
  `--effort` takes low|medium|high|xhigh|max; `--permission-mode` takes
  acceptEdits|auto|bypassPermissions|manual|dontAsk|plan; `--tools ""` disables every
  built-in tool; `--mcp-config` is variadic (it takes JSON strings or files up to the
  next flag). The master request also carries `max_tokens: 128000`,
  `output_config: {effort}`, `thinking: {type: adaptive, display: updates}` and
  `context_management: {edits: [clear_thinking_20251015, keep: all]}`; the effort and
  thinking settings are part of the request, so priming must use the same ones (it does:
  one `masterArgs()`).
- Starting the REPL on a freshly imported chat starts the pump on the whole tree: for
  the 128 real notes that is 82 sonnet calls (3–5 s each, JOBS at a time), a one-off
  cost of a few hundred thousand eq. Tell the user before the first run.
- The master's working directory is the harness's cwd. It shows in the env block
  after the view, so it never touches the cached prefix, and the CLAUDE.md files and
  auto-memory of that directory don't reach the request (§14 P2).
- The model alias `opus` resolves to `claude-opus-5-5` today (`sonnet` to
  `claude-sonnet-5-5`). An alias change invalidates every cache entry once.

## 14. Measured findings (2026-10-04, Claude Code 2.1.289)

Phase 0 (P1–P8), then step 3 (S1–S4), step 4 (T1–T3) and step 5 (F1–F6); the scheduled ones come last.

**Method (Phase 0).** `dev/wire-proxy.ts` as `ANTHROPIC_BASE_URL` (OAuth works through it),
scrubbed child env (HOME, PATH and a few basics, so no inherited `CLAUDE_CODE_*`),
tiny prompts, a stub stdio MCP server with the final tool shapes, throwaway driver
scripts and logs outside the repo. The test account's real config has hooks
(SessionStart, PreToolUse, …), 6 plugins, user skills, a global CLAUDE.md that also
sits on the repo's ancestor path, auto-memory and `model: opus[1m]`: the worst case
for leaks. Units: in / read / write = `input_tokens` / `cache_read_input_tokens` /
`cache_creation_input_tokens`.

| # | Question | Result |
|---|---|---|
| P1 | `--safe-mode` with `--mcp-config` | **MCP is dropped**: `init.mcp_servers: []`, tools `Bash,Read` only. Without `--safe-mode`: `optchat` connected, tools `Bash,Read,mcp__optchat__date,mcp__optchat__zoom`. |
| P2 | Does anything leak without `--safe-mode`, with `--setting-sources "" --strict-mcp-config`? | **No.** Request = `system[billing, identity line, our file]`, tools, `user[userEmail, git attribution, our blocks]`, env message. Nothing from hooks, skills, CLAUDE.md, plugins or memory: 19 distinctive strings from the user's CLAUDE.md, plugin names, hook text and memory index gave 0 hits over all 28 request bodies of the phase. 3 tool-using runs with `--include-hook-events`: 0 hook events (user hooks don't run). A `CLAUDE_CODE_PLUGIN_DIRS` var in the child env still loads that plugin (`init.plugins`), but nothing reached the request, so the harness doesn't scrub the env. `init` still lists built-in skills, slash commands and agents; none of them reach the request. |
| P3 | Is the request start byte-identical across processes and cwds? | **Yes.** Two processes, same cwd: all 10 block hashes identical (billing header excluded), second process `in=2 read=3409 write=0`. Other cwd (not in git, outside `~/.claude`): identical through our content; only the trailing env message differs (452 vs 382 chars: path, git yes/no), `read=3239 write=215`. Tools are the `--tools` list plus MCP tools **sorted by name**, descriptions static (no date or path; WebSearch says "current month is (provided in the conversation below)"). The env message can also carry other volatile text (e.g. a token-budget line appeared in one run only); it is after our content, so harmless. |
| P4 | Permissions in `-p` | Default mode: `Bash` `echo hi > b.txt` is denied ("Output redirection … needs approval"), `mcp__optchat__date` is denied ("requested permissions … you haven't granted it yet"), 2 `permission_denied` events, no hang, turn ends normally. `--permission-mode bypassPermissions`: both run (`hi`, `2026-10-04 14:03`). `--permission-mode dontAsk --allowedTools <8 tools + 2 MCP>`: both run. Request hashes identical across all three: the flag isn't in the request. |
| P5 | `DISABLE_PROMPT_CACHING=1` (generic) on opus | Prime request on the wire: **0 marks on `system`, none on the env message or the `ok` block, 4 marks = exactly ours** (the 4 view blocks). Real turn, Claude Code marks on, no view marks: 3 marks in step 1 (2 system + env), 4 in step 2. No 400 in 9 opus requests. |
| P6 | Priming on opus, small scale (view ≈ 6.4k tokens in 4 blocks, tools+system ≈ 5.4k tokens, 4 marks) | Fully cold: prime `in=384 read=0 write=11878` (killed at `message_start`). With a new view over cached tools+system: prime `read=5436 write=6442` → real step 1 `in=2 read=11878 write=414`, step 2 `read=12292 write=125`. Tail changed by +498 chars (N+1): prime `read=9565 write=2498` → real step 1 `read=12063 write=414`, step 2 `read=12477 write=125`. Prime and real hashes identical up to the last block. Same as the Sonnet probes: the primed view is read in full, also after a tail change. |
| P7 | Layout B: one block per line, 100+ blocks | Compactor flags (`sonnet`, `--safe-mode --tools ""`, `DISABLE_PROMPT_CACHING=1`), 3 marked context blocks, 300+ one-line tail blocks. c0 cold: `write=9529` (305 blocks). **c1 (+2 lines, 307 blocks): `read=9529 write=32`. c2 (+2): `read=9561 write=26`.** c3 (+25 lines, 334 blocks): `read=4952 write=5064`, so beyond the 20-block lookback it falls back to the 3rd mark and rewrites the whole tail. No limit on block count was hit. |
| P8 | Other facts needed later | Opus `contextWindow` is 1,000,000 (`result.modelUsage`), so no autocompact inside a turn. `result` has `usage`, `modelUsage`, `stop_reason`, `terminal_reason`, `permission_denials`, `queued_turn_count`, `total_cost_usd`. Event order per turn matches §5.3; the replay of the opening message carries all its blocks, view included (skip it). Killed with SIGTERM: exit 143, no orphaned MCP child, no files under `~/.claude/projects`. No thinking blocks showed up in these trivial runs. |

**Decisions taken because of Phase 0**

- Master and priming: no `--safe-mode`; add `--permission-mode <MASTER_PERMISSION>`
  (default `bypassPermissions`, §2). Approved by the user as D9 (§11). It gives the
  model unrestricted Bash/Edit/Write on the machine; the tighter alternative,
  `dontAsk` plus an allowlist of the 10 tools, also worked in the probe.
- One `masterArgs()` builds the argv for both the master and the priming call, so
  they can't drift apart.
- Layout A first for the compactor, as planned. Layout B stays optional (§7).
- The turn code checks `system/init` for the `optchat` MCP server (§13).
- `dev/wire-proxy.ts` now logs the request on arrival (see §10).

**Step 3 (compactor), measured** with the real `summarize.ts` (sonnet, medium, layout A) through the wire proxy:

| # | Question | Result |
|---|---|---|
| S1 | Wire layout of a compactor call | `user[userEmail, 4 context pieces each marked, step]`, `system` and the env message unmarked: pieces 49,809 / 30,012 / 20,129 / 3,368 chars, all four marks ours. No git-attribution reminder with `--tools ""`. |
| S2 | Usage on a 400-line, 105k-char chat, 4 long messages one after another | Cold: `in=651 read=0 write=39102` (50.3k eq; §7: 37.8k write, 49.7k eq). Then `read=37865` on every call (through the 100k mark) with `write` 1384 / 1546 / 1717 (the tail piece plus the new line): **7.3–7.7k eq per call**. §7's 3.7k write came from a 10.3k-char tail; the write scales with the tail piece. |
| S3 | Size and quality | 4 of 4 summaries 340–453 bytes, no retries, no refusals; the user's words kept verbatim; 3.1–4.7 s per call. On the real imported notes: 3 merges `ctx 4/36/66 lines`, 425–461 bytes from two ~260-byte notes each, no retries, no refusals; cold writes 1.6k / 4.7k / 7.7k tokens (the context differs every time, so nothing is read). |
| S4 | The imported tree | 128 notes give 255 nodes; 173 are free (128 level-0 plus 45 merges), 82 need the model (19 level-1 merges are ready, the rest unlock level by level). Not run in full: it costs ~82 calls. |

**Step 4 (MCP + turn), measured** with the real `turn.ts` and an opus master, a 12-note synthetic chat, tools `Bash` + MCP:

| # | Question | Result |
|---|---|---|
| T1 | How do thinking blocks appear in stream-json? | opus-5-5, `--effort high`, adaptive thinking, with `--include-partial-messages`: `content_block_start` of type `thinking`, several `thinking_delta` events whose `thinking` is **empty** and whose `estimated_tokens` grows (50, 150, then `null`), a `signature_delta` (~1k chars), then an `assistant` event with a thinking block of length 0, then `content_block_stop`. **The text is never streamed**: the request carries `thinking: {type: adaptive, display: updates}`, and passing `--settings '{"showThinkingSummaries":true}'` only drops `display` from the request; the stream stays the same. So nothing can be shown live today; the mapper prints text if it ever arrives and otherwise one dim `thought for ~N tokens` line. Whether the model thinks at all is its own choice (some runs have no thinking block). |
| T2 | End to end | Turn 1 (zoom, date, Bash, answer): 8 messages logged in order (`user, tool, echo, tool, echo, tool, echo, talk`), MCP results `10+0\|note: …` and `2026-10-02 15:59` (local time), usage over the 4 requests `in=4 read=6851 write=7205 out=324`, 5.1 s. Turn 2 answered from the view alone, no tool call (`in=2 read=5436 write=1726`). Turn 3 `read=5436 write=1817`. Without priming only tools+system (5,436) are read; the view and message (1.7–1.8k tokens here) are rewritten every turn: the §6 baseline, tiny in this chat. Wire: `user[userEmail, git attribution, view (1 block, unmarked), message]`, `system` marks 2 + the env message 1 (Claude Code's), tools = 8 + 2 MCP sorted. |
| T3 | `rate_limit_event` | Every turn emits `rate_limit_info.unifiedWindows.{five_hour,seven_day}.utilization` with **0.01 resolution** (0.02 and 0.04 after all the work so far), too coarse to see one request. Step 5 therefore logged the `anthropic-ratelimit-*` response headers; they turned out to have the same resolution (F6). |

**Step 5 (priming), measured** with the real `prime.ts` and `turn.ts`: opus-5-5, a synthetic
475-note chat whose view is 127,733 chars / 127,886 B in 4 blocks of 49,975 / 29,948 / 19,903 /
27,907 chars (~48.2k tokens at ~2.65 chars per token; every level-0 node is free, no compactor
call), tools = 8 + 2 MCP, one-request turns ("Reply with just OK."), through the wire proxy
(which now cancels the upstream request when the client leaves). eq = in + 0.1·read +
1.25·write + 5·out.

| # | Question | Result |
|---|---|---|
| F1 | Priming against no priming, at full scale | **No priming:** turn 1 `in=2 read=5,436 write=48,553 out=4`, turn 2 (tail changed by the two messages turn 1 logged) `read=5,436 write=48,580`: **61.3k eq per turn**, 2.6 s / 2.4 s wall. **Primed, cold:** priming call (killed at `message_start`) `in=381 read=5,436 write=48,168 out=4`, real turn `in=2 read=53,604 write=385 out=4`: **67.0k eq (+9 %)**, 5.6 s wall (+3.0 s). **Primed, after the tail change:** priming call `in=381 read=43,298 write=10,331 out=64` (reads the first three blocks, rewrites the changed last one), real turn `in=2 read=53,629 write=387`: **23.8k eq (−61 %)**, 4.6 s wall (+2.2 s). The real turn read the whole primed view both times. |
| F2 | Is the cache written when the request is killed at `message_start` *and the upstream request is cancelled*? | **Yes.** `message_start` already carries `write=48,168`, and the real turn then read it. Phase 0's P6 had used a proxy that kept the upstream request running after the kill; this repeats it with a faithful disconnect (the proxy aborts upstream, the record says `aborted`). The premise of §6 holds on a direct connection. |
| F3 | Does the kill always land in time? | No. A priming call's answer is a few tokens, so it sometimes finishes first: of 6 kill attempts, 4 were aborted mid-stream (`out=4–8`) and 2 completed (`out=64`, `out=72`; ~320–360 eq of output). Both completed ones were re-primings after a tail change (they read most of the view, so they start answering sooner). Harmless. |
| F4 | Latency | Spawn to `message_start` 1.9–3.6 s at full scale: that is what a turn waits when the background priming has not run (+2.2 s to +3.0 s wall per turn in F1). |
| F5 | Idle priming (real API, 120 notes, view 12.4k tokens) | Turn 1 foreground-primed (4.5 s). About 1 s after it ended the background priming ran (`in=381 read=5,436 write=12,453`: a view under 50k chars is **one** block, so every append rewrites it whole; with a longer view only the last block is rewritten, F1). Turn 2 found the view fresh and sent no priming call of its own: 2.3 s wall (the no-priming time), `read=17,889 write=387`. |
| F6 | Is a request killed at `message_start` billed? | **Inconclusive.** A subscription shows only `anthropic-ratelimit-unified-*` headers (5h and 7d utilization, status, reset, representative claim, overage), with **two decimals** (0.09 → 0.10): the same resolution as `rate_limit_event`. One step was ~100–250k eq in these runs, and the other sessions on the account move the same counters. Two killed and two completed requests of identical size (`write=48,168`, ~61k eq each if billed in full, ~246k together), interleaved K C K C with tiny haiku probes between, moved the 5h reading one step (0.09 → 0.10, after the first completed one) and the 7d reading one step (0.04 → 0.05, at the end): no step after a killed request, but four requests cannot separate that from chance. Stopped after two pairs. The §6 assumption stays: billed in full. |

Cost of step 5's real calls: about 540k eq (the billing pairs ~250k, the baseline and primed
runs ~215k, the idle check ~40k, a warm-up and a stray haiku probe ~35k), roughly +3 points of
the 5-hour utilization (0.07 → 0.10, other sessions included).

**Scheduled measurements** (approved; each at its step, results go into this section):

- Step 4, done (§14 T1-T3). Still open from it: a *real* mid-run message (the replay event of a message taken at a tool boundary) is tested only against the fake `claude`; confirm it with the real thing in step 6, together with long tool loops.
- Step 5, done (§14 F1–F6): priming at full scale against the no-priming baseline; killed
  against completed priming requests, inconclusive (the proxy logs only the
  `anthropic-ratelimit-*` response headers).
- Not needed: the meaning of `queued_turn_count` (the harness kills at the first
  `result`).

## 15. Working agreement

The rules this build runs under. They come from the user, through the orchestrating
session `claude-e6` (Herdr pane `wR:p1`); the build session is `optchat-impl` (pane `wR:pK`).

- **Stack and style:** Bun + TypeScript, no new dependencies (Bun built-ins and `node:`
  only). KISS, no abstraction the spec doesn't need, code that reads like its neighbours
  (2 spaces, double quotes, terse comments; a `ponytail:` comment marks a deliberate
  shortcut with its ceiling and upgrade path).
- **Process:** follow §12 strictly. `bun test` green at the end of each step. A
  conventional commit (or a few) per completed step; stage files by path, never
  `git add -A` over scratch output. The first commit was the pre-existing
  SPEC/docs/dev files. No attribution trailer is configured.
- **Reporting:** a short status after Phase 0 and after each build step: what works,
  measured usage where relevant, open issues. Send it with `SendMessage` to `claude-e6`
  (find the orchestrator with `herdr pane get wR:p1` and `ListAgents`) while work goes
  on. A final answer is delivered automatically, so don't send a separate completion
  message. A finding that breaks the design stops the work and goes into the report.
- **Gate:** after step 4 the user asked for the handover (§16) and for work to wait until
  told to go on with step 5. They may `/compact` first.
- **Subscription:** use it sparingly. Keep model calls in tests tiny (the fake `claude`
  exists for that). Scratch data dirs only (`OPTCHAT_DIR` with a short path), never
  `~/.optchat`. Never commit proxy logs, request dumps or stream taps (they hold the
  userEmail reminder or a chat). Never edit or delete anything under `~/.optmem`: read
  `LOG.txt` only (the user's own OptMem tool updates it, so its mtime moves by itself).
- **Decisions already taken by the user:** D9 (bypassPermissions default); the
  measurements scheduled in §14; bracketed paste in the REPL (§10).
- **Environment traps:** the user's damage-control hook blocks a Bash command whose text
  contains `process.env.<NAME>` (it reads it as a `.env.<name>` file): write such code
  with the Edit/Write tools, not a heredoc. `rm -rf` asks for confirmation: reuse
  scratch dirs or take fresh names; tests delete only their own temp dirs, from inside
  bun. `pkill -f <pattern>` kills your own shell when the pattern is in its command
  line: kill by PID (`ss -ltnp | grep :8399`). `Bun.spawn` without `env` passes the
  environment the process *started* with, not a `process.env` changed since: pass `env:
  { ...process.env, … }` (a test harness that skipped it would have started the real
  `claude`). This machine's shell and Claude Code
  sessions export `CLAUDE_CODE_*`, `HERDR_*` and plugin dirs: measure with a scrubbed
  environment (§16.5).

## 16. State of the build and how to continue

Written at the end of step 4, so that a fresh session (or one after `/compact`) can go
on from this file and `git log` alone.

### 16.0 Start here

1. Read this file fully, then `docs/optchat-gist.md` (the base spec; this file lists every
   deviation from it).
2. `git log --oneline` and `bun test` (expect 58 passing).
3. Do not start step 5 until the user says so (§15, Gate).
4. If something blocks, ask the orchestrator (`claude-e6`) with `SendMessage`.

### 16.1 Status

| step | commits | state |
|---|---|---|
| Phase 0 | 3e66030, c6274af | done, §14 P1–P8 |
| 1 store, tree, view, pump | 0045b07 | done |
| 2 import-optmem, view, browse | 37546fa | done |
| 3 compactor calls | d74a2a2 | done, §14 S1–S4 |
| 4 mcp, turn without priming | 269d2cf | done, §14 T1–T3 |
| 5 prime | – | **waiting for the user's go-ahead** (§16.6) |
| 6 REPL polish | – | open (§16.7) |

`bun test`: 58 tests in one file, ~1.1 s, no model calls. Commits 84bc1b5 and the
handover commit only touch SPEC.md (and add `dev/wire.ts`). The REPL does not exist
yet: `optchat` without a command prints the usage.

### 16.2 Code map (`src/`)

| file | what it holds |
|---|---|
| `config.ts` | constants (gist §1, SPEC §2, `CALL_TIMEOUT`); env overrides `OPTCHAT_MODEL`, `OPTCHAT_PERMISSION_MODE`, `OPTCHAT_DIR` |
| `tree.ts` | types `Msg`/`Node`/`Coord`/`Mem`; `id+n` addressing (`span`, `label`, `coords`); `freeText`, `ready`; `built`/`getNode`/`setNode` (first write wins); `dayOf`, `localTime` |
| `view.ts` | `fit`, `addMessage`/`addNode`, `refold`, `render`, `cutBlocks`, `allBuilt`, `first`, `context`, `settle`, `PLACEHOLDER`, `flat` |
| `store.ts` | JSONL append (write + fsync), `loadChat`, `newMsg`, `committer` (persist + `addNode`), `acquireLock` |
| `compactor.ts` | the pump: `createPump`, `buildFree`, `makeJob`, the `Job`/`Summarize` types |
| `summarize.ts` | the real `Summarize`: layout A `blocks()`, retries, `cut()`, `SCALE`, `COMPACT_FILE`, `onCall` usage hook |
| `claude.ts` | `spawnClaude` (`send`, `next`, `result`, `kill`, `stderr`, optional `tap`), `baseArgs` |
| `chat.ts` | `openChat`: lock + `loadChat` + pump + `log()` |
| `turn.ts` | `writeSystemPrompt`, `mcpConfig`, `masterArgs`, `cap`, `createMapper`, `createSession` |
| `mcp.ts` | `TOOLS`, `zoom`, `date`, `serveMcp` |
| `import.ts`, `browse.ts` | `parseOptmem`/`importOptmem`; `browseHtml` |
| `cli.ts` | `view`, `browse`, `import-optmem`, `mcp` (the REPL is missing) |
| `fake-claude.ts` | test double for `claude -p` (format in its header) |
| `selfcheck.test.ts` | every test |
| `fixtures/` | `turn-tools.jsonl`, `turn-thinking.jsonl`: real master streams, sanitized |

`prompts/`: `compact.txt` (gist §4.4 verbatim), `scale.txt` (512 bytes), `master.txt`,
`view_doc.txt`; the selfcheck re-derives each from the gist. `dev/`: `wire-proxy.ts`, `wire.ts`.

### 16.3 Running things

```
bun test
OPTCHAT_DIR=<short scratch dir> bun src/cli.ts import-optmem    # real LOG.txt, read only
OPTCHAT_DIR=<dir> bun src/cli.ts view                           # what the model sees
OPTCHAT_DIR=<dir> bun src/cli.ts browse out.html
```

### 16.4 Test rig

- One file, `src/selfcheck.test.ts`, helpers on top (`tmp`, `until`, `fake`, …). `bun test`
  runs in UTC but a child process uses the system zone: pass `TZ` explicitly when a test
  compares local times across processes.
- `src/fake-claude.ts` stands in for `claude`: the code under test spawns the binary
  named by `OPTCHAT_CLAUDE` (read at spawn time, so a test may set it late).
  `FAKE_CLAUDE_SCRIPT` and `FAKE_CLAUDE_LOG` and the script format are in the file's
  header (steps per message or per process, raw `events` with `$wait`/`$replay`/`$hang`,
  `exit`, `hang`). Pass a custom `summarize` to `openChat` when a test must not spawn
  compactor calls. The fake keeps reading stdin even while it hangs and exits when stdin
  closes (and on SIGTERM): a hung fake that doesn't read stdin spins at 100% CPU once its
  parent is gone (an orphaned one ran for 11 minutes). Outside `fake()` the tests point
  `OPTCHAT_CLAUDE` at `/bin/false`, so a stray spawn can't start the real `claude`.
- No test leaves a child behind: `afterEach` stops what the test started (`cleanups`:
  sessions, chats), then every fake named in the test's logs must be dead (a leaked one is
  killed and fails the test), and `afterAll` checks that no `fake-claude.ts` is left among
  the run's children.
- `src/fixtures/*.jsonl` are real master streams (a turn with MCP and Bash; a thinking
  block). To record one: `createSession({ …, tap: file })` or `spawnClaude(args, env,
  tap)` writes every raw stdout line; replace the `system/init` paths and plugin lists
  and anything personal before committing.
- Mutation checks (copy `src`, `prompts`, `docs` to a scratch dir, break one rule,
  expect a failure) were done after steps 1, 3 and 4 and every mutant was caught.
  They are manual.

### 16.5 Measurement recipe (the scripts used so far were scratch files, not in git)

- Proxy: `LOG=<f>.jsonl PORT=8399 SYSDIR=<dir> bun dev/wire-proxy.ts &`, outside the
  repo; stop it by PID. It binds `127.0.0.1` only (it used to bind all interfaces, Bun's
  default); it forwards the caller's OAuth token upstream, so run it only while measuring.
  Read it with `bun dev/wire.ts <f>.jsonl [last N]`. SYSDIR dumps full request bodies
  minus long text and contain the userEmail reminder.
- Children go through it with `ANTHROPIC_BASE_URL=http://127.0.0.1:8399` (OAuth works
  through it) and a scrubbed environment:
  `env -i HOME="$HOME" PATH="$PATH" ANTHROPIC_BASE_URL=… bun script.ts`.
- The e2e pattern (a scratch script): seed a chat with `appendMessage` + `newMsg`,
  `openChat(dir, { summarize })`, `createSession({ chat, out, system:
  writeSystemPrompt(dir), mcp: mcpConfig(dir), tap })`, `session.input(text)`,
  `await session.whenIdle()`; print the new messages, the `info` lines (usage per call)
  and the proxy records. Seed notes with distinct local times so `date` is checkable.
- Usage numbers: `result.usage` (aggregated over a call's requests), the `message_start`
  event (also for killed requests), or the proxy `res` record. "eq" = in + 0.1·read +
  1.25·write + 5·out.
- Subscription used so far, roughly: Phase 0 about 50 requests (nine on opus at 12–24k
  tokens, the rest small); step 3 eight sonnet calls (the largest a cold 39k-token
  write); step 4 about a dozen opus requests of 5–7k tokens and three thinking probes.
  A few hundred thousand eq in all. Step 5 will cost the most: a ~128 KB view is ~40k
  tokens, and the baseline and primed runs each write it once.

### 16.6 Step 5 (prime), in detail

1. `src/prime.ts` per §6. One `masterArgs(system, mcp)` for both calls; the priming spawn
   adds `DISABLE_PROMPT_CACHING=1`. Message = every view block (`cutBlocks(render(mem))`,
   up to 4) with `cache_control: {type: "ephemeral"}`, then a text block `ok`. Kill at the
   first `stream_event` of type `message_start` (it already carries the final input
   usage). Remember `{view, at}`; skip when the same view was primed less than
   `PRIME_MAX_AGE` ago; on failure print once and go on.
2. Hook in `turn()` (turn.ts): between `render` and `queue.splice(0)`, `await prime(view)`.
   A cancel during the wait acts like a cancel in `settle` (log the queued messages as
   `user`, break). Messages that arrive during priming join the same call. The blocks
   passed to `ask()` must be the strings that were primed.
3. Idle priming (§6): when the view is fully built and no call or turn runs, prime after
   a ~1 s debounce. `mem.waiters` is called on every `fit()`, so a persistent listener
   there can schedule it (never remove it).
4. Tests with the fake `claude`: argv equals `masterArgs`, the 4 marks, `ok` last, killed
   at `message_start` (a raw `stream_event` step), skipped when fresh, a failure doesn't
   stop the turn, cancel during priming.
5. Measure at full scale on opus (approved): a synthetic chat with a ~128 KB view
   (~480 notes of ~270 bytes; each ≤ 506 bytes, so level-0 nodes are free; give
   `openChat` `summarize: () => new Promise(() => {})` so the pump never calls a model for
   the ~240 merges that aren't free). Report `in/read/write` per request for a
   no-priming baseline turn, a cold primed turn and a primed turn after a tail change.
   Keep it to a handful of opus requests.
6. Billing of a killed priming request: make `dev/wire-proxy.ts` log **only** the
   `anthropic-ratelimit-*` response headers (in the `res` record; never auth or any other
   header) and compare the utilization change of a killed request with a completed one.
   `rate_limit_event` utilization has 0.01 resolution (§14 T3), so unless the headers
   are finer the answer is "inconclusive": say so, don't speculate. Keep repetitions
   cheap and stop if the first pairs show no movement.
7. Put the numbers into §6 and §14, commit, report, then step 6.

### 16.7 Step 6 (REPL), in detail

- `src/cli.ts` with no command: `openChat(DIR)` (the lock; a second process exits with
  `acquireLock`'s message), print the `problems` of the load, print the view (`render`),
  then read input. `createSession({ chat, out, system: writeSystemPrompt(DIR), mcp:
  mcpConfig(DIR) })` already does the rest: the `waiting for N summaries…` line, the
  queue, mid-run delivery, cancel.
- `Out` for the terminal: `text` raw; `thinking` dim (`ESC[2m … ESC[0m`); `info` on its
  own dim line, with a newline first if the cursor is mid-line. No cursor movement, no
  redraws (the scrollback must work).
- Input: bracketed paste per §10 (raw mode; `ESC[200~`…`ESC[201~` is one message with
  its newlines; Enter sends; minimal editing: printable characters, Backspace, Ctrl-U,
  Ctrl-D on an empty line exits; echo it yourself). Not a TTY: one message per line.
  Restore the terminal (`ESC[?2004l`, raw mode off) on every exit path, also on
  Ctrl-Z and on uncaught errors.
- Ctrl-C: `session.cancel()` if a turn runs or waits; a second Ctrl-C while idle exits
  (`chat.close()` stops the pump and releases the lock).
- Git commit of the data dir after every turn (§5.2): `git init` if missing, a
  `.gitignore` with `lock`, `git add -A` and commit in the DATA dir only, and never fail
  the turn on a git error (print it). Call it when `whenIdle()` resolves or from the
  session after `ask()`.
- `instructions.md` in the data dir is already read by `writeSystemPrompt`. The master's
  cwd is the REPL's cwd.
- Confirm with the real thing (so far only the fake `claude` and the Phase 0 probe cover
  it): a mid-run message taken at a tool boundary and its replay event, one that arrives
  during the final text step, Ctrl-C during a tool, a long tool loop (output over the
  30k cap), a multi-line paste.
- Install hint for the user: `ln -s ~/.claude/optchat/src/cli.ts ~/bin/optchat` (the file
  is executable and starts with `#!/usr/bin/env bun`). Tell them about the first-run cost
  of compacting an imported chat (§13).

### 16.8 Open points and risks

- `bypassPermissions` gives the master unrestricted Bash/Edit/Write (D9, approved).
- The pump's O(T) scan and the MCP server's reload per call are fine for thousands of
  messages, not for 1e5+ (`ponytail:` comments mark both).
- Layout B for the compactor is unbuilt and only pays while consecutive calls add ≤ ~20
  lines (§7).
- The master has a 1M-token context window, so no autocompact inside a turn is expected.
  Very long tool loops are unmeasured.
- Claude Code upgrades change the request and invalidate the cache once. Phase 0 was done
  on 2.1.289: re-check §14 P1–P3 (no leaks without `--safe-mode`, a stable prefix) after
  an upgrade, because a leak would silently break the prefix.
- Real views have never been refused by the safety classifier (§13): every real call in
  steps 3 and 4 passed. Synthetic word-salad views were refused 3 times in 10.
- The model may think or not (T1); thinking text is not available, only its size.
