# Compactor comparison: GLM-5.3-Flash low vs. V4.1 Flash medium

Date 2026-10-05 · 30 real jobs from `~/.optchat` (read-only), replayed in their original order, sequentially per arm · NODE 512 B, TRIES 5 · script `dev/compact-probe.ts`

MED reuses the completed V4.1-medium baseline; no DeepSeek calls are repeated. GL uses explicit `z-ai/glm-5.3-flash` with `reasoning: {effort: "low"}`. Both use the unchanged DeepSeek-specific system/step, same historical source/context, `novita/fp8` pin with fallbacks disabled, 16,000 max output tokens and unchanged size retries. No gist-prompt arm, aliases, prompt tuning, Claude invocation or optchat launch. Parent jobs consume stored Sonnet children, not earlier outputs from either arm; this is not an end-to-end model tree. Model and native reasoning setting differ by design, and cache/load/run conditions differ, so cost and speed are observations, not isolated model-only effects.

## Summary

| arm | model / settings | jobs | overshoot 1st try | final bytes mean / max | final > NODE | retries / job | tokens / call: uncached input / cache read / cache write | output (reasoning) / call | cost / job | ×434 | latency / job mean / max | empty replies | observed provider |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MED | deepseek/deepseek-v4.1-flash (DeepSeek prompt, medium, novita/fp8) | 30 | 20% | 474 / 512 | 0 | 0.20 | 16278 / 23047 / 0 | 3444 (3291) | $0.00870 | $3.776 | 23.7 / 61.7 s | 0 | Novita |
| GL | z-ai/glm-5.3-flash (same DeepSeek prompt, low, novita/fp8) | 30 | 50% | 459 / 587 | 2 | 1.03 | 24086 / 14207 / 0 | 182 (24) | $0.00466 | $2.021 | 36.6 / 115.6 s | 0 | Novita |

Tokens are means per successful call, including size retries; reasoning is a subset of output, not additional tokens. Cost/job and latency/job include size retries. Failed/interrupted calls are excluded from arm means but remain in the spend ledger when metered. ×434 is an illustrative cost/job projection; the historical 434 counts calls including retries, not 434 distinct jobs. Cache warmth, chunk boundaries and endpoint load can affect cost/latency; one run is not a repeated-trial benchmark.

## Jobs side by side

Bytes per try (→ = a size retry), then the final line (the shortest try).

### 555+1 (level 0, tree record 1105, context 381 lines / 128.3 KB)

- **MED** · 979→495 B: talk: both parts done, nothing pushed, main 3 ahead of origin; merge: ff main to da58dbd, deleted feat/tui; /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion", bun test 19/19, README+SPEC updated; /st offers stats completion; /stats bordered overlay: view stats, session totals, day/week tables; scroll arrows/PgUp/PgDn/Home/End, Esc or q closes; Esc with overlay open does not cancel a running turn; startup hint adds /stats, plain mode sends it as text; demo ok
- **GL** · 442 B: tool: usage e2e check in ~/.optchat: python counted usage.jsonl by kind/model; echo: 6 lines: 4 legacy (no kind/model), prime 1 (claude-opus-5-5, 358 in/42264 cache write/0 read/8 out), compact 1 (claude-sonnet-5-5, 2 in/35541 write/149 out); no turn-kind line yet, session predates logging change; tool: sleep 45 + count (retry after blocked chained sleep, tool said use Monitor/background); echo: blocked, kinds unverified, nothing changed.

### 554+2 (level 1, tree record 1106, context 380 lines / 128.2 KB)

- **MED** · 472 B: echo: 19 tests, 105 expects, 1119ms; commits c31e624 /stats overlay slash-command completion, da58dbd pi-style TUI, a5db61d OptMem import; main ahead 3 of origin; talk: ff-merged feat/tui into main da58dbd, branch deleted; /stats c31e624: slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text; 19 tests pass, README/SPEC updated, tmux demo verified incl 40x12; session totals count turns only.
- **GL** · 489 B: echo: bun test 19 pass/0 fail, commits c31e624 /stats overlay, da58dbd feat(tui), a5db61d import, main 3 ahead origin; talk: optchat ff-merged feat/tui into main (da58dbd), branch deleted; /stats overlay committed c31e624 (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text); 19 tests pass, README/SPEC updated; tmux demo verified incl. 40x12; main 3 ahead origin, unpushed; session totals count turns only.

### 552+4 (level 2, tree record 1107, context 380 lines / 128.2 KB)

- **MED** · 492 B: talk: /stats overlay works in tmux demo, README/SPEC next; tool: Bash ~/.claude/optchat main: python edit README.md+SPEC.md (/stats StatsPanel: view+session+day/week tables, Esc/q, not sent to model, plain mode sends text), bun test, commit "feat(tui): /stats overlay with slash-command completion"; echo: 19 pass; c31e624 on main over da58dbd, a5db61d; 3 ahead origin, unpushed; talk: ff-merged feat/tui, branch deleted; overlay slash-only completion, Esc/q closes; tmux demo ok incl. 40x12.
- **GL** · 581→514→503 B: talk: /stats overlay demo-verified; tool: python edit of README (panel) and SPEC (StatsPanel, plain mode sends "/stats" as text), bun test, git add -A, commit; echo: bun test 19 pass; c31e624 feat(tui): /stats overlay with slash-command completion over da58dbd (pi-style TUI), a5db61d; main 3 ahead origin, unpushed; talk: ff-merged feat/tui into main, branch deleted; overlay: slash completion, bordered scrollable view+session+day/week tables, Esc/q closes, not sent to model; tmux demo ok, 40x12 too.

### 556+2 (level 1, tree record 1110, context 379 lines / 128.1 KB)

