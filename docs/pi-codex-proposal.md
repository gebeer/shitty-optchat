# OptChat for Pi — implementation proposal

## Recommendation

**Use Pi's native agent loop and provider adapters, not `claude -p`.** Pi 1.0.2 exposes both full-transcript replacement and final provider-payload replacement: the three Claude Code hook blockers are not Pi blockers.

Implement a small OptChat core plus a Pi extension, hosted by a thin, always-on **Pi SDK/plain-terminal runner**. Create a fresh, in-memory Pi session for each idle admission of user input; Pi still owns streaming, reasoning replay, tool execution and steering. The runner owns admission, cancellation, permanent memory and background compaction. This is not a second implementation of Pi's agent loop.

A stock-Pi extension alone can rebuild the request context correctly, but stock Pi's TUI redraws violate spec §10, and its ordinary session files persist reasoning. The SDK runner avoids both without asking for a spec exception. A TUI-only variant would require explicit acceptance of that UI deviation; it is not the recommendation.

**Evidence labels:** **V** = verified in installed declarations/source or vendor documentation; **I** = proposed integration, not executed. No installation, implementation, credential changes or paid model probes were performed.

## Sources and citation keys

The OptChat spec, predecessor README and complete `memo`, four existing OptMem extension files, and all 116 `LOG.txt` records were read. Local `~/.pi/agent/docs` was also read; it contains historical integration/Herdr documents, not the current extension contract.

Installed Pi version: **1.0.2**. In citations below:

- **P** = `~/.nvm/versions/node/<version>/lib/node_modules/@earendil-works/pi-coding-agent`
- **A** = `P/node_modules/@earendil-works/pi-ai/dist`
- **G** = `P/node_modules/@earendil-works/pi-agent-core/dist`
- **T** = `P/dist/core/extensions/types.d.ts`
- **R** = `P/dist/core/extensions/runner.js`
- **S** = `P/dist/core/agent-session.js`

Relevant installed docs read completely: `P/README.md`, `P/docs/{extensions,custom-provider,sdk,tui,models,providers,sessions,message-types,settings,how-pi-works,session-format,compaction,cli-integration}.md`, and relevant extension/SDK examples. Citations refer to actual installed declarations and JavaScript, not assumed upstream APIs.

## 1. Hook-by-hook mapping

| Requirement | Verified Pi API and source | Proposed use / important limit |
|---|---|---|
| Fresh context per idle user turn | **V:** `context` and `context_with_system`, T:650–670; `emitContext()`, R:1006. `context` excludes system messages; `context_with_system` sees the complete transcript and sends the returned list. `createAgentSession()` and `SessionManager.inMemory()`: `P/dist/core/sdk.d.ts:107`, `session-manager.d.ts:386`. | **I:** Prefer a fresh in-memory SDK session per logical OptChat turn. A long-lived extension can instead project `[fixed system, initial user blocks, current-run suffix]` on every request. Keep the leading system message with tool declarations; do not merely filter since the latest user message, because steering is part of the same run. |
| Constant system prompt | **V:** `before_agent_start` returns `{systemPrompt}`, T:699,1088; forced prompt projection, S:1277–1312. `DefaultResourceLoader` override examples: `P/examples/sdk/03-custom-prompt.ts`, `12-full-control.ts`. | **I:** Return exactly MASTER + VIEW_DOC + one approved, fixed instructions snapshot. Suppress default date/cwd/context-file/skill catalog additions. Keep instructions and tool definitions byte-identical across requests; explicit configuration changes establish a new stable prefix. |
| Exact request body and cache annotations | **V:** `before_provider_request`, T:671,1166; R:1067. Return the replacement **payload itself**, not `{payload: ...}`. SDK wires it to `onPayload`, `P/dist/core/sdk.js:208–266`. Anthropic and Codex adapters await it before dispatch: `A/api/anthropic-messages.js:429`, `openai-codex-responses.js:174`. | **I:** Perform provider-specific block splitting and annotations here, after conversion. Use SSE: Codex's `websocket-cached` can subsequently replace the full input with `previous_response_id` plus a tail (`openai-codex-responses.js:1122–1175`). Hook access is verified; endpoint acceptance of new cache fields is not. |
| Headers / response diagnostics | **V:** `before_provider_headers` mutates headers in place; `after_provider_response` reports status/headers; `provider_stream_event` reports parsed, read-only provider events: T:675–698. | **I:** Record only payload fingerprints, block boundaries and numeric usage. These are not an unrestricted raw-HTTP interception API. Never record credentials, raw reasoning events or complete debug payloads. |
| Every assistant text and model tool call | **V:** `message_update.assistantMessageEvent` exposes `text_start/delta/end`, `thinking_*`, `toolcall_*`; `message_end` contains the finalized message: T:802–817; G/agent-loop.js:262–333. | **I:** Print deltas; append each completed text block as `talk`, each completed call as `tool` (name + JSON input), maintaining stream order. Reconcile finalized/aborted messages to prevent omission or double logging. Do not concatenate a whole assistant turn into one note. |
| Every tool result; cap before replay | **V:** `tool_result` can replace `content`, `details`, `structuredContent`, `isError`, `usage`: T:948,1077; R:904. `tool_execution_start/update/end`: T:818–849. | **I:** Apply CAP=30,000 characters, head + tail + cut notice, to the model-facing textual echo before replay and ROOT append. Log finalized results, not progress deltas. Check structured content cannot bypass the cap. Built-in truncation helpers are not the spec's head+tail rule. See the zoom ambiguity below. |
| Native codemode/nested calls | **V:** nested execution emits start/end with `parentToolCallId`, `P/dist/core/nested-tool-calls.js:92–169`; nested calls are not independent session messages. | **I:** If codemode is retained, log actual nested tool calls/results once using those events; deduplicate top-level calls by tool-call ID. Keep only the real parent messages in provider replay—do not invent orphan tool-result messages. Otherwise use a small fixed direct-tool set initially. |
| Mid-run user input | **V:** `input` has source and steering behavior, T:873; `pi.sendUserMessage(..., {deliverAs:"steer", expandPromptTemplates:false})`, T:1230; SDK `session.steer()`, S:1680. `session.clearQueue()` returns unconsumed steering/follow-up strings, S:1841. | **I:** Runner accepts input while streaming and steers it into the current run. Log at actual delivery; preserve unconsumed input. Pi steering is consumed after an assistant/tool **batch**, not between siblings within that batch: G/agent-loop.js:85–186. For literal per-tool boundaries request one top-level call at a time (`parallel_tool_calls:false` for Responses); verify the endpoint honors it. Sequential execution alone does not change steering placement. |
| Wait before a turn / cancel settle | **V:** async `input` and `before_agent_start` handlers are awaited; S:1444–1573. `ctx.signal` is undefined when not streaming, T:240. SDK `session.abort()` awaits idle, S:1873. | **I:** Runner owns a pre-admission AbortController and awaits OptChat `settle(signal)` before calling `session.prompt()`. Do not rely on `ctx.signal` during pre-start wait or assume ordinary Esc cancels that wait. `agent_before_settle` is a *post-run* hook, not this wait. |
| Know when a logical run ended | **V:** `agent_settled` is final activity settlement; `agent_end` can precede retries/continuations: T:727–785; S:666–695. `session.prompt()` resolves after its work; `session.dispose()` releases resources, S:975. | **I:** Do not advance idle admission on `agent_end` alone. Await prompt/settlement and durable logging, recover queues, then dispose the ephemeral session. Do not use `followUp` for a new OptChat turn: it keeps the current context. |
| Exclude thoughts without breaking tool steps | **V:** normalized assistant blocks preserve thinking signatures/encrypted reasoning: `A/api/anthropic-messages.js:1105–1132`, `openai-responses-shared.js:124–270,583`. Pi session persistence appends full assistant messages: S:738. | **I:** Show thinking live but never put it in ROOT/tree, HTML, backups or debug files. Preserve the complete original assistant objects in the in-memory current-run suffix. Use in-memory session persistence, not a filtered provider transcript that destroys signatures. |
| `zoom` / `date` | **V:** `pi.registerTool()` with schema and async execute: T:437–492, `P/examples/extensions/hello.ts`. | **I:** Register the spec's exact descriptions and range semantics. Validate safe nonnegative integer IDs, power-of-two n, alignment and bounds. No MCP server needed for native Pi; it would only be useful for an external engine. |
| Background compactor | **V:** `ctx.modelRegistry.find()/streamSimple()/complete()` resolve configured provider auth: `P/dist/core/model-registry.d.ts:28–42`; process-shared `ModelRuntime.create()/streamSimple()/completeSimple()`: `model-runtime.d.ts:56,100`. | **I:** Process-owned asynchronous pump, JOBS=8, using direct tool-free model streams, not another agent. Own lifetime/abort signals, independent of user-turn cancellation; stop on process shutdown. Do not retain a disposed extension context. |
| UI and commands | **V:** `ctx.ui.setStatus()/setWidget()/custom()`, T:72–150; `pi.registerCommand()/registerShortcut()/registerMessageRenderer()`, T:1194 onward; `P/docs/tui.md`. | **I:** Available for an optional Pi TUI integration, but not the recommended §10-compliant terminal. Plain SDK stdout/readline, initial view print and a browser-export command need no custom TUI. |

