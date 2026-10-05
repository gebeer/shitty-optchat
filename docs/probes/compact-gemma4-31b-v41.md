# Compactor candidate: Gemma 4 31B reasoning enabled vs. V4.1 medium

Date 2026-10-05 · **SMOKE ONLY — rejected by ZERO; no full probe.**

Requested model: `google/gemma-4-31b-it`, `reasoning: {enabled: true}`. Same unchanged DeepSeek system/step, `blocks()` and `retry()` as the GLM/Qwen comparisons; NODE 512 bytes, TRIES 5, 16,000 max output tokens, no sampling overrides. Exact historical 30-job sample ends at tree record 1153; only its first job, **555+1**, has run. No new DeepSeek calls.

Provider: **`novita/bf16`**, fallbacks disabled. The live API lists no Novita fp8 endpoint for Gemma; the reused V4.1 baseline remains `novita/fp8`. This necessary quantization difference, provider load and cache conditions prevent a model-only speed comparison. Each parent job will consume historical stored Sonnet children, not new Gemma outputs; this is not an end-to-end Gemma tree.

## Verdict

**Rejected on latency:** **273 s/job vs. 30 s** for the same Novita V4.1-medium job, with only **27 s** of headroom before the unchanged 300 s timeout. The summary also dropped explicit **"nothing pushed"**. ZERO declined the full run; this remains **smoke-only**, not a 30-job quality comparison.

### Upstream reasoning verification

A separate tiny streaming settings diagnostic requested `Reply exactly OK.` with the same explicit model/reasoning/provider/max_tokens. OpenRouter's `debug: {echo_upstream_body: true}` showed the actual transformed Novita request with:

```json
{
  "model": "google/gemma-4-31b-it",
  "max_tokens": 16000,
  "enable_thinking": "<included to upstream but not in debug info>"
}
```

**The native flag was forwarded, but OpenRouter redacts its boolean value.** Active reasoning is confirmed behaviorally: the diagnostic returned **20 reasoning tokens / 67 reasoning characters**, and the real compactor smoke returned **3,352 reasoning tokens / 10,712 reasoning characters**, separately from final content. This is stronger evidence than the local request alone; it is not a claim that the literal upstream boolean was visible or that provider internals were independently inspected.

The upstream echo also shows provider defaults `temperature: 1`, `top_p: 0.95`, `top_k: 64`; none was added to our request. Google's model card documents `enable_thinking=True` and non-empty thought output when thinking is enabled. Diagnostic: `OK`, stop finish, Novita, **2.744 s**, **$0.000012276**; excluded from compactor timing/cost means, included in this run's budget.

### Smoke result — same job 555+1

| metric | V4.1 medium, saved same job | Gemma 4 31B enabled, smoke |
|---|---:|---:|
| bytes per size attempt | 979→495 | **435** |
| final ≤512 bytes | yes | **yes** |
| size retries | 1 | **0** |
| source hashes retained | 2/2 | **2/2** |
| elapsed time, all size attempts | 30.070 s | **273.144 s (4m33s)** |
| metered cost/job | $0.013574914848 | **$0.0073423152** |

Gemma completed one HTTP request with status **200**, finish **stop**, observed model `google/gemma-4-31b-it` and provider **Novita**. There were **no transport retries**. The job clock includes one public endpoint-price lookup and artifact logging; those small components were not separately timed. Actual usage: **43,012 prompt tokens**, **3,487 output tokens**, including **3,352 reasoning tokens**, zero cache-read/cache-write tokens. The long latency is observed endpoint behavior, not proven intrinsic model inference time.

Final output, a single ASCII line:

```text
talk: ff-merged feat/tui (da58dbd) into main, deleted branch; committed c31e624 feat(tui): /stats overlay with slash-command completion; /stats: view stats, session totals, day/week tables; scrollable (arrows, PgUp/PgDn, Home/End); closes via Esc/q; not sent to model; startup hint added; plain mode sends as text; demo verified (completion, scroll, 40x12, log exclusion); bun test 19/19 pass; README/SPEC updated; main 3 ahead origin.
```