- **MED** · 461 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables, in the /stats overlay and in `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash cd ~/.claude/optchat: git status -sb, cat -n src/usage.ts, grep table\|aggregate callers to read usage table code
- **GL** · 456 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day/week tables, in /stats overlay and `optchat stats` (shared table code, filter at rendering, keep aggregate()); if none left show dim 'no model calls'; bun test green, demo check, one conventional commit on main, no push, short reply; tool: Bash in ~/.claude/optchat read usage.ts and grep table(/aggregate( callers for the empty-row filter (output not shown); nothing changed yet

### 558+1 (level 0, tree record 1111, context 379 lines / 128.1 KB)

- **MED** · 492 B: echo: main ahead 3; src/usage.ts (59 lines): logUsage appends {date,kind,model,usage} to usage.jsonl; CallKind turn\|compact\|prime; Row period/calls/input/read/write/output; isoWeek; aggregate(text,now,days=14,weeks=8), lines without kind=turn, bad lines skipped; hit read/(input+read+write); table(title,rows,dim) right-aligns; grep: cli.ts:25 reads usage.jsonl, l.27 prints day/week dim tables; tui.ts:85 usageTable via accent, l.212 reads usage.jsonl; selfcheck.test.ts:410 test 2026-10-04.
- **GL** · 469 B: user: ZERO wants empty day/week table rows (no model calls) hidden at rendering in both /stats overlay and `optchat stats` (share table code, filter at render, keep aggregate() as is); dim "no model calls" line if nothing left; bun test green, check demo, one conventional commit on main, no push; short reply; talk: read src/usage.ts (logUsage, aggregate, table: title, rows, dim); callers cli.ts:25,27 and tui.ts:85,212 use aggregate/table; read-only, no changes yet.

### 560+1 (level 0, tree record 1114, context 380 lines / 128.1 KB)

- **MED** · 484 B: echo: read optchat src/tui.ts, usage.ts, selfcheck.test.ts, cli.ts (read-only, no changes): usageTable (muted title, calls-empty periods dimmed) shared by cli `stats` and tui /stats; k() formats k/M; header hint adds /stats; StatsPanel: View stats(mem), session turns/input/read/write/output/hit%, day + ISO-week tables from usage.jsonl, Esc/q closes, scroll footer; cli stats read-only no lock; test: legacy lines=turns, bad lines skipped, 2026-10-02..04 hit 65.0%, W39/W40, W53 edge
- **GL** · 426 B: echo: read optchat src/tui.ts l.80-90/205-220, selfcheck.test.ts usage-aggregation test (day 3 periods, W39/W40, W53 edge, hit 65.0%, bad line skipped), cli.ts stats l.20-30 for empty-row hiding (prep only, no edits): usageTable in tui.ts dims periods with no calls via usageTable("day"/"week"), table(title,rows,dim) shared by cli stats and TUI overlay; T theme colors, k() token fmt, StatsPanel/day/week sections in overlay.

### 556+4 (level 2, tree record 1115, context 380 lines / 128.1 KB)

- **MED** · 508 B: user: ZERO likes /stats; change: hide empty rows (no model calls) in day/week tables, /stats overlay, `optchat stats` (shared table code; filter at render, keep aggregate()); if none left, dim 'no model calls'; bun test green, check demo, one commit on main, no push; tool: Bash ~/.claude/optchat git status, cat src/usage.ts, grep callers; echo: main ahead 3 origin/main; usage.ts table(title,rows,dim) shared cli.ts:27/tui.ts:85; unchanged; tool: read tui.ts 80-220, selfcheck.test.ts 400-430, cli.ts 20-30
- **GL** · 640→481 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day and week tables, in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if none left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply; tool: Bash git status + cat usage.ts + grep table(/aggregate( callers; echo: main ahead 3; usage.ts aggregate, table(title, rows, dim) shared by cli.ts:

### 552+8 (level 3, tree record 1116, context 380 lines / 128.1 KB)

- **MED** · 508 B: talk: /stats overlay ok; echo: c31e624 "feat(tui) /stats overlay" on main, docs updated, 19 tests pass; talk: feat/tui ff-merged, branch deleted, main 3 ahead origin unpushed; user: ZERO likes /stats; hide empty day/week table rows (no model calls) in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is), dim 'no model calls' if none left; bun test green, demo check, one commit on main, no push; tool: Bash read usage.ts; echo: table() shared cli.ts:27/tui.ts:85
- **GL** · 690→530→507 B: talk: /stats committed c31e624 "/stats overlay with slash-command completion" on main (3 ahead origin, unpushed): README/SPEC updated, bun test 19 pass, demo ok incl. 40x12; feat/tui ff-merged, branch deleted; session totals count turns only. user: ZERO likes /stats; hide empty rows (no model calls) in day/week tables in overlay and `optchat stats` (shared table; filter at render, keep aggregate()), dim 'no model calls' if none left; bun test green, demo check, one conventional commit on main, no push.

### 544+16 (level 4, tree record 1117, context 380 lines / 128.1 KB)

- **MED** · 466 B: tool: tmux demo octui (/stats overlay); echo: mid-turn "/stats"+Esc not sent to model (log user i0,i13), q/Esc close, EXITED 0; talk: /stats overlay committed c31e624 (slash completion, 19 tests pass); feat/tui ff-merged main da58dbd, branch deleted, unpushed; user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats`, at render, keep aggregate(), else dim 'no model calls'; tests green, demo check, one commit main, no push.
- **GL** · 842→780→713→595→587 B: user: ZERO likes /stats; hide empty (no model calls) day/week rows in /stats overlay and `optchat stats` at render, keep aggregate(); none left: dim "no model calls"; bun test green, demo check, one commit on main, no push; talk: /stats committed c31e624 (README/SPEC updated, 19 tests pass, demo ok; feat/tui ff-merged, branch deleted; main 3 ahead origin unpushed); tool: tmux demo (uncommitted): View 13 msgs, session hit 48.7%, tables, q/Esc close; mid-turn "/stats" not sent to model; 40x12 fits, editor overlaps; tool: read usage.ts (aggregate/table shared by cli.ts:27, tui.ts:85)

### 561+1 (level 0, tree record 1121, context 379 lines / 127.3 KB)

