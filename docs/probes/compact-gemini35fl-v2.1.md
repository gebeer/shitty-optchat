# Gemini 3.5 Flash Lite minimal: v2.1 fallback-compactor probe

## Verdict

**Reject as a fallback at these settings.** Gemini is faster, cheaper, and fits every first reply, with no empty replies. But it repeatedly answers or continues the historical task instead of recording only the supplied stretch. All five merges containing a pending push request invent a completed push; several also borrow unrelated hashes from background. Other replies invent passing tests, completed edits and commits. Availability cannot compensate for false memories.

One new run only: `google/gemini-3.5-flash-lite`, `reasoning: {effort: "minimal"}`, pinned **`google-ai-studio`**, fallbacks disabled. System `prompts/compact-v2.1.txt` and reminder `prompts/compact-v2.1-step.txt` unchanged. Compare only the existing [V4.1 Novita v2.1 run](compact-v41-prompt-v2.1.md), read in place with no reruns. No fallback implementation or production settings changed.

Same 30 keys/order, historical source/context, tree-record cutoff 1153, 16,000 max output tokens, 300s call timeout, five-try byte retry protocol, `blocks()`/`step()`/`retry()` layout and shortest-output selection. Parent jobs use stored Sonnet children, not this run's outputs: not an end-to-end Gemini tree. The existing cache-control blocks were retained, not optimized for Gemini.

## Summary

| Metric | V4.1 Novita v2.1, requested medium | Gemini 3.5 Flash Lite v2.1, minimal |
|---|---:|---:|
| Jobs attempted / successful | 30 / 29 | **30 / 30** |
| Nonempty finals <=512 bytes | 29/30 | **30/30** |
| Size retry rounds / total calls | 5 / 35 | **0 / 30** |
| First-try overshoots | 5/30 (16.7%) | **0/30** |
| Buckets: 513-560 / 561-640 / 641-800 / >800 | 1 / 3 / 1 / 0 | **0 / 0 / 0 / 0** |
| First bytes min / p25 / median / p75 / max | 239 / 336.5 / 437 / 485.75 / 717 | **149 / 261 / 322 / 383 / 511** |
| Final bytes mean / max | 407.3 / 510 | **319.2 / 511** |
| First-try mean words / items | 64.1 / 5.27 | **50.1 / 4.73** |
| Final mean words / items | 60.0 / 5.28 | **50.1 / 4.73** |
| Jobs needing >=2 size retry rounds | 0 | 0 |
| Source hashes retained, first / final | 25/25 / 24/25 | **18/25 / 18/25** |
| Novel / context-only final hash-job pairs | 0 / 0 | **0 / 5** |
| Leaf jobs with wrong/additional kinds | 4/10 | **8/10** |
| Fabrication review | False import readout; context/user contamination | **False tests/edits/commits; 5 fabricated pushes** |
| Mean / median / max time per attempted job | 8.001 / 4.787 / 28.334s | **3.405 / 4.143 / 5.009s** |
| Cost per attempted job | $0.00590332 | **$0.00413173** |
| Total 30-job cost | $0.17709947 | **$0.12395201** |
| Observed provider | Novita (`novita/fp8`) | **Google AI Studio (`google-ai-studio`)** |
| Empty / reasoning-only replies | 1 / 1 (same shrinking retry) | **0 / 0** |
| Output / reasoning tokens | 24,890 / 20,611 | **2,682 / 0** |
| Prompt / cached / cache-write tokens | 1,387,284 / 756,608 / 0 | **1,296,689 / 1,277,916 / 894,356** |

Words split on whitespace; items split literally on `"; "`; quartiles use linear interpolation. Last overshoot bucket is **801+**, disjoint from 641-800. Time and cost include all calls and failed jobs, divided by all 30 attempted jobs. Final means exclude missing finals (29 baseline, 30 Gemini); Gemini has no retries so its first/final means match. Three Gemini lines exceed 70 words and one exceeds seven items despite all fitting 512 bytes; baseline finals exceed those limits in four jobs each. All Gemini finals are single-line ASCII.

Hash retention counts unique source-hash occurrences per job, 25 across the sample. Gemini loses `da58dbd` in 555+1 and 512+64; `a5db61d` in 554+2 and 552+4; `da58dbd` also in 552+4; `c31e624` in 544+16 and 544+32. Baseline's only final loss is the failed 568+8; all 24 source-hash occurrences in its successful finals survive. Gemini's five context-only hash-job pairs have seven mentions: 558+1/c31e624, 572+4/bf97c2b, 568+8/bf97c2b, 560+16/5496b62, 544+32/a5db61d. No wholly novel hash does **not** mean no invented event or relationship.

Observed Gemini time is 57% lower and cost/job 30% lower than this baseline, but it retains less and often records the wrong task state. Different model/tokenizer, reasoning setting, provider, cache warmth and run/load conditions: not a repeated-trial benchmark or isolated prompt-only effect.

## Smoke: actual upstream effort and caching

The first **two jobs are the smoke and are included in the 30**, not paid twice:

