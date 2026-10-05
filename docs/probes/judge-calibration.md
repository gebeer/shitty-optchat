# Compaction accuracy judge calibration

2026-10-05. **Recommendation: triage only, not a replacement for manual review.**

`dev/judge.ts` reuses `loadJobs()` from the probe, `msgText()`/`flat()` for the exact stretch, and `spawnClaude()`/`baseArgs()` for subscription Sonnet with no tools, safe mode and no session persistence. Neither the probe nor compactor prompts were edited for this work. Historical chat is read-only. No OpenRouter calls or push.

## Runs and retained prompt

The four finished arms are the 30-job historical sample ending at tree record **1153**, reconstructed from `~/.optchat` and checked against each run's `jobs.json` (keys, record indices, stored summaries, levels, context line/byte counts):

| reference report | run directory | arm |
|---|---|---|
| [V4.1 Novita](compact-deepseek-v41.md) | `dev/probe-out/v41` | MED |
| [Qwen235](compact-qwen235-v41.md) | `dev/probe-out/qwen235` | QW |
| [GLM low](compact-glm53flash-v41.md) | `dev/probe-out/glm53` | GL |
| [V4.1 DeepInfra](compact-v41-deepinfra.md) | `dev/probe-out/v41-deepinfra` | DI |

Every call received the **full stretch, full context and final line**, JSON-escaped as untrusted data; no truncation, compactor scale line or retry history. Observed model: **claude-sonnet-5-5**, requested `sonnet`, medium effort. Concurrency **2**. Timings below include spawn, model response and strict JSON validation, not compactor generation/retries.

- Initial prompt: **120/120** valid judgments. Obvious context-import misses justified tuning.
- First tuning: added a source-first provenance/numeric/instruction checklist and warnings against unsupported test/commit-title alarms. All **120 calls attempted**, **117 valid**. Retained as `prompts/judge.txt`.
- Second tuning: clarified quoting and verdict consistency. This pass was **not completed**: the Claude subscription session limit was reached during GL, with reset reported as **8pm Asia/Bangkok**. MED completed; QW had a quotation failure; GL was partial; DI could not run. This candidate was reverted, not presented as a calibrated improvement. No third tuning or alternate billing route.

The retained-prompt failures are **MED 560+4, QW 561+1, GL 566+1**: non-verbatim quotation/schema validation failed. They are **not clean** and remain resumable. Their initial-prompt judgments exist, but were not silently substituted in the retained-prompt metrics. The incomplete second pass likewise is not mixed into this table. Subscription exhaustion is a practical cost of repeatedly supplying full contexts; these are not cheap local checks even though there is no per-call OpenRouter bill.

Raw judgments, usage, fingerprints and failed second-pass attempts stay in the existing gitignored run directories. `judge-<arm>-round0.jsonl` and `judge-<arm>-round1.jsonl` preserve pre-tuning ledgers; the canonical `judge-<arm>.jsonl` is append-only. Select a successful record by **key and input/prompt fingerprint**, not simply its last row. Reverting a prompt reuses matching historical judgments.

## Retained-prompt results

Finding counts below are **lines with at least one finding**, so columns overlap. Code checks cover all 30 finals even when the LLM output failed. Identifiers are lexical novelty candidates, not a semantic rejection verdict.

| arm | valid judgments | clean / minor / fabrication | unsupported | request_as_done | wrong_tag | dropped_user_instruction | size OK | source hashes retained | identifier-candidate lines / named-from-chat lines | seconds/valid line |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MED | 29/30 | 20 / 8 / 1 | 3 | 0 | 1 | 6 | 30/30 | 25/25 | 9 / 4 | 4.4 |
| QW | 29/30 | 14 / 11 / 4 | 9 | 1 | 2 | 7 | 27/30 | 17/25 | 10 / 2 | 5.3 |
| GL | 29/30 | 17 / 8 / 4 | 7 | 1 | 7 | 5 | 28/30 | 23/25 | 9 / 6 | 4.8 |
| DI | 30/30 | 21 / 7 / 2 | 4 | 0 | 3 | 4 | 30/30 | 25/25 | 9 / 1 | 4.4 |

Across **117 valid retained-prompt calls**: **550.2 process-seconds**, mean **4.70 s/line**. Per-arm median/max: MED **3.55/9.58 s**, QW **4.57/12.25 s**, GL **3.85/9.50 s**, DI **3.71/8.47 s**. Concurrency lowers elapsed wall time, not this summed process time. Excludes rejected JSON, quota errors, initial calibration and discarded tuning calls; do not mistake 550 seconds for the total development cost.