**Safety distinction:** extension callback errors are generally reported and execution continues (R:1015–1100). A throw in a context/payload/logging hook is therefore not a fail-closed policy. The SDK exposes `session.agent` (`P/dist/core/agent-session.d.ts:209`), whose `subscribe()` promises are awaited (`G/agent.d.ts:76`, `agent.js:393–446`). Use that awaited path for durable logging, plus health/layout guards around public `Agent.onPayload` and `beforeToolCall`, preserving Pi's existing callbacks (`G/agent.d.ts:40–49`). This composition is **I**, requiring disk-failure tests. Public `session.subscribe()` is useful for display but does not await returned promises (S:637).

Minimal hook-shape illustration, not implementation:

```ts
pi.on("context_with_system", () => ({ messages: requestTranscript }));
pi.on("before_provider_request", event => finalPayload(event.payload));
```

`ctx.sessionManager` is read-only; `ctx.newSession()/switchSession()/fork()` belong to command contexts, not a safe turn-start reset mechanism (T:211–334). Avoid lifecycle-triggered session resets; let the SDK host create sessions.

## 2. Module layout and turn flow

Suggested six small modules, all within one OptChat package; no database, vector search, IPC broker or second agent loop:

| Module | Responsibility |
|---|---|
| `store.ts` | ROOT/tree JSONL, lifetime Unix-socket lock, write+fsync, torn-line recovery, note import. |
| `memory.ts` | Binary node addressing, live append+fit view, refold at load, rendering, settle waiters. |
| `compactor.ts` | Exact COMPACT/SCALE, pump ordering, eight jobs, same-conversation size retries, fixed-delay failed-node retry. |
| `pi.ts` | Extension tools, fixed prompt/request projection, provider cache annotations, echo cap, durable event adapter and usage accounting. |
| `main.ts` | Plain terminal, admission/input queues, fresh SDK sessions, cancel/shutdown and per-turn persistence/backup boundary. |
| `browse.ts` | One escaped, private HTML export of current view, ROOT and every tree level with ranges, time spans and sizes. |

**Startup:** acquire the socket lock; load ROOT/tree without renumbering history; report/skip invalid JSON and append a newline if necessary. Reconstruct the view from message 0 using the same append+fit algorithm, never resummarize stored nodes. Start pump, print the view and accept input on the always-on machine. Attach through the existing terminal/remote workflow; no new OS service is needed merely to start.

**Idle admission:**

1. Queue user text; wait for every live view part to be built, with a cancellable wait.
2. Drain all queued idle texts. Freeze/render the view **before** adding those texts to ROOT.
3. Append each text as its own `user` record, one write then fsync. Join their text with `\n\n` only for the new-message block, as the spec does.
4. Create `createAgentSession({sessionManager: SessionManager.inMemory(), ...})`, sharing the configured ModelRuntime and process-owned memory. Load only approved tools/extension factories; bind them before the first request. Freeze tool declarations after asynchronous discovery, if any.
5. Force the exact fixed prompt. Build the first user message from view blocks followed by the new-message block. Run Pi's own loop via `session.prompt()`.
6. While Pi streams, append finished `talk/tool/echo/user` entries immediately and pump after each append. The global view can evolve, but the **initial request view stays frozen throughout this run**. Preserve signatures, encrypted reasoning and every actual current-run message verbatim for provider replay; ROOT excludes thoughts.
7. Inject mid-run user input through steering; recover never-consumed messages on cancellation/end. Persist pending cancelled input exactly once as unanswered `user` entries; do not fabricate replies or lose input during session disposal.
8. Await settlement and durable events, persist/backup after the turn, dispose the ephemeral session, then admit the next queued idle input with a fresh view/session.

Use `SettingsManager.inMemory()` for launch-scoped overrides, not edits to the user's global settings: compaction disabled, cache warming off, SSE transport, no automatic branch summaries or retry-driven context rewriting. Disable the old OptMem extension (`OPTMEM_DISABLED=1` is supported) and omit competing `pi-codex-compaction`/prompt-injection factories in this OptChat runtime. Do not globally disable unrelated security controls; preserve approved tool permission hooks.

## 3. Exact memory/compactor contract

