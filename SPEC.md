# OptChat on Claude Code: implementation spec

This is the build spec for OptChat, an endless chat whose history is its memory,
using Claude Code (`claude -p`, subscription login) as the model engine.

- **Base spec:** [Victor Taelin's OptChat gist](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449) ( cited
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
├─ persist    git commit of the data dir after each turn
└─ cli        chat (tui.ts on a terminal, repl.ts otherwise), `browse` (HTML export), `import-optmem`, `view`, `stats`
```

No other runtime dependencies. Use only Bun built-ins and `node:` modules. The one
exception, by the user's request (2026-10-05): `@earendil-works/pi-tui` (pinned, `bun
install`) for the chat's TUI, `tui.ts` only; nothing else imports it.
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
  usage.jsonl                one line per model call: {date, kind, model, usage[, limits]} (usage.ts; §10 `optchat stats`)
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

- `main` record `{i, kind, text, size, date, src?}` (`src: "optmem:<n>"` on imported notes), `tree` record `{l, i, text, size}`,
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

**As built** (decisions the code made; only the failure scenarios listed in §10 are tested):

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
  equals the live fold only when the compactor kept up (the fit-invariants test asserts that case).
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
A child that dies early closes its stdin: `send` catches the EPIPE (thrown or a rejected
promise) and kills the child, so its output ends and the caller reports `claude exited
(code C)` with its stderr. Only that turn, compactor call or priming fails. Bun 1.4.2 also
rejects an internal promise with the same EPIPE; `reapChildren` drops that one (an
`unhandledRejection` hook for `EPIPE`/`write` only, everything else still crashes).

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
`user:`/`talk:`/`tool:`/`echo:`, about a plausible coding session. It must stay
exactly 512 UTF-8 bytes with no trailing newline (`wc -c prompts/scale.txt`; no test checks it).
In the step it is wrapped in `<scale>…</scale>` and introduced as a made-up sample (D12).

### 7.1 The compactor on OpenRouter (as built, D11)

The default compactor engine. `chat.ts` picks it when `COMPACT_OPENROUTER` (config.ts) is set
and `openrouterKey()` finds `OPENROUTER_API_KEY` (the repo's gitignored `.env`, then the
environment); otherwise `claude -p` as above, and a missing key is reported once.
`OPTCHAT_COMPACTOR=claude` sets it to null (the TUI demo does, its `claude` is a fake).

- Model and routing: `deepseek/deepseek-v4.1-flash`, `reasoning: {effort: "medium"}` (native
  low on Novita), `provider: {order: ["novita/fp8", "deepinfra/fp8"], allow_fallbacks: false}`:
  DeepInfra only when Novita fails, no other provider. Chosen by the probes in
  `docs/probes/` (summary in `docs/probes/README.md`).
- Prompt: `prompts/compact-v2.1.txt` as the system message, and
  `prompts/compact-v2.1-step.txt` appended to the step block. `compact.txt` stays the
  `claude -p` prompt.
- Same `blocks()` (the cache marks ride along; DeepSeek caches on its own) and the same size
  retries: `fit()` in `summarize.ts` runs the protocol for both engines. One chat-completions
  request per try, `max_tokens` 16,000, the conversation kept in the summarizer. A reply with
  no content (reasoning only, seen once on Novita in a size retry) is asked once more before
  it counts as an empty reply.
- Errors (HTTP status, `error` body, timeout after `CALL_TIMEOUT` for the whole job) fail the
  job like a `claude -p` failure: reported once, retried by the pump after `RETRY`.
- Usage: logged in the stream's field names (`input_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens`, `output_tokens`) plus `cost` (USD) and `provider`, so
  `optchat stats` sums both engines. A refetched empty reply is added to its try's line.

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
  view** (gist §10), then read messages from stdin. On a terminal this is a TUI in
  the main screen (pi-tui), so the terminal scrollback works; otherwise plain lines.
  - **Multi-line input:** line-based reading would turn a pasted block into one
    message per line. On a TTY, switch the terminal to bracketed paste mode
    (`ESC[?2004h` at start; `ESC[?2004l` on exit and before suspending): text
    between `ESC[200~` and `ESC[201~` stays ONE message with its newlines kept,
    and Enter outside a paste sends the message. When stdin is not a TTY, each
    line is a message.
  - While a turn runs, typed messages become mid-run messages (§5.2).
  - While waiting in `settle`, show `waiting for N summaries…`.
  - Ctrl-C cancels the current wait or turn; a second Ctrl-C while idle exits.
  - **As built** (`repl.ts`, `tui.ts`, `persist.ts`; `cli.ts` calls `repl(DIR)` when there is no
    command, and `repl` hands over to `tui(DIR)` when stdin and stdout are both terminals).
    Shared by both (`boot` and `header` in `repl.ts`): the lock, the system prompt, the
    session, the commit after each turn, `quit`, and the startup header below.
    Start: lock (a second process exits 1 with `optchat: another optchat is already running
    on <dir>`), the reaper of §5.2 armed, the load `problems` on stderr, the last 5 view
    lines of one user or talk message each, every one cut to one terminal row with `…`
    (a dim `… N earlier view lines (optchat view)` above them when there are more;
    `optchat view` prints the whole view), a dim header of three lines from `stats(mem)`
    in `view.ts` plus the REPL (`optchat: N messages, FIRST → LAST, last 2h ago`;
    `view 41.6/128 KB (32%), L lines · P summaries pending[, K view lines unsummarized]`,
    P counting every unbuilt node over a full pair, an upper bound on compactor calls;
    plain mode: `DIR · master M`; the TUI shows the key hints instead, and the data dir,
    view fill and model in its footer). Every model
    call appends `{date, kind, model, usage}` to `usage.jsonl` in the data dir (`logUsage`,
    committed with the rest): `kind` is `turn` (the `result` event's `usage`, the sum over
    the turn's API requests), `compact` (one line per summarizer try, its `result`'s
    `usage`) or `prime` (the `message_start` usage: input only, the call is killed there).
    `model` is what the stream reports (`system/init` or `message_start`), else null.
    `turn` and `prime` lines also carry `limits`: the subscription windows' utilization
    (0..1) from the latest `rate_limit_event` the call saw, e.g.
    `{"five_hour": 0.11, "seven_day": 0.22}` (`rate_limit_info.unifiedWindows.*.utilization`),
    else null. Claude Code emits that event after `message_stop`, just before `result`
    (measured 2026-10-05, Claude Code 2.1.289), so a prime, killed at `message_start`,
    always logs `limits: null`. Lines before 2026-10-05 have no `limits`; `optchat stats`
    does not read it.
    No effort is logged: the stream does not report it (init only has
    `per_turn_effort_active: true`, measured with Claude Code 2.1.289); the requested one
    is in §2. Lines from before 2026-10-04 have only `{date, usage}` and count as turns.
    A failed write is reported and never fails the call. Calls that end without a
    usage (cancelled, crashed) are not logged.
    - *TUI* (`tui.ts`, since 2026-10-05; replaced the hand-made raw-mode screen and its
      `createKeys` parser). `TuiMainScreen` + `ProcessTerminal`: the document is the
      startup header, the chat, the editor and a two-line footer; it looks like pi's
      interactive mode with pi's "dark" theme colours (okhsl values converted once).
      User messages: Markdown on the user background. Assistant text and thoughts: one
      Markdown per streamed run (`setText` on each delta), thoughts italic; a thinking
      block without text is one italic `thought for ~N tokens` line. Tools: a box per call
      (pending background, then success or error), title `$ command` for Bash (5 lines at
      most) or `name {json}` (300 chars at most), then up to 10 output lines and
      `... (N more lines, Ctrl-O to expand)`. Info lines dim, errors in the error colour. The editor's top
      border shows `── ⠧ Working ───` while a turn runs. Footer: data dir · `stats()` fill
      line (recomputed only after the view changed; a dir too long for the width is cut
      from the left, `…`, so the fill stays whole), then session totals of the turns and
      priming calls `↑input ↓output Rread Wwrite CHhit%` (hit = read / (input + read +
      write) over all of them; the priming usage comes through `Out.prime`) left and
      `MODEL • EFFORT` right. Compactor calls stay out of it (`/stats` has them). Model and tool text is stripped of control characters (`plain`) and tabs.
      A message sent while a turn runs waits above the editor as a dim `queued: text` line
      (pi's pending messages) and becomes a user box only when it enters the chat: when
      claude takes it (its replay event) or when it opens the next turn, or when a cancel
      logs it unanswered. So it never splits a streamed run. Every block (user box, run,
      tool box, info line) comes after one blank line, as pi's `Spacer(1)`.
      `turn.ts`'s `Out` has optional structured hooks (`error`, `thought`, `tool`,
      `result`, `usage`, `user`); `full(out)` fills the missing ones with the dim lines plain
      mode prints (`→ …`, `← …`, the usage line; `user` prints nothing, the terminal shows
      what was typed).
    - *Keys* (TUI): pi-tui's `Editor` (multi-line, bracketed paste, a paste over 10 lines
      shown as a marker and sent whole, Shift-Enter or Ctrl-J for a newline, Up/Down
      history of what was sent). Enter sends (while a turn runs, to the running call, §5.2);
      Esc cancels a running turn; Ctrl-D on an empty editor exits; Ctrl-O toggles all tool
      boxes between the preview and the whole title and output (pi's `app.tools.expand`). Slash
      commands (the editor completes them, no file completion) are never sent to the model.
      `/summaries` (`/s`, listed first so an exact `/s` + Enter picks it) shows or hides a
      top-right overlay, 30% wide, off at start, only drawn at 100+ columns, that never takes
      the keys (`nonCapturing`; not an `HStack`, which pi-tui keeps to `TuiAltScreen`): the
      compactor calls from the pump's `onJob` hook (start, done with the line, failed with the
      error; a failed node starts again after `RETRY`). Running calls first with their
      elapsed time (redrawn each second while shown), then finished ones newest first with
      their line wrapped; finished entries stay until the rows are needed, then the oldest
      leave. `/stats` it opens a bordered, scrollable overlay
      (`StatsPanel`) with `stats(mem)`, this session's turn totals and the `optchat stats`
      tables (`usage.ts` `aggregate`/`table`, days without calls dim); arrows, PgUp/PgDn,
      Home/End scroll, Esc or `q` closes, and while it is open no key reaches the chat (Esc
      does not cancel a turn). Plain mode sends `/stats` like any text. Plain mode (stdin or
      stdout not a terminal): one message per line, echoed as `> text`; at the end of the
      input the turn is finished and the process exits. Dim lines use colour only when
      stdout is a terminal.
    - *Ctrl-C*: a running or waiting turn is cancelled (`cancelled (Ctrl-C again
      exits)`); idle, the typed line is dropped and a hint is printed. A second Ctrl-C with
      no other key in between exits (Ctrl-C idle clears the editor): `session.stop()`, wait for the turn loop (so the
      messages the call never took are logged), `chat.close()`, a last commit, exit 0.
      Ctrl-D exits the same way.
    - *Ctrl-Z*: the terminal is given back (`ui.stop()`), the whole job is stopped with `SIGTSTP` to the
      process group (the `claude` children stop with it), and after `fg` the terminal is
      taken again (`ui.start()`, full redraw) with the typed text still there.
    - *Ctrl-G* (pi's `app.editor.external`; pi-tui's own `ctrl+g` is alt-screen search only):
      the editor's whole text (`getExpandedText()`, paste markers expanded) goes to a temp
      file, the TUI stops as for Ctrl-Z, and `sh -c '<cmd> "$1"'` runs `$VISUAL`, else
      `$EDITOR`, else `vi` (a shell, as git does, so the variable may carry arguments) with
      the terminal. Then the TUI starts again (forced full redraw) and, on exit code 0, the
      file (one trailing newline dropped) replaces the editor text, unsent. Another exit code
      (127: not found) keeps the old text and prints one info line. The temp dir is removed.
      Allowed while a turn runs: the stopped TUI draws nothing, the chat grows meanwhile and
      the redraw shows it. While `/stats` is open the key does nothing.
    - *Exit paths*: the TUI stopped (`ui.stop()`: raw mode and bracketed paste off, cursor
      shown), and the system-prompt temp dir removed, on a normal exit, a signal
      (`reapChildren` turns SIGINT/SIGTERM/SIGHUP into `process.exit(128+n)`) and an
      uncaught error. The directory goes first and the terminal writes are guarded: with
      the terminal already gone (SIGHUP when a window closes) a write throws.
    - *Git*: after every turn loop (`onIdle`) and at exit, the DATA dir is committed
      (`persist.ts`): `git init -q` when `DIR/.git` is missing (even inside another repo,
      so `add -A` never reaches it), a `.gitignore` with `lock` when missing, `add -A`, a
      commit only if something is staged, message `chore(chat): N messages`, author
      `optchat <optchat@localhost>` and signing off through `-c` (it must work on a bare
      machine and never wait for a passphrase). One git at a time; an error is printed
      once per distinct text and never fails a turn.
- `optchat view`: print the current view (read-only, no lock).
- `optchat stats`: read `usage.jsonl` (read-only, no lock) and print two plain tables,
  the last 14 local days and the last 8 ISO weeks (local dates), oldest first. Periods
  without model calls are hidden at rendering (`table()`; `aggregate()` keeps them); a
  table with none left is one dim `day: no model calls` / `week: no model calls` line,
  in the `/stats` overlay too. Columns: calls per kind (`turn`, `compact`, `prime`), input, cache
  read, cache write, output tokens, and hit = read / (input + read + write). Only the
  header (and that line) is dim, and only on a terminal; no costs, no charts.
- `optchat browse [out.html]`: one self-contained HTML page with the view,
  ROOT and each tree level, each entry with its range, time span and size
  (gist §10). Escape all text.
- `optchat import-optmem [path]` (default `~/.optmem/memory/LOG.txt`): appends
  the notes OptMem gained since the last import (other agents write there too);
  a rerun adds nothing. Manual only: it takes the lock, so the REPL must be closed. LOG.txt has fixed-width 320-byte records, each
  `#<n> <YYYY-MM-DD> <text>` padded with spaces, ending in `\n`. Import record
  `n` as message `i = n`, kind `note`, text trimmed, date = that day at
  **12:00 local time** (a fixed time, so imported times are recognizably
  synthetic). Refuse if the ids aren't contiguous from 0.
- Incremental import (as built): each imported note gets
  `src: "optmem:<n>"` and the next free message id. The cursor is the highest
  tagged `n` + 1; a chat without tags (the first import) counts its leading
  `note` messages, which are OptMem `0…k-1`. Only whole 320-byte records are
  read, so a record OptMem is still writing waits for the next run. Before
  appending, the stored text of note `cursor-1` must equal that LOG.txt record,
  and the log must hold at least `cursor` records: else an error and nothing
  written (a replaced or reset log). Dates stay the note's own day (option A),
  so message dates can go backwards; the startup header's "last" is the newest
  date, not the last message. A non-empty import commits the data dir. The
  `note` kind in the prompts reads "memories from OptMem, written by other
  agents too". One-way: OptChat never writes to OptMem.
- As built: `view`, `browse` and `mcp` never write (`repair: false`). `browse`
  writes `./optchat.html` unless given a path. `import-optmem` parses the whole
  file before writing anything (a bad file writes nothing), takes the lock, and builds the free nodes so the chat is readable at once.
  The real `LOG.txt` has 128 notes (2026-08-08 … 2026-10-04, 32 days, 123–280
  bytes each, ids contiguous from 0, 24 with non-ASCII text, so the padding is by
  bytes): 255 nodes, 173 free, 82 need the model.
- `src/selfcheck.test.ts` (`bun test`): **few tests, only for real failure scenarios; no
  per-function suites; no mutation runs** (breaking code on purpose to test the tests).
  No model calls. 21 tests, about 410 lines, ~1.1 s (it had 58, and 64 after step 5; the
  user asked for a lean suite; step 6 added one test). What is covered:
  - view and pump: the view-block cut points; the fit invariants over 1200 random
    messages (tiles `[0,T)`, under budget once parents exist, never splits, refold equals
    the live fold); pump rule 3 (messages in order, merges alongside, at most `JOBS`);
  - compactor: one failure test, end to end: a hung call times out, is reported once,
    and the node is retried and built (real summarizer, fake `claude`, real pump);
    OpenRouter (stubbed `fetch`): a size retry and a refetched empty reply, with the usage
    summed; the key lookup order;
  - store: a torn last line; the lock (live owner, stale socket); import: the `LOG.txt` parse;
  - the turn: the two recorded real streams (tools, thinking) through the event → log
    mapping; a late message that is requeued; a cancel that keeps the message unanswered;
  - priming: the flags and blocks equal the turn's, the background priming runs once; a
    failing priming is reported once; a cancel during priming;
  - children: a harness that exits, is terminated or is killed leaves no `claude` behind;
    every test reaps its children and no fake survives the run (§16.4).
    (The paste test of step 6 went with `createKeys`: pi-tui's `Editor` reads the input now.)

  Left untested on purpose, because they restated the code or were low risk: exact flags
  and prompt files, the tool descriptions, the MCP protocol, the CLI end to end, `browse`,
  per-error-type matrices, `cap()`; and, because they need a terminal, the REPL's screen
  handling, Ctrl-C, Ctrl-Z, signals and `persist.ts`: those were checked by hand in a pty
  (§14 R7) and with the real `claude` (§14 R1–R6). Add a test only for a failure that has
  happened or plausibly will, and don't let the suite grow back.
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
| D10 | `prompts/master.txt` adds three lines: each turn is a fresh process, so background tasks die when the reply ends | The harness kills `claude` at the first `result` (§5); a background Bash task dies with it (step 6). The gist's harness has no such limit. Approved by the user. |
| D11 | The compactor runs on OpenRouter (DeepSeek V4.1 Flash, prompt v2.1), not `claude -p` with sonnet, when a key is found (§7.1); amends D1/D6 for the compactor | Compaction was ~2/3 of the spend and used the subscription's quota; the user prefers API prices for a cheap model. `claude -p` stays the fallback. Approved by the user. |
| D12 | The step marks SCALE as a made-up sample, in `<scale>` tags, not from the chat (§7) | Unmarked, the sample leaked: on 2026-10-05 Sonnet wrote its export.py story into the real node 720+2 as chat content, and the merges above carried it up (720+4, 720+8). Approved by the user. |

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
6. REPL polish, git commit per turn, mid-run messages, Ctrl-C paths. **Done**
   (§10 as built, §14 R1–R7, §16.7). Again the handover (§16); the build order ends here.

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
- Claude Code behaviour met in step 6 (`-p`, bypassPermissions, §14 R1–R6):
  - A foreground `sleep N` of a minute or two is refused ("foreground sleeps are
    blocked"): the model runs it in the background and the turn ends at once (`sleep 12`
    stayed in the foreground; a `python3 -c` sleep of 117 s did too).
  - A background Bash task dies with its call: the harness kills `claude` at the end of
    the turn and the task goes with it. Nothing can keep running across turns.
  - Bash output over ~30 KB becomes a `<persisted-output> Output too large (42.9KB).
    Full output saved to: ~/.claude/projects/<cwd slug>/<session>/tool-results/…` notice
    plus a ~2 KB preview: that notice (~2.3 KB) is what the `echo` entry holds and what the
    model sees; the file is Claude Code's, subject to its own clean-up. `Read` output is
    cut near 30,000 chars, and `cap()` trims the small overshoot. So `CAP` rarely acts.
  - SIGTERM to a `claude -p` while its Bash tool runs: the tool's process is killed (exit
    137; the `tool_result` still arrives and is logged) and `claude` exits within ~1 s.
    No orphan is left.
- Bun in a terminal: `setRawMode(true)` keeps output post-processing (`\n` is CRLF) and
  turns off ICRNL, ISIG, ICANON and ECHO (Enter is `\r`; Ctrl-C and Ctrl-Z are the bytes
  0x03 and 0x1a, no signal). Bun restores the terminal modes at exit, not bracketed paste.
  The `exit` event also fires after an uncaught error. `process.kill(0, "SIGTSTP")` stops
  the whole job and returns after the shell's `fg` (the shell leaves the terminal cooked:
  set raw mode again). A closed terminal gives SIGHUP, and every write to it then throws:
  an exit handler must do its clean-up before, or without, writing.

## 14. Measured findings (2026-10-04, Claude Code 2.1.289)

Phase 0 (P1–P8), then step 3 (S1–S4), step 4 (T1–T3), step 5 (F1–F6) and step 6 (R1–R7); the scheduled ones come last.

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

**Step 6 (REPL), checked** with the real `repl.ts` in a pty (scratch Python drivers, not in
git: `pty.fork`, keystrokes in, raw bytes out, a scrubbed environment) against the real
`claude` on sonnet (`OPTCHAT_MODEL=sonnet`, scratch data dirs, one-line prompts, no proxy, so
no rate-limit readings), and against the fake `claude` for what needs no model. The usage
numbers are the REPL's own usage line: in · read · write · out, seconds.

| # | Question | Result |
|---|---|---|
| R1 | A message typed while a tool runs (`sleep 12; echo ready`, the second message typed 2 s into the tool) | **Taken at the tool boundary, in the same call.** One usage line (`4 · 13,020 · 535 · 169`, 15.5 s); the answer carried the word asked for; log `user, tool, echo, user, talk`: the second `user` entry comes from the replay event, after the tool's `echo`. |
| R2 | A message typed during the final text step (the model streaming 120 numbers) | The first call ended with its `result` (`2 · 6,381 · 258 · 241`, 3.2 s), all 120 numbers complete; the message was not taken, so it was requeued and got a **fresh call** (`2 · 6,659 · 244 · 4`, 1.4 s): `user, talk, user, talk`. No follow-up turn ran inside the first call (D3 holds with the real thing). |
| R3 | Ctrl-C while a foreground tool runs (a `python3 -c` sleep of 117 s) | `cancelled` at once; `claude` was gone within 1.1 s, and the tool's process within 0.6 s (the cancel makes Claude Code kill it: `← Exit code 137` arrived, was shown and logged as `echo`; log `user, tool, echo`). No process left. A second Ctrl-C exited with 0. A compactor call (sonnet) started ~2 s later for the new entries, as it should. |
| R4 | A long tool loop, outputs over the cap | Four Bash calls each printing 43–53 KB (one turn, 5 requests: `4 · 13,082 · 5,846 · 653`, 6.3 s): Claude Code replaced every output with a ~2.3 KB `<persisted-output>` notice (§13), so the log never held more. The next turn, typed at once, printed `waiting for 3 summaries…` (the pump had built one of the four echo summaries while the turn ran), then answered (`2 · 7,194 · 266 · 246`, 3.9 s). Its answer, 27333, was the last number of the preview it had been shown. A `Read` of a 48.8 KB file (8 requests, `8 · 72,376 · 24,018 · 775`, 10.4 s): Claude Code cut it near 30k chars and `cap()` trimmed the 44-char overshoot (`[… 44 chars cut …]`, 30,022 chars logged). |
| R5 | A multi-line paste | One `user` message with its three newlines; the model counted the 3 lines of the block (`2 · 6,381 · 267 · 3`, 1.2 s). |
| R6 | The default master (opus) | One turn answered (`2 · 6,254 · 408 · 4`, 1.8 s); 4 s idle afterwards, the background priming ran without an error line. |
| R7 | The terminal behaviour, in a pty with the fake `claude` (and a compactor whose calls never finish, on the imported LOG.txt chat) | As §10 says: typing, Backspace, Ctrl-U, Ctrl-D; a paste whole and cut inside both markers with CR/CRLF newlines; Ctrl-C idle (hint, then exit) and busy (`cancelled`, then exit; a message typed mid-run and never taken is logged unanswered); a tool line arriving while typing (input line erased, redrawn below it); Ctrl-Z and `fg` (also with a running child: it stops and continues with the harness); SIGTERM and SIGHUP (exit 143 / 129, terminal restored, children gone); a second REPL refused; a UTF-8 character and an emoji cut across reads; escape sequences in model and tool text stripped; the imported chat (128 notes, a 31 KB view) opens, and `waiting for 1 summaries…` ends in a Ctrl-C that keeps the message unanswered. Found on the way and fixed: a closed terminal (SIGHUP) skipped the temp-dir clean-up because the terminal write in the exit handler threw; a prompt flashed after `waiting for N summaries…` (the session wasn't busy yet when `turn()` printed it). Found by reading: a `stop()` landing while a call ended with an untaken message could start one more call (the loop now checks `stopped`). |

Cost of step 6's real calls: roughly 0.2M eq, nearly all sonnet (summed from the usage lines
plus an estimate for the compactor calls, about a dozen, and the cheap priming calls; there
was no proxy), one opus turn of about 1k eq.

**Scheduled measurements** (approved; each at its step, results go into this section):

- Step 4, done (§14 T1-T3). Its open part, a *real* mid-run message (the replay event of a message taken at a tool boundary), was confirmed in step 6 (§14 R1, R2), together with a long tool loop (R4).
- Step 5, done (§14 F1–F6): priming at full scale against the no-priming baseline; killed
  against completed priming requests, inconclusive (the proxy logs only the
  `anthropic-ratelimit-*` response headers).
- Not needed: the meaning of `queued_turn_count` (the harness kills at the first
  `result`).

## 15. Working agreement

The rules this build runs under. They come from the user, through the orchestrating
session `claude-e6` (Herdr pane `wR:p1`); the build session is `optchat-impl` (pane `wR:pK`).

- **Stack and style:** Bun + TypeScript, no new dependencies (Bun built-ins and `node:`
  only). The one allowed dependency, by the user's request (2026-10-05):
  `@earendil-works/pi-tui` for the TUI (§1, §10). KISS, no abstraction the spec doesn't need, code that reads like its neighbours
  (2 spaces, double quotes, terse comments; a `ponytail:` comment marks a deliberate
  shortcut with its ceiling and upgrade path).
- **Process:** follow §12 strictly. `bun test` green at the end of each step. A
  conventional commit (or a few) per completed step; stage files by path, never
  `git add -A` over scratch output. The first commit was the pre-existing
  SPEC/docs/dev files. No attribution trailer is configured.
- **Tests:** few tests, only real failure scenarios; no per-function suites; no mutation
  runs (§10). Step 6 added one test (the paste); later work adds a test only for a failure
  it actually finds.
- **Reporting:** a short status after Phase 0 and after each build step: what works,
  measured usage where relevant, open issues. Send it with `SendMessage` to `claude-e6`
  (find the orchestrator with `herdr pane get wR:p1` and `ListAgents`) while work goes
  on. A final answer is delivered automatically, so don't send a separate completion
  message. A finding that breaks the design stops the work and goes into the report.
- **Gate:** after steps 4, 5 and 6 the user asked for the handover (§16) and for work to wait
  until told to go on (step 5, then step 6, then whatever comes next). They may `/compact` first.
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
  `claude`). The same hook once blocked a Python heredoc that read `os.environ[...]`:
  write driver scripts with the Write tool. `pgrep -f <pattern>` takes a regex and also
  matches your own shell wrapper (its command line holds the whole heredoc): look at
  `ps --ppid <pid>` or `/proc/<pid>/cmdline` instead. This machine's shell and Claude Code
  sessions export `CLAUDE_CODE_*`, `HERDR_*` and plugin dirs: measure with a scrubbed
  environment (§16.5).

## 16. State of the build and how to continue

Written at the end of step 4 and updated at the end of steps 5 and 6, so that a fresh session
(or one after `/compact`) can go on from this file and `git log` alone.

### 16.0 Start here

1. Read this file fully, then the [OptChat gist](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449) (the base spec; this file lists every
   deviation from it).
2. `git log --oneline` and `bun test` (expect 17 passing).
3. The build order (§12) is complete and nothing is planned beyond it. Don't start anything
   new until the user says what (§15, Gate); §16.8 lists what is open.
4. If something blocks, ask the orchestrator (`claude-e6`) with `SendMessage`.

### 16.1 Status

| step | commits | state |
|---|---|---|
| Phase 0 | 3e66030, c6274af | done, §14 P1–P8 |
| 1 store, tree, view, pump | 0045b07 | done |
| 2 import-optmem, view, browse | 37546fa | done |
| 3 compactor calls | d74a2a2 | done, §14 S1–S4 |
| 4 mcp, turn without priming | 269d2cf | done, §14 T1–T3 |
| 5 prime | 240cfac (orphan fix), d2d2968 (proxy), ff3d093 | done, §6 as built, §14 F1–F6 |
| 6 REPL | 4ac3180 | done, §10 as built, §14 R1–R7 (§16.7) |

`bun test`: 21 tests in one file, ~1.1 s, no model calls (§10: the suite was trimmed after
step 5; step 6 added the paste test). Commits 84bc1b5 and d9d69f6 (the step 4 handover),
9f415f7 (the proxy bound to loopback), 7af5d59 (the step 5 handover), 8204193 and d20ad9c
(the test trim and its temp-dir clean-up) are outside the steps. The tool is complete:
`optchat` without a command is the chat.

### 16.2 Code map (`src/`)

| file | what it holds |
|---|---|
| `config.ts` | constants (gist §1, SPEC §2, `CALL_TIMEOUT`, `KILL_GRACE`, `PRIME_*`); env overrides `OPTCHAT_MODEL`, `OPTCHAT_PERMISSION_MODE`, `OPTCHAT_DIR`, `OPTCHAT_COMPACTOR`; `COMPACT_OPENROUTER` |
| `tree.ts` | types `Msg`/`Node`/`Coord`/`Mem`; `id+n` addressing (`span`, `label`, `coords`); `freeText`, `ready`; `built`/`getNode`/`setNode` (first write wins); `dayOf`, `localTime` |
| `view.ts` | `fit`, `addMessage`/`addNode`, `refold`, `render`, `cutBlocks`, `allBuilt`, `first`, `context`, `settle`, `PLACEHOLDER`, `flat`, `stats` (startup header) |
| `store.ts` | JSONL append (write + fsync), `loadChat`, `newMsg`, `committer` (persist + `addNode`), `acquireLock` |
| `compactor.ts` | the pump: `createPump` (its `onJob` events), `buildFree`, `makeJob`, the `Job`/`Summarize`/`JobEvent` types |
| `summarize.ts` | the `claude -p` `Summarize`: layout A `blocks()`, `fit()` (the size retries, both engines), `cut()`, `SCALE`, `COMPACT_FILE`, `onCall` usage hook |
| `openrouter.ts` | `openrouterKey`, `makeOpenrouterSummarizer` (§7.1) |
| `claude.ts` | `spawnClaude` (`send`, `next`, `result`, `kill(grace)`, `stderr`, `model` (as the stream reports it), `limits` (latest `rate_limit_event`), optional `tap`), `windows`, `baseArgs`; the registry of running children and the exit/signal hooks that SIGTERM them (§5.2), armed by `reapChildren()` |
| `chat.ts` | `openChat`: lock + `loadChat` + pump + `log()`; picks the compactor engine |
| `prime.ts` | `createPrimer` (§6): `prime(view)`, `stop()` |
| `turn.ts` | `writeSystemPrompt`, `mcpConfig`, `masterArgs`, `cap`, `createMapper`, `createSession` (the turn loop, foreground and idle priming, `input`/`cancel`/`stop`/`whenIdle`, the `onIdle` option) |
| `repl.ts` | `boot` (lock, session, commit per turn, `quit`), `header` (startup tail + `stats`), `plain`, `repl(dir, openChat options)`: plain line mode, or `tui` on a terminal (§10 as built) |
| `tui.ts` | `tui(dir, openChat options)`: the pi-tui chat (theme, chat blocks, tool boxes, working border, footer, keys, Ctrl-Z, Ctrl-G, `/stats` and `/summaries` overlays) |
| `persist.ts` | `commitData(dir, msg)`: the data dir's own git repo, one commit per turn (§10) |
| `mcp.ts` | `TOOLS`, `zoom`, `date`, `serveMcp` |
| `import.ts`, `browse.ts` | `parseOptmem`/`importOptmem`; `browseHtml` |
| `usage.ts` | `logUsage` (one line per model call, `limits` for turn and prime), `aggregate`, `isoWeek`, `hit`, `table` (`optchat stats`) |
| `cli.ts` | no command: `repl(DIR)`; `view`, `stats`, `browse`, `import-optmem`, `mcp` |
| `fake-claude.ts` | test double for `claude -p` (format in its header, `$sleep` and `$take` for demos; reads stdin all the time; exits on a closed stdin and on SIGTERM) |
| `selfcheck.test.ts` | the 21 tests (§10) |
| `fixtures/` | `turn-tools.jsonl`, `turn-thinking.jsonl`: real master streams, sanitized |

`prompts/`: `compact.txt` (gist §4.4 verbatim), `scale.txt` (512 bytes), `master.txt`,
`view_doc.txt`: each is derived from the gist by hand (no test re-derives them). `dev/`: `wire-proxy.ts`, `wire.ts`,
`tui-demo.sh` (+ `tui-demo.ts`: the TUI on `/tmp/oc-tui` with the fake `claude` replaying a slowed demo stream).

### 16.3 Running things

```
bun test
OPTCHAT_DIR=<short scratch dir> bun src/cli.ts import-optmem    # real LOG.txt, read only
OPTCHAT_DIR=<dir> bun src/cli.ts view                           # what the model sees
OPTCHAT_DIR=<dir> bun src/cli.ts browse out.html
OPTCHAT_DIR=<dir> OPTCHAT_MODEL=sonnet bun src/cli.ts           # the chat; sonnet as master for cheap checks
printf 'hello\n' | OPTCHAT_DIR=<dir> bun src/cli.ts             # not a TTY: one message per line, exits when the turn is done
ln -s ~/.claude/optchat/src/cli.ts ~/bin/optchat                # the install (works through the symlink; the user's choice)
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
  the run's children. `tmp()` dirs (and the `writeSystemPrompt` dir a rig makes) are removed
  in `afterAll`, from inside bun; a run adds nothing to `/tmp`. (Before this, every run left
  ~60 `optchat-*` dirs behind. The REPL removes its own `optchat-XXXXXX` system-prompt dir
  at exit, on every exit path but a SIGKILL; `view`, `browse` and `mcp` make none.)
- `src/fixtures/*.jsonl` are real master streams (a turn with MCP and Bash; a thinking
  block). To record one: `createSession({ …, tap: file })` or `spawnClaude(args, env,
  tap)` writes every raw stdout line; replace the `system/init` paths and plugin lists
  and anything personal before committing.
- No mutation runs (the user stopped them): don't break code on purpose to test the tests.
  They were done by hand after steps 1, 3 and 4 and every mutant was caught then.

### 16.5 Measurement recipe (the scripts used so far were scratch files, not in git)

- Proxy: `LOG=<f>.jsonl PORT=8399 SYSDIR=<dir> bun dev/wire-proxy.ts &`, outside the
  repo; stop it by PID. It binds `127.0.0.1` only (it used to bind all interfaces, Bun's
  default); it forwards the caller's OAuth token upstream, so run it only while measuring.
  Read it with `bun dev/wire.ts <f>.jsonl [last N]` (it shows `ABORTED` and the
  `ratelimit:` headers). The proxy cancels the upstream request when the client goes
  away, so a killed priming call is really killed (§10, §14 F2). SYSDIR dumps full
  request bodies minus long text and contain the userEmail reminder.
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
  write); step 4 about a dozen opus requests of 5–7k tokens and three thinking probes;
  step 5 about 540k eq (§14, after F6): twelve full-scale opus requests (a 128 KB view is
  ~48k tokens, ~61k eq each time it is written), small checks and probes; step 6 about
  0.2M eq, nearly all sonnet (§14 R1–R7).
- The REPL in a pty (step 6; scratch Python, not in git): `pty.fork()` runs `bun
  src/cli.ts` with `env` = HOME, PATH, LANG, TERM, `OPTCHAT_DIR` (a scratch dir) and
  `OPTCHAT_MODEL=sonnet`; `os.write` the keystrokes (`\x1b[200~…\x1b[201~` a paste, `\x03`
  Ctrl-C, `\x04` Ctrl-D, `\x1a` Ctrl-Z, `\r` Enter), `select` + `os.read` the output and
  match it with regexes (the usage line `\(\d+ in · … s\)` ends a turn);
  `termios.tcgetattr(master)` shows the terminal flags after the exit; closing the master
  fd is a closed window. Ctrl-Z needs `bash -i` as the pty's program, with the REPL run in
  it. For the fake `claude`, set `OPTCHAT_CLAUDE`, `FAKE_CLAUDE_SCRIPT`, `FAKE_CLAUDE_LOG`
  (the repo's fake has no sleep step: use a scratch copy when output must arrive over
  time). To keep every summary off the model, call `repl(dir, { summarize: () => new
  Promise(() => {}) })` from a scratch script instead of the CLI. Check children by PID
  (`ps --ppid`, `/proc`), not by `pgrep -f` (§15).

### 16.6 Step 5 (prime): done

Built as §6 "As built" says and measured as §14 F1–F6 says. To repeat the full-scale run
(the scripts were scratch files, not in git):

- A chat of 475 synthetic notes (~270 bytes each, varied templates, the first note carrying
  a run id so that every run is a cache miss; each far below 512 bytes, so every level-0
  node is free), opened with `openChat(dir, { summarize: () => new Promise(() => {}) })`
  so the ~240 merges that aren't free never reach a model, and driven with
  `createSession({ …, prime: false | { idleMs: 600_000 } })` and "Reply with just OK."
  turns (one request each), through the proxy with a scrubbed environment. A warm-up turn
  on a tiny chat comes first, so tools and system prompt are cached in every run.
- Killed against completed priming: the same blocks sent by the real primer (killed at
  `message_start`) and by `spawnClaude` (left to complete), one cold view each, with tiny
  haiku probes between them (compactor flags, a one-line system prompt file) to read the
  account utilization from the proxy's `rl` record.
- Don't repeat the billing comparison without a better instrument: it cost ~250k eq and
  ended inconclusive (F6).

### 16.7 Step 6 (REPL): done

Superseded on 2026-10-05 by the TUI (§10 *TUI*): the screen state, `createKeys` and the
"not planned" list below describe the plain REPL that came before; plain mode keeps only
the line-per-message path. The rest (options, `onIdle`, exit paths) still holds.

Built as §10 "As built" says (`repl.ts`, `persist.ts`, small changes in `turn.ts`, `claude.ts`,
`cli.ts`) and checked as §14 R1–R7 says. What to know when touching it:

- `repl(dir, options)` forwards `options` to `openChat` (a scratch script passes a `summarize`
  that never finishes to keep every summary off the model). The session is built with
  `onIdle`, which the REPL uses to clear its own `working` flag, commit the data dir and draw
  the prompt. The REPL keeps its own `working` flag because the session's state is set only
  after `turn()` has printed its first lines (`waiting for N summaries…`).
- Screen state is three variables, `col0` (cursor at the start of a line), `onInput` (the
  cursor is on the prompt line) and `buf` (what is typed). Everything that prints goes
  through `put`; the prompt and the typed text are drawn only by `draw`/`show`. A change in
  how output interleaves with typing belongs there, not in the callers.
- The parser `createKeys` is pure and has the one test. A new key means a new entry in
  `KEYS` and a handler in `keys`; a sequence it doesn't know is dropped, never echoed.
- Exit paths all end in the `exit` event: `quit()` (Ctrl-D, second Ctrl-C, the end of piped
  input) calls `process.exit(0)`, and signals go through `reapChildren`. Anything that must
  happen at exit (the temp dir, the terminal) lives in that one handler and must not depend
  on a terminal write succeeding.
- Not done on purpose, and not planned: line editing beyond Backspace and Ctrl-U (no
  cursor keys, no history), multi-row redraw of a wrapped input, a `--print` one-shot mode
  (piping a line in is the one-shot), colours beyond dim, a status line. The startup
  header (`stats`) is not one: it is printed once at start and never redrawn or updated.
- For the user, when they install it: `ln -s ~/.claude/optchat/src/cli.ts ~/bin/optchat`
  (the file is executable and starts with `#!/usr/bin/env bun`; it works through the
  symlink). The first run on the imported LOG.txt chat starts ~82 sonnet calls at once
  (§13): tell them before they open it. The data dir `~/.optchat` is its own git repo, one
  commit per turn, with no remote: backing it up is theirs (gist §10: "the log is your life").
- To re-check the REPL after a Claude Code upgrade, repeat §14 R1 (a message typed during a
  tool), R2 (one during the final text) and R3 (Ctrl-C during a tool) with `OPTCHAT_MODEL=sonnet`
  on a scratch chat: about 15k eq each.

### 16.8 Open points and risks

- `bypassPermissions` gives the master unrestricted Bash/Edit/Write (D9, approved).
- The pump's O(T) scan and the MCP server's reload per call are fine for thousands of
  messages, not for 1e5+ (`ponytail:` comments mark both).
- Layout B for the compactor is unbuilt and only pays while consecutive calls add ≤ ~20
  lines (§7).
- The master has a 1M-token context window, so no autocompact inside a turn is expected.
  Loops of 4 to 8 requests with big results were fine (§14 R4); loops of dozens of steps
  are unmeasured.
- Claude Code upgrades change the request and invalidate the cache once. Phase 0 was done
  on 2.1.289: re-check §14 P1–P3 (no leaks without `--safe-mode`, a stable prefix) after
  an upgrade, because a leak would silently break the prefix.
- Real views have never been refused by the safety classifier (§13): every real call in
  steps 3 to 6 passed, also the 475 templated (realistic) synthetic notes of step 5.
  Synthetic word-salad views were refused 3 times in 10.
- The model may think or not (T1); thinking text is not available, only its size.
- Whether a request killed at `message_start` is billed is unknown (§14 F6, inconclusive);
  §6 assumes it is billed in full. The kill also loses the race against a tiny response
  now and then (F3): harmless.
- A merge changes the view from the merge point on, and the blocks before it stay cached.
  The next priming rewrites from the first changed block on; how often an early merge
  forces a rewrite of everything (~48k tokens, ~61k eq at full size) in real use is
  unmeasured. The tail-change case is F1. A view under 50k chars is one block, so each
  append rewrites it (F5): cheap while it is small.
- What a real `claude` does when its stdin closes (a harness killed with SIGKILL) is not
  measured; the exit and signal hooks cover everything except SIGKILL (§5.2).
- Background work ends with the call (§13): a server or watcher the master starts with
  `run_in_background` dies when the turn ends, and `prompts/master.txt` doesn't say so.
  Whether to tell the model is the user's call (the prompt is derived from the gist).
- A big tool result is a `<persisted-output>` notice in the log, and the file it names is
  Claude Code's, deleted by its own clean-up some day (§13): the log keeps the notice, not
  the output.
- Ctrl-Z during a real turn stops the `claude` child mid-request too (it works with the
  fake); a long suspension may break its API stream: unmeasured. Ctrl-D, like a second
  Ctrl-C, cancels a running turn.
- Terminal limits (§10): a wrapped or pasted input is erased only on its last row, wide
  characters back up one column, there are no cursor keys or history.

### 16.9 Planned (approved by the user, not started)

Start these only when the user says so (§15, Gate).

1. **`search` tool and the raw-log hint.** The master reaches old detail only by zooming
   down from the view. A fact that a high-level summary dropped gives it no hint where to
   zoom, and a topic spread over hundreds of messages costs one zoom per step. The master has
   Bash/Read/Grep, but nothing tells it where the log is.
   **Dropped by the user (2026-10-05):** unsure it adds real value, and it deviates from the
   gist. The hint alone (where the log is) would be the cheap version if it comes back.
   - `search(text)` in the MCP server (`mcp.ts`, read-only like `zoom`/`date`, no lock):
     case-insensitive substring over the raw messages (not the summaries), hits as
     `id+1|<snippet around the hit>`, newest first, capped (~50, then "N more"); the model
     follows up with `zoom(id, 1)`.
   - The hint: the log location (`<OPTCHAT_DIR>/chat/main/YYYY-MM-DD.jsonl`, one
     `{i, kind, text, size, date}` per line) where the model sees it. Preferred: in the
     `search` tool description, built from `OPTCHAT_DIR` at server start, so `master.txt` and
     `view_doc.txt` stay gist-derived; it must stay byte-stable across turns (cache). At most
     one sentence in `view_doc.txt` on when to use `search`.
   - A new D-entry (§11), §9 and README updated, one test (hits, case, cap, no hits).
2. **Done (§7.1, D11).** **Compactor through OpenRouter, switchable by config** (depends on the compactor model
   probe, `docs/probes/compact-models.md`). Reason: compaction is ~2/3 of the spend and
   uses the subscription's quota/rate limits; the user prefers paying API prices for a cheap
   model. The engine is chosen in config (not at runtime in the TUI): `claude -p` as today,
   or OpenRouter with a model id. API key lookup: `OPENROUTER_API_KEY` from a `.env` file in
   the repo (gitignored), else from the environment, else fall back to `claude -p`. The key
   never goes into `config.ts`, logs or git. Adds a D-entry (amends D1/D6 for the compactor).
3. **Done (§10 TUI, as `/summaries` and `/s`).** **Compactor sidebar in the TUI, toggled by `/sidebar`.** A sidebar lists the compactor calls
   that are running now (node `id+n`, level, elapsed time). When a call finishes, its entry
   shows the result: the summary line it produced (the last model response). Finished entries
   stay until new calls start, then the oldest finished ones leave so the list fits the
   sidebar. `/sidebar` toggles it (registered with the slash-command autocomplete like
   `/stats`); off by default. Data comes from the pump (start, done, failed, retry), through a
   hook like `report`, not from the usage log. Drawn as a pi-tui overlay, decided by the user: `anchor: "top-right"`,
   `width: "30%"`, `nonCapturing: true` (the editor keeps the keys), `visible: (w) => w >= 100`;
   `/sidebar` calls `setHidden()`. It covers the right part of the chat while shown, which is
   fine for a temporary panel. Not an `HStack`: pi-tui keeps `VStack`/`HStack` to `TuiAltScreen`,
   and moving off `TuiMainScreen` would take the chat out of the terminal scrollback (§10).
4. **Done (§10 TUI footer).** **Footer cache hit = turn + prime for the session.** Today `CH` is the last master turn's
   `read / (input + read + write)` only (`tui.ts` `usage()`), ~99%, because the priming call
   took the cache write before the turn. Show the session's turn and prime calls together
   instead (all usage so far, same formula; ~93% on the data of 2026-10-04/05), so the footer
   reflects what a turn really costs. Compactor calls stay out of it (they are in `/stats`).
   The prime usage reaches the TUI through a hook next to `out.usage` (today it only goes to
   `logUsage`).