Exact code metrics reproduce the reports: QW oversize **552+8, 566+1, 568+8**; GL oversize **544+16, 544+32**; MED/DI none. Hash retention counts distinct **(job, exact source hash)** pairs, including repeated occurrences at different merge levels, not unique commits across the sample. Code flags QW's novel **c38e0a8** at **572+1**, even though it appears nowhere in source/context, and its corrupted **2026-05** date at **566+2**. Context-only hashes are not allowed as names; MED's context-imported **da58dbd** at **544+16** is separately flagged.

### Scope of identifier checks

Exact membership/UTF-8/hash checks are free and deterministic. Extraction recognizes 7–40-character lowercase hexadecimal hashes, rooted paths, filenames, conventional branch/ref paths, PR/issue numbers, dotted numeric/version forms, dates, digit-bearing hyphenated identifiers, CLI flags, and distinctive camelCase/underscore/acronym/call-syntax names. Only the latter name class can be recorded as **named from chat** rather than source-novel.

This is **not an exhaustive proper-noun or identifier parser**. Ordinary capitalized names, arbitrary branch grammars and semantic paraphrases can evade lexical extraction. Dotted numbers are candidates too, not certainly versions. Resolved file/repo names or abbreviated numeric readouts can produce candidate alarms despite acceptable prose. Nine MED lines with candidates do **not** mean nine fabricated summaries. In particular source-less filenames in an echo code excerpt can be resolved correctly from chat even though the requested strict path-membership diagnostic flags them. LLM findings remain necessary for semantic invention, and manual review remains necessary for both false alarms and misses. No claim of “every distinctive token” beyond these explicit lexical classes.

## Comparison with the hand reviews

The Novita arm is a **reference, not a clean ground-truth negative**. Its hand review already documents context leakage, loose technical attribution and instruction loss. Treating all its findings as false positives would hide genuine errors.

For recall-ish comparison, the following fixed report-anchored cases group one hand-described failure family per job. They exclude ordinary non-user detail omissions, clipping with no new factual/instruction error, ASCII and user-first ordering: those are not the four requested LLM finding categories. A case is caught only if a finding addresses that particular error; an unrelated omission on the same job is not credit. Different categories can still catch the same error (unsupported rather than request_as_done). Parsing failures count as not caught.

| arm | report-anchored cases caught | recall-ish | confirmed matching findings / all emitted findings | definite false findings |
|---|---:|---:|---:|---:|
| MED | 4/7 | 57% | at least 4/13 | 1 |
| QW | 13/14 | 93% | at least 13/31 | 2 |
| GL | 9/11 | 82% | at least 9/21 | 2 |
| DI | 7/13 | 54% | at least 7/13 | 0 |
| total | **33/45** | **73%** | **at least 33/78** | **at least 5/78** |

**These are not measured population precision/recall.** Reports are prose, overlapping historical merges are not independent samples, prompt tuning used these same cases, and several new valid instruction omissions were not individually listed by hand. The anchored matches establish a conservative finding-precision floor of **33/78 = 42%**; five definite false findings establish a ceiling of **73/78 = 94%**. Unmatched findings include genuine additional omissions as well as arguable wording alarms, not automatically false positives. A precise 94% precision claim would be unjustified without a blinded, exhaustive labeled dataset.

### MED: seven anchored cases

| job / hand finding | retained judge |
|---|---|
| 560+1: usageTable incorrectly described as shared with CLI | **Caught** technical attribution (and disputes title colour) |
| 564+1: CLI invocation/path/dim styling imported into echo | **Missed**; clean |
| 552+8: edit/test grouped as echo | **Missed that provenance error**; instead finds legitimate conventional-commit/short-reply omissions |
| 544+16: da58dbd imported from context | **Missed by LLM**; deterministic hash novelty catches it; LLM instead notices missing short reply |
| 560+8: echo user aside promoted/imported constraints | **Caught** wrong_tag and unsupported orders |
| 568+8: entire latest push/range user item dropped | **Caught** |
| 512+64: keep aggregate() instruction dropped | **Caught**; also finds missing plain-mode/docs/test/demo requirements |

Additional instruction-preservation findings at **556+4, 552+8, 544+16, 544+32** are supported by their quoted user constraints, not false alarms merely because MED is the reference.

**Definite reference false alarm:** MED **564+4** is given an unsupported finding for “bun test 19 pass/0 fail after hiding empty rows in table()”, while its own reason says the result is supported and “not an error”. It should have emitted no finding. This is **1 false-alarm line / 29 valid reference judgments (3.4%)**. It is also **1/9 flagged reference lines**; this is not an estimate of false-positive rate on a genuinely clean corpus.

### QW: fourteen anchored cases