- **MED** · 473 B: tool: Bash python3 heredoc edits src (assert each old text occurs once): usage.ts table(title,all,dim) filters rows to KINDS.some(k=>r.calls[k]), returns dim("<title>: no model calls") if none; tui.ts usageTable -> table(title,rows,s=>s), single line T.dim else text/accent; selfcheck.test.ts expects table("day",day) first tokens ["day","2026-10-04"] and table("day",day.slice(0,2))=="day: no model calls"; greps ^import.*usage in selfcheck.test.ts, tui.ts; output unseen.
- **GL** · 369 B: tool: edited optchat src/usage.ts table() to drop periods with no model calls (aggregate unchanged), returning dim "<title>: no model calls" when empty; tui.ts usageTable restyled (accent header, text rows, dim no-calls line); selfcheck.test.ts adds expectations (empty days hidden, all-empty "day: no model calls"); grep of usage imports pending; untested, uncommitted

### 564+1 (level 0, tree record 1123, context 382 lines / 128.2 KB)

- **MED** · 418 B: echo: bun test 19 pass/0 fail 107 expects 1084ms; bun src/cli.ts stats day 2026-10-04 turn 11 compact 110 prime 11 in 4,328 read 8,497,674 write 930,584 out 74,897 hit 90.1%, 2026-10-05 turn 4 compact 303 prime 8 in 342,349 read 20,017,373 write 5,412,788 out 129,924 hit 77.7%; week 2026-W40 same as 10-04, W41 same as 10-05; OPTCHAT_DIR=/tmp/nonexist stats prints dim "day: no model calls" and "week: no model calls"
- **GL** · 530→507 B: tool: in optchat (hide-empty-rows task, main, uncommitted): sed added table to selfcheck.test.ts import, ran bun test + `bun src/cli.ts stats` on real data and with OPTCHAT_DIR=/tmp/nonexist; echo: bun test 19 pass/0 fail (107 expects); stats real data shows day 2026-10-04 turn 11/compact 110/prime 11 hit 90.1%, 2026-10-05 turn 4/compact 303/prime 8 input 342,349/read 20,017,373/write 5,412,788/out 129,924/hit 77.7% (weeks W40/W41 same), empty dir prints dim "day: no model calls"/"week: no model calls"

### 560+2 (level 1, tree record 1125, context 377 lines / 127.3 KB)

- **MED** · 484 B: echo: read optchat /stats code: tui.ts usageTable l.85 dims zero-call rows, openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck test l.400-420; no edits. tool: Bash python edit (optchat main, uncommitted): usage.ts table() filters no-call rows (aggregate() unchanged), dim "<title>: no model calls" if none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls); selfcheck.test.ts asserts empty days hidden; greps usage imports in tests/tui.
- **GL** · 467 B: tool: Bash python edit in optchat (main, uncommitted): usage.ts table() filters rows with no model calls (aggregate() unchanged), returns dim "<title>: no model calls" if none; tui.ts usageTable simplified (accent header, text rows, dim no-calls line); echo: greps confirmed callers cli.ts:27 stats prints table(), tui.ts openStats uses aggregate day/week; selfcheck.test.ts adds assertions (empty days hidden, "day: no model calls"); bun test pending, no commit yet.

### 566+1 (level 0, tree record 1126, context 381 lines / 128.1 KB)

- **MED** · 283 B: tool: Bash tmux demo octui 120x40 (dev/tui-demo.sh): /stats overlay captured empty, q closes, send "first message", reopen /stats after turn, capture tail, grep "no model calls"/"2026-10-05", Esc, Ctrl-D, EXITED, kill session; checks empty-row hiding in overlay; output not yet shown
- **GL** · 262 B: tool: tmux demo of /stats overlay empty-row hiding (main, uncommitted, 120x40): "empty" shows dim "day: no model calls"/"week: no model calls"; after a turn shows day row 2026-10-05 with calls/hit only, no zero rows; Escape then Ctrl-D, EXITED 0; session killed.

### 560+4 (level 2, tree record 1127, context 378 lines / 127.5 KB)

- **MED** · 506 B: echo: read tui.ts usageTable, cli.ts stats (user: hide no-call rows in day/week tables in overlay + `optchat stats`, filter at render, keep aggregate()); tool: Bash python edit (uncommitted): usage.ts table() drops empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; echo: selfcheck.test.ts:11 imports {aggregate,hit,isoWeek}, tui.ts:14 {aggregate,table}; tool: sed -i adds table to test import; bun test, `bun src/cli.ts stats` real + OPTCHAT_DIR=/tmp/nonexist, output unseen.
- **GL** · 364 B: echo: greps confirm imports; tool: Bash sed adds `table` to selfcheck.test.ts import, ran bun test + `bun src/cli.ts stats` on real data and on /tmp/nonexist (empty-data no-calls case) in optchat main; uncommitted /stats empty-row-hiding work: usage.ts table() filters no-call rows (aggregate() unchanged), tui.ts usageTable simplified, selfcheck assertions added.

### 567+1 (level 0, tree record 1132, context 379 lines / 127.7 KB)

- **MED** · 465 B: echo: tmux capture, TUI demo /stats overlay (dev/tui-demo.sh, /tmp/oc-tui): empty: View 0 messages, no turns yet, "day: no model calls", "week: no model calls", footer /tmp/oc-tui opus-high, Esc/q closes; after turn: 13 messages 2026-10-05, view 0.9/128 KB (1%), all summarized, session 1 turn input 4 read 6,851 write 7,205 out 324 hit 48.7%, day 2026-10-05 turn 1 compact 1 prime 2 input 12 read 13,702 write 28,112 out 696 hit 32.8%, week 2026-W41 same; EXITED 0
- **GL** · 429 B: tool: tmux demo (octui 120x40, dev/tui-demo.sh) checks /stats overlay with hidden empty rows (uncommitted on main): echo: overlay on empty chat shows "day: no model calls", "week: no model calls", no empty rows; after "first message" turn overlay shows View 13 messages all summarized, session 1 turn in4/R6,851/W7,205/out324 hit 48.7%, day+week rows only 2026-10-05/W41 (1/1/2, hit 32.8%); Ctrl-D EXITED 0; commit still pending.

### 566+2 (level 1, tree record 1133, context 378 lines / 127.4 KB)

- **MED** · 406 B: tool: Bash tmux demo octui 120x40 dev/tui-demo.sh to check /stats overlay with hidden empty rows (uncommitted): opened /stats on empty chat, closed q, sent "first message", reopened; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.
- **GL** · 339 B: tool: tmux demo (octui, 120x40, dev/tui-demo.sh) checked /stats overlay with empty rows hidden, uncommitted; echo: empty chat shows "day: no model calls" and "week: no model calls", "no turns yet"; after one turn only 2026-10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.