| Job | First bytes | Time | Metered cost | Cached / cache-write tokens |
|---|---:|---:|---:|---:|
| 555+1 | 234 | 4.496s | $0.0051346284 | 42,757 / 42,757 |
| 554+2 | 359 | 3.898s | $0.0051670146 | 42,728 / 42,728 |

OpenRouter's streamed upstream-body echo confirmed on **all 30 calls**, not merely the local request:

```json
{
  "generationConfig": {
    "thinkingConfig": { "thinkingLevel": "minimal" },
    "candidateCount": 1,
    "maxOutputTokens": 16000
  },
  "cachedContent": "<Google cache resource>"
}
```

The uncached native `contents` matches the exact task/step reminder on every call. The initial two outputs were nonempty, fitting, source-related and had no transport error, but smoke 555+1 dropped `da58dbd` and “nothing pushed.” Projected from these two: **$0.1545 and 125.9s for 30 jobs**; continued without waiting under the $5 cap. The much more serious request-as-result defects emerged in later jobs.

**Minimal really reached Google.** All responses report zero reasoning tokens and contain no reasoning text; this is not evidence of an effort downgrade to off. Model metadata lists reasoning mandatory/default-enabled and supports minimal/low/medium/high. OpenRouter documents Gemini's direct effort-to-`thinkingLevel` mapping, with token consumption determined by Google rather than a fixed percentage of max output.

**Caching works, including reuse.** Every call has native `cachedContent` plus positive `cached_tokens`. However, both smoke calls created a cache, so those counters alone were not warm-hit evidence. Full run: **21 cache creations and 9 warm reads with zero cache writes**, across 21 cache identities. Repeated cache identities have identical system/context fingerprints; 383,560 cached tokens belong to the nine warm-read calls. Reported cached totals include tokens also reported as newly written; do not interpret the 98.6% cached-token ratio as a 98.6% warm-hit rate.

This is explicit caching through the unchanged `blocks()` breakpoints. Gemini uses the last marked breakpoint; the cacheable view can change between historical jobs. No marker rearrangement, cache warmup calls, or same-job repeats were added. Model calls used SSE plus `debug.echo_upstream_body` solely to inspect upstream settings, and a saved-stream adapter reconstructed the same text/usage fields the existing nonstream harness consumes. The baseline used nonstream replies; delivery/debug overhead is an additional latency-comparison caveat.

Pinned standard AI Studio endpoint, not Flex/priority: live metadata advertises input **$0.30/M**, output/reasoning **$2.50/M**, cache reads **$0.03/M**; quantization **unknown**. Public canonical slug is `google/gemini-3.5-flash-lite-20260721`. All 30 replies name Google AI Studio and finish `stop`; no transport retry, refusal, token-limit finish, empty final or reasoning-only reply. Cost is OpenRouter `usage.cost`, including reported cache writes, not the slightly higher `upstream_inference_cost` field.