Retain the spec's constants: NODE=512 UTF-8 bytes, VIEW=128,000 bytes, JOBS=8, TRIES=5, RETRY=10s, CAP=30,000 characters, MARKS=50k/80k/100k characters. VIEW measures **part texts**, not address/markup overhead. Node output may remain slightly over target after five attempts; fit measures its actual size.

- Pure binary tree, including a summary at level 0 for every ROOT message. Free nodes are exactly the spec's short `kind: text` or `childA + "\n" + childB`; otherwise call the model. No OptMem raw-block shortcut.
- Copy §4.1 pump/rule 3 exactly: `end=i` for level 0, `(i+1)*2^l` for merges; compare with `first()` (earliest unbuilt view-part start, or T). Sequential message summaries, parallel eligible merges, eight occupied slots including failed nodes waiting their 10s retry. Report the first failure per node; retry forever. Disable SDK/provider automatic exponential retries for these calls.
- First user block is the ID-free `<chat>` prefix: only preceding summaries for level 0, through the node's end for a merge. Second block repeats the **whole** message or both child texts, preceded by the verified 512-byte SCALE example. No addressing IDs; ordinary factual IDs inside source text are not scrubbed.
- COMPACT is verbatim §4.4, no tools, no extra formatting/priorities. Trim output only. Empty output fails. Retain each assistant response and send the exact byte-count/cut-at-limit feedback in the **same conversation**; stop under target or at five tries and keep the shortest. UTF-8-safe first-512-byte cut, not input truncation.
- Save/fsync each node before publishing it and fitting. View changes only by append and greatest-due adjacent aligned-sibling merge with a built parent: `due=(T-start)/2^(l+2)`. Never split, rebudget via alpha, or refold each turn. Refit wakes settle waiters.

### Existing models and auth

Verified without displaying secret values:

| Source | Relevant configuration |
|---|---|
| `~/.pi/agent/settings.json` | Master default `openai-codex/gpt-6.1-sol`, medium thinking. Enabled alternatives include Codex `gpt-5.6-{sol,terra,luna}`, `gpt-6-{astra,luna}`, OpenRouter DeepSeek v4 flash/pro, Cursor composer 2.5. Transport is currently **websocket-cached**; compaction enabled. |
| `~/.pi/agent/models.json` | No custom provider endpoint; Codex `gpt-5.6-{luna,sol,terra}` context overrides are 272,000 tokens. |
| `~/.pi/agent/extensions/optmem.json` | Existing curator is enabled, `openai-codex/gpt-5.6-terra`, medium. |
| Auth presence | Anthropic and Codex OAuth configured; OpenCode Go and Cursor API-key entries; `OPENROUTER_API_KEY` present. No Anthropic/OpenAI direct API-key environment variables were present. Credentials were not exercised. |

Start with **`openai-codex/gpt-5.6-terra`, medium** for the compactor: already selected by the user's curator, configured context room, no new auth/dependency. This is a baseline, not a claim that it is cheapest or equally good as the reference. Anthropic OAuth plus catalog `claude-sonnet-5-5` is a reference-like alternative; summarize-quality, rate-limit and cache probes must decide. Do not silently substitute a low-effort/cheap model—the spec explains that tradeoff's overshoot cost.

Make calls through shared `ModelRuntime.streamSimple()` or the extension's `modelRegistry.streamSimple()`, with explicit no tools, medium effort, short cache retention, SSE, provider `maxRetries:0`, and compactor-owned cancellation. Consume text only as summaries, preserving retry conversations in RAM. Supply the same final-payload cache helper explicitly: background registry calls do **not** automatically pass through the foreground extension's request hooks.

Keep COMPACT/system constant and `<chat>` first, step second. Split/cache the context at the same fixed view marks when long enough, plus automatic request end. Use a stable compactor cache/routing key separate from the master's, not a per-node timestamp. Eight independent retry conversations must never share mutable message arrays. Stable keys do not mean shared server conversation state; SSE sends complete independent requests.

The installed `CacheWarmer` schedules renewal calls (`P/dist/core/cache-warmer.js`); absent a setting, Pi defaults to streaming warming (`settings-manager.js:679`). Explicitly turn it **off**, also defensively return `{action:"stop"}` from `cache_warming_decision` (T:1165). `cacheRetention:"short"` alone does not disable warming.

### Import and replacement

Import `~/.optmem/memory/LOG.txt` into an initially empty ROOT as **116 `note` records with IDs 0–115**, removing only record headers/fixed-width padding. Preserve note text; never import OptMem's hybrid tree or wake view. Original records provide dates, not times: use the user's chosen fixed **12:00 local time** on the recorded date, and disclose date-only precision in browsing/date output. Keep the original files untouched and reject duplicate/noncontiguous import.

Existing `memo` uses raw blocks/parameterized wake; existing `protocol.ts` and `curator.ts` perform 280-byte ID-addressed, bounded-attempt, isolated curator calls. Those algorithms are wrong for OptChat; replace, do not wrap them. Reuse only model/config-resolution experience. No manual `note/nap/wake` protocol remains in the master's memory path.

## 4. Request caching and verification

### Provider payload policy

**Anthropic:** remove Pi's inherited cache marks on system, tools and last user block, then add only the three eligible view-piece `cache_control:{type:"ephemeral"}` markers and **top-level automatic** `cache_control:{type:"ephemeral"}`. No one-hour TTL. Pi currently adds its own marks (`A/api/anthropic-messages.js:885,1176,1282`), so simply adding three risks exceeding the four-mark limit. OAuth also prepends a fixed Claude Code identity system block (same file:885): stable for caching, but not literally MASTER-first. Prefer Codex for the initial master; strict Anthropic prompt ordering would need direct API auth or an explicitly justified mandatory-auth prefix.

**OpenAI Responses/Codex:** `store:false`, encrypted reasoning included/replayed, `reasoning.context:"all_turns"`, constant `prompt_cache_breakpoint:{mode:"explicit"}` on each eligible view `input_text` piece, `prompt_cache_options:{mode:"implicit"}` for request-end caching. Split at the last complete line end before each character mark; skip marks beyond the view. Annotations belong in the final payload: Pi's user-text converter does not retain arbitrary block metadata (`A/api/openai-responses-shared.js:124–270`). Keep the same block splitting/annotations for every request in the run.

Pi already sets `store:false`, encrypted-content inclusion and `prompt_cache_key`, but not view breakpoints or `reasoning.context` (`A/api/openai-codex-responses.js:378–413`). Set a stable master cache key across fresh in-memory sessions; otherwise Pi's default session UUID changes each turn. Choose short retention explicitly; never enable renewal pings.

**V:** Current vendor documentation supports these cache mechanisms:

- Anthropic: <https://platform.claude.com/docs/en/build-with-claude/prompt-caching> — three explicit plus automatic fourth, 20-block lookback, five-minute default, creation/read usage.
- OpenAI: <https://developers.openai.com/api/docs/guides/prompt-caching> — GPT-5.6+ explicit input-text breakpoints, implicit end mode, write/read usage, all-turn reasoning replay.

