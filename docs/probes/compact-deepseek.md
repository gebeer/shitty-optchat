# Archived April-V4 compactor probe: model-specific prompt

**Superseded 2026-10-05:** `deepseek/deepseek-v4-flash` is April's V4 Flash 0423, not V4.1. ZERO cancelled this model's planned rounds 1–4 and requested a fresh V4.1 off/medium baseline: [current report](compact-deepseek-v41.md). All recommendations and resume instructions below are historical, not the current plan. The original 11-job A2 report snapshot is retained; its remaining 19 jobs completed before the model correction (30/30 raw results in gitignored `dev/probe-out/baseline/`). No further old-model calls or prompt-tuning rounds will run.

Date 2026-10-05 · 30 real jobs from `~/.optchat` (read-only), replayed in their original order, sequentially per arm · NODE 512 B, TRIES 5 · script `dev/compact-probe.ts`

A0 reuses probe 1's gist-prompt/medium-effort DeepSeek calls; its provider was not recorded. A1/A2 use `compact-deepseek.txt` + `compact-deepseek-step.txt`, with reasoning disabled / medium respectively, pinned to `novita/fp8`, fallbacks disabled. No Claude or optchat was launched. The layout and retries reuse `blocks()`/`step()`/`retry()` from `summarize.ts`; `compact.txt` is unchanged. These are independent replays from stored Sonnet children, not an end-to-end DeepSeek tree.

**Historical snapshot:** A1 was 30/30 and A2 11/30 when this table and quality pass were written. A2 subsequently reached 30/30; the superseding V4.1 report, not an old-model comparison, is now the active task.

## Summary

| arm | model / settings | jobs | overshoot 1st try | final bytes mean / max | final > NODE | retries / job | tokens / call: uncached input / cache read / cache write | output (reasoning) / call | cost / job | ×434 | latency / job mean / max | empty replies | observed provider |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A0 | deepseek/deepseek-v4-flash (gist prompt, medium, any provider (probe 1 arm A)) | 30 | 10% | 294 / 510 | 0 | 0.10 | 21311 / 17886 / 0 | 1150 (1019) | $0.00307 | $1.333 | 45.6 / 149.4 s | 1 | not recorded |
| A1 | deepseek/deepseek-v4-flash (DeepSeek prompt, reasoning off, novita/fp8) | 30 | 43% | 384 / 509 | 0 | 0.50 | 17904 / 21447 / 0 | 140 (0) | $0.00467 | $2.028 | 5.0 / 11.7 s | 0 | Novita |
| A2 | deepseek/deepseek-v4-flash (DeepSeek prompt, medium, novita/fp8) | 11 | 18% | 437 / 512 | 0 | 0.18 | 13701 / 25935 / 0 | 3692 (3559) | $0.00430 | $1.868 | 31.8 / 186.3 s | 0 | Novita |
| stored | claude-sonnet-5-5 (historical claude -p) | 30 | – | 403 / 512 | 0 | – | – | – | subscription | – | – | – | – |

Tokens are means per successful call, including size retries; reasoning is a subset of output, not additional tokens. Cost/job and latency/job include size retries. Failed/interrupted calls are excluded from arm means but remain in the spend ledger when metered. ×434 is the requested illustrative cost/job projection; the historical 434 counts calls including retries, not 434 distinct jobs. A0 routing/cache conditions differ from A1/A2, so this is not a controlled prompt-only comparison.

Errors:

- A0 568+4: empty reply (finish undefined) (a rerun of the job succeeded)

## Jobs side by side

Bytes per try (→ = a size retry), then the final line (the shortest try).

### 555+1 (level 0, tree record 1105, context 381 lines / 128.3 KB)

- **stored (Sonnet, claude -p)** · 371 B: talk: optchat: ff-merged feat/tui into main (da58dbd), branch deleted; /stats overlay committed c31e624 (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text); 19 tests pass, README/SPEC updated; tmux demo verified incl. 40x12; main 3 ahead origin, unpushed; session totals count turns only.
- **A0** · 443 B: talk: /stats done, nothing pushed (main 3 ahead of origin: feat/tui merged+deleted da58dbd; /stats c31e624). `/st` completes only slash commands; Enter opens bordered theme overlay; ↑↓/PgUp/PgDn/Home/End scroll, Esc/q close (mid-turn Esc closes, turn keeps running), 40×12 no crash; model never sees /stats, plain mode sends it; "This session" counts own turns only (summary/priming in day/week); try: restart or dev/demo.sh, then /stats.
- **A1** · 166 B: user: got it; the repo notes are now updated. talk: I'll add those; merge and /stats are done, and I made sure nothing got pushed. The demo is ready when you want it.
- **A2** · 447 B: talk: both parts done; main 3 ahead origin, ff da58dbd, feat/tui deleted; /stats committed c31e624, 19 tests pass; README/SPEC updated. /st slash-only autocomplete; overlay view stats+session totals+day/week tables, dim empty days; arrows/PgUp/PgDn/Home/End scroll; Esc/q closes; never sent to model, Esc during turn keeps running; plain mode sends /stats. Demo checked incl 40x12 and absent from chat log. Restart or dev/tui-demo.sh, type /stats.

### 554+2 (level 1, tree record 1106, context 380 lines / 128.2 KB)

- **stored (Sonnet, claude -p)** · 450 B: echo: bun test 19 pass; git: c31e624 feat(tui): /stats overlay with slash-command completion on main over da58dbd (pi-style TUI) and a5db61d, main 3 ahead origin, unpushed. talk: ff-merged feat/tui into main, branch deleted; /stats overlay (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, not sent to model, plain mode sends text); README/SPEC updated; tmux demo ok incl. 40x12; session totals count turns only.
- **A0** · 411 B: talk: optchat: ff-merged feat/tui into main (da58dbd), branch deleted; /stats overlay committed c31e624: slash-only completion, bordered scrollable panel (view stats(mem), session token totals, usage day/week tables), Esc/q closes, never sent to model (plain mode sends as text); 19 tests pass; README/SPEC updated; tmux demo verified incl. 40x12; main 3 ahead origin, unpushed; session totals count turns only.
- **A1** · 505 B: tool: bun test 19 pass/0 fail (105 expects), committed c31e624 feat(tui): /stats overlay + slash-command completion, over da58dbd feat(tui) and a5db61d feat(import); main 3 ahead origin, unpushed.\ntalk: ff-merged feat/tui to main (da58dbd), branch deleted; /stats overlay in c31e624 (slash-only, bordered scrollable view+session+usage day/week tables, Esc/q closes, never sent to model, plain mode sends text); 19 tests pass, README/SPEC updated, tmux-verified incl 40x12; session totals count turns only.
- **A2** · 513→512 B: echo: bun test 19 pass/0 fail (105 expects, 1119ms); git c31e624 "feat(tui): /stats overlay with slash-command completion" on main, ahead 3 of origin. talk: ff-merged feat/tui into main (da58dbd), deleted branch; /stats overlay committed c31e624 (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text); 19 tests pass, README/SPEC updated; tmux demo verified incl. 40x12; main 3 ahead origin, unpushed; session totals count turns only

### 552+4 (level 2, tree record 1107, context 380 lines / 128.2 KB)

