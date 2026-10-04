# Claude Code `claude -p` probes, round 2: mid-run messages, compactor layout, pre-turn priming

Date 2026-10-04 · Claude Code 2.1.289 · OAuth (subscription) · `--model sonnet` (claude-sonnet-5-5)

## Method

- `proxy.ts` (reused from cc-cachetest, port 8398): logs only payload structure and response usage, never headers. For text blocks under 1500 chars that contain no `@`, it now also logs the first 400 chars, which is how the wrapper texts below were captured. Every log was checked: no email address and no credentials.
- `drive.py`: runs one `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` process. It writes user messages to stdin on triggers (`tool_use:N`, `text_delta:N`, `result:N`), can kill the process on `message_start:N`, and writes a compact timeline `tl-<label>.jsonl` (events, usage, text heads, no request bodies).
- Base flags as before: `--no-session-persistence --safe-mode --strict-mcp-config --setting-sources ""`, plus `--system-prompt-file` and a fixed `--tools`.
- `gen2.py` builds the payloads, `p2.sh` / `p3.sh` run the series, `wire.py` prints the wire layout per request, `tab3.py` builds the probe 3 table.
- Cost unit, "eq" = input-token equivalents at API price ratios: `in + 0.1·read + 1.25·write(5m) + 5·out`. On the subscription this is a proxy for usage budget, not money.
- Usage columns: in / read / write / out = `input_tokens / cache_read_input_tokens / cache_creation_input_tokens / output_tokens`.

---

## Probe 1: mid-run user messages

Run: `--tools Bash`, 4 sequential steps of `sleep 3; echo step N`. "also tell me the word BANANA" is written to stdin 1 s after the 2nd `tool_use` arrives, so during the 2nd sleep. 4 s after the first `result`, "now tell me the word KIWI" is sent. 1b: a ~500-word story with no tools, with BANANA sent about 1 s into the text stream. Each variant ran twice (r2 with `--replay-user-messages`).

### 1a. Message sent while a tool is running: delivered in the SAME turn

Wire (r1; marks `*`; `s:` = a `role:"system"` entry inside `messages`):

| req | in / read / write / out | messages |
|---|---|---|
| step 1 | 2 / 0 / 2277 / 86 | `u:[reminder][reminder][prompt]` `s*:env` |
| step 2 | 2 / 2277 / 94 / 86 | … `a*:tool_use` `u*:tool_result` |
| step 3 | 2 / 2371 / **186** / 86 | … `a*:tool_use` `u:tool_result` **`s*:"The user sent a new message while you were working:\nalso tell me the word BANANA\n\nThis is how Claude Code surfaces messages the user sends mid-turn — within the running turn, often alongside the next tool result, rather than as a separate conversation turn. Address the message above as you continue this turn."`** |
| step 4 | 2 / 2557 / 94 / 86 | … (the injected message is now an unmarked `s:str`) |
| step 5 (text) | 2 / 2651 / 94 / 24 | reply: "All four steps ran in order, and the word you asked for is BANANA." |
| KIWI turn | 4 / 2745 / 36 / 6 | the whole previous conversation + `a*:text` `u*:"now tell me the word KIWI"` |