**Not verified:** the **ChatGPT Codex OAuth endpoint** accepts those newer Responses fields for the configured models. Public OpenAI API documentation is not proof of subscription-endpoint behavior. This is the first implementation gate; do not silently drop fields if rejected. If needed, use a compatible already-authorized provider, or obtain explicit user approval for direct API credentials/billing. A custom `pi.registerProvider(..., {streamSimple})` adapter is available (T:1275–1322; `P/docs/custom-provider.md`), but only justified if the stock adapter cannot express an accepted payload; no custom transport is currently needed.

### Usage-based proof plan — future probes, not tests already run

1. **Validate the actual wire layout.** Use SSE; retain only structure/hashes, constant-prefix fingerprints, line-ending offsets, marker counts and numeric usage. Assert system/tools constant, exactly eligible view markers plus request end, no placeholders, no prior-turn suffix, and unchanged current-run reasoning items. Test field acceptance independently before evaluating cache economics.
2. **Use a representative >100k-character view.** The 116 imported notes alone will not exercise all three marks. Replay text-only fixtures in scratch; same model, effort, tool declarations and stable cache key throughout. Make a cold request, then subsequent requests within expiry. Do not estimate tokens as characters/4.
3. **Isolate every view breakpoint.** After populating entries, alter only the view tail after 100k; then after 80k; then after 50k. Each experiment starts from the same warmed prefix. Expect reads near the longest unchanged eligible marked prefix, including tools/system. Compare against marker-disabled/end-only controls and provider token counts/calibrated matching-prefix controls. Allow tokenization/cache granularity, not an invented exact character-to-token ratio. Positive `cacheRead` alone only proves *some* caching, not the view marks.
4. **Verify in-turn extension.** Run several tool steps and inject a user message mid-run. Expect the previous request's input prefix to be read, with only newly included assistant output/reasoning, tool results and input written. Generated output is not automatically a previously written *input* cache entry; distinguish these. Earlier reasoning must remain present after steering. Test enough steps to cover Anthropic lookback behavior, not just a two-request happy path.
5. **Read raw and normalized fields correctly.** Anthropic: `usage.cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens` (uncached); input total is their sum. OpenAI: `usage.input_tokens_details.cached_tokens` and `cache_write_tokens`, with `input_tokens` already the total—do not add cached tokens again. Pi normalizes to `usage.{input,cacheRead,cacheWrite}` (`A/api/anthropic-messages.js:462`; `openai-responses-shared.js:442`). Compare numeric deltas across matched runs; record master and compactor separately. Require zero one-hour writes and zero warm-only requests.
6. **Repeat for compactor and pauses.** Two nodes sharing `<chat>` should reuse the same prefix despite different step blocks; oversize retries should extend that same conversation. Check expiry by waiting past the provider's short-cache lifetime without pings; rewriting after expiry is expected. Measure total calls/cache writes and settle latency under JOBS=8, not just a successful master cache hit.

## 5. All 15 mistakes to avoid

The following are design commitments, not claimed runtime test results.

| # | Avoided? How |
|---|---|
| 1. Refit from scratch every turn | **Yes:** one live append+greatest-due-merge view; refold only on startup; never split. |
| 2. Whole messages in view | **Yes:** view holds tree summaries/free short nodes only; full new input is outside the view, full history via zoom. |
| 3. Cut unsummarized text | **Yes:** admission waits for settle; no request sees a placeholder or raw prefix. Cancellation retains unanswered input. |
| 4. Contextless compactor | **Yes:** ID-free `<chat>` prefix first, with exact node-specific coverage and rule 3. |
| 5. Address IDs in compactor input | **Yes:** bare summary texts; whole source/children repeated in the step; no `id+n|` metadata. |
| 6. Ask model to count bytes | **Yes:** measured UTF-8 bytes, exact SCALE, same-conversation cut feedback, five tries, shortest retained. |
| 7. Uselessly short lines | **Yes:** 512-byte target, not OptMem's 280/128-byte policy; tolerate slight final overshoot. |
| 8. Log thoughts | **Yes:** live display only, ephemeral replay; no disk session, ROOT, compactor or diagnostic reasoning persistence. |
| 9. Volatile system/tools | **Yes:** fixed MASTER/VIEW_DOC/instructions and frozen declarations; no Pi date/cwd or changing tool catalog in cached head. |
| 10. One-hour cache / keepalive | **Yes:** short retention, no one-hour markers, warming off; expiry simply rewrites. |
| 11. Conversation across turns | **Yes:** fresh in-memory SDK session per idle admission; same-run steering/reasoning retained only until that run ends. |
| 12. Exponential compactor backoff | **Yes:** fixed 10s forever retry, first error reported once; disable provider retry backoff. |
| 13. No fsync / multiple writers | **Yes:** lifetime socket lock; one write+fsync per record before publication; per-turn persistence and backup. |
| 14. Obey instructions in source | **Yes:** verbatim COMPACT forbids answering/obeying/adding; no compactor tools. This reduces risk, not a mathematical prompt-injection guarantee. |
| 15. Hybrid tree | **Yes:** every message has level 0; every parent is exactly two children; no raw blocks of 16. |

## 6. Comparison with the Claude Code proposal

| Engine | Fresh view placement / cache control | Tradeoff |
|---|---|---|
| Stock Pi extension | **V:** full transcript and final payload hooks solve all three CC hook blockers. | Reuses current CLI, but strict plain-terminal/no-persistent-thoughts operation is awkward; cancellation, hook failure and session-projection discipline need care. |
| **Pi SDK + extension (recommended)** | **V APIs / I composition:** actual fresh sessions, fixed prefix, provider payload control; same Pi agent loop. | Thin terminal/admission layer only; native auth, tools and reasoning replay. Endpoint cache acceptance remains a probe gate. |
| Pi drives fresh `claude -p` subprocesses | Fresh contexts via subprocess; stream-json cache annotations remain unverified, as in the supplied CC findings. | Extra CLI/process/MCP layer, CC prompt suppression and duplicate auth/tool behavior; gives up Pi's verified payload hook. No benefit for this request. |
| Standalone direct Anthropic/OpenAI API harness | Maximum wire control. | Reimplement streaming, reasoning, tools, queues and retries unnecessarily; new direct API credentials/billing may be needed. If only transport is deficient, register/delegate a Pi provider instead. |

Storage/tree/compactor/view costs are identical across engines. Pi removes the CC-specific subprocess and MCP requirements; it does **not** eliminate the roughly two model-built nodes per logged message, amortized before free-node savings/retries. Every tool call/result still creates its own message. Measure compactor cost and rate limits before daily adoption; do not evade this by dropping tool history, shrinking context or weakening pump ordering.