### 571+1 (level 0, tree record 1134, context 381 lines / 128.0 KB)

- **MED** · 501 B: echo: SPEC.md CLI text: `optchat view` prints current view, read-only, no lock; `optchat stats` reads usage.jsonl read-only, no lock, prints 2 plain tables for last 14 local days and 8 ISO weeks (local dates, oldest first, empty periods included); columns calls per kind turn/compact/prime, input, cache read, cache write, output tokens, hit = read/(input+read+write); only header dim and only on a terminal, no costs, no charts; `optchat browse [out.html]` one self-contained HTML page with the view.
- **GL** · 415 B: tool: sed -n 566,572p SPEC.md (read-only, /stats empty-row task, no edits); echo: SPEC l.566-572 stats paragraph: `optchat stats` prints last 14 local days + last 8 ISO weeks (local dates), oldest first, empty periods included; columns calls per kind (turn/compact/prime), input, cache read/write, output, hit; dim header only on terminal, no costs/charts; table() shared with /stats overlay now filters empty rows.

### 564+4 (level 2, tree record 1136, context 376 lines / 126.8 KB)

- **MED** · 738→510 B: echo: bun test 19 pass/0 fail after hiding empty rows in table(); `optchat stats` data: days 2026-10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 2026-10-05 (4/303/8, hit 77.7%), weeks W40/W41; talk: overlay; tool: tmux octui 120x40 dev/tui-demo.sh /stats: opened empty chat, q, "first message", reopened, Esc, Ctrl-D, killed (uncommitted); echo: empty chat: "day/week: no model calls", "no turns yet"; one turn -> only 2026-10-05 (turn 1/compact 1/prime 2, hit 32.8%) and 2026-W41; footer 0.9/128 EXITED 0
- **GL** · 615→513→515→509 B: echo: bun test 19 pass/0 fail (107 expects) after empty-row hiding; `optchat stats` shows only non-empty days (10-04: turn 11/compact 110/prime 11, hit 90.1%; 10-05: 4/303/8, 77.7%) + W40/W41; empty dir prints "day/week: no model calls". talk: Now the overlay demo; tool: tmux demo (octui, 120x40) of /stats, empty rows hidden; echo: empty chat shows "day/week: no model calls", "no turns yet"; after one turn only 10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 row; EXITED 0; uncommitted.

### 570+2 (level 1, tree record 1137, context 380 lines / 127.9 KB)

- **MED** · 507 B: tool: Bash sed -n 566,572p SPEC.md read SPEC stats paragraph (read-only, hiding-empty-rows task); echo: SPEC.md l.566-572 still states old behaviour: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days + 8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); header dim on tty only; no costs/charts; `optchat browse [out.html]` starts; needs update.
- **GL** · 485 B: tool: Bash sed SPEC.md l.566-572 (read-only, hiding-empty-rows task, no changes); echo: SPEC stats paragraph still old behaviour: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days/8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); only header dim on tty; no costs/charts; `optchat browse [out.html]` starts; needs update.

### 572+1 (level 0, tree record 1138, context 380 lines / 127.9 KB)

- **MED** · 479 B: tool: Bash in ~/.claude/optchat: python3 heredoc edits SPEC.md (empty periods hidden at rendering via table(); aggregate() unchanged; dim 'day: no model calls'/'week: no model calls' line, also in /stats overlay; 'only the header (and that line) is dim') and README.md (periods without model calls hidden); then bun test tail -2, git add -A, commit 'feat(stats): hide periods without model calls in usage tables' (Co-Authored-By Claude Opus 5.5), git log/status; no output shown.
- **GL** · 606→433 B: tool: python edit of SPEC.md/README.md (stats: periods without model calls hidden at rendering via table(), aggregate() unchanged; a table with none left is one dim "day/week: no model calls" line, /stats overlay too), bun test, commit; echo: 19 pass/0 fail; talk: stats real data shows only 2026-10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 10-05 (4/303/8, 77.7%), W40/W41; empty dir prints dim "day/week: no model calls"; de

### 568+4 (level 2, tree record 1139, context 379 lines / 127.7 KB)

- **MED** · 670→491 B: tool: Bash grep README.md/SPEC.md for stats docs (14 days/ISO week/dim header/empty periods); echo: README.md:40 `optchat stats` = usage per day/ISO week; SPEC.md:494 dim 3-line stats(mem) header, l.568 14 local days/8 ISO weeks oldest first, empty; tool: Bash sed SPEC.md 566-572 (read-only, hide-empty-rows task); echo: SPEC still old: reads usage.jsonl, two plain tables (same periods), "empty periods included", cols kind turn/compact/prime, input, cache, output, hit; dim header on tty.
- **GL** · 518→512 B: tool: grep of optchat README/SPEC for stats-doc spots (hide-empty-rows task, no edits): README.md:40 stats row (14 days/8 weeks), SPEC.md:494 startup stats(mem) header, SPEC l.568 stats section; then read SPEC l.566-572: `optchat stats` reads usage.jsonl, two plain tables last 14 local days/8 ISO weeks, oldest first, "empty periods included"; cols calls by kind turn/compact/prime, input, cache read/write, output, hit; header dim only on tty; no costs/charts; still old behaviour, needs update for empty-row h

### 572+2 (level 1, tree record 1140, context 381 lines / 128.2 KB)

- **MED** · 509 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in table(), aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; echo: 107 expect() calls, 19 tests 0 fail [1157ms], fecfd07 feat(stats): hide periods without model calls in usage tables, main...origin/main [ahead 4]
- **GL** · 344 B: tool: edited optchat SPEC.md (periods without model calls hidden in table(), aggregate() unchanged; dim "day/week: no model calls" line, also in /stats overlay) and README stats row; echo: bun test 19 pass/0 fail (107 expects); committed fecfd07 "feat(stats): hide periods without model calls in usage tables" on main, 4 ahead origin, unpushed.

### 560+8 (level 3, tree record 1141, context 375 lines / 126.7 KB)

