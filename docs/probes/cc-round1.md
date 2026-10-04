# Claude Code (`claude -p`) prompt-caching probes for OptChat

Date 2026-10-04 · Claude Code 2.1.289 · OAuth (claude.ai subscription) · model `sonnet` (= claude-sonnet-5-5)

## Method

- `proxy.ts`: a Bun pass-through on 127.0.0.1:8399 used as `ANTHROPIC_BASE_URL`. **OAuth works through it.**
  It logs only payload structure (block types, lengths, sha256 prefixes, `cache_control`
  positions) plus the response `usage`. It never logs headers. Logs: `smoke.jsonl`,
  redacted bodies in `sys/` (text blocks over 3000 chars replaced by length and hash).
- `gen.py`: a ~110k-char view (`id+1|user: …; echo: …; talk: …`, nonce on the first line), cut
  at the last line end before 50k/80k/100k into 4 pieces (49.8k / 30.1k / 19.9k / 10.3k chars),
  then the new-message block. Variants: `tail100` (only bytes after ~100.3k differ), `tail50`
  (only bytes after ~50.4k differ).
- `run.sh`: one fresh process per request:
  `claude -p --model sonnet --no-session-persistence --safe-mode --strict-mcp-config --setting-sources "" --system-prompt-file sysprompt.txt --tools "" --input-format stream-json --output-format stream-json --verbose`.
  `--bare` is not an option because it refuses OAuth (API key only). `--safe-mode` disables hooks, CLAUDE.md, plugins and MCP while keeping OAuth.
- All series ran with `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`. Claude Code's default for subscription users is `ttl:"1h"` on its own marks.
- `series.sh` (R0–R4), `turn.sh` (within-turn), `tab.py` / `last.py` (tables).

## Q1: Do `cache_control` marks on stream-json user blocks reach the wire?

**Verdict: yes, verbatim.** They show up on the wire in the same positions, with `ttl` kept, and Claude Code does not dedupe, cap or reorder them. Consequences:

- Claude Code adds its own marks, so you go over the API limit quickly: 3 view marks gave `400 A maximum of 4 blocks with cache_control may be provided. Found 6`.
- A 5m mark in the view combined with Claude Code's default 1h marks gives `400 … a ttl='1h' cache_control block must not come after a ttl='5m'`. Fix this with `ttl:"1h"` on the view marks or `CLAUDE_CODE_PROMPT_CACHE_TTL=5m` (both verified).

## Q2: Where does Claude Code put its own breakpoints?

Wire layout, with a custom system prompt (`*` = cache_control):

```
system: [billing-header (no cc)] [*"You are a Claude agent, built on Anthropic's Claude Agent SDK."] [*<your --system-prompt-file>]
messages:
  user:   [<system-reminder> userEmail (+gitStatus with default prompt)] [view pieces…] [new msg]
  system: [*# Environment: cwd, git yes/no, OS, model, "Today's date is …"]    <- role:"system" message AFTER the user msg
  (step ≥2) assistant [*last block] / user tool_result [*last block]          <- rolling, replaces the env mark
```

- Step 1 uses 3 Claude Code marks: 2 on the system prompt (the first one is wasted on a fixed 62-char line) and 1 at the end (on the env message). **1 slot is left for the view.**
- From step 2 on it uses 4 marks: 2 on the system prompt plus 2 rolling ones (last assistant message and last tool_result). **0 slots are left.** A view mark that passes step 1 makes step 2 fail with `400 … Found 5` (W1, proxy records 99/100), and the turn dies.
- `DISABLE_PROMPT_CACHING_SONNET=1` (also `DISABLE_PROMPT_CACHING`, per-model variants) removes **all** of Claude Code's marks but **keeps the caller's**. That gives you all 4 slots, but nothing marks the growing end of the turn (see Q4).
- Tools carry no mark. The system mark covers tools + system (tools come first in the prefix).

## Q3: Cross-turn

R0 cold, R1 identical, R2 differs only after ~100k chars, R3 differs only after ~50k chars, R4 has a new nonce. Each series uses a fresh nonce. All 40 requests returned "ok".

| Layout | | R0 in/read/write | R1 | R2 (tail >100k) | R3 (tail >50k) | R4 (new nonce) |
|---|---|---|---|---|---|---|
| **A** view = 1 block, Claude Code marks only | rep1 | 2 / 0 / 39693 | 2 / **39693** / 0 | 2 / 0 / 39755 | 2 / 0 / 39678 | 2 / 0 / 39694 |
| | rep2 | 2 / 0 / 39694 | 2 / **39694** / 0 | 2 / 0 / 39746 | 2 / 0 / 39785 | 2 / 0 / 39693 |
| **B** view = 4 blocks, no view marks | rep1 | 2 / 0 / 39693 | 2 / **39693** / 0 | 2 / 0 / 39719 | 2 / 0 / 39711 | 2 / 0 / 39694 |
| | rep2 | 2 / 0 / 39693 | 2 / **39693** / 0 | 2 / 0 / 39747 | 2 / 0 / 39761 | 2 / 0 / 39693 |
| **C** 4 blocks, 1 view mark @100k + Claude Code marks | rep1 | 2 / 0 / 39693 | 2 / **39693** / 0 | 2 / **35855** / 3892 | 2 / 0 / 39841 | 2 / 0 / 39693 |
| | rep2 | 2 / 0 / 39694 | 2 / **39694** / 0 | 2 / **35856** / 3926 | 2 / 0 / 39803 | 2 / 0 / 39693 |
| **D** `DISABLE_PROMPT_CACHING_SONNET=1`, marks @50k/80k/100k | rep1 | 3840 / 0 / 35855 | 3840 / **35855** / 0 | 3866 / **35855** / 0 | 3878 / **18062** / 17865 | 3840 / 0 / 35856 |
| | rep2 | 3840 / 0 / 35856 | 3840 / **35856** / 0 | 3817 / **35856** / 0 | 3878 / **18063** / 17800 | 3840 / 0 / 35855 |