## 7. Risks, open questions and scope

- **Primary gate: cache endpoint compatibility.** No model request was made. Validate explicit markers, implicit end, all-turn reasoning and stable cache key on configured Codex OAuth; verify by usage, not body inspection alone.
- **Fail-closed durability/layout.** Pi extension exceptions can fail open. Prove disk-full/fsync errors prevent the next model request/tool effect; validate awaited logging order, callback guards and nested-tool deduplication. Treat unsupported layout as an error, not a fallback to old context.
- **Tool boundary fidelity.** Steering is batch-boundary behavior. One top-level call per request is the minimal proposed solution; endpoint acceptance/enforcement and codemode's internal nested concurrency need a runnable probe. Do not claim `deliverAs:"steer"` alone implements sibling-tool interruption.
- **Spec ambiguity: CAP versus whole zoom.** §7 caps echoes, while §7.1 requires `zoom(id,1)` to return a whole message, including a potentially huge user paste. Resolve against the reference implementation/spec author before implementation. Do not silently truncate zoom or invent paginated zoom. Proposed reading is that the explicit whole-zoom contract takes precedence; document that exception if confirmed.
- **Finite engine context.** A 128k-byte view is not a 128k-token guarantee; huge user pastes or long same-run tool loops can overflow even 272k tokens. Never clip compactor inputs, shrink the view ad hoc, or let Pi auto-compaction alter the run. Report capacity failure/request a larger compatible model or an explicit new turn.
- **Global means one master.** Multiple Herdr/Pi panes cannot independently append to this log. OptChat is opt-in on one always-on host; the second writer exits. Future subagents keep their own sessions; only final `[id] report` messages reach master ROOT, exactly as §9. No automatic import of every agent pane.
- **Migration/privacy.** Notes provide only date precision; inspect import and export correctness before retiring OptMem. Private file permissions and backups; escape HTML. Avoid debug-provider persistence. Images/attachments are outside the text-only record schema: do not promise lossless multimodal history without an explicit spec-compatible representation.
- **SDK integration validation.** Fresh-session resource lifecycle, Bun compatibility and approved existing extension factories must be tested against pinned Pi 1.0.2. Avoid autoloading all user packages per session; no new dependencies or global setting edits. A minimal future self-check should cover tree/view invariants, settle abort, durability/lock recovery, logging/steering and cache layout.

Required first scope includes import, browser export, plain terminal, backups and cache proof—not just zoom/date. Skip §9's explicitly optional spawn/tell/computer integrations and a standalone MCP server until an external engine or user-requested delegation actually needs them.

## 8. Probe results

### Decisions received

Codex is the master; compactor is `openai-codex/gpt-5.6-terra`, medium. The user will measure cost during use; cache warming stays off. **CAP applies to zoom results too**, resolving the §7 ambiguity above. Imported OptMem notes get a fixed **12:00 local time** on their recorded date; their source still has date-only precision. **Codemode must be documented as a requirement if the project is distributed.** Fail-closed durability and codemode handling are deferred. No implementation or configuration changes were made for these decisions.

### 8.1 Disposable Codex OAuth capability test

**Executed:** four HTTP requests using installed Pi `ModelRuntime.streamSimple()`, model **`openai-codex/gpt-6.1-sol`**, SSE, medium reasoning, `store:false`, short retention, stable `prompt_cache_key` within each probe group, `maxRetries:0`. No agent session/CacheWarmer was instantiated, so no warming requests ran. Credentials and model catalogs used in-memory stores; the stored OAuth token was read without printing it or refreshing/persisting it. Nothing was installed and settings were untouched.

Scratch artifacts: `scratchpad/cachetest/{probe.mjs,results.json,acceptance.mjs,acceptance-results.json}`. The first script constructed **110,031 characters**, with line-end cuts at **49,983 / 79,845 / 99,911**. Its initial request included all three proposed fields. After rejection, three tiny requests isolated the remaining capabilities and supplied an ordinary control.

| Request | Added fields | HTTP | input | cacheRead | cacheWrite | output |
|---|---|---:|---:|---:|---:|---:|
| Long-view initial request | Three explicit view marks + implicit options + all-turns reasoning | 400 | 0 | 0 | 0 | 0 |
| Tiny isolation | Explicit mark + all-turns reasoning; no cache options | 400 | 0 | 0 | 0 | 0 |
| Tiny isolation | `reasoning.context:"all_turns"` only | 200 | 37 | 0 | 0 | 5 |
| Tiny baseline control | None of the three additions | 200 | 37 | 0 | 0 | 5 |

Exact rejection bodies:

```json
{"error":{"message":"prompt_cache_options is not supported on this model","type":"invalid_request_error","param":"prompt_cache_options","code":"invalid_parameter"}}
{"error":{"message":"prompt_cache_breakpoint is not supported on this model","type":"invalid_request_error","param":"prompt_cache_breakpoint","code":"invalid_parameter"}}
```

**Verdict:** this Codex OAuth endpoint/model rejects both proposed cache fields. It **accepts** `reasoning.context:"all_turns"`; the successful tiny test does not prove its encrypted-reasoning behavior across a steered run.

The marked long-view request never generated a completion. Therefore **no tail-change experiments or longest-unchanged-prefix cache comparison were run**: task 1(b)'s acceptance prerequisite failed. The tiny unmarked control confirms ordinary SSE/OAuth requests work; its zero cache reads at 37 input tokens are not evidence against ordinary implicit caching. Both successful responses also reported raw `input_tokens_details.{cached_tokens,cache_write_tokens}=0`, agreeing with Pi's normalized fields.

This changes the earlier open gate into a concrete blocker **for the tested `gpt-6.1-sol` Codex route**. Public Responses API documentation does not establish support on this route. `gpt-5.6-terra` and direct OpenAI API credentials were not tested; do not generalize the result to those endpoints/models or silently substitute implicit caching as proof of the spec's explicit breakpoints.

### 8.2 What codemode actually does

**The core claim is correct, with one wording correction:** JavaScript in QuickJS can chain/parallelize nested tool calls, and the model receives the script's **accumulated output**, not automatically every nested result. That output includes `text()`, `console.*`, images and a top-level returned value, plus the completion/failure header. A failed script can return partial output and an error; it is not merely the final JavaScript return value.

Verified sources:

- `P/docs/codemode.md`, “Scripts”, “Globals”, “Call tools”: only script output reaches the model; sandbox/no Node/network/timers; calls can run in parallel.
- `P/dist/extensions/codemode/tool.js:1–23,235–250`: nested tools use `ctx.executeTool()`; only script output reaches the model; the model-issued input is the JS source in `code` (grammar-capable providers send raw JS).
- `P/dist/extensions/codemode/execute.js:269–374`: invokes nested tools at line 304, waits for the script, accumulates output/return/errors, then returns one model-facing `content` result. Progress callbacks contain empty `content` plus UI `details` (line 284).
- `P/dist/core/nested-tool-calls.js:92–169`, `P/docs/extensions.md:148`: nested calls emit execution events with `parentToolCallId`, but create **no independent transcript entries**. Their bounded metadata record is not a verbatim history of results.
- `A/api/openai-responses-shared.js:244–267`: provider tool-result output is converted from `msg.content`, not UI `details` or nested-call metadata.

**“On by default” is true of this user's setup, not Pi's universal default:** `~/.pi/agent/settings.json` has `defaultTools:["+codemode"]`. Codemode's presentation mode defaults to `on`, which leaves ordinary direct tools declared; it does not force every tool through JS (`P/dist/extensions/codemode/index.js:10–12,18–27`; `tool.js:204–233`; `P/docs/cli.md`, “Enable codemode”).

#### Steering granularity

- **Yes, input can arrive between model steps.** Pi executes the current assistant's entire tool batch, then drains steering before the next model request (`G/agent-loop.js:141–186`). A single codemode call behaves as one outer tool invocation; no special harness is needed to steer at that outer boundary.
- **No, one model step is not necessarily one codemode call.** The assistant can issue multiple calls, mix direct tools and codemode, or issue no tool. Default `on` mode does not impose a one-call limit.
- **No steering between nested calls inside a running script.** For `await tools.a(); await tools.b();`, an input arriving during `a()` is queued until the script/batch ends; it does not alter `b()` through a new model decision. Codemode packages those operations into one macro-tool; it does not create extra steering checkpoints. Cancellation is separate.

Thus codemode is compatible with **between-model-step / outer-batch steering**, but does not remove the finer-grained interruption concern. Whether finer granularity is needed remains deferred; no scheduler change is proposed here.

#### What ROOT should log

**Recommended interpretation of chat-as-memory:** log the real model-issued **outer** call as `tool` (name `codemode` plus its JS input, represented as the actual `code` argument), and its final model-facing output as one `echo`, applying CAP. Preserve any accompanying assistant text as `talk`. Do not turn progress/UI metadata into chat messages.

This supersedes §1's earlier suggestion to log every nested invocation into ROOT. The source establishes that nested calls are not model-transcript messages; treating them as internal execution, like commands inside one bash call, preserves the master's actual chat rather than inventing extra exchanges. Choosing this ROOT policy is a **design interpretation**, not something Pi's source decides for OptChat.

If “every tool call” is instead intended to include *all internal programmatic invocations*, recording nested execution events is available, but it is an additional audit policy: the outer script/output must still be logged, and nested entries must not be inserted as orphan tool messages into model replay. Keep this deferred, as requested. In particular, a nested `tool_result` notification is not automatically a model-facing `echo`; indiscriminately capping nested structured results could change the script's computation.

### 8.3 Implicit prefix-caching test: both Codex models

**Executed 20 successful HTTP 200 requests:** two independently salted R0–R4 sequences for each of `openai-codex/gpt-6.1-sol` and `openai-codex/gpt-5.6-terra`. Installed Pi `ModelRuntime`, OAuth read into memory, SSE, medium effort, `maxRetries:0`, short retention, no CacheWarmer, no settings changes or installations. Each run had one stable `prompt_cache_key`; no explicit breakpoints, cache options or cache-control fields were sent.

Fixtures used varied, summary-shaped historical lines (`id+1|user: ...; echo: ...; talk: ...`), including varied projects, paths, names, findings and numbers. A fresh random nonce was the **very first text of the view**. The fixed system prompt and empty tool list were identical across all requests. Layout was **one view text block followed by one short new-message block**, with no previous response replayed.

- **R0:** cold baseline. **R1:** byte-identical payload, asserted by hash.
- **R2/R3:** baseline view with only text after the last line end before 100k/50k changed; prefix equality and unchanged total character length were asserted.
- **R4:** baseline view with only the starting nonce changed to another nonce of the same length.
- Five-request run durations were **14.887s / 13.655s** for Sol and **11.849s / 10.263s** for Terra: comfortably within one minute, with no delays between requests.

Artifacts: `scratchpad/cachetest/implicit-probe.mjs`, `implicit-results.json` (complete raw usage and payload hashes), `tokenize-prefixes.py`, and scratch-only `tokenizer-cache/`. The installed `tiktoken 0.9.0` was used; only its standard vocabulary data was downloaded into scratch, not a package installation.

#### Every request's usage

Triplets are **input / cacheRead / cacheWrite**, in tokens. Raw input includes cached tokens; Pi's normalized input is the uncached remainder. The percentage is `raw cacheRead / raw input`, not reads divided by the uncached remainder.

| Model | Run | Request | Raw I / R / W | Normalized I / R / W | Read fraction |
|---|---:|---|---|---|---:|
| gpt-6.1-sol | 1 | R0 | 29,441 / 0 / 0 | 29,441 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 1 | R1 | 29,441 / 29,312 / 0 | 129 / 29,312 / 0 | 99.56% |
| gpt-6.1-sol | 1 | R2 | 29,441 / 0 / 0 | 29,441 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 1 | R3 | 29,441 / 0 / 0 | 29,441 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 1 | R4 | 29,437 / 0 / 0 | 29,437 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 2 | R0 | 29,374 / 0 / 0 | 29,374 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 2 | R1 | 29,374 / 29,184 / 0 | 190 / 29,184 / 0 | 99.35% |
| gpt-6.1-sol | 2 | R2 | 29,374 / 0 / 0 | 29,374 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 2 | R3 | 29,374 / 0 / 0 | 29,374 / 0 / 0 | 0.00% |
| gpt-6.1-sol | 2 | R4 | 29,373 / 0 / 0 | 29,373 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 1 | R0 | 29,457 / 0 / 0 | 29,457 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 1 | R1 | 29,457 / 28,416 / 0 | 1,041 / 28,416 / 0 | 96.47% |
| gpt-5.6-terra | 1 | R2 | 29,457 / 0 / 0 | 29,457 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 1 | R3 | 29,457 / 0 / 0 | 29,457 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 1 | R4 | 29,452 / 0 / 0 | 29,452 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 2 | R0 | 29,360 / 0 / 0 | 29,360 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 2 | R1 | 29,360 / 28,416 / 0 | 944 / 28,416 / 0 | 96.78% |
| gpt-5.6-terra | 2 | R2 | 29,360 / 0 / 0 | 29,360 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 2 | R3 | 29,360 / 0 / 0 | 29,360 / 0 / 0 | 0.00% |
| gpt-5.6-terra | 2 | R4 | 29,361 / 0 / 0 | 29,361 / 0 / 0 | 0.00% |