- **Same turn.** The message is attached at the next tool boundary, right after the running tool's `tool_result`, as a `role:"system"` message with the wrapper text above. It is not sent as a user message. The rolling marks move onto it, and caching stays perfect (step 3 writes 94 + 92 tokens: the tool step plus the injected message). r2 repeated r1 exactly (everything read from the 1h cache).
- **stream-json output:** without `--replay-user-messages`, nothing shows that the message was consumed. With it, a `{"type":"user", isReplay:true}` event with the text is emitted **at the moment of consumption**: at the same timestamp as the `tool_result` it rides with (t = 10.6 s, sent at 8.55 s). The same happens for a message that starts a turn (the replay comes right before that turn's `message_start`).
- **Event order per step:** `system/status requesting` → `stream_event message_start` (usage) → `content_block_*` → `assistant` (one per completed block) → `message_delta` (final usage, stop_reason) → `message_stop` → for tools: `system/task_started`, `system/task_notification`, `user` (tool_result) [+ replayed user msg].

### 1b. Message sent during a long text reply (no tools): it becomes a NEW turn

| req | in / read / write / out | |
|---|---|---|
| story | 2 / 1498 / 707 / 878 | not interrupted; the reply never mentions BANANA |
| BANANA turn | 4 / 1988 / 1106 / 6 | starts 0.02 s after the first `result`: a new `system/init`, then the replay (r2), then a reply of just "BANANA" |

The second turn **continues the same conversation** (history kept, previous prefix read). It is not a fresh call.

### Results and idle detection

- There is **one `result` per turn** (`num_turns` = number of API steps in that turn), and every turn starts with a new `system/init`. Two user messages produce two `result`s, back to back.
- **A `result` alone does not mean idle.** A message queued during the final step starts the next turn immediately. Rule that works: **idle = a `result` has arrived and every message written to stdin has been replayed** (needs `--replay-user-messages`). In other words, count sent messages against `isReplay` events.
- Consequence for OptChat §7: messages sent after the last tool boundary are **not** "given back to the queue". Claude Code runs them as a follow-up turn in the same session, with no re-rendered view. If you want the spec's behaviour (a fresh call with a new view), close stdin or kill the process at the `result` and requeue every sent message that has no replay. The kill will also abort a follow-up request that has already started (it starts within ~20 ms).

**Verdict: a message sent while a tool runs reaches the model in the same turn, as a `role:"system"` wrapper after the next tool_result, cached normally; one sent during a text-only final step becomes a separate turn in the same session; detect consumption with `--replay-user-messages` and idle as "result + all sent messages replayed".**

---

## Probe 2: compactor layout

`DISABLE_PROMPT_CACHING_SONNET=1`, `--tools ""`, `--system-prompt-file compact.txt` (COMPACT from spec §4.4, verbatim). One user message: `<chat>…</chat>`, ~110k chars of bare, varied summary lines with no ids and a fresh nonce on line 1. It is cut at the last line end before 50k/80k/100k into 4 blocks, each marked, so the 4th mark is at the end of `</chat>`. Then an unmarked step block: the 512-byte SCALE line plus "Compress this message …" with a ~4k-char `echo:` message. Each call's chat = the previous call's chat + 2 new lines. Each call is a separate process. Retries are stream-json follow-ups in the same process: "That line is N bytes; the limit is L. It must end where it is cut here: …| ← LIMIT".

Note: the replies were 240–290 bytes (the probe message is noise), so to force retries I set L = N − 60 instead of 512. This doesn't affect the caching layout.

Wire: `u:[reminder(569)][chat*][chat*][chat*][chat*][step]` `s:env(str)`, then for retries `a:text` `u:text` …; always 4 marks, and no 400s.

| call | step | in | read | write | out | eq |
|---|---|---|---|---|---|---|
| A-c0 (cold) | call | 1907 | 0 | 37790 | 111 | 49,700 |
| | retry 1 | 2150 | 37790 | 0 | 95 | 6,404 |
| A-c1 (+2 lines) | call | 2089 | **34292** | 3712 | 95 | 10,633 |
| | retry 1 | 2298 | 38004 | 0 | 74 | 6,468 |
| | retry 2 | 2464 | 38004 | 0 | 56 | 6,544 |
| A-c2 (+2 lines) | call | 1734 | **34292** | 3818 | 105 | 10,461 |
| | retry 1 | 1963 | 38110 | 0 | 84 | 6,194 |
| B-c0 (cold) | call | 1951 | 0 | 37808 | 107 | 49,746 |
| | retry 1 | 2179 | 37808 | 0 | 84 | 6,380 |
| B-c1 | call | 1786 | **34345** | 3614 | 95 | 10,213 |
| | retry 1 | 1993 | 37959 | 0 | 75 | 6,164 |
| | retry 2 | 2154 | 37959 | 0 | 55 | 6,225 |
| B-c2 | call | 2001 | **34345** | 3734 | 117 | 10,688 |
| | retry 1 | 2252 | 38079 | 0 | 97 | 6,545 |

- Each next call **reads exactly through the 100k mark** (34.3k tokens = COMPACT + reminder + the first 3 pieces) and writes the last piece plus the new lines (~3.7k). The previous call's end-of-chat entry never hits, because the new lines go *before* `</chat>`, inside the same 4th block.
- **Retries** read through their own call's end-of-chat mark (37.8–38.1k), **write nothing**, and pay ~2.0–2.5k uncached input: the step block + the env message + the earlier replies and retry texts. Claude Code keeps the caller's 4 marks on the first user message in follow-up requests and adds none of its own. Each retry costs ~6.2–6.5k eq, mostly the 0.1× read of the chat.

**Extra variant I (one run, not requested, cheap):** keep the tail after 100k as **one block per call increment** (`[p0*][p1*][p2*][tail0][inc1]…[incK*]`), move `</chat>` into the step block, and mark the last increment. The chat text is byte-identical once concatenated.

| call | in | read | write | out | eq |
|---|---|---|---|---|---|
| I-c0 (cold) | 1868 | 0 | 37801 | 107 | 49,654 |
| I-c1 | 1893 | **37801** | **217** | 132 | 6,604 |
| I-c2 | 1866 | **38018** | **157** | 102 | 6,374 |

The 20-block lookback finds the previous call's end mark one block back, so each sequential level-0 call costs **~6.5k eq instead of ~10.5k (−38%)**. This only holds while nothing earlier in the view changed. When a merge rewrites lines, it falls back to the 100k/80k/50k marks.

**Verdict: as expected, consecutive level-0 calls read through the 100k mark (34.3k) and write ~3.7k; retries read the whole chat (their own end mark), write 0 and pay ~2–2.5k uncached each; if the new lines go in their own block and `</chat>` moves out of the marked block, the next call reads the whole previous chat and writes only ~200 tokens.**

---

## Probe 3: pre-turn priming call

- **Real turn:** Claude Code's marks on (`CLAUDE_CODE_PROMPT_CACHE_TTL=5m`), `--tools Read`, OptChat sysprompt, view as 4 unmarked blocks (same 50k/80k/100k split), then the new message "Read files/a.txt, then files/b.txt, one call per step, then reply: done" (3 steps).
- **Priming:** same flags, tools, system and view blocks, plus `DISABLE_PROMPT_CACHING_SONNET=1` and marks on all 4 view pieces (50k/80k/100k + end of view). After the view-end mark comes either "reply with exactly one word: ok" (**P** series), or the real new message with the process killed on `message_start` (**A** series, "abort").
- **Baseline (B):** the real turn only.
- **Turn N** = fresh nonce (cold). **Turn N+1** = the view differs only after ~100k (tail changed).

| run | req | in | read | write | out | eq |
|---|---|---|---|---|---|---|
| P1 N prime | 1 | 233 | 0 | 38634 | 4 | 48,546 |
| P1 N real | 1 | 2 | **38634** | 271 | 115 | 4,779 |
| | 2 | 2 | 38905 | 2722 | 115 | 7,870 |
| | 3 | 2 | 41627 | 2722 | 3 | 7,582 |
| P1 N+1 prime | 1 | 233 | **35161** | 3460 | 4 | 8,094 |
| P1 N+1 real | 1 | 2 | **38621** | 271 | 115 | 4,778 |
| | 2 | 2 | 38892 | 2722 | 115 | 7,869 |
| | 3 | 2 | 41614 | 2722 | 3 | 7,581 |
| P2 N prime | 1 | 233 | 927 | 37707 | 4 | 47,479 |
| P2 N real | 1 | 2 | **38634** | 271 | 115 | 4,779 |
| | 2–3 | 2 | 38905 / 41627 | 2722 / 2722 | 115 / 3 | 15,452 |
| P2 N+1 prime | 1 | 233 | **35161** | 3422 | 4 | 8,047 |
| P2 N+1 real | 1 | 2 | **38583** | 271 | 115 | 4,774 |
| | 2–3 | 2–4 | 38854 / 41576 | 2722 / 278 | 99 / 265 | 13,619 (refusal at step 2, see notes) |
| A1 N prime (abort) | 1 | 273 | 927 | 37707 | ~0 | 47,499 |
| A1 N real | 1 | 2 | **38634** | 271 | 99 | 4,699 (refused at steps 1 and 2; turn ended) |
| A1 N+1 prime (abort) | 1 | 273 | **35161** | 3569 | ~0 | 8,250 |
| A1 N+1 real | 1 | 2 | **38730** | 271 | 115 | 4,789 |
| | 2–3 | 2 | 39001 / 41723 | 2722 / 2722 | 115 / 3 | 15,472 |
| B1 N real | 1 | 2 | 927 | 37978 | 114 | 48,137 |
| B1 N+1 real | 1 | 2 | 927 | **37982** | 115 | 48,147 |
| | 2–3 | 2 | 38909 / 41631 | 2722 / 2722 | 115 / 3 | 15,453 |
| B2 N real | 1 | 2 | 927 | 37978 | 0 | 47,567 (refusal) |
| B2 N+1 real | 1 | 2 | 927 | **38102** | 115 | 48,297 |
| | 2–3 | 2 | 39029 / 41751 | 2722 / 2722 | 115 / 3 | 15,477 |

(The 927 read is the tools + system entry left by earlier runs.)

**Findings**

- **The real turn's step 1 reads the view the priming call wrote: every time, 6/6.** It reads everything up to the end of the view (38.6k) and writes only the new message + env message (271). The 20-block lookback from Claude Code's end mark (on the env message) finds the priming call's view-end entry 3 blocks back. So **cache keys ignore whether `cache_control` is present**: system blocks marked or not, view blocks marked or not, a different billing header, a different trailing message, all irrelevant. Steps 2+ then roll normally.
- **It still holds at N+1 with a changed tail.** The priming call reads through the 100k mark of turn N's priming (35.2k) and writes the tail (~3.5k); the real turn then reads the full 38.6k again.
- **No 400s** in any priming or real request (4 caller marks with Claude Code's disabled; real calls have 3–4 Claude Code marks; all 5m).
- **Abort after `message_start` works.** `message_start` already carries the final input usage, and the cache entry exists afterwards (A1 real step 1 read 38634 and 38730). It is 0.3–1.1 s faster than the one-word reply, and it needs no special message. Unverified: whether the killed request is billed; assume full input.
- Baseline N+1, as before: the view is rewritten in full every turn (write ~38k, read only tools + system).

**Cost per turn (eq; the 3-step real turn has the same cost structure in both paths)**

| | priming + step 1 | whole turn (3 steps) |
|---|---|---|
| **Steady state, N+1, tail changed after 100k**: primed (P1, P2, A1) | 12.8k / 12.8k / 13.0k | 28.3k / 26.4k* / 28.5k |
| baseline (B1, B2) | 48.1k / 48.3k | 63.6k / 63.8k |
| **difference** | **−35.2k (−73 %)** | **−35.2k (−55 %)** |
| **Cold, N**: primed (P1, P2, A1) | 53.3k / 52.3k / 52.2k | |
| baseline (B1, B2) | 48.1k / 47.6k | |
| **difference** | **+4.6k (+10 %)** | |

\* P2 N+1 was cut short by a refusal at step 2.

Latency: the priming call takes 2.0–3.3 s wall time ("ok") or 1.7–2.8 s (abort). Done serially, it adds that much before every turn. Real step 1's time-to-first-token was 2.1–3.7 s, no different from baseline.

**Verdict: priming works exactly as intended. The real turn (Claude Code marks on, no view marks) reads the whole primed view from cache, at N and at N+1 after a tail change.**

### Recommendation: priming is worth it

- In steady state it saves **~35k eq per turn** (an amount of input equal to the view's tokens; −73 % on the first step, −55 % on a short 3-step turn), for an extra **~8k eq** priming call. It costs only when the cache is cold (first turn, after >5 min idle, or a view change before 50k): then it adds ~+4.6k (+10 %). The spec says turns normally keep 57k–81k chars of the view, so the expected saving per turn is large and the loss rare and small. Even when only the 50k mark survives, you still read ~18k (round-1 probe D).
- How:
  1. The priming request = the exact real request, with `DISABLE_PROMPT_CACHING_SONNET=1` and marks on the 50k/80k/100k pieces + the view end. Same `--tools`, `--system-prompt-file`, flags, model and block split. Real calls use `CLAUDE_CODE_PROMPT_CACHE_TTL=5m` (keep everything 5m).
  2. Kill the priming process on its first `message_start` (abort variant). Only the view up to its end mark needs to match, so the priming call doesn't need the new message.
  3. The priming call only needs the rendered view, not the new message. So it can run **right after `settle()`**, or as soon as the view is stable while the user is still typing, which hides the 2–3 s. Re-prime if more than ~4.5 min have passed or the view changed.
- Caveats: the safety classifier refused 3 of the 10 real/baseline turns (`stop_reason:"refusal"`: A1 N and B2 N at step 1, P2 N+1 at step 2). This looks like a false positive on the word-salad view and was not related to priming (it also happened in the baseline). Tools and system must stay byte-identical. Claude Code version upgrades change the request and will invalidate the cache once.