- **stored (Sonnet, claude -p)** · 428 B: talk: overlay works in demo; tool: Bash on optchat main edited README (`/stats` panel: view, session totals, usage tables, Esc/q closes, not sent to model) + SPEC (StatsPanel, plain mode sends text), bun test 19 pass; echo: committed c31e624 "feat(tui): /stats overlay with slash-command completion" (main 3 ahead origin, unpushed); talk: feat/tui ff-merged, branch deleted; demo ok incl. 40x12; session totals count turns only.
- **A0** · 510 B: talk: Overlay ok in demo; docs, commit. tool: edited README (/stats: view+session+usage tables, scroll; Esc/q; not sent to model) + SPEC (StatsPanel, plain sends text, code map); bun test, commit. echo: 19 pass; c31e624 feat(tui): /stats overlay w/ slash completion on main over da58dbd, 3 ahead origin, unpushed. talk: /stats: slash-only autocomplete, bordered scrollable panels (view/session/day/week), Esc/q closes, never to model, plain sends text; tmux demo ok incl 40x12; session totals count turns only.
- **A1** · 617→414 B: tool: Bash edited README.md+SPEC.md (/stats panel, StatsPanel, plain-mode text, Esc/q), bun test; git add -A, commit c31e624 "feat(tui): /stats overlay with slash-command completion"; echo: 19 pass; c31e624 on main over da58dbd+a5db61d, 3 ahead, unpushed; talk: /stats overlay slash-only, bordered scrollable view+session+day/week, Esc/q closes, not sent, plain sends text; README/SPEC updated, tmux demo 40x12 ok.
- **A2** · 466 B: talk: demo OK; commit next. tool: Bash python edit README+SPEC (/stats overlay docs: view+session+usage, Esc/q closes), bun test, git add -A, commit; echo: 19 pass, c31e624 feat(tui): /stats overlay with slash-command completion, main 3 ahead origin, unpushed; talk: feat/tui ff-merged into main, branch deleted; /stats slash-only autocomplete, scrollable overlay (view+session+day/week), not sent to model, plain-mode text; tmux 40x12 OK; session totals=turns only.