(input_tokens / cache_read_input_tokens / cache_creation_input_tokens. These are the values from the stream-json `result`; the proxy recorded identical values.)

**Verdict: yes, reads match the longest unchanged marked prefix exactly.** In D, R2 read through the 100k mark (35.9k tokens) and R3 through the 50k mark (18.1k tokens). In C, R2 read through its only mark and R3 fell back to 0. Without view marks (A, B), only a byte-identical request hits. Splitting into 4 blocks without marks changes nothing: the 20-block lookback only finds entries that were written at a breakpoint. The negative control missed every time.

Notes:
- In A/B, R2/R3 didn't even read the system prompt. My probe's tools+system prefix (~300 tokens with no tools) is below the minimum cacheable length. With the Read tool it was 927 tokens and was read across processes (W1b/W2 step 1). A real OptChat tools + system prompt would be cached cross-turn on its own.
- In D the 3840 uncached input tokens are the unmarked last view piece, the new message and the env message. That doesn't matter cross-turn, but it is why D is bad within a turn.

## Q4: Within a turn (4 sequential Read calls, one process)

| Step | W1b: Claude Code marks, no view marks (in/read/write) | W2: Claude Code marks disabled, 4 view marks (in/read/write) |
|---|---|---|
| 1 (tool_use) | 2 / 927 / 39720 | 293 / 927 / 39429 |
| 2 (tool_use) | 2 / **40647** / 133 | 426 / 40356 / 0 |
| 3 (tool_use) | 2 / **40780** / 133 | 559 / 40356 / 0 |
| 4 (tool_use) | 2 / **40913** / 133 | 692 / 40356 / 0 |
| 5 (text) | 2 / **41046** / 133 | 825 / 40356 / 0 |

W1 (Claude Code marks + 1 view mark): step 1 OK (2 / 0 / 40646), then step 2 got `400 Found 5`, so the turn failed.

**Verdict: with Claude Code's own marks, yes.** Each step reads the previous step's whole prefix and writes only the new ~133 tokens. With Claude Code marks disabled, no: the reads stop at the last caller mark, and every step pays full price for all earlier tool calls and results again (quadratic). With 30k-char tool results that adds up fast.

## Q5: Is the default system prompt stable? What gets injected?

**Verdict: stable within a day and a cwd. Everything volatile sits *after* the first user content, except gitStatus.**
- Two processes with the default prompt (`--safe-mode`, same cwd): the request bodies were byte-identical except `metadata.user_id.session_id`, which is not prompt content.
- cwd, git yes/no, OS, model and **today's date** go into a trailing `role:"system"` message *after* the user message. With either a default or a custom prompt, that is after the view, so it never breaks the view prefix (it does mean the request ends with a date that changes at midnight).
- A `<system-reminder>` user block (userEmail) is **prepended before the view**. With the **default** prompt in a git repo it also carries **gitStatus** (branch, status, recent commits): volatile, and placed before the view. With `--system-prompt-file`, gitStatus was **not** injected (verified in a git repo). userEmail is constant per account.
- The billing-header system block (`cc_version=2.1.289.<3 hex>`) varies between requests, but it is excluded from cache keying. W1 and W1b had different headers, and W1b still read the 927-token tools+system prefix written by W1. It also changes when Claude Code updates.
- The forced "You are a Claude agent, built on Anthropic's Claude Agent SDK." block always stays with OAuth.
- Flags for a byte-stable prefix: `--system-prompt-file F --safe-mode --setting-sources "" --strict-mcp-config --no-session-persistence --tools <fixed list>`, plus fixed `--model`/effort and a fixed Claude Code version.

## Conclusion vs Codex

Codex OAuth rejects explicit breakpoints (HTTP 400) and caches only byte-identical requests. Claude Code is clearly better:

- **Explicit breakpoints pass through and work exactly as the spec expects.** Layout D reproduced the spec's 50k/80k/100k reads to the token.
- **But `claude -p` can't do both halves of §8 at once.** Claude Code uses 2 marks on the system prompt plus 2 rolling marks per tool step, which leaves 0 free slots in tool-using turns, and a view mark crashes the turn at step 2. You can choose:
  1. Claude Code marks on, no view marks: perfect within a turn, and cross-turn only tools+system are cached (the view is cached only when byte-identical). That's roughly where Codex is cross-turn, but with good within-turn caching.
  2. `DISABLE_PROMPT_CACHING_<MODEL>=1` + 4 own marks: perfect cross-turn view reads, but within a turn the growing tail is re-paid every step. That's worse, because the spec says most tokens are spent within a turn.
  3. Viable in principle but **untested here**: the harness keeps Claude Code marks on and runs a small local rewriting proxy (like `proxy.ts`). The proxy drops the redundant first system mark (and maybe the system mark entirely when tools+system is short) and inserts view marks. The probes show the API accepts such requests. I haven't checked whether rewriting Claude Code's subscription traffic is acceptable under the terms of use.
- Option 1 is the safe default for an OptChat-on-Claude-Code engine. The cross-turn cost of a miss: the view (~36k tokens) is rewritten at 1.25× once per turn, and the steps within that turn then read it.