**Sane and source-supported on this one job:** correct talk kind, both exact hashes, completed merge/commit, tests, demo and ahead-of-origin state; no obvious invented facts, unrelated context event or invented identifier. It omits explicit "nothing pushed", the session's own-turns-only accounting, dim empty days and the Esc-during-running-turn exception. The full 30-job fabrication/instruction-preservation check has **not** been run; one good smoke is not a quality verdict.

### Projection and hold

Straight-line **30 × this smoke**, with no size/transport retries:

- Cost: **$0.220269456** compactor calls; including the one settings diagnostic, **$0.220281732**, below the **$5/run** cap.
- Sequential time: **8,194.32 s = approximately 2h17m**.
- If the candidate needed the baseline's six extra size calls and each cost/took as much as this smoke, approximately **$0.26434 / 2h44m** instead. These are one-job extrapolations, not guarantees; caching, source sizes, retries and endpoint load can change both.

This first call consumed **273.1 s of the unchanged 300 s per-call timeout**. That leaves only about **27 s headroom**; larger/slower jobs could time out. The saved V4.1 baseline averages **23.7 s/job across all 30 jobs**, and this same baseline job took **30.1 s including a size retry**. The Gemma smoke is therefore approximately **9.1× slower on this job**, despite needing no size retry. It does not presently look like a good latency fit on this endpoint.

**Stopped permanently after the settings diagnostic and one compactor job for this candidate.** ZERO rejected the full run. No provider switch, prompt optimization, timeout change or additional Gemma calls.

### Spend, checks and reproduction

Recorded spend in this output directory/run: **$0.0073545912 / $5**, one settings diagnostic plus one compactor completion. There are no unmetered failed smoke dispatches. Existing endpoint-priced reserves use the live pinned prices and full output/reasoning ceiling plus 10% headroom; unrelated historical runs do not consume this run's budget.

Live Novita pricing: **$0.14/M input, $0.40/M output**, context **262,144**, max completion **131,072**, supports `reasoning` and `include_reasoning`. Sources:

- https://openrouter.ai/api/v1/models/google/gemma-4-31b-it/endpoints
- https://huggingface.co/google/gemma-4-31B-it/raw/main/README.md

Raw request/response bodies, upstream diagnostic and endpoint snapshots: gitignored `dev/probe-out/gemma4-31b/`. The baseline's exact source/context and prompt snapshots are read in place from `dev/probe-out/v41/`, never copied or modified. Shared ledger: `dev/probe-out/spend.jsonl`; this run's entries have `out: "dev/probe-out/gemma4-31b"`.

```bash
# Already executed once; the settings script refuses a second paid dispatch.
OPTCHAT_CLAUDE=/bin/false bun dev/probe-out/gemma4-31b/settings-check.ts
# Historical smoke command only. Candidate rejected; DO NOT resume.
# A repeat would skip completed 555+1 and dispatch an unauthorized next job.
OPTCHAT_CLAUDE=/bin/false bun --preload ./dev/probe-out/gemma4-31b/log-requests.ts dev/compact-probe.ts run \
  --probe 6 --arms GE --jobs 30 --end 1153 --take 1 \
  --out dev/probe-out/gemma4-31b --spend dev/probe-out/spend.jsonl --budget 5
OPTCHAT_CLAUDE=/bin/false bun dev/probe-out/gemma4-31b/validate.ts
OPTCHAT_CLAUDE=/bin/false bun test
```

Checks: **21 tests pass, 0 fail, 159 expect() calls**, including stubbed initial/retry Gemma requests with reasoning enabled, unchanged messages/max_tokens, explicit bf16 pin, foreign-arm rejection, and existing per-run pricing/budget guards. Ignored validation checks all **30 exact historical source/context snapshots**, unchanged prompt hashes, the one smoke's actual request/response and metering, exact source hashes and separately observed non-empty reasoning. No network in tests, no Claude or optchat launch, `~/.optchat` read-only; foreground only. No production/SPEC edits. Smoke report and harness support committed with the rejection verdict; no push.