### 556+2 (level 1, tree record 1110, context 379 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 443 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day and week tables, in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if none left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply; tool: Bash git status + cat usage.ts + grep table(/aggregate( callers in ~/.claude/optchat (output not yet shown).
- **A0** · 331 B: user: ZERO likes /stats. Hide empty rows (no model calls) in day/week tables in /stats overlay and `optchat stats`; filter at rendering, keep aggregate(). If nothing left, show dim 'no model calls' line. bun test green, check in demo, one conventional commit on main, no push. tool: Bash read usage.ts, grep table/aggregate callers
- **A1** · 316 B: user: hide empty rows (no model calls) in day/week tables for /stats overlay + `optchat stats`, keep aggregate() as is; show dim 'no model calls' if none; bun test green, check demo, one commit on main, no push; tool: Bash read optchat src/usage.ts and grep table/aggregate callers in src/*.ts on main; no edits yet.
- **A2** · 358 B: user: ZERO likes /stats; hide empty (no model calls) rows in day/week tables in /stats overlay + `optchat stats`, share table code, filter at rendering, keep aggregate() as is, if nothing left dim 'no model calls' line, bun test green, check demo, one conventional commit on main, no push; tool: Bash read git status + usage.ts ./table()/aggregate() callers;

### 558+1 (level 0, tree record 1111, context 379 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 216 B: echo: optchat repo main synced state "## main...origin/main [ahead 3]"; read src/usage.ts (aggregate, table(title, rows, dim) shared by cli.ts:27 and tui.ts:85) and callers for hiding empty rows; nothing changed yet.
- **A0** · 1681→143 B: tool: hidden empty rows in table() via filtered, shows dim "no model calls" if none remain; edit applied. echo: bun test 19 pass (uncommitted).
- **A1** · 307 B: tool: Bash read optchat src/usage.ts (table/aggregate) and callers (cli.ts:25-27, tui.ts:212, test l.410); echo: usage.ts l.26-59, KINDS turn/compact/prime, hit ratio, table() header+rows; user wants empty rows (no calls) hidden in /stats+`optchat stats`, "no model calls" dim line if none, keep aggregate()
- **A2** · 508 B: user: hide empty rows (no model calls) in /stats overlay + `optchat stats` day/week tables; filter at render, keep aggregate() as is; if empty, dim "no model calls" line; tool: read src/usage.ts (table() l.52 padEnd/padStart, dim header; aggregate() l.26 days/weeks, legacy=turn, skips bad lines; hit() l.49; KINDS turn/compact/prime), callers cli.ts:25-27 prints day+week, tui.ts:85 usageTable accent, tui.ts:212 overlay, selfcheck.test.ts:410 3d/2w; echo: full source, no edits; main...origin/main ahead 3.

### 560+1 (level 0, tree record 1114, context 380 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 226 B: echo: read optchat code to hide empty rows in /stats: tui.ts usageTable dims zero-call rows (usageTable l.85), openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck aggregation test l.400-420. No edits yet.
- **A0** · 155 B: echo: read src/usage.ts (aggregate/table), tui.ts overlay, cli.ts stats — table() shared; test passes, git ahead 3. Next: filter empty rows in rendering.
- **A1** · 297 B: tool: read src/tui.ts/usage.ts and usage aggregation test for hiding empty rows in /stats and `optchat stats`; found shared table() in usage.ts (cli.ts:27, tui.ts:85); usageTable() styles header accent, periods without calls dim; test covers day/week with zeros; no edits yet; main ahead 3 origin.
- **A2** · 518→368 B: tool: Bash read optchat src/tui.ts, cli.ts, test for hiding empty rows: usageTable() (header muted, empty calls dim) exists; openStats builds View/session/day/week; cli.ts stats raw table() no filter; test day 3 periods, W39/W40, hit 65.0%, isoWeek W53; task: filter empty rows at render in /stats + stats cmd, keep aggregate(), 'no model calls' dim if none, no edits.

### 556+4 (level 2, tree record 1115, context 380 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 508 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day/week tables, in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is); if none left dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply. tool: Bash git status, cat usage.ts, grep callers; echo: main ahead 3 of origin; table(title, rows, dim) shared by cli.ts:27 and tui.ts:85; read tui.ts/test/cli.ts spots; nothing changed yet.
- **A0** · 544→386 B: user: ZERO likes /stats. Change: hide empty rows in day/week tables (/stats overlay + `optchat stats`) by filtering at rendering, keep aggregate() as is; if none left show dim 'no model calls' line. bun test green, check in demo, one conventional commit on main, no push. tool: Bash read usage.ts/callers, tui.ts lines, grep dim/muted, test; echo: repo state unchanged, nothing changed.
- **A1** · 596→438 B: user: hide empty rows (no model calls) in day/week tables in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is); if none left show dim 'no model calls'; bun test green, demo check, one conventional commit on main, no push, short reply; tool: Bash read usage.ts (aggregate+table shared cli.ts:27/tui.ts:85), main ahead 3; tool: Bash sed read tui.ts/selfcheck test/cli.ts spots; no changes yet.
- **A2** · 455 B: user: ZERO likes /stats; hide empty rows (no model calls) in day/week tables, /stats overlay + `optchat stats` (shared table: filter at render, keep aggregate()); empty -> dim 'no model calls'; bun test green, conventional commit, no push; tool: Bash git status + cat usage.ts + grep table(/aggregate( callers; echo: main ahead 3; usage.ts table shared by cli.ts:27/tui.ts:85; tool: Bash sed table callers+test (tui dim, selfcheck l.400-430, cli l.20-30).

### 552+8 (level 3, tree record 1116, context 380 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 512 B: talk: /stats overlay committed c31e624 "feat(tui): /stats overlay with slash-command completion" (README/SPEC updated, bun test 19 pass, demo ok incl. 40x12; feat/tui ff-merged, branch deleted; main 3 ahead origin, unpushed; session totals count turns only). user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats` at render, keep aggregate(); none left: dim 'no model calls'; bun test green, demo check, one commit on main, no push, short reply. tool: read usage.ts/cal
- **A0** · 352 B: talk: /stats overlay demo OK, committed c31e624 (main 3 ahead origin); SPEC/README updated. user: ZERO approves; wants empty model-call rows hidden in day/week tables (shared table() render filter; dim "no model calls" fallback); bun test, demo, one commit, no push. tool: Bash read usage.ts, grep table callers (cli.ts:27, tui.ts:85); nothing changed.
- **A1** · 1024→469 B: tool: Bash read README/SPEC keys spots; talk: overlay works; tool: edited README+SPEC (/stats panel, Esc/q, plain mode), bun test 19 pass; echo: committed c31e624 (main 3 ahead origin); talk: feat/tui ff-merged, branch deleted; demo ok 40x12; user: hide empty rows in day/week tables, shared code, filter at render, dim 'no model calls' if none; bun test green, demo, one commit, no push; tool: read usage.ts+callers; echo: table shared cli.ts:27/tui.ts:85; no changes.
- **A2** · 502 B: talk: committed c31e624 /stats overlay (README/SPEC docs, bun 19 pass); feat/tui ff-merged into main, branch deleted, demo ok. user: ZERO likes /stats; hide empty day/week rows (no model calls) in /stats + `optchat stats` (shared table code; filter at render, keep aggregate()); dim 'no model calls' if none left; bun test green, demo, one conventional commit on main, no push. tool: Bash cat usage.ts, grep table callers; echo: table() shared cli.ts:27/tui.ts:85, main 3 ahead origin; nothing changed.

### 544+16 (level 4, tree record 1117, context 380 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 467 B: tool: Bash tmux demo of /stats overlay (120x30, 40x12) OK: view, session totals, tables, End scroll, q/Esc close, not sent to model; 40x12 table cut. talk: committed c31e624 "feat(tui): /stats overlay" (19 tests, main 3 ahead, unpushed). user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats` at render, keep aggregate(); none left: dim 'no model calls'; bun test green, demo check, one commit on main, no push, short reply.
- **A0** · 468 B: tool: tmux demo of /stats overlay (120x30, 40x12): overlay renders correctly, Esc/q close, mid-turn `/stats` not sent to model; committed c31e624 feat(tui): /stats overlay (slash autocomplete, bordered view/session/day/week tables, Esc/q closes, never sent to model; 19 tests, README/SPEC updated). user: ZERO likes /stats; hide empty day/week rows at render (keep aggregate()); none left: dim 'no model calls'; bun test green, demo check, one commit on main, no push.
- **A1** · 670→481 B: tool: tmux demo /stats (120x30/40x12): View 13 msgs 1%, session 1 turn hit 48.7%, day/week tables, End scrolls (9-34 of 34); q/Esc close; mid-turn "/stats"+Esc not sent (log i0,i13); EXITED 0. talk: /stats committed c31e624 (README/SPEC, bun 19 pass; feat/tui ff-merged, main 3 ahead, unpushed). user: ZERO likes /stats; hide empty day/week rows at render, keep aggregate(); none left: dim 'no model calls'; bun test, demo, one commit, no push; short reply. tool: read usage.ts/cal
- **A2** · 469 B: tool: tmux demo /stats overlay 120x30/40x12; echo: View 13/128KB 1%, session hit 48.7%, day/week tables, End 9-34/34; q/Esc close; mid /stats+Esc not sent (i0,i13); EXITED 0; talk: committed c31e624 /stats overlay, README/SPEC, 19 tests, feat/tui ff-merged, main 3 ahead unpushed; user: ZERO likes /stats; hide empty (no calls) day/week rows in overlay+stats at render, keep aggregate(); else dim 'no model calls'; one commit, no push; tool: read usage.ts/table callers

### 561+1 (level 0, tree record 1121, context 379 lines / 127.3 KB)

- **stored (Sonnet, claude -p)** · 396 B: tool: Bash python edit in optchat (main, uncommitted, output unseen): usage.ts table() now filters rows with no model calls (aggregate() unchanged) and returns dim "<title>: no model calls" if none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls line); selfcheck.test.ts adds assertions (empty days hidden, "day: no model calls"); then greps usage imports in tests/tui.
- **A0** · 121 B: tool: Python edit filtering empty calls rows in usage.ts table, adapting tui.ts styling & test; echo: grep found imports.
- **A1** · 294 B: tool: python edit src/usage.ts: table() filters rows with no calls via KINDS, empty -> dim "title: no model calls"; src/tui.ts usageTable drops per-row dimming (header accent, rows text); selfcheck.test.ts adds expects: hidden empty days + "day: no model calls", grep imports; no tests run yet.
- **A2** · 347 B: tool: Bash python3 heredoc edits optchat src (empty-row hiding): usage.ts table() filters rows with all-zero KINDS calls, returns dim "<title>: no model calls" if none; tui.ts usageTable styles header accent, rows text, "no model calls" dim; selfcheck.test.ts adds asserts (day table hides empty day, fallback line); then grep imports in test/tui.

### 564+1 (level 0, tree record 1123, context 382 lines / 128.2 KB)

- **stored (Sonnet, claude -p)** · 323 B: echo: bun test passed (19 tests, 0 fail, 107 expects) after the empty-row hiding edit; `optchat stats` on real data shows only non-empty days (2026-10-04: turn 11/compact 110/prime 11, hit 90.1%; 2026-10-05: 4/303/8, hit 77.7%) and weeks W40/W41; with empty data dir prints "day: no model calls" and "week: no model calls".
- **A0** · 207 B: tool: edited selfcheck.test.ts to import table; bun test 19 pass; stats on real data shows only rows with model calls (W40/W41, Oct 4-5); on empty dir shows dim "day: no model calls" / "week: no model calls"
- **A1** · 370 B: echo: bun test 19 pass (107 expects); real `optchat stats`: days 2026-10-04 (turn 11, compact 110, prime 11, in 4,328, read 8,497,674, write 930,584, out 74,897, hit 90.1%) + 10-05 (turn 4, compact 303, prime 8, in 342,349, read 20,017,373, write 5,412,788, out 129,924, hit 77.7%); weeks W40/W41 same rows; empty dir prints "day: no model calls"/"week: no model calls".
- **A2** · 376 B: echo: bun test 19 pass/0 fail (107 expects, 1084ms); `optchat stats` shows non-empty rows only: 2026-10-04/W40 turn 11 compact 110 prime 11, in 4,328 read 8,497,674 write 930,584 out 74,897 hit 90.1%; 10-05/W41 turn 4 compact 303 prime 8, in 342,349 read 20,017,373 write 5,412,788 out 129,924 hit 77.7%; empty dir /tmp/nonexist -> 'day: no model calls'/'week: no model calls'

### 560+2 (level 1, tree record 1125, context 377 lines / 127.3 KB)

- **stored (Sonnet, claude -p)** · 440 B: echo: read optchat code to hide empty rows in /stats (user: hide no-call rows in day/week tables, overlay and `optchat stats`, filter at render, keep aggregate()): tui.ts usageTable, cli.ts stats, selfcheck test l.400-420; tool: Bash python edit (main, uncommitted, output unseen): usage.ts table() filters empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; selfcheck adds assertions; then greps usage imports.
- **A0** · 228 B: Hid empty rows in /stats overlay and `optchat stats`: table() now filters zero-call rows, aggregate() unchanged; tui.ts usageTable simplified, tests assert empty days hidden. Implemented via Bash python edit (main, uncommitted).
- **A1** · 329 B: tool: read optchat src/usage.ts table()/callers tui.ts:85+cli.ts:27, test l.400-420, for hiding zero rows; tool: python edit (uncommitted): usage.ts table() filters no-call rows, returns dim "<title>: no model calls", tui.ts usageTable simplified, selfcheck asserts empty days hidden/"day: no model calls", grepped usage imports;
- **A2**: no result

### 566+1 (level 0, tree record 1126, context 381 lines / 128.1 KB)

- **stored (Sonnet, claude -p)** · 331 B: tool: Bash tmux demo (octui, 120x40, dev/tui-demo.sh) to check /stats overlay with hidden empty rows: opens /stats on empty chat, closes with q, sends "first message", reopens /stats after the turn, greps "no model calls"/"2026-10-05" rows with colours, Esc, Ctrl-D, checks EXITED, kills session; output not yet shown, uncommitted.
- **A0** · 141 B: tool: Bash tested /stats overlay in tmux demo: empty (shows "no model calls"), after turn shows day/week tables with non-zero rows; EXITED 0.
- **A1** · 281 B: tool: Bash tmux demo (120x40, dev/tui-demo.sh): before turn "/stats" overlay shows dim "day: no model calls"/"week: no model calls"; after "first message" turn shows 2026-10-05 row (turn 1, compact 1, prime 2); Escape/Ctrl-D EXITED 0; session killed; doc grep pending; uncommitted.
- **A2**: no result

### 560+4 (level 2, tree record 1127, context 378 lines / 127.5 KB)

- **stored (Sonnet, claude -p)** · 382 B: echo: read optchat code to hide empty rows (user: hide no-call rows in day/week tables, overlay + `optchat stats`, keep aggregate()); tool: Bash python edit (main, uncommitted): usage.ts table() filters empty rows, dim "<title>: no model calls"; tui.ts usageTable simplified; test assertions added; tool: sed test import +table, bun test, `stats` on real/empty data (output unseen).
- **A0** · 486 B: user: hide empty rows (no model calls) in day/week tables in /stats overlay and `optchat stats`, filter at render, keep aggregate(); dim 'no model calls' if nothing left; commit. echo: read usage.ts table(), tui.ts usageTable, selfcheck test. tool: edited usage.ts (table() filters zero-call rows, dims if none), tui.ts (usageTable simplified), selfcheck (imports table, asserts empty rows hidden). echo: bun test 19/19, CLI stats real non-zero only, empty dim 'no model calls'. commit.
- **A1** · 547→337 B: user: hide no-call rows in day/week tables, /stats + `optchat stats`, render filter, keep aggregate(); tool: read usageTable/cli stats/test; Bash edit (uncommitted) usage.ts filters empty, dim "no model calls"; tui.ts simplified; test adds asserts; echo: imports selfcheck:11, tui:14; Bash sed adds table, ran test+stats real/empty dirs.
- **A2**: no result

### 567+1 (level 0, tree record 1132, context 379 lines / 127.7 KB)

- **stored (Sonnet, claude -p)** · 300 B: echo: tmux demo of /stats overlay with empty rows hidden (uncommitted): empty chat shows "day: no model calls" and "week: no model calls", "no turns yet"; after one turn only the 2026-10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.
- **A0** · 430 B: echo: /stats overlay demo (empty→after turn): empty chat shows "View: 0 messages", "no turns yet", "day/week: no model calls" (empty rows hidden); after "first message" turn, overlay shows 13 msgs, view 0.9/128KB (1%), 1 turn, input 4, cache read 6,851, write 7,205, output 324, hit 48.7%; day/week tables show only 2026-10-05/W41 (1 turn, 1 compact, 2 prime, 12 in, 13,702 read, 28,112 write, 696 out, 32.8% hit); Esc/q closes.
- **A1** · 442 B: echo: tmux demo /stats overlay: empty chat shows "day: no model calls"/"week: no model calls", "0 messages"/"no turns yet", faint colours, Esc/q closes; after "first message" turn: 13 messages, view 0.9/128 KB (1%) all summarized, session 1 turn (4 in/6851 read/7205 write/324 out, hit 48.7%), day table only 2026-10-05 (1 turn/1 compact/2 prime, 12 in/13702 read/28112 write/696 out, hit 32.8%), W41 same; EXITED 0 after Ctrl-D; uncommitted.
- **A2**: no result

### 566+2 (level 1, tree record 1133, context 378 lines / 127.4 KB)

- **stored (Sonnet, claude -p)** · 420 B: tool: Bash tmux demo (octui, 120x40, dev/tui-demo.sh) of /stats overlay with empty rows hidden: opened /stats on empty chat, q, "first message", reopened, Esc, Ctrl-D, session killed; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; EXITED 0; change uncommitted.
- **A0** · 184 B: tool: tmux demo /stats overlay with hidden empty rows: empty chat → "day: week: no model calls" & "no turns yet"; after turn → only 2026-10-05/W41 rows visible; Esc/Ctrl-D exit ok.
- **A1** · 362 B: tool: tmux demo /stats overlay hidden-empty-rows (uncommitted): empty chat shows dim "day: no model calls"/"week: no model calls", "no turns yet"; after turn only 2026-10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) + 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0; echo: overlay verified, empty rows hidden, tables show only active dates/weeks.
- **A2**: no result

### 571+1 (level 0, tree record 1134, context 381 lines / 128.0 KB)

- **stored (Sonnet, claude -p)** · 456 B: echo: optchat SPEC.md l.566-572 (read-only, hiding-empty-rows task, still states old behaviour): `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days and 8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); only header dim on tty; no costs/charts; `optchat browse [out.html]` starts. Needs update.
- **A0** · 283 B: echo: SPEC.md §stats: optchat stats reads usage.jsonl, prints 14 local days & 8 ISO weeks (incl empty) as dim-header tables: calls turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write). Also: view (read-only view), browse [out.html] (self-contained HTML).
- **A1** · 268 B: echo: SPEC.md l.566-572 read; also grep README:40 `optchat stats` row and SPEC:568 stats paragraph - both say 14 days/8 weeks with "empty periods included", need update to mention empty rows are now hidden; no edits yet; for empty-row hiding docs on main, uncommitted.
- **A2**: no result

### 564+4 (level 2, tree record 1136, context 376 lines / 126.8 KB)

- **stored (Sonnet, claude -p)** · 455 B: echo: bun test passed (19 tests, 107 expects) after hiding empty rows; `optchat stats` real data shows only non-empty days/weeks (10-04 turn 11/compact 110/prime 11, hit 90.1%; 10-05 4/303/8, 77.7%); empty dir prints "day: no model calls"/"week: no model calls". tool: Bash tmux demo /stats overlay (120x40): empty chat shows no-calls lines, "no turns yet"; after one turn only 2026-10-05 row (1/1/2, hit 32.8%) and W41; Esc, Ctrl-D EXITED 0; uncommitted.
- **A0** · 293 B: echo: tests pass (19/0/107), `optchat stats` now hides empty rows: shows only 2026-10-04 (turn 11/compact 110/prime 11, 90.1%) and 2026-10-05 (4/303/8, 77.7%); empty dir prints dim "day: no model calls" / "week: no model calls". talk: starts tmux demo of /stats overlay with empty rows hidden.
- **A1** · 658→567→532→509 B: echo: bun test 19/0 after empty-row hiding; `optchat stats` shows only non-empty days (10-04: turn 11/compact 110/prime 11, hit 90.1%; 10-05: 4/303/8, hit 77.7%) + W40/W41; empty dir: "day: no model calls"/"week: no model calls". tool: tmux demo (120x40) of /stats w/ empty rows hidden: opened on empty chat, q, reopened after "first message", Esc/Ctrl-D, EXITED 0; echo: empty chat: "day: no model calls", "week: no model calls", "no turns yet"; after 1 turn only 10-05 row (1/1/2, 32.8%) + W41; uncommitted.
- **A2**: no result

### 570+2 (level 1, tree record 1137, context 380 lines / 127.9 KB)

- **stored (Sonnet, claude -p)** · 389 B: tool: Bash `sed -n 566,572p SPEC.md` in optchat (read-only, hide-empty-rows task); echo: SPEC l.566-572 still states old behaviour: `optchat stats` reads usage.jsonl, two plain tables, last 14 local days/8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit; header dim only on tty; no costs/charts; needs update.
- **A0** · 213 B: echo: read SPEC.md l.566-572 (`optchat stats` docs: two tables, 14 days/8 weeks, "empty periods included", cols calls/input/read/write/output/hit); must update to "empty rows hidden, dim `no model calls` if none".
- **A1** · 446 B: tool: sed 566-572 SPEC.md (hiding-empty-rows, read-only): `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days/8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); header dim on tty; no costs/charts; `optchat browse [out.html]` starts; still states old empty-row behaviour, needs update.
- **A2**: no result

### 572+1 (level 0, tree record 1138, context 380 lines / 127.9 KB)

- **stored (Sonnet, claude -p)** · 381 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in `table()`, aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; output not yet shown.
- **A0** · 191 B: tool: Python update SPEC.md/README.md to hide empty periods in usage tables (`table()` drops them, `aggregate()` unchanged), test 19/19, commit "feat(stats): hide periods without model calls"
- **A1** · 499 B: tool: Bash python edited SPEC.md ("empty periods included" → "Periods without model calls are hidden at rendering (`table()`; `aggregate()` keeps them); one dim `day: no model calls`/`week: no model calls` line if none left, in /stats overlay too") + README.md stats row; then bun test; echo: 19 pass 0 fail 107 expects; git add+commit "feat(stats): hide periods without model calls in usage tables" (table() drops empty rows, shows dim `<title>: no model calls`); git log/status output not shown.
- **A2**: no result

### 568+4 (level 2, tree record 1139, context 379 lines / 127.7 KB)

- **stored (Sonnet, claude -p)** · 372 B: tool: Bash grep of README.md/SPEC.md for "14 days\|ISO week\|dim header\|periods without" (hide-empty-rows task, optchat); echo: README l.40 stats row "per day (last 14 days) and per ISO week (last 8)", SPEC l.494 header, l.568 stats paragraph; tool: Bash sed SPEC l.566-572 (read-only); echo: still says "empty periods included", old behaviour, needs update; nothing edited.
- **A0** · 107 B: tool: grep stats doc locations; echo: README.md:40, SPEC.md:494/568 show old "empty periods included" text.
- **A1** · 519→389 B: tool: Bash grep README/SPEC for stats docs to update; echo: README.md:40\| `optchat stats` prints usage/day(14d)+week(8 ISO); SPEC.md:568 empty periods included, needs change. tool: Bash sed SPEC l.566-572 read-only; echo: still old: usage.jsonl, 14 days/8 weeks oldest first, empty periods incl; cols/kind turn/compact/prime input/cache r+w/output/hit; header dim on tty; no costs; update.
- **A2**: no result

### 572+2 (level 1, tree record 1140, context 381 lines / 128.2 KB)

- **stored (Sonnet, claude -p)** · 378 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): edited SPEC.md (table() hides periods without model calls, aggregate() unchanged; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; bun test 19 pass (107 expects); committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; main 4 ahead of origin, unpushed.
- **A0** · 134 B: echo: committed fecfd07 "feat(stats): hide periods without model calls" after editing SPEC/README, bun test 19/107 pass, main ahead 4.
- **A1** · 298 B: tool: Bash python edited SPEC.md (table() hides no-call periods, aggregate() keeps them; dim "day/week: no model calls", /stats too) + README stats row; bun test 19 pass 0 fail (107 expects); committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; main ahead 4, unpushed.
- **A2**: no result

### 560+8 (level 3, tree record 1141, context 375 lines / 126.7 KB)

- **stored (Sonnet, claude -p)** · 511 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), "no model calls" dim line if none; tool: Bash python edit on main (uncommitted): usage.ts table() filters empty rows, tui.ts usageTable simplified, test assertions; echo: bun test 19 pass (107 expects); stats real data shows only non-empty days/weeks (10-04 11/110/11, 90.1%; 10-05 4/303/8), empty dir prints "day/week: no model calls"; tmux demo overlay checked (1 turn: only 10-05 row, W41), Esc/Ctrl-D exit 0; not
- **A0** · 300 B: echo: user wanted empty-call rows hidden in day/week tables (overlay + CLI). Edited usage.ts filter, test import +table, bun test 19/107; CLI shows non-empty only, empty dir shows dim "no model calls". Demo /stats overlay verified: empty→no-calls line, after turn→only populated row. Uncommitted.
- **A1** · 611→420 B: user: hide empty rows in day/week tables, overlay + `optchat stats`, keep aggregate(), dim 'no model calls' if empty; tool: edit usage.ts table() filter, tui.ts simplify, test asserts; tool: sed, bun test, stats real/empty; echo: 19 pass/107; stats only 10-04 (11/110/11, 90.1%)/10-05 (4/303/8, 77.7%), empty day/week no-calls; tool: tmux demo 120x40, after 1 turn only 10-05 row + W41; Esc/Ctrl-D EXITED 0; uncommitted.
- **A2**: no result

### 574+1 (level 0, tree record 1142, context 381 lines / 128.2 KB)

- **stored (Sonnet, claude -p)** · 331 B: talk: hid empty (no model call) rows in day/week tables, in `/stats` overlay and `optchat stats`; `table()` filters, aggregate() unchanged; dim "day:/week: no model calls" line if none left (prefix added by talk); bun test 19 pass; demo+real log checked; README/SPEC updated; committed fecfd07 on main, unpushed, 4 ahead of origin.
- **A0** · 382 B: talk: usage tables hide empty rows (day/week) in /stats overlay + `optchat stats`; table() filters zero-call rows, aggregate() unchanged; dim "day: no model calls"/"week: no model calls" if none left; committed fecfd07 (main, 4 ahead origin, not pushed); 19 tests pass, real log shows only 2026-10-04/05 + W40/W41, empty data dir shows dim lines, demo verified; README/SPEC updated.
- **A1** · 448 B: talk: day/week tables now hide rows with no model calls, in /stats overlay and `optchat stats`; committed fecfd07 on main, not pushed, main 4 ahead origin; table() filters, aggregate() unchanged; empty -> dim "day:/week: no model calls" (prefix added, stats has no section titles); bun test 19 pass + 2 new checks; real log shows only 2026-10-04/05 + W40/W41; demo: dim lines before first turn, single 2026-10-05/W41 row after; README/SPEC updated.
- **A2**: no result

### 572+4 (level 2, tree record 1146, context 381 lines / 128.0 KB)

- **stored (Sonnet, claude -p)** · 475 B: tool: Bash in ~/.claude/optchat (main): edited SPEC.md + README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead of origin, unpushed. talk: table() hides empty day/week rows (aggregate() unchanged), in /stats overlay and `optchat stats`; dim "day:/week: no model calls" if none left; demo checked. user: ZERO tested TUI, likes it; asks to `git push origin main`, then reply with the pushed range.
- **A0** · 223 B: echo: feat(stats): hide empty rows in usage tables (fecfd07), 19 tests, main 4 ahead of origin, unpushed. user: ZERO tested TUI, likes it. Please push main to origin (git push origin main), then reply with the pushed range.
- **A1** · 530→424 B: tool: Bash edited SPEC.md+README.md stats rows (table() hides periods w/o model calls, aggregate() unchanged; dim "no model calls" line); bun test 19 pass (107 expects); committed fecfd07 "feat(stats): hide periods..." on main, 4 ahead origin, unpushed. talk: hid empty rows in day/week tables in /stats + `optchat stats`; README/SPEC updated. user: ZERO likes TUI; push main (git push origin main), reply with pushed range.
- **A2**: no result

### 568+8 (level 3, tree record 1148, context 380 lines / 127.5 KB)

- **stored (Sonnet, claude -p)** · 484 B: tool: Bash grep README/SPEC for stats wording (README l.40 "14 days/8 ISO weeks", SPEC l.494, l.568 "empty periods included", stale); tool: edited SPEC.md+README.md, bun test 19 pass, committed fecfd07 "feat(stats): hide periods without model calls in usage tables" (main 4 ahead, unpushed). talk: table() hides empty rows (aggregate() unchanged), in /stats and `optchat stats`; dim "no model calls" if none; user: ZERO likes TUI; asks `git push origin main`, reply with pushed range.
- **A0** · 225 B: tool: Bash grep found stale "empty periods included" in SPEC.md; echo: committed fecfd07 on main (4 ahead), table() hides empty rows, dim "no model calls" line; user: ZERO tested TUI, "push main, then reply with pushed range"
- **A1** · 542→355 B: tool: grep README/SPEC stats docs, sed SPEC l.566-572; echo: README:40, SPEC l.494/l.568 "empty periods included"; tool: edited SPEC+README, bun test 19 pass, commit fecfd07 "hide periods without model calls"; talk: table() hides empty rows, dim "no model calls" fallback, overlay+CLI, demo ok; user: ZERO likes TUI; push origin main + reply pushed range.
- **A2**: no result

### 576+2 (level 1, tree record 1150, context 380 lines / 127.7 KB)

- **stored (Sonnet, claude -p)** · 348 B: tool: Bash in ~/.claude/optchat on main (user ZERO asked to push): git status, log origin/main..main, `git push origin main`; echo: pushed 955394f..fecfd07 to github.com/gebeer/shitty-optchat, 4 commits: a5db61d incremental OptMem import, da58dbd pi-tui TUI, c31e624 /stats overlay, fecfd07 hide empty usage rows; main now in sync with origin/main.
- **A0** · 283 B: tool: Pushed optchat main to origin (4 commits: fecfd07 feat(stats): hide empty rows in usage tables, c31e624 feat(tui): /stats overlay, da58dbd feat(tui): pi-style TUI, a5db61d feat(import): append OptMem notes). echo: Success; main synced with github.com/gebeer/shitty-optchat.git.
- **A1** · 286 B: tool: Bash optchat pushed main to origin github.com/gebeer/shitty-optchat: `git push origin main` -> 955394f..fecfd07; range includes a5db61d feat(import), da58dbd feat(tui), c31e624 feat(tui):/stats, fecfd07 feat(stats): hide empty rows; git status clean, main synced with origin/main.
- **A2**: no result

### 560+16 (level 4, tree record 1151, context 378 lines / 127.0 KB)

- **stored (Sonnet, claude -p)** · 457 B: user: ZERO wants no-call rows hidden in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: python edit usage.ts table() filter, tui.ts, tests; echo: bun test 19 pass; real data only non-empty rows (10-04, 10-05), empty dir prints "day/week: no model calls"; tmux demo ok; docs edited; committed fecfd07 (main 4 ahead, unpushed). user: ZERO likes TUI; asks `git push origin main`, reply with pushed range.
- **A0** · 531→343 B: user: hide empty rows in /stats+`optchat stats` tables, keep aggregate(), dim "no model calls" line; tool: edit usage.ts table() filter, tui.ts simplify, test; echo: 19 pass, only non-empty (10-04 11/110/11 90.1%); tool: grep stale docs, edit, commit fecfd07; talk: ZERO asks push; user: git push origin main; talk: pushed, replied with range.
- **A1** · 521→427 B: user: hide no-call rows in /stats + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edit usage.ts table() filters, tui.ts simplified, tests; echo: bun test 19 pass, stats only non-empty (10-04 11/110/11 90.1%, 10-05 4/303/8), tmux demo ok; tool: edit README/SPEC, commit fecfd07; talk: table() filters, aggregate() unchanged; user: ZERO likes TUI, asks push origin main, reply with range.
- **A2**: no result

### 544+32 (level 5, tree record 1152, context 378 lines / 127.0 KB)

- **stored (Sonnet, claude -p)** · 394 B: user: ZERO likes /stats and wants no-call day/week rows hidden in overlay and `optchat stats` (keep aggregate(); dim "no model calls" if none); then likes TUI, asks `git push origin main`, reply with pushed range; tool: tmux demo /stats OK (120x30, 40x12); edited usage.ts/tui.ts/tests, bun test 19 pass; talk: committed c31e624 /stats overlay, fecfd07 hide empty rows (main 4 ahead, unpushed).
- **A0** · 457 B: user: ZERO wants no-call rows hidden in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: python edit usage.ts table() filter, tui.ts, tests; echo: bun test 19 pass; real data only non-empty rows (10-04, 10-05), empty dir prints "day/week: no model calls"; tmux demo ok; docs edited; committed fecfd07 (main 4 ahead, unpushed). user: ZERO likes TUI; asks `git push origin main`, reply with pushed range.
- **A1** · 526→453 B: tool: tmux demo /stats overlay (120x30, 40x12) ok: view/session/tables, End scroll, q/Esc close, not sent to model. talk: committed c31e624 "/stats overlay" (19 tests, main 3 ahead). user: hide empty day/week rows in overlay+`optchat stats` at render, keep aggregate(), dim "no model calls"; tool: edited usage.ts table(), tui.ts, tests; echo: 19 pass, real non-empty only, empty dims no-calls; tmux ok; docs updated; committed fecfd07. user: push main.
- **A2**: no result

### 512+64 (level 6, tree record 1153, context 378 lines / 127.0 KB)

- **stored (Sonnet, claude -p)** · 448 B: user: ZERO approved feat/tui: ff-merge to main, delete branch, no push; add TUI /stats (slash autocomplete, overlay day/week+stats(mem)+session totals, Esc/q, not sent to model). tool: ff-merged da58dbd, /stats built, demo OK (120x30, 40x12), 19 tests; talk: c31e624. user: hide no-call day/week rows (aggregate() kept, dim "no model calls"); talk: fecfd07. user: likes TUI, asks `git push origin main`, reply pushed range (main 4 ahead, unpushed).
- **A0** · 404 B: user: ZERO approved feat/tui: ff-merge to main, delete branch; add /stats overlay (day/week usage, session totals, Esc/q, not sent). Later likes /stats, wants no-call rows hidden; then asks push origin main. tool: Ctrl-O expand; slash-complete /stats; hide empty rows; tmux demo OK (120x30,40x12). echo: ff-merged, branch deleted; committed c31e624, fecfd07; bun test 19 pass. talk: main 4 ahead, pushed.
- **A1** · 854→483 B: tool: Ctrl-O expands tool boxes (hint, README, SPEC), 19 tests; squashed da58dbd. user: ff-merge to main, no push, del branch; add /stats (slash autocomplete, overlay usage/stats(mem)/session, Esc/q, not sent); README/SPEC/tests/demo, one commit. echo: merged, branch del; /stats uncommitted, tests pass. user: hide no-call rows in /stats+`optchat stats` (keep aggregate; dim "no model calls"); push main. tool: tmux OK; edits, 19 tests. talk: commits c31e624, fecfd07; main 4 ahead.
- **A2**: no result

## Verdict

The prompt buys more detail, not yet reliable memory. A1 averages **384 B** (75% of NODE, versus A0's 58%), **5.0 s/job**, **$0.00467/job** ($2.03 for the requested ×434 projection). It is about 9× faster than A0, but costs 52% more and overshoots on **13/30** first tries, requiring **15** extra calls. The new prompt therefore misses its retry-cost goal. A1 also invents a user utterance, imports outcomes from outside the stretch, and emits a multiline result. Do not ship this prompt as the default compactor.

A2's **11 completed jobs** average **437 B**, **31.8 s/job**, **$0.00430/job**, with **2/11** first-try overshoots. This is not a 30-job result or a verdict on high-level merges: A2 has not reached either disputed push merge. Medium fixes A1's egregious 555+1 corruption in the observed sample, but still mixes context/user/tool facts into echo-only stretches.

### Like-for-like subset

Only the first 11 jobs have all three arms. Compare these, not A1's full-job mean against A2's early-job mean:

| arm | jobs | final mean B | overshoot | retries/job | mean latency/job | cost/job |
|---|---|---|---|---|---|---|
| A0 | 11 | 321 | 2/11 | 0.18 | 50.2 s | $0.00334 |
| A1 | 11 | 369 | 4/11 | 0.36 | 4.5 s | $0.00432 |
| A2 | 11 | 437 | 2/11 | 0.18 | 31.8 s | $0.00430 |

Cache warmth and provider routing still prevent clean attribution. A2's largest job latency, 186.3 s at 552+4, dominates this small sample; no provider-speed conclusion should rest on that one call.

## The "pushed" check

**No later-message leakage; no replay fix was needed.** `loadJobs()` may reconstruct a root through later messages because earlier tree records already touched them. The actual model context nevertheless comes from `makeJob()`, which calls `context(mem, (i+1)*2^l)` for merges. `context()` includes only view parts ending at or before that limit.

For both **560+16** (tree record 1151) and **512+64** (1153):

- The exclusive limit is **576**, and the context ends with raw message **575**, the user's request to push main and return the range.
- Message **574** says fecfd07 is committed, **unpushed**, main four ahead. The two source child lines also say unpushed/request to push; neither contains a successful push.
- The push command is message **576**, its successful output/range **955394f..fecfd07** is **577**, and the reply confirming it is **578**. None is in either model context.
- Earlier context mentions pushes in unrelated repos; those are not this event. Resolving names from context does not license inventing this outcome.

A0 560+16 is especially diagnostic: its first 531-B answer correctly says unpushed/request, but the size retry introduces "pushed, replied with range". A0 512+64 invents "pushed" on its first try. These are genuine fidelity errors, not a replay artifact. A1's completed versions keep the push as a request; A2 has no result yet. This confirms, rather than retracts, the finding in `compact-models.md`.

The audit's raw rebuilt jobs and messages stay in `/tmp/compact-probe2/`. `dev/compact-probe.test.ts` leaves a synthetic regression check: later leaves are already committed, yet an earlier merge sees only its first two leaves. It also checks zero-budget rejection before any network call and rejects probe-1/Claude arms in probe 2, using a throwing fetch stub and `/bin/false`.

## Quality pass

Reviewed all 30 completed A0/A1 jobs and the 11 available A2 jobs against the exact step source (whole message or stored child lines), not merely against Sonnet's output. This is one replay of one task-heavy chat, not a repeated-trial quality benchmark. Parent replays consume stored Sonnet children; they do not measure errors accumulating through a DeepSeek-only tree.

### Identifiers and user's words

- A simple exact hash check finds **20/25** retained job/hash pairs in A0 and **23/25** in A1. The denominator counts each hash once per source job, so repeated merges count again; it is not 25 distinct commits. A2 has **7/10** in its completed subset. On that same subset A0 and A1 each retain 8/10. These checks cover hashes, not every kind of identifier.
- A1 restores the actual pushed range **955394f..fecfd07** in 576+2, which A0 omits; keeps c31e624 in 544+32 and da58dbd in 512+64. Its corrupted 555+1 loses both hashes. A2 drops a5db61d in 554+2 and a5db61d/da58dbd in 552+4.
- A1 keeps `aggregate()`, shared render filtering, "no model calls", and the requested push/range in most relevant merges. 544+32 and 512+64 reduce the final request to "push main", losing the requested reply with the range; 544+32 also drops the explicit four-ahead/unpushed state.
- User-first ordering is inconsistent. For actual `user:` items in the source, A0 is not user-first at 552+8/572+4; A1 at 552+8/572+4/544+32/512+64; A2 at 552+8. The prompt itself conflicts: priority rule 3 says user's words first, whereas kind rule 5 says keep the lines' tag order. Resolve that contradiction before blaming only the model.

### Source fidelity and kind tags

Known defects, with concrete counterexamples:

| job | A0 | A1 | A2, where available |
|---|---|---|---|
| 555+1 (talk only) | wrong demo filename `dev/demo.sh` | invents `user: got it; the repo notes are now updated` and a conversational `I'll add those`; drops nearly all detail | faithful talk summary, hashes retained |
| 554+2 | drops echo provenance | relabels echo as tool; contains an actual newline despite the one-line instruction | correct echo/talk, but drops a5db61d |
| 558+1 (echoed old source) | says edits applied and tests passed although source is only a readout | adds a tool call and user instructions from context to an echo-only stretch | adds user/tool items from context to an echo-only stretch |
| 560+1 (echoed code/test assertions) | says `test passes`; an assertion in source is not a test run | labels echoed code as `tool:` | also labels echoed code as `tool:` |
| 561+1 (tool call) | invents an echo result for grep | retains tool provenance; says tests not run yet | retains tool provenance |
| 564+1 (test/stat output) | tags it `tool:` and imports the test-import edit from context | correct echo, dense exact counts/hits | correct echo, dense counts/hits |
| 552+8 | generally faithful, omits some user detail | adds a separate README/SPEC read absent from the step | generally faithful, user priority still late |
| 566+1 (tmux command only) | imports successful output/exit from the next message | imports 1/1/2 counts and EXITED 0 from the next message; adds doc-grep-pending from context | not run |
| 571+1 (SPEC excerpt only) | faithful excerpt, retains 14d/8w | imports prior README grep and work-state commentary; drops useful excerpt detail | not run |
| 572+1 (edit/test/commit command only) | promotes tests to 19/19 success without output | invents an `echo:` with 19 pass/0 fail/107 expects before output is shown | not run |
| 560+16 / 512+64 | invents a completed push | keeps push as a request, no invented success | not run |

Other completed jobs (556+2, 556+4, 544+16, 560+2, 567+1, 566+2, 560+4, 564+4, 570+2, 568+4, 572+2, 560+8, 574+1, 572+4, 568+8, 576+2, 544+32) were reviewed too. Their useful content is visible side by side above; they are not all perfect. For example A0 560+4 claims successful tests/stat checks before the command's output, A1 560+4 likewise says it ran the checks rather than marking the pending command, and A2 544+16 turns "View 13 msgs 1%" into "View 13/128KB 1%", confusing units. Tool call versus tool result must remain distinct even when later context corroborates an outcome.

Mechanical single-message provenance checks flag mixed/wrong kinds in **3/10** A0 leaves, **4/10** A1 leaves, and **2/5** available A2 leaves. No observed arm invents a `work:` tag here. A1 554+2 is the sole observed multiline final (1/30); the comparison displays its literal newline as `\n`. Smaller answers are not automatically faithful answers.

## Rounds

### Archived calibration, completed before handover

These files already existed; no calls were repeated. Same four jobs for the effort sweep, Novita pin; token/latency variance is too large to establish that low and medium are ignored. They clearly differ from off, which reports zero reasoning tokens.

| reasoning | jobs | overshoot | final mean/max B | retries total | mean/max s/job | reasoning tokens/call | cost/job |
|---|---|---|---|---|---|---|---|
| off | 4 | 2/4 | 485/512 | 2 | 5.47/8.62 | 0 | $0.00487 |
| low | 4 | 3/4 | 441/471 | 3 | 21.28/31.55 | 1700 | $0.00289 |
| medium | 4 | 1/4 | 463/506 | 2 | 24.30/41.57 | 2199 | $0.00377 |
| high | 4 | 2/4 | 444/511 | 2 | 40.68/65.71 | 4263 | $0.00355 |

Archived prompt-v1: 8 jobs, 3/8 overshoots, 383/509 B final, 5 retries, 5.51 s/job, $0.00402/job. Prompt-v2: 12 jobs, 1/12 overshoots, 395/483 B, 1 retry, 3.83 s/job, $0.00445/job. Samples differ, and the exact old prompt texts are not retained there; these are exploratory records, not proof of an isolated wording effect. The apparent 1/12 overshoot rate did not generalize to the main A1 run's 13/30.

### This continuation

1. Audited the two disputed push merges without any model call: no context leak.
2. Resumed A1's 8 missing jobs; all 30 now complete. A2 advanced from 2 to 11 jobs, including the slow 552+4 call.
3. The 300-second foreground command timed out during the next A2 job. No probe process remained. An attempted background continuation from this repo, writing only `/tmp/compact-probe2/run.log`, was blocked: **"Command may modify a read-only path. The invocation did not execute."** It was not retried or bypassed.
4. No further paid prompt/provider/retry rounds were run after that block. Harness-only work added a shared spend ledger (`--spend`), conservative in-flight budget reservations, preserved metered empty replies, prompt-file overrides (`--system`, `--step`), report metadata, and the no-network regression check.

## Recommendation for the real switch

**Candidate transport:** `deepseek/deepseek-v4-flash`, `provider: {order: ["novita/fp8"], allow_fallbacks: false}`, `reasoning: {enabled: false}`; separate `compact-deepseek.txt` and `compact-deepseek-step.txt`. Keep the gist-verbatim `compact.txt` for the Sonnet path. Novita served all 45 completed A1 and 13 completed A2 calls; A0's actual provider is unknown. This probe does not rank providers or independently confirm the endpoint's quantization.

**Not production-ready yet.** Off wins on latency, not demonstrated fidelity. Finish A2 before deciding whether medium warrants its delay; its first 11 jobs are not clean enough to assume it solves attribution. The next small probes should change one variable at a time, in this order:

1. A source-isolation reminder in the step: only the explicitly supplied message/two lines are event sources, and an echoed command/readout is not a new user/tool message. Keep the existing length target unchanged for this round.
2. Remove rule 5's chronological tag-order requirement, preserving original source kinds while allowing user's words first. Keep the source/length wording unchanged.
3. Test a lower length target (for example 360–440 B) without changing other instructions. Measure overshoot and identifier loss together; 854 B on A1 512+64 shows the current target is not enforced reliably.
4. Then test a retry reminder restating the source boundary and kind tags. A0 560+16 shows why size retries need their own fidelity review.

Re-run the full 30-job sample and an end-to-end small tree before a default switch. Only then compare a second fp8 provider with the same prompt/reasoning for speed/cache cost. The requested switch is not implemented. This checkout's `SPEC.md` currently ends at §16.8; the handover's planned §16.9 item 2 is not present here, and no SPEC changes were made.

## Spend, files, and resumption

- Session ledger: **$0.19763697 recorded**, including the **$0.11223764** handover balance; this continuation added **$0.08539933**. A1 ledger $0.14501252 / 49 metered calls; A2 $0.05262445 / 14. Successful result files account for only 45/13 calls: earlier interrupted/missing results explain why ledger spend exceeds the table totals.
- The final interrupted foreground request has no returned usage record; if charged despite cancellation, its cost is unknown. A conservative extra $0.02 allowance puts this session around **<$0.22**, far under $2; do not present the recorded sum as an exact invoice.
- Archived pre-handover calibration ledgers total $0.14585926 separately; even counting those too plus the allowance remains below $0.37. A0 is reused historical spend ($0.09211 for successful calls), not new session spend.
- Raw JSONL, rebuilt contexts, audit script, and quality-review source stay in `/tmp/compact-probe2`, outside git. Only summary comparisons are included in this report.
- `bun test`: **21 pass, 0 fail** with `OPTCHAT_CLAUDE=/bin/false`; the tests use fake processes, never the real Claude CLI. Work stays on `feat/compact-probe`, unpushed.

Resume only after the owner resolves/approves the blocked execution path. There are **19 A2 jobs missing**, starting at 560+2. Use tree end **1153** to keep this exact job set; do not select newly appended chat jobs. The harness supports `--probe 2 --arms A2 --jobs 30 --end 1153 --out /tmp/compact-probe2 --budget 1.8`, with `OPTCHAT_CLAUDE=/bin/false`. Future round directories should share `--spend /tmp/compact-probe2/spend.jsonl`; never run multiple probe processes against that ledger at once. `--system`/`--step` allow scratch variants without overwriting the tested prompt. Reporting is offline and preserves this verdict and the sections after it.
