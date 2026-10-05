# V4.1 Novita prompt v2.1: one-pass comparison with v2 and v1

One new 30-job replay only: explicit `deepseek/deepseek-v4.1-flash`, requested `reasoning: {effort: "medium"}`, pinned `novita/fp8`, fallbacks disabled. Used the user's `prompts/compact-v2.1.txt` and `prompts/compact-v2.1-step.txt` **unchanged**. Existing v2 Novita and v1 Novita MED results were read in place, not rerun. No other model/arm calls or new effort diagnostics.

The existing probe's `--v2-system` and `--step` options already cover this; no new prompt arm was needed. Raw arm name remains `V2`, distinguished by the new output directory and exact captured prompts. System **and** step changed together as requested, so this run cannot isolate which prompt change produced the difference. Requested medium previously mapped to native low/50 on this endpoint; see [the effort mapping](compact-v41-prompt-v2.md#novita-v41-effort-mapping).

Same 30 keys, historical source/context, tree-record cutoff 1153, order, 16,000 max output tokens, five-try byte retry protocol, and shortest-output selection. Parent jobs use stored Sonnet children, not outputs from this replay: not an end-to-end v2.1 tree. No sampling overrides or production setting changes.

## Summary

**Length control improved substantially; fidelity is still not clean.** Retries fell from 17 to 5 versus v2, first overshoots from 11 to 5, and mean time from 15.3s to 8.0s. However, one shrinking retry returned reasoning only, leaving that job failed. Remaining finals still import user instructions from context and misrecord an import readout. Treat this as a promising size-control result, not a production acceptance.

| Metric | v1 Novita MED | v2 Novita | v2.1 Novita |
|---|---:|---:|---:|
| Jobs attempted / successful | 30 / 30 | 30 / 30 | 30 / 29 |
| Nonempty finals <=512 bytes | 30/30 | 30/30 | **29/30** |
| Empty-reply failures | 0 | 0 | 1 |
| First outputs >512 bytes | 6/30 (20%) | 11/30 (36.7%) | 5/30 (16.7%) |
| Size retry rounds / total calls | 6 / 36 | 17 / 47 | **5 / 35** |
| Jobs with >=2 retry rounds | 0 | 4 | 0 |
| Final bytes mean / max | 474.4 / 512 | 452.1 / 512 | 407.3 / 510 |
| Source hashes retained, first / final | 25/25 / 25/25 | 25/25 / 24/25 | 25/25 / 24/25 |
| Novel / context-only final hashes | 0 / 1 | 0 / 0 | 0 / 0 |
| Leaf jobs with wrong/additional kinds | 0/10 | 3/10 | 4/10 |
| Direct user-bearing merges starting `user:` | 3/9 | 3/9 | 5/9 |
| Mean / median / max time per attempted job | 23.699 / 17.598 / 61.667s | 15.325 / 10.702 / 60.158s | **8.001 / 4.787 / 28.334s** |
| Cost per attempted job | $0.00870065 | $0.00713738 | **$0.00590332** |
| Total 30-job cost | $0.26101950 | $0.21412133 | **$0.17709947** |
| Output / reasoning tokens | 123,988 / 118,487 | 64,602 / 57,507 | 24,890 / 20,611 |
| Prompt / cache-read tokens | 1,415,717 / 829,696 | 1,854,401 / 1,236,352 | 1,387,284 / 756,608 |

Time and cost include all size retries **and the failed job**, divided by all 30 attempted jobs. The failure is not counted as a fitting zero-byte final. Final-size/word/item means exclude missing finals (29 for v2.1, 30 for baselines); all first-try distributions include all 30 initial nonempty replies. Single replay, different cache warmth/chunk boundaries/load: speed/cost are observations, not a repeated-trial prompt-only benchmark.

Hash counts are unique source-hash occurrences per job, 25 across this sample. The only v2.1 final loss is `fecfd07` in failed **568+8**; all 24 source-hash occurrences in the 29 successful finals survive. V2 instead lost `a5db61d` during shrinking in **552+4**. No invented hash does not imply no invented fact.

## First-try size distribution

Quartiles use linear interpolation. Buckets are disjoint: the last is **>800** (801+), not another count of byte 800.