Caught: **555+1** corrupted `19/1`; **556+2** missing validation/commit/no-push/short-reply constraints; **560+1** invented completed filter/test/demo outcomes; **544+16** missing user instructions; **567+1** imported user/talk/tests/CLI events; **566+2** corrupted date; **572+1** invented hash and clean/ahead state; **560+8** wrong provenance and lost aggregate() constraint; **572+4** entire latest request lost; **576+2** falsely still ahead after successful push; **560+16** latest request lost; **544+32** latest request lost; **512+64** lost range reply and aggregate() constraint.

**Not caught in the retained valid outputs:** **561+1**, invented “grep confirmed imports”, because strict quoting validation rejected the judgment. The initial prompt did catch it; that is not credit for the retained prompt.

**Two definite false findings at 564+1:** claiming the phrase “empty day/week tables show no model calls” falsely implies real tables were emptied, and flagging rounded token values while explicitly saying they are not errors. The source includes both populated real-data and empty-data outputs. These are interpretive/rounding alarms, not fabrications.

### GL: eleven anchored cases

Caught: **555+1** wrong-source substitution; **558+1** imported user task and wrong tags; **564+1** imported tool/sed/CLI event; **567+1** imported tool and pending-commit state; **571+1** imported sed event and new filter behavior in an old SPEC excerpt; **572+1** fake passing tests and unrelated stats; **560+8** promoted echo aside; **572+4** latest request lost; **512+64** latest push/range lost.

Missed: **560+2**, “grep confirmed callers” for a pending grep (clean); **566+1**, invented demo observation/EXITED 0, whose tuned output failed quotation validation. The initial prompt caught 566+1; the discarded partial second tuning caught it too. Neither repairs the retained-output failure.

**Two definite false findings:** **554+2** says 19 pass/0 fail is unsupported, overlooking the same stretch's talk item reporting all 19 tests passed; **555+1** labels omitted contents of a talk-only source as dropped_user_instruction. The latter has genuine wrong-source findings too, so this false finding is not a false-alarm line.

### DI: thirteen anchored cases

Caught: **552+8** lost aggregate()/conventional-on-main constraints; **566+1** invented observed before/after demo state; **560+4** promoted/imported user requirements; **560+8** promoted echo aside; **576+2** imported user push/range event; **544+32** lost one-commit/short-reply constraint; **512+64** lost pushed-range reply instruction.

Missed: **558+1** imported tool event in an echo-only source; **544+16** actual demo echo collapsed under tool; **564+1** CLI invocation/path imported from context; **560+4** specifically the corrupted `selfcheck imports table` readout (other findings on the same job do not earn credit); **567+1** imported actions/uncommitted state; **568+8** aggregate() wording lost (the judge instead finds a plausible new README/SPEC attribution error).

The extra DI **568+8** attribution finding points out that only the SPEC paragraph, not all README/SPEC grep matches, says “empty periods included”. No definite DI false finding was established, but this is not proof of perfect precision.

**Severity is also unreliable:** the retained prompt calls DI **566+1** minor despite finding an invented demo observation. Several imported tool/user events receive wrong_tag without unsupported. Therefore consumers must inspect finding types/fragments, not filter on `verdict === fabrication` alone.

## Usage, resumption and remaining work

```bash
bun dev/judge.ts dev/probe-out/v41 MED --concurrency 2
bun dev/judge.ts dev/probe-out/qwen235 QW --concurrency 2
bun dev/judge.ts dev/probe-out/glm53 GL --concurrency 2
bun dev/judge.ts dev/probe-out/v41-deepinfra DI --concurrency 2

# Free report refresh, no Claude calls, including deterministic checks for unjudged finals:
bun dev/judge.ts dev/probe-out/v41 MED --report
# Also supported: --arms MED,OFF, --chat DIR, --take N, concurrency 1..4.
bun test
```

Each arm gets `judge-<arm>.jsonl` and `judge-<arm>.md`. Successful matching keys skip; changed finals, source/context or prompt require rejudging. Code-only changes refresh checks without a paid/subscription call. Errors remain resumable. Timeouts kill children; subscription-limit errors stop further dispatch (already-running siblings finish). One process owns an output directory; concurrent owners are deliberately unsupported.

**23 tests pass, 0 fail, 207 assertions** in the final workspace, including two judge tests for lexical extraction, byte/hash checks, strict JSON/verbatim quotations, the fake subscription transport, full input preservation, unchanged-key resumption, changed-final invalidation and foreign-history refusal. Existing probe/selfchecks still pass. Concurrent probe changes belong to the other agent and are not part of this commit.

Before anybody relies on the retained judge: rerun the **three failed keys after quota reset**, then run a separate blinded holdout containing known clean leaves, mixed-origin merges and pending commands. Do not tune further on this same sample and then claim general accuracy. The present judge is useful to prioritize review—especially QW inventions, GL context substitution and missing latest push requests—but **clean is not an acceptance certificate**, and the corrupt DI import/readout miss is enough to rule out replacing manual review.