Raw fields are `usage.input_tokens` and `input_tokens_details.{cached_tokens,cache_write_tokens}`. They agreed with normalized fields on every request. **Reported cacheWrite was always zero**, despite the clear R1 hits; zero here does not mean no implicit cache entry was populated. One-word output was requested; reported output was five tokens per Sol request and twenty per Terra request, including any reasoning tokens.

#### Expected unchanged-prefix reads versus observed reads

`o200k_base` is not explicitly mapped to these newer model IDs by installed tiktoken. Calibration was nevertheless strong: for **all 20 views**, provider per-block input attribution was exactly the tokenizer's count **plus three framing tokens**. Figures below tokenize the unchanged view prefix and add the provider's 38 instruction tokens; additional framing can shift the threshold by a few tokens, so these are approximate, not authoritative provider token counts.

| Model/run | View chars | R2/R3 cut offsets | Prefix tokens R2 / R3 | Rounded down to 128 | Actual reads R2 / R3 |
|---|---:|---|---|---|---|
| Sol 1 | 110,082 | 99,995 / 49,837 | 26,729 / 13,339 | 26,624 / 13,312 | 0 / 0 |
| Sol 2 | 110,175 | 99,827 / 49,930 | 26,599 / 13,304 | 26,496 / 13,184 | 0 / 0 |
| Terra 1 | 110,171 | 99,855 / 49,924 | 26,678 / 13,332 | 26,624 / 13,312 | 0 / 0 |
| Terra 2 | 110,036 | 99,956 / 49,825 | 26,681 / 13,328 | 26,624 / 13,312 | 0 / 0 |

Character-prefix ratios were **90.61–90.84% for R2** and **45.27–45.32% for R3**, versus observed read fractions of **0%**. These shared prefixes are far above OpenAI's **1,024-token minimum**. All positive cached counts are multiples of its **128-token granularity**; rounding cannot explain losing 13k–27k shared tokens. For R4, only the short fixed head precedes the changed nonce, so the expected read was approximately zero; all negative controls passed.

#### Verdict

- **`gpt-6.1-sol`: only exact repeats cached in both runs.** R1 read 99.56% / 99.35%; every changed-tail R2/R3 read zero.
- **`gpt-5.6-terra`: only exact repeats cached in both runs.** R1 read 96.47% / 96.78%; every changed-tail R2/R3 read zero.

Thus this probe **does not support dropping explicit breakpoints on the assumption that Codex automatically caches the unchanged start of a changing view**. The cache is demonstrably active, but prefix reuse failed with two fresh salts per model and contemporaneous positive controls.

Scope: this is evidence for the tested **single-view-block layout**, not a universal claim about all Codex layouts or routing. Fragmented view blocks, in-turn reasoning/tool replay and alternative endpoints were not tested. Keep that boundary explicit rather than treating either ordinary-cache documentation or these finite trials as a guarantee.

### 8.4 Block/message boundaries and append-only replay

**Executed 60 successful HTTP 200 requests:** A BLOCKS (20), B MESSAGES (20), C APPEND single-view-block (20). Each layout/model had **two fresh-nonce runs**, a byte-identical repeat control and a same-length different-start-nonce control. All 12 runs completed their five consecutive requests in **10.624–16.789 seconds**. Fixed system prompt, empty tools, medium effort, one stable cache key per run, SSE, `store:false`, `maxRetries:0`, no CacheWarmer, no installations/settings/credential changes. No explicit cache fields were sent.

Views were **110,010–110,177 characters** of varied OptChat-shaped lines, with a fresh UUID at the very start. Cuts were the last line ends before 50k/80k/100k; mutated tails kept the same character length. **`reasoning.context:"all_turns"` was set consistently for all three layouts**, and Pi requested `reasoning.encrypted_content`. This is an accepted reasoning option, not an explicit cache field.

Artifacts: `scratchpad/cachetest/layout-probe.mjs`, `layout-results.json`, `append-results.json`, and numeric/structural run logs. Raw usage and payload hashes were retained; assistant text, encrypted reasoning, full payloads and credentials were **not** persisted.

#### A/B: changing a later block or message

**A BLOCKS:** one user item containing four view `input_text` blocks plus the new-message block. **B MESSAGES:** four separate user items, one per view piece, then the new-message user item. The outgoing payload shapes were asserted; Pi did not merge the messages before dispatch.

R0 = cold; R1 = byte-identical repeat; R2 = change only piece 4 after ~100k; R3 = change pieces 3+4 after ~80k; R4 = change only the starting nonce.

Each cell is **raw input / cacheRead / cacheWrite → normalized uncached input**. Normalized cacheRead/cacheWrite equal the raw values; thus both usage representations are given without repeating the same two fields.

| Model | Layout/run | R0 cold | R1 repeat | R2 change ~100k | R3 change ~80k | R4 new nonce |
|---|---|---|---|---|---|---|
| Sol | blocks 1 | 29294 / 0 / 0 → 29294 | 29294 / 29056 / 0 → 238 | 29294 / 0 / 0 → 29294 | 29294 / 0 / 0 → 29294 | 29296 / 0 / 0 → 29296 |
| Sol | blocks 2 | 29361 / 0 / 0 → 29361 | 29361 / 29184 / 0 → 177 | 29361 / 0 / 0 → 29361 | 29361 / 0 / 0 → 29361 | 29364 / 0 / 0 → 29364 |
| Sol | messages 1 | 29357 / 0 / 0 → 29357 | 29357 / 29184 / 0 → 173 | 29357 / 0 / 0 → 29357 | 29357 / 0 / 0 → 29357 | 29360 / 0 / 0 → 29360 |
| Sol | messages 2 | 29483 / 0 / 0 → 29483 | 29483 / 29312 / 0 → 171 | 29483 / 0 / 0 → 29483 | 29483 / 0 / 0 → 29483 | 29478 / 0 / 0 → 29478 |
| Terra | blocks 1 | 29354 / 0 / 0 → 29354 | 29354 / 28416 / 0 → 938 | 29354 / 0 / 0 → 29354 | 29354 / 0 / 0 → 29354 | 29351 / 0 / 0 → 29351 |
| Terra | blocks 2 | 29393 / 0 / 0 → 29393 | 29393 / 28416 / 0 → 977 | 29393 / 0 / 0 → 29393 | 29393 / 0 / 0 → 29393 | 29392 / 0 / 0 → 29392 |
| Terra | messages 1 | 29443 / 0 / 0 → 29443 | 29443 / 28416 / 0 → 1027 | 29443 / 0 / 0 → 29443 | 29443 / 0 / 0 → 29443 | 29442 / 0 / 0 → 29442 |
| Terra | messages 2 | 29374 / 0 / 0 → 29374 | 29374 / 28416 / 0 → 958 | 29374 / 0 / 0 → 29374 | 29374 / 0 / 0 → 29374 | 29371 / 0 / 0 → 29371 |

