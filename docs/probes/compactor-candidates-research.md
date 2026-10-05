# Compactor candidates: cheaper/faster models to beat DeepSeek V4.1 Flash (medium)

Date 2026-10-05 · desk research only, no paid API calls, no probe run · author: research subagent

Evidence quality, up front: **no public benchmark measures "one dense line, hard 512-byte cap, exact identifiers retained, from a 40k-token transcript".** Everything below is a proxy (Vectara HHEM summarization hallucination, AA-LCR long context, AA-Omniscience, vendor family history) plus live OpenRouter catalogue data. Treat the ranking as "which to probe first", not "which is better". Only `dev/compact-probe.ts` can settle fidelity.

## Bottom line

1. **The baseline is not on the cost frontier; it may be on the fidelity frontier.** Its cost is dominated by reasoning tokens (3,291 of 3,444 output tokens/call) and by a pinned, mid-priced provider (`novita/fp8`, $0.24/$0.96). Two of the three levers below keep the same model and weights:
   - Same model, cheaper endpoint: DeepInfra fp8 lists $0.14/$0.42, cache read $0.0042, and shows TTFT 0.8 s and ~90 tok/s p50 over 176k requests. At the baseline token mix that is ~$0.0038/job against ~$0.0073 on Novita, about half, with the same fp8 weights.
   - `{"effort":"low"}` on the same model: roughly another 20-35% off (my estimate; the reasoning-token count is a guess), but a quality drop is unmeasured. V4.1 `off` already needed 1.47 retries/job and 4/30 finals over 512 B.
2. **Best new bets** are `openai/gpt-6-luna` and `openai/gpt-5.4-nano` (see ranking). They are ~2-4x cheaper per job than the baseline and likely 3-6x faster, because they skip the reasoning phase. Whether they beat the baseline on fidelity and length control is unknown. gpt-5.4-nano has the best measured summarization-hallucination score of any cheap model still on OpenRouter (HHEM 3.1%).
3. **Main risk for any non-thinking candidate is the 512 B cap, not hallucination.** V4.1 with reasoning off overshot on 60% of first tries; reasoning medium overshot on 20%. Expect retries to cost 1-2 extra full-context calls per job for non-thinking arms (prompt-cache hits make them cheap, ~$0.001 each at Luna rates).
4. **Do not spend probe budget on:** `google/gemini-2.5-flash-lite` (best old HHEM, 3.3%, but **deprecated 2026-10-20**), `poolside/laguna-s-2.1` (deprecated 2026-10-31), `xiaomi/mimo-v2.6-flash` (AA-Omniscience hallucination 54%), more Qwen/GLM (both families already failed in probes; Qwen3.5-flash HHEM 10.5%).

## Ranked shortlist

Prices are OpenRouter list prices from `GET /api/v1/models` and `/models/{id}/endpoints` fetched 2026-10-05, standard tier, $/M tokens (in / out / cache read). Several models list extra endpoints at roughly half price (flex/batch) or 2-4x price (priority/long-context); the table uses the middle "standard" endpoint. Latency/throughput are OpenRouter's own p50 over the last 30 min (TTFT includes input processing; for reasoning models it includes thinking only if streamed as reasoning chunks).

$/job columns (my arithmetic, one call, no retries):
- **A** = 40k uncached input + 200 output, as specified.
- **B** = baseline token mix: 16.3k uncached + 23k cache read + 200 output. Reasoning tokens are added where a model cannot turn reasoning off; the figures are guesses.
- Baseline recomputed with the same formula: A $0.0129, B $0.0073 (measured $0.0087/job including size retries).