- **MED** · 901→504 B: user: hide no-call rows in day/week tables, /stats overlay + `optchat stats`, filter at rendering, keep aggregate(); else dim "no model calls"; bun test green, demo check, 1 commit on main, no push; tool: Bash python edit (uncommitted): usage.ts table() filters empty rows and tui.ts usageTable simplified; tests +assertions; echo: bun test 19 pass/0 fail 107 expects; stats non-empty days only (10-04, 10-05); tool: /stats: 1 turn -> 10-05 row only, no-calls line if empty, Ctrl-D EXITED 0; uncommitted.
- **GL** · 685→489 B: user: hide empty (no model calls) rows in day/week tables, /stats overlay + `optchat stats`, keep aggregate(); tool: python edit (main, uncommitted): usage.ts table() filters empty rows, dim "<title>: no model calls"; tui.ts usageTable simplified; test assertions added; echo: bun test 19 pass/0 fail (107 expects); `optchat stats` real data: only non-empty 10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 10-05 (4/303/8, 77.7%), empty dir prints "day/week: no model calls"; tool: tmux

### 574+1 (level 0, tree record 1142, context 381 lines / 128.2 KB)

- **MED** · 498 B: talk: day/week tables no longer show empty rows in /stats and optchat stats; committed main fecfd07, not pushed, 4 ahead origin; table() drops zero-call rows, aggregate() unchanged; empty table shows dim day: no model calls / week: no model calls (prefix added since optchat stats has no titles); bun test 19 pass, 2 new checks; real log shows only 2026-10-04/05, W40/W41; empty dir prints both lines; demo /stats dim before turn 1, single 2026-10-05/W41 row after, clean exit; README/SPEC updated.
- **GL** · 567→520→505 B: talk: day/week usage tables hide rows with no model calls in /stats overlay and optchat stats (shared table() filters at render, aggregate() unchanged); empty table shows dim "day/week: no model calls" (prefix so table identifiable); committed fecfd07 on main, unpushed, 4 ahead origin; bun test 19 pass, 2 new assertions (empty days hidden, all-empty dim line); checks: real log only 2026-10-04/05 + W40/W41, empty dir prints both lines, demo overlay verified pre/post turn, EXITED 0; README/SPEC updated

### 572+4 (level 2, tree record 1146, context 381 lines / 128.0 KB)