**Expected unchanged-prefix counts use the provider's own R0 per-block/message attribution**, not a guessed tokenizer: 38 instruction tokens plus pieces 1–3 for R2, or pieces 1–2 for R3. Additional framing may shift a boundary slightly; it cannot explain zero reads on a >21k-token unchanged prefix.

| Model | Layout/run | Expected R2 prefix | Expected R3 prefix | Observed R2 / R3 reads |
|---|---|---:|---:|---|
| Sol | blocks 1 | 26587 | 21252 | 0 / 0 |
| Sol | blocks 2 | 26639 | 21320 | 0 / 0 |
| Sol | messages 1 | 26656 | 21315 | 0 / 0 |
| Sol | messages 2 | 26753 | 21451 | 0 / 0 |
| Terra | blocks 1 | 26624 | 21351 | 0 / 0 |
| Terra | blocks 2 | 26663 | 21346 | 0 / 0 |
| Terra | messages 1 | 26665 | 21323 | 0 / 0 |
| Terra | messages 2 | 26640 | 21347 | 0 / 0 |

All **eight repeat controls hit**; all **eight changed-nonce controls missed**. Every R2/R3 read zero. The shared prefixes exceed the 1,024-token minimum by a wide margin; all nonzero reads were multiples of 128. **Splitting into blocks or separate user messages did not recover prefix reuse.** In particular, B contradicts the simple hypothesis that each unchanged input message is independently reusable. It does not establish the server's actual matching/coalescing algorithm.

#### C: append-only replay inside a turn

Used §8.3's single-view-block layout. R0 = base input; P = byte-identical R0 repeat control; R1 = **original R0 input + its actual assistant output + a short new user message**; R2 = exact R1 input + its actual assistant output + another short user message; N = baseline with a different starting nonce. The original R0 response—not P's response—was replayed.

Actual normalized `AssistantMessage` objects were passed back through Pi's provider adapter, rather than rebuilding replies from text. Assertions verified each prior wire-input item was preserved verbatim and assistant item IDs survived. **Terra emitted encrypted reasoning in three of the four replayed responses; all three items were replayed verbatim**, including their encrypted content. Sol emitted no reasoning item in these tiny-output requests. No invented reasoning was added.

| Model/run | R0 cold | P repeat | R1 first append | R2 second append | N new nonce |
|---|---|---|---|---|---|
| Sol 1 | 29319 / 0 / 0 → 29319 | 29319 / 29184 / 0 → 135 | 29338 / 29184 / 0 → 154 | 29357 / 29184 / 0 → 173 | 29323 / 0 / 0 → 29323 |
| Sol 2 | 29411 / 0 / 0 → 29411 | 29411 / 29184 / 0 → 227 | 29430 / 29184 / 0 → 246 | 29449 / 29312 / 0 → 137 | 29414 / 0 / 0 → 29414 |
| Terra 1 | 29383 / 0 / 0 → 29383 | 29383 / 28416 / 0 → 967 | 29417 / 28416 / 0 → 1001 | 29447 / 28416 / 0 → 1031 | 29383 / 0 / 0 → 29383 |
| Terra 2 | 29405 / 0 / 0 → 29405 | 29405 / 28416 / 0 → 989 | 29439 / 28416 / 0 → 1023 | 29458 / 28416 / 0 → 1042 | 29403 / 0 / 0 → 29403 |

“Previous input” below is the preceding non-control response's reported raw input count, including provider framing.

| Model/run | Append | Previous input | Actual read | Unread remainder | Previous-input coverage |
|---|---|---:|---:|---:|---:|
| Sol 1 | R1 | 29319 | 29184 | 135 | 99.54% |
| Sol 1 | R2 | 29338 | 29184 | 154 | 99.48% |
| Sol 2 | R1 | 29411 | 29184 | 227 | 99.23% |
| Sol 2 | R2 | 29430 | 29312 | 118 | 99.60% |
| Terra 1 | R1 | 29383 | 28416 | 967 | 96.71% |
| Terra 1 | R2 | 29417 | 28416 | 1001 | 96.60% |
| Terra 2 | R1 | 29405 | 28416 | 989 | 96.64% |
| Terra 2 | R2 | 29439 | 28416 | 1023 | 96.53% |

**Append reuse: yes for the bulk previous prefix; no for literal full-input reuse.** Sol read **99.23–99.60%** of the preceding input; Terra **96.53–96.71%**. Reads matched the positive control, except Sol run 2's R2 increased by 128 tokens. Provider attribution placed **all cached tokens in the fixed instructions and original view block**: no replayed assistant/reasoning or newly appended user item was reported cached. Consequently these short continuations prove that appending does not destroy the old view hit; they do **not** prove that each evolving within-turn suffix becomes cached.

All four repeat and four nonce controls passed. Reported cacheWrite was zero on all 60 requests, despite positive hits; again, this field is not proof that no implicit cache entry was populated.

Neither A nor B worked, so the requested conditional “best working A/B layout” append test had **no qualifying layout** and was skipped—no extra requests were spent.

#### One-line verdicts and implementation consequence

| Model | Layout | Reads unchanged prefix after tail edits? | Appends reuse previous prefix? |
|---|---|---|---|
| gpt-6.1-sol | A BLOCKS | **No**, both runs | Not tested: conditional layout did not qualify |
| gpt-5.6-terra | A BLOCKS | **No**, both runs | Not tested: conditional layout did not qualify |
| gpt-6.1-sol | B MESSAGES | **No**, both runs | Not tested: conditional layout did not qualify |
| gpt-5.6-terra | B MESSAGES | **No**, both runs | Not tested: conditional layout did not qualify |
| gpt-6.1-sol | C single block | **No** in §8.3 | **Yes**, bulk prefix; **no**, full preceding input |
| gpt-5.6-terra | C single block | **No** in §8.3 | **Yes**, bulk prefix; **no**, full preceding input |

**Pi-native replay remains viable and cache-friendly for an unchanged view within a turn. The unresolved blocker is caching a rebuilt, changed view across fresh OptChat turns.** Neither splitting strategy fixes it on these OAuth routes, and the required explicit fields were rejected in §8.1. Do not claim spec-equivalent view breakpoints or an independently cached compactor prefix from these results. This is finite endpoint evidence, not a guarantee or permission to relax the spec silently.

Verified replay sources: `A/api/openai-responses-shared.js:139–166` maps user text blocks and preserves separate user items; `:175–212` replays thinking signatures as the original JSON reasoning items and reconstructs assistant text with preserved IDs; `A/api/openai-codex-responses.js:373–437` builds `store:false`, encrypted-reasoning inclusion and cache-key/effort fields. The probe exercised that installed Pi conversion path directly.