| First-try bytes | v1 Novita MED | v2 Novita | v2.1 Novita |
|---|---:|---:|---:|
| Min / p25 / median / p75 / max | 283 / 469.75 / 492 / 508 / 979 | 255 / 427 / 495 / 601 / 932 | **239 / 336.5 / 437 / 485.75 / 717** |
| 513-560 | 1 | 3 | 1 |
| 561-640 | 1 | 2 | 3 |
| 641-800 | 2 | 4 | 1 |
| >800 | 2 | 2 | 0 |

V2.1's five overshoots: **552+8 717**, **544+16 565**, **564+4 524**, **568+8 570**, **560+16 598** bytes. Each received one shrinking retry; four produced fitting finals, one produced no text. No job was rerun.

## Words and items

Words are whitespace-separated; items are literal splits on `"; "`. Bytes/word is pooled total UTF-8 bytes divided by total words within each first-try group. These are surface counts, not semantic fact counts.

| Metric | v1 Novita MED | v2 Novita | v2.1 Novita |
|---|---:|---:|---:|
| First-try mean words / items, all 30 | 76.4 / 7.37 | 75.9 / 6.67 | **64.1 / 5.27** |
| Final mean words / items | 68.9 / 6.80 | 66.4 / 5.87 | **60.0 / 5.28** |
| First-try mean words: fit / overshoot | 67.4 / 112.5 | 62.3 / 99.4 | 58.5 / 92.2 |
| First-try mean items: fit / overshoot | 6.5 / 10.8 | 5.4 / 8.9 | 5.2 / 5.6 |
| First-try bytes/word: fit / overshoot | 6.95 / 6.51 | 6.83 / 6.74 | 6.84 / 6.45 |
| First replies exceeding 70 words / 7 items | 18 / 13 | 17 / 13 | **9 / 3** |
| Finals exceeding 70 words / 7 items | 17 / 11 | 13 / 10 | **4 / 4** |

The new word/item instructions moved the overall distribution downward, but were not mechanically obeyed. The actual harness still enforces the historical 512-byte check only; it does not add word/item retries or truncate at 70 words. Four finals exceed 70 whitespace words and four exceed seven literal items despite fitting the byte limit.

## Failure, smoke, and fabrication review

Smoke **555+1** is part of this single run: first reply 496 bytes, no retry, 3.763s, $0.009492994368. Both hashes and “nothing pushed” survive. However, its talk-only source is retagged as talk/work/tool, already showing that role boundaries remain unreliable.

**568+8 failed during its first size retry**, not on its first call: 570-byte initial output, then `message.content: null`, `finish_reason: "stop"`, 2,068 output tokens all counted as reasoning, and no final. Total job 12.915s, $0.010907303616. This was not a 16,000-token exhaustion or HTTP failure. Its first output retained `fecfd07` and the push/range request; the harness's existing empty-reply handling returns an error rather than publishing the oversized earlier line. No fallback final was fabricated and no rescue call was made.

A minimal `--skip-errors` resume flag was added to finish the final remaining job without retrying this recorded failure. Default resume behavior is unchanged. A no-network regression test verifies default retry, opt-in skip, and no further calls once all jobs have a recorded result.

All 29 finals and the failed job's initial line were manually compared with their exact stretch; baseline comparisons use existing results. Material findings:

| Job | Finding |
|---|---|
| **558+1** | Echo-only code read becomes tool + user. The user instruction to hide rows, keep `aggregate()`, and show a dim line is imported from context. `aggregate filters day/week rows` is also misleading: the read implementation constructs/preserves the periods, it is not the rendering filter. |
| **560+1** | Echo-only excerpt imports a full `user:` item with test/demo/commit/no-push instructions from background. More serious user-role contamination than v2's extra tool item. |
| **560+4** | **False import readout:** `echo: imports now aggregate,hit,isoWeek,table`, although the source echo lists the test import **without table**. The subsequent sed command only requests adding it. This is an invented intermediate result, also seen in the earlier DeepInfra probe. V2 kept the original readout separate. A user aside inside the input echo is also promoted to `user:`. |
| **564+1** | Echo-only results become `tool:` and import the earlier sed/import edit and CLI invocation from context. Supported numerical results remain faithful, but source role/scope are wrong. |
| **555+1 / 554+2** | Talk becomes work/tool in the smoke; the first half's echo in 554+2 becomes tool. No subagent report exists to justify the smoke's `work:` tag. |
| **561+1** | Final grep target becomes `selfcheck.ts`, whereas the stretch names `selfcheck.test.ts`. Identifier-copying defect; the earlier part of the same final still uses the correct filename. |
| **566+1** | **Gain versus v2:** no invented `EXITED 0`, populated rows, or dim-line observation for the pending demo command. Still says `ran`, `checked`, and `session killed` without an output-not-shown qualifier; it is not a strong pending-work preservation pass. |
| **572+1** | Pending docs/test/commit command remains tool-only with `output not shown`; no invented hash or passing-test result. |
| **560+8** | Still promotes a user aside inside an echo summary to `user:` (both baselines do this). Unlike v2's `Ctrl-D EX` tail, the supported `EXITED 0` survives intact. |
| **576+2** | Actual successful push/range is supported, but final imports a preceding user push request from context. V2 does this too; v1 sticks to tool/echo. |
| **556+2 / 556+4 / 552+8** | Core render-filter/keep-aggregate/no-push constraints retained, but short-reply and some minor tool/commit qualifiers dropped. 556+4 again loses the last read-tool item. |
| **560+16** | Retains latest push/range request and prior unpushed state, but imports the earlier user test/commit/no-push instructions from context; those instructions are not directly in this stretch. |
| **544+32 / 512+64** | Latest push remains a request, no fabricated forward push result. `aggregate()` survives. In 512+64, plain-mode behavior and docs/test/one-commit details still disappear. |