| # | model id | suggested `reasoning` | $/M in / out / cr | $/job A / B | TTFT p50 / tok/s p50 | est. s/job |
|---|---|---|---|---|---|---|
| 1 | `openai/gpt-6-luna` | `{"effort":"none"}` (fallback `"low"`) | 0.10 / 0.50 / 0.01 | 0.0041 / 0.0020 | 2.8 s / 64 (main endpoint, n=553k) | ~6 |
| 2 | `openai/gpt-5.4-nano` | `{"effort":"none"}` (fallback `"low"`) | 0.20 / 1.25 / 0.02 | 0.0083 / 0.0040 | 0.8-1.8 s / 62-98 | ~3-5 |
| 3 | `google/gemini-3.5-flash-lite` | `{"effort":"minimal"}` (reasoning is mandatory, minimal is the floor) | 0.30 / 2.50 / 0.03 | 0.0132 / 0.0068 | 0.5 s / 130 (n=257k) | ~4-5 |
| 4 | `mistralai/mistral-small-2603` | `{"effort":"none"}` | 0.15 / 0.60 / 0.015 | 0.0061 / 0.0029 | 0.5 s / 80 | ~3 |
| 5 | `google/gemma-4-26b-a4b-it` | omit (no reasoning control); pin a fast provider, e.g. Makora (0.2 s / 138 tok/s) or NextBit (0.2 s / 79) | 0.09 / 0.30 / 0.05 | 0.0037 / 0.0027 | 0.2-1.5 s / 29-138 by provider | ~2-8 |
| 6 | `google/gemini-3.1-flash-lite` | `{"effort":"minimal"}` | 0.25 / 1.50 / 0.025 | 0.0107 / 0.0054 | 0.9 s / 111 (n=228k) | ~3-4 |
| 7 | `upstage/solar-pro4` | `{"effort":"none"}` if accepted, else default | 0.09 / 0.36 / 0.018 | 0.0037 / 0.0020 | 0.9-2.1 s / 58 | ~4-6 |
| 8 | `inception/mercury-2.5` (long shot) | `{"effort":"none"}` | 0.04 / 0.15 / 0.004 | 0.0016 / 0.0008 | 0.9 s / 176 | ~2 |

JSON to paste into the probe:

```json
{"model": "openai/gpt-6-luna", "reasoning": {"effort": "none"}}
{"model": "openai/gpt-5.4-nano", "reasoning": {"effort": "none"}}
{"model": "google/gemini-3.5-flash-lite", "reasoning": {"effort": "minimal"}}
{"model": "mistralai/mistral-small-2603", "reasoning": {"effort": "none"}}
{"model": "google/gemma-4-26b-a4b-it"}
{"model": "google/gemini-3.1-flash-lite", "reasoning": {"effort": "minimal"}}
{"model": "upstage/solar-pro4", "reasoning": {"effort": "none"}}
{"model": "inception/mercury-2.5", "reasoning": {"effort": "none"}}
```

Reasoning-effort values come from each model's OpenRouter `reasoning_config` (luna: none/low/medium/high/xhigh/max, default medium and **on**; nano: none/low/medium/high/xhigh, default off; Gemini 3.5/3.1 flash-lite: minimal/low/medium/high, **mandatory**; mistral-small-2603: none/high; mercury-2.5: none/low/medium/high; solar-pro4: `supports reasoning_effort`, exact values not checked). Re-check that `none` is honoured by the routed provider before trusting a result: a silently-ignored `none` on Luna would default to medium reasoning.

### Evidence and risks per candidate