- **MED** · 488 B: tool: Bash in ~/.claude/optchat main: edited SPEC.md + README.md (table() hides no-model-call periods, aggregate() unchanged, dim no-calls line); bun test 19 pass; committed fecfd07 "feat(stats): hide empty usage-table periods"; main 4 ahead of origin, unpushed; talk: empty day/week rows now hidden in /stats overlay and `optchat stats`, dim no-calls line if none left; user: ZERO tested the TUI and likes it, asked to push main to origin (git push origin main), reply with pushed range.
- **GL** · 517→464 B: tool: edited optchat SPEC.md (table() hides periods without model calls, aggregate() unchanged; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; bun test 19 pass (107 expects); committed fecfd07 "feat(stats): hide periods without model calls in usage tables" on main, unpushed, 4 ahead of origin; talk: empty rows hidden in /stats overlay and optchat stats via table() filter; demo+real log checked, only non-empty rows remain.

### 568+8 (level 3, tree record 1148, context 380 lines / 127.5 KB)

- **MED** · 586→512 B: tool: Bash grep README/SPEC stats docs; echo: README l.40 14d/8 ISO wks, SPEC l.494, l.568 stats para "empty periods included", needs update; tool: Bash sed SPEC l.566-572; echo: no edits; tool: Bash (optchat main) edited SPEC.md+README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats and `optchat stats`, dim "no model calls" if none left;
- **GL** · 655→628→498 B: tool: edited optchat README/SPEC stats spots (SPEC l.568 said "empty periods included", stale); bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats overlay and `optchat stats`; dim "no model calls" line if none; demo checked. user: ZERO tested TUI, likes it; asks to push main to origin (git push origin main), then reply with the pushed range.

### 576+2 (level 1, tree record 1150, context 380 lines / 127.7 KB)

- **MED** · 377 B: tool: Bash in ~/.claude/optchat: git status -sb, log origin/main..main, git push origin main, status again; echo: main was 4 ahead (a5db61d import optmem incremental, da58dbd pi-style TUI, c31e624 /stats overlay, fecfd07 hide no-call periods); pushed 955394f..fecfd07 main -> main to github.com/gebeer/shitty-optchat; status now "## main...origin/main" (in sync, nothing ahead)
- **GL** · 477 B: tool: Bash pushed optchat main to origin per user request; echo: before push main was ahead 4 (fecfd07 feat(stats): hide periods without model calls in usage tables; c31e624 feat(tui): /stats overlay with slash-command completion; da58dbd feat(tui): pi-style TUI on @earendil-works/pi-tui; a5db61d feat(import): append new OptMem notes incrementally); push to github.com/gebeer/shitty-optchat.git succeeded, origin/main updated 955394f..fecfd07, now main...origin/main in sync.

### 560+16 (level 4, tree record 1151, context 378 lines / 127.0 KB)

- **MED** · 469 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edited usage.ts table(), tui.ts usageTable, README/SPEC; echo: bun test 19 pass; real log: non-empty days/weeks only (10-04 11/110/11 90.1%, 10-05 4/303/8); tmux /stats Esc/Ctrl-D exit 0; tool: committed fecfd07 hide no-call periods in usage tables (main 4 ahead, unpushed); user: ZERO likes TUI, asks git push origin main + pushed range.
- **GL** · 772→698→495 B: user: hide no-call rows in /stats + `optchat stats` tables, keep aggregate(), "no model calls" dim line if none; tool: table() filters empty rows, tui.ts simplified, tests; echo: bun test 19 pass; real data only non-empty days (10-04 90.1%, 10-05 4/303/8), empty dir "no model calls"; tmux demo overlay ok; committed fecfd07 "feat(stats): hide periods without model calls" (main 4 ahead, unpushed); talk: aggregate() unchanged; user: ZERO likes TUI; push main to origin, reply with pushed range.

### 544+32 (level 5, tree record 1152, context 378 lines / 127.0 KB)

- **MED** · 520→473 B: tool: Bash /stats demo tmux 120x30+40x12 OK: view, tables, q/Esc close; talk: committed c31e624 /stats, main 3 ahead unpushed; user: ZERO likes /stats; wants no-call day/week rows hidden in overlay and `optchat stats`, aggregate() kept, dim no model calls if none, one commit on main, no push; tool: python edit usage.ts table() filter, tui.ts, tests; echo: 19 pass; committed fecfd07, main 4 ahead; user: ZERO likes TUI; asks git push origin main, reply with pushed range.
- **GL** · 891→726→582→551→542 B: tool: tmux demo /stats (120x30, 40x12) OK: tables, scroll, q/Esc close, not sent to model. talk: committed c31e624 "/stats overlay" (19 tests, main 3 ahead). user: ZERO likes /stats; hide empty day/week rows in overlay + `optchat stats`, keep aggregate(), dim "no model calls" if none; bun test, demo, one commit, no push. tool: edit usage.ts table(), tui.ts, tests; echo: 19 pass; real data only non-empty rows, empty dir "no model calls"; committed fecfd07 (main 4 ahead, unpushed). user: ZERO likes TUI; asks push origin main, reply range.

### 512+64 (level 6, tree record 1153, context 378 lines / 127.0 KB)

- **MED** · 501 B: tool: Ctrl-O expand, 19 tests, squashed da58dbd; user: ZERO approved feat/tui: ff main, no push, delete branch; add TUI /stats: overlay (usage day/week, session totals), Esc/q closes, not sent to model, one commit; echo: ff'd, branch deleted, tests pass; user: ZERO likes /stats; hide no-call day/week rows in overlay + `optchat stats` (dim if none); then push origin main, reply pushed range; tool: tmux demo OK, edited usage/tui/tests; talk: c31e624 /stats, fecfd07 hide rows, main 4 ahead unpushed.
- **GL** · 839→600→534→516→507 B: user: ZERO approved feat/tui: ff-merge to main, no push, delete branch; add TUI /stats (slash autocomplete, overlay: usage day/week, stats(mem), session totals, Esc/q closes, not sent). tool: ff'd main to da58dbd (Ctrl-O expand squashed, 19 tests), branch deleted; /stats demo tmux OK (120x30, 40x12); committed c31e624, unpushed. user: hide no-call day/week rows in /stats + `optchat stats` (keep aggregate(), dim "no model calls"); tool: table() filters, bun 19 pass, demo OK; committed fecfd07, unpushed.

## Verdict

**Keep V4.1 Flash medium as the baseline.** All 30 GLM jobs returned; **28/30** finals fit 512 B versus **30/30** for MED. GLM's metered cost/job was **46.5% lower**, but observed job latency was **54.6% higher**, with **31 size retries versus 6** plus 28 transport retries. It retained **23/25** exact source hash pairs versus **25/25**, yet mixed kinds/context on **6/10** single-message leaves and reported test/demo outcomes that were not supplied. Hash retention alone substantially overstates its fidelity.

Low reasoning was confirmed in the actual upstream request, not inferred from a short answer. This evaluates the unchanged DeepSeek prompt/protocol at the pinned endpoint, not GLM's best performance with tailored prompts or another provider. No production switch or prompt optimization was made.

## Rounds

### GLM-5.3-Flash low — frozen setup and smoke

- **GL:** explicit `z-ai/glm-5.3-flash`, `reasoning: {effort: "low"}`. **MED:** completed `deepseek/deepseek-v4.1-flash` medium baseline, read in place from `dev/probe-out/v41/MED.jsonl`, no new DeepSeek calls.
- Same unchanged `compact-deepseek.txt` + `compact-deepseek-step.txt`, same 30 historical jobs through tree record **1153**, source/context layout, `novita/fp8` pin with fallbacks disabled, max_tokens **16000**, NODE **512 B**, TRIES **5**, unchanged size retry, no sampling overrides. Parent jobs consume stored Sonnet children, not new outputs; not an end-to-end GLM tree.
- Public [models API](https://openrouter.ai/api/v1/models) identifies canonical `z-ai/glm-5.3-flash-20260826`, mandatory reasoning, supported efforts **max/high/low**, default **max**. [Endpoint API](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints) lists Novita fp8 with reasoning/reasoning_effort support, 1,048,576 context, 131,072 maximum completion. Snapshot prices USD/million: input **$0.084**, output **$0.28**, cache read **$0.0168**; these are current discounted endpoint prices, not the generic model-card list prices.
- Low is verified beyond our request JSON: a tiny streaming diagnostic used OpenRouter's `debug.echo_upstream_body`; actual Novita payload contains **`reasoning_effort: "low"`**, model `zai-org/glm-5.3-flash`, max_tokens 16000. The [official model card](https://huggingface.co/zai-org/GLM-5.3-Flash) requires explicit low/high or defaults to max. This confirms forwarding of the supported setting, not an independent inspection of provider internals. Diagnostic cost **$0.00000216216**, 3.205 s, excluded from compactor sample timing/cost means but included in run spend.
- Same **555+1** smoke: first/final **442 B**, **14.545 s**, no size retry, **$0.00323015616**, Novita/requested model, finish `stop`, **70 reasoning tokens / 272 reasoning characters**. Quality red flag: instead of the supplied talk report about TUI merge and /stats, it summarizes unrelated historical usage-count tool/echo items from context. The saved request's final step contains the correct source. Retain this result in the sample; do not rerun or fix the prompt.
- Same-job references: V4.1 MED **30.070 s** including one retry (first 5.923 s), Qwen235 **19.260 s** including one retry (first 8.911 s). Single-job smoke timings are not performance benchmarks.
- Smoke-cost projection for 30 jobs plus diagnostic: **$0.09690684696**, below ZERO's revised **$5 per probe run** cap. The former session-wide $2 cap is superseded. Resume the same output directory and shared ledger; run spend filters entries to this output directory, excluding unrelated prior candidates while including its diagnostic and all size retries.
- Per-call reserve now comes from live pinned-endpoint input/output prices, uncached text-input byte/framing ceiling, the full 16,000-token output budget (including reasoning), and 10% headroom. No model-name dollar constants or $1 fallback. Unknown/missing pricing stops before a paid request; the per-run $5 cap is checked before each dispatch. Cache discounts are not assumed for reservation. Exact realized cost/latency remain cache/load-sensitive observations.
- Damage-Control blocked a combined baseline-copy/test command before execution. No equivalent copy/symlink was retried: MED and original source/prompt snapshots are reused read-only in place. Standalone network-stubbed tests then passed.
- Prompt hashes: system `9c08ec458cd625858d5b7757aeeeebeb2f0f6eec4c239e8f327327e02d220752`; step `bd25f461f88f35c7b5df0eafcc0e2dcfa6550a41b631858f12ec520af2e4d22f`. Verified byte-for-byte against the saved baseline, along with all 30 source/context snapshots.

### GLM-5.3-Flash low — completed 30-job comparison

| check | V4.1 MED | GLM GL |
|---|---|---|
| Returned jobs / successful completions | 30 / 36 | 30 / 61 |
| First try exceeds 512 B | 6/30 (20%) | 15/30 (50%) |
| Size retries total / per job | 6 / 0.20 | 31 / 1.03 |
| Final at most 512 B | 30/30 | 28/30 |
| Final bytes mean / max | 474.4 / 512 | 459.1 / 587 |
| Final within prompt's 400–470 B target | 6/30 | 9/30 |
| Exact source hash pairs retained in final | 25/25 | 23/25 |
| Wrong/mixed kind tags in single-message leaves | 0/10 | 6/10 |
| User-first / entire user item missing, direct user-bearing stretches | 3/9 / 1/9 | 5/9 / 1/9 |
| Latency/job mean / median / max, including retries | 23.699 / 17.598 / 61.667 s | 36.631 / 29.905 / 115.594 s |
| First-response latency mean | 19.058 s | 20.198 s |
| Metered cost/job, including size retries | $0.00870065 | $0.00465567 |
| Metered 30-job sample cost, including smoke | $0.26101950 (reused) | $0.13967011 |

Hash retention counts distinct `(job, exact source hash)` pairs, excluding context-only hashes. GL loses da58dbd and c31e624 at **555+1**; its other 23 source pairs survive first and final answers, with no additional hash losses during size retries. No novel hash absent from source/context was found. That does **not** mean no invented facts: fake outcome/provenance assertions do not require invented hashes.

User-first is only a tag-order check across nine direct user-bearing stretches, excluding echo-parent user asides at 560+4/560+8. GL's entire direct user item is missing at **572+4**; MED's at **568+8**. GL also drops the **latest push/range instruction at 512+64**, despite retaining earlier user items, so that loss is not captured by the missing-tag count. Two GL user-first entries are oversized. These overlapping historical jobs are not independent conversations or a universal quality score.

All **61 successful completions** returned the explicit GLM model, **Novita**, and finish `stop`. Requests kept low on every initial/size/transport retry. Observed reasoning totaled **1,456 tokens / 5,744 characters**, about **24 tokens/completion**, within 11,085 total output tokens. Some trivial responses had no reasoning output; that is not evidence the supported low setting was dropped. No empty replies, multiline finals or non-ASCII finals occurred.

**Transport caveat:** saved request bodies show **89 HTTP dispatches** for those 61 completions: **28 identical-body transport retries** in 15 request groups, each 2–4 attempts. The unchanged transport retries only HTTP 429/5xx; individual statuses were not captured, so do not label all 28 as 429 or successful paid completions. Their known scheduled backoffs sum to **225 s**. Job timings include these waits, failed-attempt time and the per-chunk live price lookup (11 lookups, not separately timed). Provider load, chunk boundaries and cache state therefore materially affect the comparison; **54.6% higher job latency is not a claim of intrinsically slower model inference**. Failed attempts returned no completion/metering records in this harness.

GL reported **866,624 cached input tokens** out of 2,335,884 total prompt tokens; cache-write tokens were zero. MED reported 829,696 cached out of 1,415,717. The cost gap uses actual returned metering at the current discounted endpoint prices, not a cache-independent price assumption or an exact provider invoice.

Two finals exhausted all five size attempts and remain invalid for NODE:

- **544+16:** 842→780→713→595→**587 B**.
- **544+32:** 891→726→582→551→**542 B**.

Both still contain useful user instructions; preserving facts does not make their byte count valid. The harness retains the shortest returned try, not a fabricated hard-cropped success. Other retries leave clipped endings at **556+4 (`cli.ts:`), 572+1 (`; de`), 568+4 (`empty-row h`) and 560+8 (`tool: tmux`)**. The existing retry requests a displayed 512-B prefix; this is a test of the shared prompt/retry protocol together, not just the initial system prompt.

### Source-fidelity and invented-fact pass

All 30 exact source stretches were reviewed. Important failures and counterexamples:

| job / exact source | GL finding | MED reference |
|---|---|---|
| 555+1, talk report of completed TUI merge and /stats | **Wrong topic entirely:** unrelated historical usage-count tool/echo items replace the talk; both source hashes, merge, /stats and unpushed state disappear | Preserves talk, da58dbd/c31e624 and main 3 ahead/unpushed |
| 558+1, echo of old usage.ts and callers | Replaces echo with **user/talk**, importing the user task and constraints from context | Describes the actual echo/code readout |
| 560+1, echo of old code/test assertions | Describes old dim-empty-row code, preparatory/no edits; no invented successful update | Also read-only, but loosely calls usageTable shared with CLI |
| 556+2 / 552+8, user request | Keeps aggregate(), test/demo, conventional commit and **no push**; 552+8 is not user-first | Also preserves core user constraints |
| 556+4, read/command merge | Keeps user constraints but retry clips at **`cli.ts:`**, dropping the last tool/read details | Keeps latest read tool |
| 561+1, edit/grep command only | Says grep pending, untested/uncommitted; does not fabricate a successful grep/test | Explicitly output unseen |
| 564+1, echo-only test/stat output | Imports a **tool: sed import fix + test/CLI invocation** from context into the echo stretch; most actual numbers retained | Keeps echo kind, though also imports prior CLI invocation/"dim" styling |
| 560+2, prior readout then edit/grep command | Reorders the old echo after the edit and says **grep confirmed callers**, blurring a pending grep with the earlier readout | Keeps prior echo and pending tool separately |
| 566+1, tmux command without output | Claims **empty/after-turn rows shown and EXITED 0**, despite no supplied result: invented observed outcome | Describes check, **output not yet shown** |
| 567+1, echo-only demo output | Adds a **tool:** invocation and uncommitted/pending-commit state from context, but captures actual demo counts | Echo-only with actual counts |
| 566+2 / 564+4, supplied demo result | Useful source-supported rows and clean exit; no fabricated new outcome | Also faithful |
| 571+1, old SPEC echo excerpt | Adds **tool: sed** and **table() now filters empty rows** from context; neither is in the supplied excerpt | Faithfully summarizes stale excerpt only |
| 570+2, read command + stale-doc result | Faithful command/result, no edits, docs need update | Also faithful |
| 572+1, docs edit/test/commit command without output | Adds **echo: 19 pass/0 fail** and a nonexistent talk of real/empty stats; those outcomes were not returned for this command. Final ends **`; de`** | Command-only provenance, **no output shown** |
| 572+2 / 574+1, actual commit result and report | Useful **fecfd07**, tests and main 4 ahead/unpushed state | Also faithful |
| 560+8, inherited user aside | Promotes aside to user, retains aggregate(), but retry loses demo result after **`tool: tmux`** | Also promotes/imports user wording from context; retains demo result |
| 572+4, latest direct user push/range request | Missing **already on first answer**, not just after retry | Preserves request and pushed-range instruction |
| 568+8, same late request | Retry retains push/range and fecfd07 **within 498 B**: a genuine GL win on this job | Fits 512 B but loses the entire latest user item |
| 576+2, actual successful push | Correct **955394f..fecfd07**, all four hashes and **now in sync** | Also correct |
| 560+16, pending push/range request | Retains latest push/range request, aggregate(), fecfd07 and unpushed state in **495 B** | Also retains them |
| 544+32, earlier no-push then latest push request | Retains both hashes and latest push/range request, but final **542 B** is oversized | Retains facts within 473 B |
| 512+64, high merge | First answer retains latest push/range; retries remove it entirely, leaving earlier **no push** and unpushed state. Keeps aggregate() but loses plain-mode behavior and main 4 ahead | Preserves latest push/range and hashes, but drops aggregate() |

The earlier boundary audit still holds for **560+16/512+64**: exclusive context limit **576**, last context message **575**; actual push at 576–578 is outside their source/context. GL invents no successful push in these two jobs, but drops the latest request at 512+64. At **576+2**, where success is really supplied, it correctly preserves the pushed range and in-sync state.

Overall, GL has more serious **source isolation/provenance** defects than the hash metric suggests, including a wrong-source smoke and fabricated observed outcomes. It also produces useful dense summaries and beats MED at 568+8 and aggregate() preservation at 512+64. MED is not perfect: its existing review found dropped user wording, context-imported instructions and loose technical provenance. Do not call either production-ready based only on bytes/hashes.

## Recommendation

**Keep explicit `deepseek/deepseek-v4.1-flash`, `reasoning: {effort: "medium"}`, `novita/fp8` with fallbacks disabled** as the current baseline. GLM low is cheaper but not a replacement under the unchanged prompt/protocol: lower byte compliance, unsupported test/demo outcomes, context/kind leakage, lost latest instructions and worse observed job latency outweigh the saving.

No GLM-specific prompt tuning, provider change, max-effort comparison or end-to-end GLM tree was run. Future V4.1 optimization should still isolate user-instruction ordering, source boundaries and retry fidelity one variable at a time. No production transport/prompt or SPEC edits; SPEC §16.9 remains on main (`2ba9689`).

## Spend and reproduction

- Full GL sample: **$0.139670113968** across **61 successful completions**, including the reused **$0.00323015616** smoke. Settings diagnostic: **$0.00000216216**. Total recorded spend for this run: **$0.139672276128 / $5**. Reused MED incurred **zero new spend**.
- The 28 retried HTTP attempts have no captured completion metering. As an extra conservative check, reserving their full input/output ceilings at the pinned price plus 10% gives **$0.492630446**; even adding that allowance to metered run spend gives **$0.632302722128**, below $5. This is an allowance, not claimed charges or an invoice.
- Shared ledger across historical runs now records **$1.102310271612**, 320 metered entries; unrelated historical spend no longer consumes the new per-run cap. The per-run guard filters by output directory, uses live endpoint-priced ceilings, defaults to $5, and rejects budgets above $5 or non-finite values. One foreground owner; no background processes.

Raw GL results, request bodies, live endpoint snapshots and upstream settings diagnostic: gitignored `dev/probe-out/glm53/`. Baseline/source/prompt snapshots reused read-only from `dev/probe-out/v41/`; shared ledger `dev/probe-out/spend.jsonl`. Only entries with `out: "dev/probe-out/glm53"` count against this run's cap; retain them on resume.

```bash
OPTCHAT_CLAUDE=/bin/false bun --preload ./dev/probe-out/glm53/log-requests.ts dev/compact-probe.ts run \
  --probe 5 --arms GL --jobs 30 --end 1153 --take 1 \
  --out dev/probe-out/glm53 --spend dev/probe-out/spend.jsonl --budget 5
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts report \
  --probe 5 --out dev/probe-out/glm53 --md docs/probes/compact-glm53flash-v41.md
OPTCHAT_CLAUDE=/bin/false bun test
```

Checks: **21 tests pass, 0 fail, 151 expect() calls** with fake processes/stubbed fetch; initial/retry GL requests specify low, messages/provider/max_tokens match MED, foreign-run spend does not consume this run's budget, endpoint-priced reserve blocks an unaffordable call, and invalid/$5-exceeding budgets are refused. Ignored `dev/probe-out/glm53/validate.ts --complete` verifies all 30 exact source/context snapshots, unchanged prompt bytes/hashes, every saved request/size retry against `blocks()` + `retry()`, all 89 low-reasoning dispatches / 61 completions, upstream low, and exact metered-ledger costs below the run cap.

Foreground/resumable chunks only, no Claude or optchat launch; `~/.optchat` read-only. Branch `feat/compact-probe`, no push or attribution lines in commits.