No novel final hashes or material fabrication from the seven example markers was found. The false import readout and context/user contamination still block a clean-fidelity verdict. More user-first tags are not automatically better: some newly tagged user items are out of scope.

## Example-string grep

Actual fixed-string `grep -Fn` across saved nonempty finals, plus an independent literal scan: **zero hits for every requested string**.

| String | Final hits |
|---|---:|
| `0412` | 0 |
| `test_header_order` | 0 |
| `02:00 UTC` | 0 |
| `export.py` | 0 |
| `a3f9c21` | 0 |
| `feat/export` | 0 |
| `--verbose` | 0 |

None occurs in the job stretches. `test_header_order`, `export.py`, and `--verbose` occur in all background contexts, so hypothetical hits could be context leakage rather than uniquely example copying. No hits occurred; this does not rule out semantic imitation of the examples.

## Reproduce and audit

```sh
# The first job was the smoke, then resumable foreground chunks of <=4 jobs.
bun --preload ./dev/probe-out/v41-prompt-v2.1/log-requests.ts dev/compact-probe.ts run \
  --probe 8 --arms V2 --jobs 30 --end 1153 --take 4 \
  --out dev/probe-out/v41-prompt-v2.1 \
  --v2-system prompts/compact-v2.1.txt --step prompts/compact-v2.1-step.txt \
  --spend dev/probe-out/spend.jsonl --budget 5 --skip-errors
bun dev/probe-out/v41-prompt-v2.1/validate.ts --complete
python dev/probe-out/v41-prompt-v2.1/analyze.py
OPTCHAT_CLAUDE=/bin/false bun test
```

Artifacts in gitignored `dev/probe-out/v41-prompt-v2.1/`: all 30 result records (29 finals + one explicit failure), all 35 request bodies and response/usage logs, endpoint snapshot, exact-input validator, metrics, finals for grep, source-review files, and immutable input hashes. All requests are V4.1/medium/Novita with fallbacks disabled; all responses HTTP 200/provider Novita/finish stop, including the reasoning-only failure. No transport retries. Existing five-try size protocol remained unchanged; retries use `src/summarize.ts:retry()` with no extra retry reminder.

Both old baseline result files and both user draft files are SHA-256 checked before/after; same 30 reconstructed sources/context match `dev/probe-out/v41/rebuilt-jobs.json` exactly. Prompt hashes:

- `compact-v2.1.txt`: `6ca298128a5415b5abcdb2ac62ddeadf5e5f022af7f2adf36a502e6cbf11dcd7`.
- `compact-v2.1-step.txt`: `a5f8a6cb68892b071bde643395d54bbe72afc5aed80441521561ddd3151d870a`.

Validation passed: all 30 exact source/context snapshots and all 35 captured requests/responses; unchanged prompt/baseline hashes; zero example-string grep hits. `OPTCHAT_CLAUDE=/bin/false bun test`: **24 pass, 0 fail, 214 assertions**, no model calls (judge/session tests use local fakes). `git diff --check` passed.

The $5 per-run safeguard uses live pinned-endpoint prices and full output/input reserve. Total metered spend, including the failed retry: **$0.177099474816**. No prompt edits, baseline reruns, judge model invocation, SPEC edits, real Claude invocation, optchat launch, or push.
