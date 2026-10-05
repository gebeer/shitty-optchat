# Compactor probes

Replays of real compaction jobs (30 per run, read-only on the chat) through candidate models on
OpenRouter, to pick the compactor of SPEC §7.1. The probe code (`dev/compact-probe.ts`,
`dev/judge.ts`) and the prompts of the earlier runs (`compact-deepseek*.txt`, `compact-v2.txt`,
`judge.txt`) are not on main: they are kept at the git tag `archive/compact-probe`.

Result: DeepSeek V4.1 Flash, requested effort medium (native low), prompt v2.1, Novita fp8 first
and DeepInfra fp8 as the fallback.

| run | report | verdict |
|---|---|---|
| models, prompt v1 | `compact-models.md`, `compact-deepseek.md`, `compact-deepseek-v41.md` | V4.1 medium on Novita is the baseline |
| Qwen3 235B | `compact-qwen235-v41.md` | rejected: invented a commit hash |
| GLM 5.3 Flash low | `compact-glm53flash-v41.md` | rejected: invented results, imported context |
| Gemma 4 31B | `compact-gemma4-31b-v41.md` | rejected: 273 s per job |
| V4.1 on DeepInfra, v1 | `compact-v41-deepinfra.md` | rejected then: invented details |
| prompt v2 | `compact-v41-prompt-v2.md` | 17 size retries: v2 lost "cut filler" |
| prompt v2.1 | `compact-v41-prompt-v2.1.md` | chosen: 5 retries, 24/25 hashes, 8.0 s and $0.0059 per job |
| Gemini 3.5 Flash Lite, v2.1 | `compact-gemini35fl-v2.1.md` | rejected: invented a push in 5 of 5 merges |
| V4.1 on DeepInfra, v2.1 | `compact-v41-deepinfra-v2.1.md` | fallback: defects like Novita's, $0.0026 per job |
| subscription judge | `judge-calibration.md` | dropped: used up the Claude quota |

`compactor-candidates-research.md` is the web research that picked the candidates.
