# V4.1 DeepInfra fp8: v2.1 provider-fallback probe

## Verdict

**Not acceptable as a provider fallback at these settings.** DeepInfra completed all 30 jobs without an empty reply and cost 56% less than the existing Novita run, but was 34% slower on average. It fabricated observed demo success for a pending command, dropped a source hash, and erased the latest push request during a size retry while retaining the superseded no-push instruction. Same model and advertised fp8 quantization did not establish equal fidelity.

One new run only: `deepseek/deepseek-v4.1-flash`, requested `reasoning: {effort: "medium"}`, pinned **`deepinfra/fp8`**, `allow_fallbacks: false`. System `prompts/compact-v2.1.txt` and reminder `prompts/compact-v2.1-step.txt` unchanged. Compare only the saved [V4.1 Novita v2.1 run](compact-v41-prompt-v2.1.md), read in place, not rerun. No fallback implementation or production settings changed.

Same 30 keys/order, exact historical source/context, tree-record cutoff 1153, 16,000 max output tokens, 300s call timeout, five-try byte retry protocol, `blocks()`/`step()`/`retry()` layout and shortest-output selection. Every first request matches its saved Novita request as parsed JSON **except the provider pin**. Both runs use nonstream replies. Parent jobs use stored Sonnet children, not new replay outputs: this is not an end-to-end DeepInfra tree.

## Summary

| Metric | V4.1 Novita v2.1, requested medium | V4.1 DeepInfra v2.1, requested medium |
|---|---:|---:|
| Jobs attempted / successful | 30 / 29 | **30 / 30** |
| Nonempty finals <=512 bytes | 29/30 | **30/30** |
| Size retry rounds / total calls | 5 / 35 | **8 / 38** |
| First-try overshoots | 5/30 (16.7%) | **7/30 (23.3%)** |
| Buckets: 513-560 / 561-640 / 641-800 / >800 | 1 / 3 / 1 / 0 | **4 / 3 / 0 / 0** |
| First bytes min / p25 / median / p75 / max | 239 / 336.5 / 437 / 485.75 / 717 | **228 / 365.25 / 455.5 / 508.5 / 635** |
| Final bytes mean / max | 407.3 / 510 | **420.4 / 512** |
| First-try mean words / items | 64.1 / 5.27 | **65.3 / 5.47** |
| Final mean words / items | 60.0 / 5.28 | **62.0 / 5.37** |
| Jobs needing >=2 size retry rounds | 0 | **1** |
| Source hashes retained, first / final | 25/25 / 24/25 | **24/25 / 24/25** |
| Novel / context-only final hash-job pairs | 0 / 0 | **0 / 0** |
| Leaf jobs with wrong/additional kinds | 4/10 | **5/10** |
| Fabricated pending-push results | 0/5 | **0/5** |
| Fabrication review | False import readout; context/user contamination | **Invented pending-demo success; context/user contamination** |
| Mean / median / max time per attempted job | 8.001 / 4.787 / 28.334s | **10.684 / 4.808 / 58.144s** |
| Cost per attempted job | $0.00590332 | **$0.00258059** |
| Total 30-job cost | $0.17709947 | **$0.07741756** |
| Observed provider | Novita (`novita/fp8`) | **DeepInfra (`deepinfra/fp8`)** |
| Empty / reasoning-only replies | 1 / 1 (same shrinking retry) | **0 / 0** |
| Output / reasoning tokens | 24,890 / 20,611 | **22,720 / 17,722** |
| Prompt / cached / cache-write tokens | 1,387,284 / 756,608 / 0 | **1,506,782 / 1,047,808 / 0** |

Words split on whitespace; items split literally on `"; "`; quartiles use linear interpolation. Last overshoot bucket is **801+**, disjoint from 641-800. Time and cost include every call, retry and failed job, divided by all 30 attempted jobs. Final means exclude missing finals: 29 Novita, 30 DeepInfra. All DeepInfra finals are single-line ASCII; eight exceed 70 words and three exceed seven items despite fitting the byte limit. Novita has four finals exceeding each limit. The unchanged harness enforces bytes, not word/item limits.

Hash retention counts unique source-hash occurrences per job, 25 across the sample. DeepInfra loses **`c31e624` in 544+32 on both first and final replies**. Novita's only final loss is `fecfd07` in failed 568+8; all 24 hash occurrences in its 29 successful finals survive. Equal final 24/25 counts therefore hide different failure modes. No invented hash does not mean no invented event.