**1. gpt-6-luna.** Released 2026-09-22; ctx 1.05M, max out 128k, structured outputs; OpenAI-first-party endpoint at 99.99% uptime.
- Faithfulness: no HHEM row yet. Family signal is mixed: gpt-5.4-nano 3.1%, gpt-6-sol 6.5%, gpt-6-astra 8.7%, gpt-5.6-sol 12.4%. AA-LCR v1.1 83.3% (vs Gemini 3.5 Flash-Lite 76.0%), AA Intelligence Index 38 at max effort (V4.1 Flash max: 39). AA-Omniscience hallucination rate ~77% means it guesses rather than abstains on *knowledge* questions. That is a different failure from summarization, but "never invent facts" is exactly the failure to watch.
- Length compliance: no data. OpenAI small models are usually good at byte/word caps with reasoning on, weaker with none.
- Risks: day-old model, AA published numbers are at max effort only, ~6 s median TTFT on the cheapest endpoint (the 1.7 s / 111 tok/s endpoint is a pricier tier), OpenRouter lists a $0.125 cache-write price (other pages say OpenAI cache writes are free; check actual billing in the probe's usage ledger), price doubles above 272k ctx (irrelevant at 40k).
- Cache: yes, $0.01/M reads (90% off).

**2. gpt-5.4-nano.** Released 2026-03-17; ctx 400k.
- Faithfulness: Vectara HHEM hallucination **3.1%**, 100% answer rate, avg summary 144 words (second-best of 108 rows; leaderboard updated 2026-09-22). This is the strongest direct summarization-faithfulness number for any cheap model still on OpenRouter.
- Risks: output price $1.25 is 2.5x Luna's; HHEM uses short documents, not 40k-token transcripts; the HHEM summary length (144 words) suggests it is not terse by default, so retries on the 512 B cap are likely; may be superseded by Luna and later retired. Cache: yes, $0.02/M.

**3. gemini-3.5-flash-lite.** Released 2026-07-21; ctx 1M. Priced above the others but fast and conservative.
- Faithfulness: AA-Omniscience hallucination 32-34% with a 65.6% abstain rate (vs Luna 76.7%, MiMo-V2.6-Flash 54.4%). It says "I don't know" rather than inventing, which is the right bias for a compactor. No HHEM row for 3.5; predecessor `gemini-3.1-flash-lite-preview` scored 8.2% (99.6% answer rate).
- Risks: most expensive here per job (B $0.0068, close to baseline $0.0073) because output costs $2.50/M and some reasoning tokens are unavoidable; AA Intelligence Index 22 (low) and AA-LCR 76.0%; cheaper endpoints exist at $0.15/$1.25 (flex/batch tier; semantics not verified). Cache: implicit, $0.03/M reads. Pick this only if speed and abstention matter more than cost.

**4. mistral-small-2603.** Released 2026-03-16; ctx 262k; reasoning optional.
- Faithfulness: no HHEM row for 2603. Family: mistral-small-2501 5.1% (97.9% answer rate), mistral-large-2411 4.5%, mistral-3-large-2512 14.5%. AA-Omniscience hallucination for "Mistral Small 4" is 66.5%, so the model knows little and probably guesses. In-context summarization is a different regime.
- Strength: fast TTFT (0.4-0.5 s), 80-95 tok/s, 100% uptime, first-party. Cache: $0.015/M.
- Risk: weakest long-context story at 40k+ in this list; verify identifiers are retained.

**5. gemma-4-26b-a4b-it.** Released 2026-04-03; ctx 262k; no reasoning control; many providers, so provider choice dominates speed (10-138 tok/s). A sibling of the `gemma-4-31b-it` run currently in flight.
- Faithfulness: HHEM **5.2%** (99.8% answer rate) against 7.4% for gemma-4-31b-it, so the 26B-A4B scores better than the 31B on this metric. Cheap at $0.09/$0.30.
- Risks: if gemma-4-31b fails on length or identifiers, this one probably will too (same family and prompt-following style). Listed cache-read price ($0.05) is more than half the input price, so caching barely helps. Provider quantization varies (Darkbloom/DeepInfra differ); pin one.

**6. gemini-3.1-flash-lite.** Listed 2026-05-07 (preview 2026-03-03); deprecation 2027-05-07 (stable). The previous-generation version of #3.
- Faithfulness: preview HHEM 8.2%; fast and cheaper than 3.5 ($0.25/$1.50). Weaker abstention data. Use it as the cheaper Gemini arm if #3 passes and cost matters.

**7. solar-pro4.** Released 2026-08-10; ctx 524k; Upstage is a grounded-generation vendor.
- Faithfulness: AA-Omniscience hallucination 24.4% (rank 9 of 200 on BenchLM, a secondary source). No HHEM row. Two endpoints, both first-party (TTFT 0.9 s / 2.1 s, 58 tok/s). $0.09/$0.36, cache $0.018.
- Risks: little independent evidence, one vendor, unknown instruction-following on tight byte caps.

**8. mercury-2.5 (long shot).** Diffusion LLM, released 2026-09-08, $0.04/$0.15, 176 tok/s, ctx 260k.
- Faithfulness: predecessor mercury-2 HHEM 12.3% with 149-word summaries (verbose). A diffusion decoder with a hard byte cap is untested; may under- or over-shoot unpredictably. Only worth a probe because it is ~5x cheaper and ~3x faster than anything else.

## Levers on the baseline itself (not new models)

| arm | settings | $/job B | notes |
|---|---|---|---|
| baseline | V4.1 Flash, medium, `novita/fp8` | 0.0073 (measured 0.0087 with retries) | 87 tok/s, TTFT 2.1 s |
| same model, cheaper provider | `{"provider":{"order":["DeepInfra"],"allow_fallbacks":false}}`, medium | ~0.0038 | fp8; TTFT 0.8 s, ~90 tok/s, 99.96% uptime, cache read $0.0042 |
| same model, fastest provider | Together (unknown quant): $0.30/$1.20/cr 0.006, TTFT 0.3 s, **226 tok/s**, n=315k | ~0.0094 | much faster, higher price; BaseTen fp8 ($0.30/$1.20, 217 tok/s) is similar |
| lower reasoning | DeepInfra, `{"effort":"low"}` | ~0.0030 | quality unmeasured; `high` would be slower and dearer than medium |

Other V4 siblings: `deepseek/deepseek-v4-flash-0731` ($0.015-0.14 in depending on provider, DeepInfra $0.06/$0.18, cache $0.015). V4-Pro scored HHEM 8.6%, so V4 is not a clear fidelity leader among small models. HHEM has no V4.1 Flash row yet.

## Considered and not shortlisted

| model | why not |
|---|---|
| `google/gemini-2.5-flash-lite` | HHEM 3.3% and $0.10/$0.40, but deprecation_date 2026-10-20 on OpenRouter |
| `poolside/laguna-s-2.1` / `laguna-xs-2.1` | deprecation 2026-10-31 (s); low evidence |
| `xiaomi/mimo-v2.6-flash` | AA-Omniscience hallucination 54.4%; TTFT 6.2 s on the first-party endpoint (n=326k) |
| `qwen/qwen3.8-flash`, `qwen/qwen3.7-flash` | Qwen already rejected in the 235B probe; Qwen3.5-flash HHEM 10.5%; reasoning on by default; single Alibaba endpoint with cache-write charge ($0.19-0.20/M) |
| `z-ai/glm-5.3-flash` | already rejected; HHEM family: glm-4.7-flash 9.3%, glm-5 10.1% |
| `meta/muse-spark-1.3-contributor` | reasoning mandatory, TTFT 6.2 s; the "contributor" tier is aimed at experimentation; no faithfulness data |
| `ibm-granite/granite-4.2-8b` | 4.0-h-small had HHEM 5.2% but only 8B parameters and two providers; low odds on 40k-token multi-fact lines |
| `anthropic/claude-haiku-4.5` | $1/$5; HHEM 9.8%; ~5x the baseline cost even with cache |
| `minimax/minimax-m2.7`, `stepfun/step-3.7-flash`, `tencent/hy3`, `nex-agi/*` | HHEM 12.9% (minimax), slow TTFT (hy3 3.6 s), little or no faithfulness evidence |
| Vectara leaders `antgroup/finix_s1_32b` (1.8%), Phi-4 (80.7% answer rate) | not on OpenRouter, or too low an answer rate to trust |

## Suggested probe order (cheapest first)

1. DeepInfra-pinned V4.1 Flash medium: same model, ~half the cost. Zero fidelity risk if weights match; only latency and rate-limit behaviour change.
2. `gpt-6-luna` effort `none` and `low`, then `gpt-5.4-nano` `none`.
3. `mistral-small-2603` `none`, `gemini-3.5-flash-lite` `minimal`.
4. `gemma-4-26b-a4b-it` only if `gemma-4-31b-it` passes.
5. `solar-pro4`, `gemini-3.1-flash-lite`, `mercury-2.5` as long shots.

Acceptance bar from the baseline: 30/30 final lines ≤512 B, 25/25 source hashes retained, no invented hashes/test outcomes/imported context, ≤ ~0.2 retries/job (V4.1 off at 1.47/job is the failure pattern to avoid), cost/job below $0.0087.

## Sources

- OpenRouter model catalogue and endpoints API (prices, caching, context, reasoning configs, deprecation dates, p50 latency and throughput from the embedded model-page stats, all fetched 2026-10-05): https://openrouter.ai/api/v1/models · https://openrouter.ai/openai/gpt-6-luna · https://openrouter.ai/deepseek/deepseek-v4.1-flash · https://openrouter.ai/google/gemini-3.5-flash-lite · https://openrouter.ai/mistralai/mistral-small-2603 · https://openrouter.ai/inception/mercury-2.5 · https://openrouter.ai/google/gemma-4-26b-a4b-it
- Vectara hallucination leaderboard (HHEM, updated 2026-09-22): https://github.com/vectara/hallucination-leaderboard · methodology: https://arxiv.org/html/2505.04847v2 · FaithBench: https://arxiv.org/html/2410.13210v1
- AA-Omniscience hallucination rate leaderboard (BenchLM, secondary): https://benchlm.ai/benchmarks/omnisciencehallucinationrate · paper: https://arxiv.org/abs/2511.13029
- Artificial Analysis model pages: https://artificialanalysis.ai/models/gpt-6-luna · https://artificialanalysis.ai/models/gemini-3-5-flash-lite · https://artificialanalysis.ai/models/deepseek-v4-1-flash (charts are JS-rendered; I used the secondary comparisons below for numbers)
- GPT-6 Luna vs Gemini 3.5 Flash-Lite (AA-LCR, Omniscience, cache pricing): https://www.orcarouter.ai/blog/gpt-6-luna-vs-gemini-3-5-flash-lite · https://www.gradually.ai/en/llm-comparison/gpt-6-luna-vs-gemini-3.5-flash-lite/
- DeepSeek V4.1 Flash vs GPT-6 Luna cost comparison: https://benchlm.ai/compare/deepseek-v4-1-flash-vs-gpt-6-luna
- Repo probes for the baseline and rejected arms: `docs/probes/compact-deepseek-v41.md`, `compact-qwen235-v41.md`, `compact-glm53flash-v41.md`

## Caveats

- Vectara HHEM scores short-document summarization; none of its documents resemble a 40k-token transcript with hashes and paths.
- AA-Omniscience measures knowledge hallucination (answering without the source), not faithfulness to supplied text; used only as a weak "does it guess" signal.
- The AA pages I fetched were chart-rendered, so AA numbers (index, AA-LCR, hallucination rate) come from secondary sites (orcarouter, gradually, benchlm, search snippets) and were not cross-checked.
- Throughput/latency are 30-minute p50s for the whole endpoint population (mostly chat-sized prompts), not for 40k-token inputs; real latency with a 40k prefix will be higher on cold cache. `est. s/job` is TTFT + output/tok/s only, no retries.
- Reasoning-token counts for Gemini minimal and Luna low are assumptions, not measurements.