Sources: [model/endpoints API](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite/endpoints), [model reasoning metadata](https://openrouter.ai/api/v1/models), [Gemini effort mapping](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#google-gemini-3-models-with-thinking-levels), [prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching#google-gemini).

## Fabrication and preservation review

All 30 Gemini finals were manually checked against their exact stretch and the existing baseline. Unsupported result/change claims occur in at least these **18 jobs**: 556+2, 558+1, 560+1, 544+16, 561+1, 560+2, 566+1, 560+4, 567+1, 571+1, 570+2, 572+1, 568+4, 572+4, 568+8, 560+16, 544+32, 512+64. This is an evidence list, not a subscription-judge score; no judge model was invoked.

| Jobs | Evidence / comparison |
|---|---|
| **556+2** | Stretch contains the user's row-filter request and a read-code tool call. Final invents completed filtering, `bun test 19/19 green`, demo verification and a main commit. Baseline keeps request + read tool. |
| **558+1 / 560+1** | Echo-only old code becomes user/work/talk, with filtered rows, verified demo and commit claims. 558+1 even says `main commit c31e624 amended`; no amendment exists in the stretch. Baseline also leaks user/context here, but does not invent these completed tests/commits. |
| **544+16** | Drops the actual `c31e624` overlay commit and records the newly requested row-filter change as implemented/tested, plus an unsupported commit command/title. Also introduces nonstandard `test:` item labeling. |
| **561+1 / 560+2 / 560+4** | Pending edits/test commands acquire invented successful results. 561+1 says `20 passed`; 560+2 says `20 pass, 0 fail (143 expects)`; 560+4 says `20/20 pass` and demo/commit completion. No such output is in these stretches; the later real result is 19 tests/107 expects. Baseline 560+4 has a false table-import readout too, but does not claim a completed test/demo/commit result. |
| **566+1 / 567+1** | Pending demo command or actual demo echo becomes an imported user request, code edits, successful tests and a commit. 566+1 also invents a diff stat `(+7 -17)`. Baseline 566+1 imperfectly says `ran/checked`, but does not invent test or commit outcomes; baseline 567+1 retains the actual demo observations. |
| **571+1 / 570+2 / 568+4** | Read-only old docs explicitly include empty periods. Finals falsely claim updated docs/filtering, tests and/or commit completion. 568+4 fabricates an echo of new README/SPEC wording. Baseline correctly retains old wording and need for an update. |
| **572+1** | Pending docs/test/commit command becomes `echo: 19 pass, 0 fail` and a completed commit/clean tree. Baseline explicitly says output not shown. |
| **572+4 / 568+8** | Latest user asks to push; source still says unpushed. Finals claim a completed push **bf97c2b..fecfd07**. `bf97c2b` occurs only in unrelated background. Baseline 572+4 preserves request/unpushed; baseline 568+8 failed with no final. |
| **560+16** | Fabricated push **5496b62..fecfd07**, borrowing another background-only hash. Baseline keeps the latest push as a request and main 4 ahead/unpushed. |
| **544+32** | Invents `Everything up-to-date or pushed` and a completed **a5db61d..fecfd07** range; drops `c31e624`, `aggregate()` and most row-filter constraints. Baseline retains both constraints and pending push. |
| **512+64** | Invents a completed, backwards **fecfd07..c31e624** push range, drops `da58dbd`, earlier no-push and `aggregate()` constraints. Baseline keeps pending push and unpushed state. |
| **555+1 / 554+2 / 552+4 / 552+8 / 556+4** | Source-related but lossy: omit hashes, unpushed state or user test/demo/one-commit/no-push qualifiers. 554+2 collapses talk into echo; 556+4 loses the echo and final read-tool half. Baseline is generally fuller. |
| **564+1 / 576+2** | Import or invent additional role items. 576+2 is the one actual successful push stretch: **955394f..fecfd07** and all four source hashes survive, but Gemini invents a talk item absent from the stretch. |
| **566+2 / 564+4 / 572+2 / 560+8 / 574+1** | Main recorded outcomes are supported, though heavily abbreviated and sometimes retagged. 560+8 does not promote its embedded user aside into a fresh user item, unlike the baseline. These gains do not offset the false-push/test failures. |

The pattern is not merely losing details to a size limit: Gemini has unused space (mean 319 bytes) while hallucinating task progress. In particular, **all five pending-push merges fabricate the result**; the actual successful-push stretch has a different range. That is disqualifying for a fallback intended to preserve durable memory when the primary endpoint is unavailable.

## Copied-example check

Actual fixed-string `grep -Fn` of finals, independently checked by the analyzer: **zero hits** for `0412`, `test_header_order`, `02:00 UTC`, `export.py`, `a3f9c21`, `feat/export`, `--verbose`. As before, some markers also appear in the scale line/background, so a hit would not uniquely establish system-example copying. No literal hits occurred; false task progress and borrowed push hashes remain independently evidenced.

## Reproduce and audit

```sh
# Smoke used --take 2; subsequent foreground invocations used --take 4.
bun --preload ./dev/probe-out/gemini35fl-v2.1/log-requests.ts dev/compact-probe.ts run \
  --probe 9 --arms GM --jobs 30 --end 1153 --take 4 \
  --out dev/probe-out/gemini35fl-v2.1 \
  --v2-system prompts/compact-v2.1.txt --step prompts/compact-v2.1-step.txt \
  --spend dev/probe-out/spend.jsonl --budget 5 --skip-errors
bun dev/probe-out/gemini35fl-v2.1/validate.ts
python dev/probe-out/gemini35fl-v2.1/analyze.py
OPTCHAT_CLAUDE=/bin/false bun test
```

Added only a single GM arm to `dev/compact-probe.ts`, using existing prompt/step options, endpoint-price reserve and per-directory $5 ledger. Earlier arms remain unchanged. No-network test checks the explicit model/effort, provider pin, max tokens, unchanged prompt/reminder and size retry request. Tests: **24 pass, 0 fail, 223 assertions**. `git diff --check` passed.

Gitignored `dev/probe-out/gemini35fl-v2.1/` contains 30 unique result records, all 30 submitted requests, raw SSE replies, normalized response/usage logs, model/endpoint snapshots, source-review files, metrics/finals, immutable input hashes and the no-API validator. Validator checks every exact historical source/context against `dev/probe-out/v41/rebuilt-jobs.json`; every request against unchanged prompts/blocks; every native minimal setting and uncached task; stream reconstruction and usage; consistent cache identity/fingerprint; and exactly 30 metered ledger calls. Existing V4.1 result and both prompt SHA-256 hashes are unchanged before/after.

Prompt hashes: system `6ca298128a5415b5abcdb2ac62ddeadf5e5f022af7f2adf36a502e6cbf11dcd7`; reminder `a5f8a6cb68892b071bde643395d54bbe72afc5aed80441521561ddd3151d870a`. Actual run spend **$0.1239520062**, including both smoke jobs; no additional paid diagnostics or other-arm calls. No prompt tuning, baseline reruns, judge model calls, SPEC edits, real Claude invocation, optchat launch or push.