DeepInfra's seven first overshoots: **552+4 635**, **564+1 542**, **564+4 552**, **560+8 514**, **568+8 568**, **560+16 530**, **544+32 603** bytes. Only 552+4 needs two shrinking retries (635 -> 536 -> 457); each other job needs one. No job was rerun.

Observed cost/job is 56.3% lower and mean time/job 33.5% higher. Cache warmth, endpoint load and run/chunk conditions differ; this is one replay, not a repeated-trial latency benchmark. Three large-context jobs dominate the slow tail: 552+8 52.328s, 544+16 51.841s, 512+64 58.144s.

## Routing, quantization and first-job check

Live [model/endpoints metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), saved before the run, advertises:

- Tag **`deepinfra/fp8`**, provider DeepInfra, model name `deepseek/deepseek-v4.1-flash-20260910`, context 1,048,576, quantization **fp8**.
- Input **$0.14/M**, output/reasoning **$0.42/M**, cache reads **$0.0042/M**; metadata also includes `discount: 0.3`. Actual reported `usage.cost`, not a price-based estimate, is used throughout.
- Both DeepInfra and the existing Novita endpoint advertise fp8. That matches the quantization label, not proof of identical inference implementations, defaults or fidelity.

All **38 captured requests** specify medium and disable provider fallbacks. All **38 responses** are HTTP 200, report V4.1/DeepInfra and finish `stop`. No transport retry, refusal, token-limit finish, empty content or reasoning-only completion occurred. Requested medium is verified at the OpenRouter boundary; no extra native-effort diagnostic was added to this one run, so this does not independently prove equal native reasoning budgets across providers.

The first job **555+1** is included in the 30: **511 bytes, 3.485s, $0.005570334**, no retry. Both source hashes and “nothing pushed” survive, with the correct talk-only role. Its first-job projection was **$0.1671 / 104.6s for 30 jobs**, within the $5 run cap. The later fidelity failures were not visible in that first reply. Total actual spend includes all eight shrinking retries and stays well below $5.

## Fabrication and preservation review

All 30 finals and their retry chains were manually reviewed against the exact supplied stretch and the saved Novita result. No judge model was called.

| Jobs | Evidence / comparison |
|---|---|
| **566+1 — material fabrication** | Source contains only a pending tmux demo command, **no output**. DeepInfra records an observed empty-chat `"no model calls"` view, a populated 2026-10-05 row and **`EXITED 0`**. Those outcomes are absent from the stretch. Novita also weakly says `ran/checked/session killed`, but does not invent these observations or the exit code. |
| **544+32 — latest instruction lost** | First reply includes the latest request to push and reply with the range. The 603 -> 458 byte retry removes that entire request and the current unpushed qualifier, leaving the earlier **`no push`** instruction and an unfinished `main 4` tail. `c31e624` is missing even before retry. Novita keeps both hashes, unpushed state and the latest push/range request. No completed push is invented, but the remembered next action is wrong. |
| **560+8 / 560+16** | Shrinking produces cut-looking endings: `uncommitte` at exactly 512 bytes, and `asks git push origin main, reply` with the requested range omitted. No local truncation was applied; these are the model's saved replies. Novita retains complete uncommitted/pending-range wording. |
| **560+1 / 561+1 / 564+1 / 574+1** | DeepInfra introduces user items absent from these leaf stretches, importing background requests; 560+1/564+1 also import earlier tool actions. 574+1 is talk-only but becomes user+talk. Supported numerical results in 564+1 remain faithful. Novita shares some contamination, but keeps 561+1 tool-only and 574+1 talk-only. |
| **558+1** | Echo-only code read becomes tool. Gain: unlike Novita, it does not import a user item or misleadingly say `aggregate filters day/week rows`; source role is still wrong. |
| **560+4** | Gain: unlike Novita's false `imports now ... table` readout, DeepInfra keeps the old import read separate from the later sed/test command and explicitly says `no output yet`. It still promotes the embedded user aside and miscopies `selfcheck.test.ts` as `selfcheck.ts`. |
| **572+1** | Pending docs/test/commit command explicitly retains `log/status output not shown`; no invented passing-test result or commit hash. Both providers preserve this pending boundary. |
| **572+4 / 568+8 / 560+16 / 544+32 / 512+64** | **0/5 fabricated completed pushes.** Four DeepInfra finals retain a pending push request; 544+32 loses it as above. Novita retains the request in four finals too, but its fifth job, 568+8, fails with no final rather than silently retaining an obsolete instruction. |
| **576+2** | The actual successful push **955394f..fecfd07**, all four commit hashes and synchronized main state survive. Like Novita, DeepInfra imports the preceding user push request into this tool/echo-only stretch. This real push result is not present in any of the five pending-push stretches. |
| **555+1 / 554+2 / 556+2 / 556+4** | Gains: talk-only smoke and echo+talk roles are correct in the first two jobs, unlike Novita's extra work/tool tags. Direct render-filter/keep-aggregate/no-push constraints and the final read-tool item survive in 556+4. Minor session/UI, conventional-commit and short-reply details are still omitted in some summaries. |
| **552+4 / 552+8 / 512+64** | Length fitting is lossy: two retries in 552+4 remove plain-mode/session-turn details; 552+8 drops demo/short-reply qualifiers; 512+64 adds an unsupported `work:` role to a tool-sourced item and omits some row-filter/docs/test constraints. Core hashes in these jobs survive. |

Some boundary handling improves over Novita, and there is no Gemini-style fabricated push pattern. Nevertheless, the pending-demo fabrication plus latest-instruction loss prevent an equal-fidelity or acceptable-fallback verdict. Novita itself is not a clean-fidelity production acceptance; its existing limitations are not waived here.

## Copied-example check

Actual fixed-string `grep -Fn` of saved finals, independently checked by the analyzer: **zero hits** for all seven strings: `0412`, `test_header_order`, `02:00 UTC`, `export.py`, `a3f9c21`, `feat/export`, `--verbose`. Some also occur in historical background, so hypothetical hits would not uniquely prove example copying. No literal hits occurred; the demo fabrication is independently evidenced.

## Reproduce and audit

```sh
# Foreground chunks of <=4 jobs; recorded jobs are resumed, not rerun.
bun --preload ./dev/probe-out/v41-deepinfra-v2.1/log-requests.ts dev/compact-probe.ts run \
  --probe 8 --arms V2 --provider deepinfra/fp8 \
  --jobs 30 --end 1153 --take 4 \
  --out dev/probe-out/v41-deepinfra-v2.1 \
  --v2-system prompts/compact-v2.1.txt --step prompts/compact-v2.1-step.txt \
  --spend dev/probe-out/spend.jsonl --budget 5 --skip-errors
bun dev/probe-out/v41-deepinfra-v2.1/validate.ts --complete
python dev/probe-out/v41-deepinfra-v2.1/analyze.py
OPTCHAT_CLAUDE=/bin/false bun test
```

Existing probe/provider/prompt options already cover this run; **no tracked harness or prompt edits were needed**. Raw arm name remains `V2`, distinguished by its output directory, provider pin and captured requests. The existing pinned-endpoint price reserve and per-directory $5 ledger were retained.

Gitignored `dev/probe-out/v41-deepinfra-v2.1/` contains 30 unique result records, all 38 request bodies and raw response/usage logs, endpoint snapshots, exact-input validator, metrics/finals, source-review files and immutable input hashes. Validator checks all 30 sources/context against `dev/probe-out/v41/rebuilt-jobs.json`, every first request against the saved Novita request except provider, exact unchanged prompt/reminder and retry messages, provider/model/finish, all nonempty ASCII finals <=512, and exactly 38 metered ledger calls. No transport attempts are hidden in the call count.

Before/after hashes unchanged:

- System: `6ca298128a5415b5abcdb2ac62ddeadf5e5f022af7f2adf36a502e6cbf11dcd7`.
- Reminder: `a5f8a6cb68892b071bde643395d54bbe72afc5aed80441521561ddd3151d870a`.
- Saved Novita v2.1 results: `d19fd92e672c33e245affd622e74b502680c6c0790fef967256cd9543b833273`.

Validation and zero-hit grep passed. Safe no-network tests: **24 pass, 0 fail, 223 assertions**. `git diff --check` passed. Actual run spend **$0.077417558064**. No additional paid diagnostics, other arms, baseline reruns, judge model calls, SPEC edits, real Claude invocation, optchat launch or push.
