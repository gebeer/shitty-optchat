# DeepSeek V4.1 Flash compactor baseline: reasoning off vs. medium

Date 2026-10-05 · 30 real jobs from `~/.optchat` (read-only), replayed in their original order, sequentially per arm · NODE 512 B, TRIES 5 · script `dev/compact-probe.ts`

OFF/MED use the explicit `deepseek/deepseek-v4.1-flash` ID, the unchanged `compact-deepseek.txt` + `compact-deepseek-step.txt`, reasoning `{enabled: false}` / `{effort: "medium"}`, and `novita/fp8` with fallbacks disabled. Only reasoning changes; no gist-prompt arm, model aliases, or prompt tuning. No Claude or optchat was launched. Layout and size retries reuse `blocks()`/`step()`/`retry()` from `summarize.ts`. Each job consumes its historical source message or stored Sonnet children, not earlier outputs from these arms; this is not an end-to-end V4.1 tree.

## Summary

| arm | model / settings | jobs | overshoot 1st try | final bytes mean / max | final > NODE | retries / job | tokens / call: uncached input / cache read / cache write | output (reasoning) / call | cost / job | ×434 | latency / job mean / max | empty replies | observed provider |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OFF | deepseek/deepseek-v4.1-flash (DeepSeek prompt, reasoning off, novita/fp8) | 30 | 60% | 497 / 762 | 4 | 1.47 | 7562 / 32125 / 0 | 174 (0) | $0.00522 | $2.264 | 10.1 / 29.6 s | 0 | Novita |
| MED | deepseek/deepseek-v4.1-flash (DeepSeek prompt, medium, novita/fp8) | 30 | 20% | 474 / 512 | 0 | 0.20 | 16278 / 23047 / 0 | 3444 (3291) | $0.00870 | $3.776 | 23.7 / 61.7 s | 0 | Novita |

Tokens are means per successful call, including size retries; reasoning is a subset of output, not additional tokens. Cost/job and latency/job include size retries. Failed/interrupted calls are excluded from arm means but remain in the spend ledger when metered. ×434 is an illustrative cost/job projection; the historical 434 counts calls including retries, not 434 distinct jobs. Cache warmth, chunk boundaries and endpoint load can affect cost/latency; one run is not a repeated-trial benchmark.

## Jobs side by side

Bytes per try (→ = a size retry), then the final line (the shortest try).

### 555+1 (level 0, tree record 1105, context 381 lines / 128.3 KB)

- **OFF** · 941→898→745→584→549 B: talk: both done, nothing pushed, main 3 ahead of origin: ff main to da58dbd, deleted feat/tui; /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion", bun test 19/19, README/SPEC updated. /st completes slash commands only; /stats = bordered overlay: view stats, session turn totals, day/week tables, dim empty days; scroll arrows/PgUp-PgDn/Home-End, Esc or q closes; model never gets /stats, Esc while open won't cancel a turn; plain mode sends it as text. Demo-checked: 40x12 ok. Restart or dev/tui-demo.sh, type /stats.
- **MED** · 979→495 B: talk: both parts done, nothing pushed, main 3 ahead of origin; merge: ff main to da58dbd, deleted feat/tui; /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion", bun test 19/19, README+SPEC updated; /st offers stats completion; /stats bordered overlay: view stats, session totals, day/week tables; scroll arrows/PgUp/PgDn/Home/End, Esc or q closes; Esc with overlay open does not cancel a running turn; startup hint adds /stats, plain mode sends it as text; demo ok

### 554+2 (level 1, tree record 1106, context 380 lines / 128.2 KB)

- **OFF** · 595→513→583→524→458 B: echo: bun test 19 pass/0 fail (105 expects, 1119ms); log: c31e624 /stats overlay, da58dbd feat(tui): pi-style TUI, a5db61d feat(import): incremental OptMem notes; main ahead 3 of origin/main; talk: ff-merged feat/tui into main at da58dbd, branch deleted; /stats overlay committed c31e624: slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends it as text; README/SPEC updated; tmux demo v
- **MED** · 472 B: echo: 19 tests, 105 expects, 1119ms; commits c31e624 /stats overlay slash-command completion, da58dbd pi-style TUI, a5db61d OptMem import; main ahead 3 of origin; talk: ff-merged feat/tui into main da58dbd, branch deleted; /stats c31e624: slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text; 19 tests pass, README/SPEC updated, tmux demo verified incl 40x12; session totals count turns only.

### 552+4 (level 2, tree record 1107, context 380 lines / 128.2 KB)

- **OFF** · 818→512 B: talk: Overlay works in demo; updating README/SPEC then committing; tool: Bash on main in ~/.claude/optchat: python edit (assert once) of README.md (adds /stats panel: view, session token totals, usage tables, scroll keys, Esc/q closes, not sent to model) and SPEC.md (/stats overlay StatsPanel, plain mode sends it as text, code map), bun test, git add -A, commit "feat(tui): /stats overlay with slash-command completion"; echo: bun test 19 pass; commit c31e624 on main over da58dbd (pi-style TUI) and a5db61d, m
- **MED** · 492 B: talk: /stats overlay works in tmux demo, README/SPEC next; tool: Bash ~/.claude/optchat main: python edit README.md+SPEC.md (/stats StatsPanel: view+session+day/week tables, Esc/q, not sent to model, plain mode sends text), bun test, commit "feat(tui): /stats overlay with slash-command completion"; echo: 19 pass; c31e624 on main over da58dbd, a5db61d; 3 ahead origin, unpushed; talk: ff-merged feat/tui, branch deleted; overlay slash-only completion, Esc/q closes; tmux demo ok incl. 40x12.

### 556+2 (level 1, tree record 1110, context 379 lines / 128.1 KB)

- **OFF** · 434 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash in ~/.claude/optchat read git status -sb, cat -n src/usage.ts, grep table(/aggregate( callers
- **MED** · 461 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables, in the /stats overlay and in `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash cd ~/.claude/optchat: git status -sb, cat -n src/usage.ts, grep table\|aggregate callers to read usage table code

### 558+1 (level 0, tree record 1111, context 379 lines / 128.1 KB)

- **OFF** · 556→545→496 B: user: hide empty (no model calls) rows in day/week tables in /stats overlay and `optchat stats`, filter at rendering, keep aggregate() as is; if none left show dim 'no model calls'; bun test green, check in demo, one conventional commit on main, no push; tool: Bash git status, cat -n src/usage.ts, grep table(/aggregate( callers; echo: main ahead 3; usage.ts l.10 logUsage, l.18 isoWeek, l.26 aggregate(text,now,days=14,weeks=8), l.52 table(title,rows,dim) no filter yet; cli.ts:25/27 call sites
- **MED** · 492 B: echo: main ahead 3; src/usage.ts (59 lines): logUsage appends {date,kind,model,usage} to usage.jsonl; CallKind turn\|compact\|prime; Row period/calls/input/read/write/output; isoWeek; aggregate(text,now,days=14,weeks=8), lines without kind=turn, bad lines skipped; hit read/(input+read+write); table(title,rows,dim) right-aligns; grep: cli.ts:25 reads usage.jsonl, l.27 prints day/week dim tables; tui.ts:85 usageTable via accent, l.212 reads usage.jsonl; selfcheck.test.ts:410 test 2026-10-04.

### 560+1 (level 0, tree record 1114, context 380 lines / 128.1 KB)

- **OFF** · 470 B: echo: read optchat tui.ts/usage.ts (main, uncommitted): usageTable() at tui.ts:84-86 dims rows whose calls are all zero (table() shared with cli.ts:27); grep of table(/aggregate( callers; read selfcheck.test.ts usage-aggregation test (local days/ISO weeks, legacy lines=turns, bad lines skipped) and cli.ts stats cmd (l.24-27, no lock, table day/week with dim); T theme fg okhsl + Spacer/StatsPanel scroll line "1-8 of 33 · ↑↓ scroll · Esc/q closes"; no edits yet.
- **MED** · 484 B: echo: read optchat src/tui.ts, usage.ts, selfcheck.test.ts, cli.ts (read-only, no changes): usageTable (muted title, calls-empty periods dimmed) shared by cli `stats` and tui /stats; k() formats k/M; header hint adds /stats; StatsPanel: View stats(mem), session turns/input/read/write/output/hit%, day + ISO-week tables from usage.jsonl, Esc/q closes, scroll footer; cli stats read-only no lock; test: legacy lines=turns, bad lines skipped, 2026-10-02..04 hit 65.0%, W39/W40, W53 edge

### 556+4 (level 2, tree record 1115, context 380 lines / 128.1 KB)

- **OFF** · 509 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables of /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if none left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push; tool: Bash git status + cat src/usage.ts + grep table(/aggregate( callers; echo: main 3 ahead origin, usage.ts aggregate/table(title,rows,dim) shared by cli.ts:27 and tui.ts:85; nothing changed yet.
- **MED** · 508 B: user: ZERO likes /stats; change: hide empty rows (no model calls) in day/week tables, /stats overlay, `optchat stats` (shared table code; filter at render, keep aggregate()); if none left, dim 'no model calls'; bun test green, check demo, one commit on main, no push; tool: Bash ~/.claude/optchat git status, cat src/usage.ts, grep callers; echo: main ahead 3 origin/main; usage.ts table(title,rows,dim) shared cli.ts:27/tui.ts:85; unchanged; tool: read tui.ts 80-220, selfcheck.test.ts 400-430, cli.ts 20-30

### 552+8 (level 3, tree record 1116, context 380 lines / 128.1 KB)

- **OFF** · 937→801→766→712→677 B: talk: /stats overlay demo-verified incl. 40x12; tool: edited README (/stats: view, session totals, usage tables, Esc/q closes, not sent to model) + SPEC, bun test 19 pass; echo: committed c31e624 "feat(tui): /stats overlay with slash-command completion", main 3 ahead origin, unpushed; feat/tui ff-merged, branch deleted; user: ZERO likes /stats; one change: hide empty rows in day/week tables, in /stats and `optchat stats` (shared table code; filter at render, keep aggregate()); if none left dim 'no model calls'; bun test green, demo check, one commit, no push; tool: git status/usage.ts/callers; echo: table(title,rows,dim) shared cli.ts:27 tui.ts:85; nothing changed yet.
- **MED** · 508 B: talk: /stats overlay ok; echo: c31e624 "feat(tui) /stats overlay" on main, docs updated, 19 tests pass; talk: feat/tui ff-merged, branch deleted, main 3 ahead origin unpushed; user: ZERO likes /stats; hide empty day/week table rows (no model calls) in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is), dim 'no model calls' if none left; bun test green, demo check, one commit on main, no push; tool: Bash read usage.ts; echo: table() shared cli.ts:27/tui.ts:85

### 544+16 (level 4, tree record 1117, context 380 lines / 128.1 KB)

- **OFF** · 953→480 B: tool: Bash tmux demo octui (optchat main, uncommitted /stats overlay) 120x30+40x12; echo: View 13 msgs 1%, session 1 turn hit 48.7%, day/week tables, End scrolls (9-34 of 34), q/Esc close, mid-turn "/stats"+Esc keeps Working, not sent to model (log user i0,i13), 40x12 fits but day table cut "…", EXITED 0; Ctrl-O docs README:58, SPEC:519,536. talk: /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion" (README/SPEC, bun test 19 pass; feat/tui ff-\|
- **MED** · 466 B: tool: tmux demo octui (/stats overlay); echo: mid-turn "/stats"+Esc not sent to model (log user i0,i13), q/Esc close, EXITED 0; talk: /stats overlay committed c31e624 (slash completion, 19 tests pass); feat/tui ff-merged main da58dbd, branch deleted, unpushed; user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats`, at render, keep aggregate(), else dim 'no model calls'; tests green, demo check, one commit main, no push.

### 561+1 (level 0, tree record 1121, context 379 lines / 127.3 KB)

- **OFF** · 493 B: tool: Bash python3 edited optchat main (hide empty rows in /stats, uncommitted): usage.ts table() filters periods with no calls (KINDS), returns dim "title: no model calls" if none, aggregate() unchanged; tui.ts usageTable maps 1-line result to dim, else accent header/text rows; selfcheck.test.ts asserts table("day",day) -> ["day","2026-10-04"] and table("day",day.slice(0,2)) === "day: no model calls"; then grepped usage imports in selfcheck.test.ts/tui.ts; output not yet shown, untested.
- **MED** · 473 B: tool: Bash python3 heredoc edits src (assert each old text occurs once): usage.ts table(title,all,dim) filters rows to KINDS.some(k=>r.calls[k]), returns dim("<title>: no model calls") if none; tui.ts usageTable -> table(title,rows,s=>s), single line T.dim else text/accent; selfcheck.test.ts expects table("day",day) first tokens ["day","2026-10-04"] and table("day",day.slice(0,2))=="day: no model calls"; greps ^import.*usage in selfcheck.test.ts, tui.ts; output unseen.

### 564+1 (level 0, tree record 1123, context 382 lines / 128.2 KB)

- **OFF** · 483 B: tool: sed added table to selfcheck.test.ts usage import; ran bun test + `bun src/cli.ts stats` on real data and on OPTCHAT_DIR=/tmp/nonexist; echo: 19 pass 0 fail, 107 expects; real day rows 2026-10-04 turn11 compact110 prime11 in4328 read8497674 write930584 out74897 hit90.1%, 2026-10-05 turn4 compact303 prime8 in342349 read20017373 write5412788 out129924 hit77.7%; weeks W40 11/110/11 90.1%, W41 4/303/8 77.7%; empty dir prints dim "day: no model calls" and "week: no model calls"
- **MED** · 418 B: echo: bun test 19 pass/0 fail 107 expects 1084ms; bun src/cli.ts stats day 2026-10-04 turn 11 compact 110 prime 11 in 4,328 read 8,497,674 write 930,584 out 74,897 hit 90.1%, 2026-10-05 turn 4 compact 303 prime 8 in 342,349 read 20,017,373 write 5,412,788 out 129,924 hit 77.7%; week 2026-W40 same as 10-04, W41 same as 10-05; OPTCHAT_DIR=/tmp/nonexist stats prints dim "day: no model calls" and "week: no model calls"

### 560+2 (level 1, tree record 1125, context 377 lines / 127.3 KB)

- **OFF** · 608→512 B: echo: read optchat code for /stats empty-row filter: tui.ts usageTable dims zero-call rows (l.85), openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck aggregation test l.400-420; no edits yet; tool: Bash python edit in optchat on main (uncommitted, output unseen): usage.ts table() filters rows with no model calls (aggregate() unchanged), returns dim "<title>: no model calls" when none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls line); selfcheck.test.ts ad
- **MED** · 484 B: echo: read optchat /stats code: tui.ts usageTable l.85 dims zero-call rows, openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck test l.400-420; no edits. tool: Bash python edit (optchat main, uncommitted): usage.ts table() filters no-call rows (aggregate() unchanged), dim "<title>: no model calls" if none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls); selfcheck.test.ts asserts empty days hidden; greps usage imports in tests/tui.

### 566+1 (level 0, tree record 1126, context 381 lines / 128.1 KB)

- **OFF** · 256 B: tool: tmux octui 120x40 ran dev/tui-demo.sh, /stats before turn -> empty panel, after "first message" + /stats -> day table shows only non-empty rows; grep "no model calls"/"2026-10-05" escapes checked; Esc, Ctrl-D, EXITED, session killed; no code changes.
- **MED** · 283 B: tool: Bash tmux demo octui 120x40 (dev/tui-demo.sh): /stats overlay captured empty, q closes, send "first message", reopen /stats after turn, capture tail, grep "no model calls"/"2026-10-05", Esc, Ctrl-D, EXITED, kill session; checks empty-row hiding in overlay; output not yet shown

### 560+4 (level 2, tree record 1127, context 378 lines / 127.5 KB)

- **OFF** · 694→512 B: echo: user wants empty rows (no model calls) hidden in day/week tables, in /stats overlay and `optchat stats` (shared table code, filter at rendering, keep aggregate(); dim 'no model calls' line if nothing left); tool: read tui.ts usageTable, cli.ts stats, selfcheck test l.400-420; python edit on main, uncommitted: usage.ts table() filters zero-call rows, returns dim "<title>: no model calls"; tui.ts usageTable simplified; selfcheck adds assertions; echo: imports aggregate/hit/isoWeek from usage.ts in selfc
- **MED** · 506 B: echo: read tui.ts usageTable, cli.ts stats (user: hide no-call rows in day/week tables in overlay + `optchat stats`, filter at render, keep aggregate()); tool: Bash python edit (uncommitted): usage.ts table() drops empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; echo: selfcheck.test.ts:11 imports {aggregate,hit,isoWeek}, tui.ts:14 {aggregate,table}; tool: sed -i adds table to test import; bun test, `bun src/cli.ts stats` real + OPTCHAT_DIR=/tmp/nonexist, output unseen.

### 567+1 (level 0, tree record 1132, context 379 lines / 127.7 KB)

- **OFF** · 439 B: echo: tmux /stats overlay test on TUI demo (/tmp/oc-tui, empty chat then after "first message"): empty panel View "0 messages", "This session: no turns yet", day/week "no model calls"; after turn 13 messages, view 0.9/128 KB (1%), all summarized, 1 turn in 4/read 6,851/write 7,205/out 324/hit 48.7%, day 2026-10-05 turn 1/compact 1/prime 2 in 12/read 13,702/write 28,112/out 696/hit 32.8%, same for 2026-W41; Esc/q closes; Ctrl-D EXITED 0
- **MED** · 465 B: echo: tmux capture, TUI demo /stats overlay (dev/tui-demo.sh, /tmp/oc-tui): empty: View 0 messages, no turns yet, "day: no model calls", "week: no model calls", footer /tmp/oc-tui opus-high, Esc/q closes; after turn: 13 messages 2026-10-05, view 0.9/128 KB (1%), all summarized, session 1 turn input 4 read 6,851 write 7,205 out 324 hit 48.7%, day 2026-10-05 turn 1 compact 1 prime 2 input 12 read 13,702 write 28,112 out 696 hit 32.8%, week 2026-W41 same; EXITED 0

### 566+2 (level 1, tree record 1133, context 378 lines / 127.4 KB)

- **OFF** · 489 B: tool: Bash tmux demo (session octui, 120x40, dev/tui-demo.sh) checked /stats overlay with empty rows hidden: opened /stats on empty chat, q closes, sent "first message", reopened /stats, grepped "no model calls"/"2026-10-05" rows, Esc, Ctrl-D; uncommitted; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 day row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer view 0.9/128 KB; Esc/Ctrl-D EXITED 0.
- **MED** · 406 B: tool: Bash tmux demo octui 120x40 dev/tui-demo.sh to check /stats overlay with hidden empty rows (uncommitted): opened /stats on empty chat, closed q, sent "first message", reopened; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.

### 571+1 (level 0, tree record 1134, context 381 lines / 128.0 KB)

- **OFF** · 482 B: echo: SPEC.md l.566-572 (read-only, no changes): `optchat view` prints current view read-only no lock; `optchat stats` reads usage.jsonl read-only no lock, two plain tables last 14 local days + last 8 ISO weeks oldest first empty periods included, cols calls per kind (turn/compact/prime), input, cache read, cache write, output, hit = read/(input+read+write), dim header only on terminal, no costs/charts; then `optchat browse [out.html]` one self-contained HTML page with the view
- **MED** · 501 B: echo: SPEC.md CLI text: `optchat view` prints current view, read-only, no lock; `optchat stats` reads usage.jsonl read-only, no lock, prints 2 plain tables for last 14 local days and 8 ISO weeks (local dates, oldest first, empty periods included); columns calls per kind turn/compact/prime, input, cache read, cache write, output tokens, hit = read/(input+read+write); only header dim and only on a terminal, no costs, no charts; `optchat browse [out.html]` one self-contained HTML page with the view.

### 564+4 (level 2, tree record 1136, context 376 lines / 126.8 KB)

- **OFF** · 709→661→613→574→549 B: echo: bun test 19 pass/0 fail/107 expects after hiding empty rows; `optchat stats` real data only non-empty days (2026-10-04 turn 11/compact 110/prime 11 hit 90.1%; 2026-10-05 4/303/8 hit 77.7%), weeks W40/W41; empty dir prints "day: no model calls"/"week: no model calls"; talk: now demo overlay; tool: Bash tmux octui 120x40 dev/tui-demo.sh /stats with empty rows hidden (empty chat, q, "first message", reopen, Esc, Ctrl-D, killed); echo: empty chat "day: no model calls", "no turns yet"; after 1 turn 10-05 row (1/1/2, 32.8%) + W41; uncommitted.
- **MED** · 738→510 B: echo: bun test 19 pass/0 fail after hiding empty rows in table(); `optchat stats` data: days 2026-10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 2026-10-05 (4/303/8, hit 77.7%), weeks W40/W41; talk: overlay; tool: tmux octui 120x40 dev/tui-demo.sh /stats: opened empty chat, q, "first message", reopened, Esc, Ctrl-D, killed (uncommitted); echo: empty chat: "day/week: no model calls", "no turns yet"; one turn -> only 2026-10-05 (turn 1/compact 1/prime 2, hit 32.8%) and 2026-W41; footer 0.9/128 EXITED 0

### 570+2 (level 1, tree record 1137, context 380 lines / 127.9 KB)

- **OFF** · 458 B: tool: Bash sed -n 566,572p SPEC.md (read-only, hiding-empty-rows task); echo: SPEC stats paragraph, needs update: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl as two plain tables, last 14 local days + 8 ISO weeks, oldest first, "empty periods included"; cols calls by kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); dim header only on tty; no costs/charts; `optchat browse [out.html]` starts.
- **MED** · 507 B: tool: Bash sed -n 566,572p SPEC.md read SPEC stats paragraph (read-only, hiding-empty-rows task); echo: SPEC.md l.566-572 still states old behaviour: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days + 8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); header dim on tty only; no costs/charts; `optchat browse [out.html]` starts; needs update.

### 572+1 (level 0, tree record 1138, context 380 lines / 127.9 KB)

- **OFF** · 420 B: tool: Bash python patch of SPEC.md (l.568 stats: periods without model calls hidden at rendering via table(), aggregate() keeps them, dim "day/week: no model calls" also in /stats overlay; header+that line dim) and README.md stats row; echo: bun test tail + commit "feat(stats): hide periods without model calls in usage tables" (table() drops empty rows, dim no-calls line, optchat stats + /stats overlay) + log/status.
- **MED** · 479 B: tool: Bash in ~/.claude/optchat: python3 heredoc edits SPEC.md (empty periods hidden at rendering via table(); aggregate() unchanged; dim 'day: no model calls'/'week: no model calls' line, also in /stats overlay; 'only the header (and that line) is dim') and README.md (periods without model calls hidden); then bun test tail -2, git add -A, commit 'feat(stats): hide periods without model calls in usage tables' (Co-Authored-By Claude Opus 5.5), git log/status; no output shown.

### 568+4 (level 2, tree record 1139, context 379 lines / 127.7 KB)

- **OFF** · 657→507 B: tool: Bash grep README.md/SPEC.md for stats docs to update; echo: README.md:40 `optchat stats` = token usage per day (last 14 days) + per ISO week (last 8 weeks); SPEC.md:494 startup dim header from stats(mem); SPEC.md:568 last 14 local days/8 ISO weeks, oldest first, empty periods included; tool: Bash sed -n 566,572p SPEC.md read-only (hide-empty-rows task); echo: SPEC l.566-572 still states old behaviour: optchat stats reads usage.jsonl, two plain tables per day/week, oldest first, "empty periods inc
- **MED** · 670→491 B: tool: Bash grep README.md/SPEC.md for stats docs (14 days/ISO week/dim header/empty periods); echo: README.md:40 `optchat stats` = usage per day/ISO week; SPEC.md:494 dim 3-line stats(mem) header, l.568 14 local days/8 ISO weeks oldest first, empty; tool: Bash sed SPEC.md 566-572 (read-only, hide-empty-rows task); echo: SPEC still old: reads usage.jsonl, two plain tables (same periods), "empty periods included", cols kind turn/compact/prime, input, cache, output, hit; dim header on tty.

### 572+2 (level 1, tree record 1140, context 381 lines / 128.2 KB)

- **OFF** · 525→488 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in `table()`, aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; echo: 19 tests pass, 0 fail, 107 expects (1157ms); fecfd07 "feat(stats): hide empty usage periods"; main...origin/main [ahead 4]
- **MED** · 509 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in table(), aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; echo: 107 expect() calls, 19 tests 0 fail [1157ms], fecfd07 feat(stats): hide periods without model calls in usage tables, main...origin/main [ahead 4]

### 560+8 (level 3, tree record 1141, context 375 lines / 126.7 KB)

- **OFF** · 781→743→579→544→506 B: user: hide no-call rows in day/week tables in /stats overlay and `optchat stats`, filter at rendering, keep aggregate() as is; show dim "no model calls" if nothing left; tool: python edit on main, uncommitted: usage.ts table() filters no-call rows, returns dim "<title>: no model calls"; tui.ts usageTable simplified; tests added; echo: bun test 19 pass, 107 expects; `optchat stats`: 10-04 turn 11/compact 110/prime 11, hit 90.1%; 10-05 4/303/8, 77.7%; weeks W40/W41; empty dir "day/week: no model calls".
- **MED** · 901→504 B: user: hide no-call rows in day/week tables, /stats overlay + `optchat stats`, filter at rendering, keep aggregate(); else dim "no model calls"; bun test green, demo check, 1 commit on main, no push; tool: Bash python edit (uncommitted): usage.ts table() filters empty rows and tui.ts usageTable simplified; tests +assertions; echo: bun test 19 pass/0 fail 107 expects; stats non-empty days only (10-04, 10-05); tool: /stats: 1 turn -> 10-05 row only, no-calls line if empty, Ctrl-D EXITED 0; uncommitted.

### 574+1 (level 0, tree record 1142, context 381 lines / 128.2 KB)

- **OFF** · 576→548→524→475 B: talk: /stats overlay and optchat stats now hide day/week rows with no calls; table() filters at render, aggregate() untouched; dim "day: no model calls"/"week: no model calls" line when none left (prefix added since stats has no titles); bun test 19 pass, +2 checks; real log -> only 2026-10-04/05, W40/W41; empty dir prints both lines; demo clean exit, dim before first turn then one 2026-10-05/W41 row; README+SPEC updated; committed fecfd07, unpushed, main 4 ahead origin.
- **MED** · 498 B: talk: day/week tables no longer show empty rows in /stats and optchat stats; committed main fecfd07, not pushed, 4 ahead origin; table() drops zero-call rows, aggregate() unchanged; empty table shows dim day: no model calls / week: no model calls (prefix added since optchat stats has no titles); bun test 19 pass, 2 new checks; real log shows only 2026-10-04/05, W40/W41; empty dir prints both lines; demo /stats dim before turn 1, single 2026-10-05/W41 row after, clean exit; README/SPEC updated.

### 572+4 (level 2, tree record 1146, context 381 lines / 128.0 KB)

- **OFF** · 700→678→553→477 B: tool: Bash ~/.claude/optchat (main): table() hides periods without model calls, aggregate() unchanged, dim "no model calls" line also in /stats overlay; SPEC/README updated; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; main 4 ahead, unpushed. talk: hid empty day/week rows in /stats and `optchat stats`; demo+log checked. user: ZERO likes the TUI; push main to origin (git push origin main), then reply with pushed range.
- **MED** · 488 B: tool: Bash in ~/.claude/optchat main: edited SPEC.md + README.md (table() hides no-model-call periods, aggregate() unchanged, dim no-calls line); bun test 19 pass; committed fecfd07 "feat(stats): hide empty usage-table periods"; main 4 ahead of origin, unpushed; talk: empty day/week rows now hidden in /stats overlay and `optchat stats`, dim no-calls line if none left; user: ZERO tested the TUI and likes it, asked to push main to origin (git push origin main), reply with pushed range.

### 568+8 (level 3, tree record 1148, context 380 lines / 127.5 KB)

- **OFF** · 548→534→506 B: tool: Bash grep README/SPEC stats docs (14 days/ISO week, SPEC l.568 "empty periods included"); echo: stale, needs update; tool: edited SPEC.md + README.md, bun test 19 pass, committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats and `optchat stats`, dim "day:/week: no model calls" if none left, demo checked; user: ZERO tested TUI, likes it; asks to git push origin main.
- **MED** · 586→512 B: tool: Bash grep README/SPEC stats docs; echo: README l.40 14d/8 ISO wks, SPEC l.494, l.568 stats para "empty periods included", needs update; tool: Bash sed SPEC l.566-572; echo: no edits; tool: Bash (optchat main) edited SPEC.md+README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats and `optchat stats`, dim "no model calls" if none left;

### 576+2 (level 1, tree record 1150, context 380 lines / 127.7 KB)

- **OFF** · 495 B: tool: pushed optchat main to origin (gebeer/shitty-optchat) after user ZERO's request; git push output 955394f..fecfd07 main -> main; range origin/main..main was 4 commits: a5db61d feat(import) append new OptMem notes incrementally, da58dbd feat(tui) pi-style TUI, c31e624 feat(tui) /stats overlay with slash-command completion, fecfd07 feat(stats) hide periods without model calls in usage tables; echo: status before "## main...origin/main [ahead 4]", after push clean "## main...origin/main".
- **MED** · 377 B: tool: Bash in ~/.claude/optchat: git status -sb, log origin/main..main, git push origin main, status again; echo: main was 4 ahead (a5db61d import optmem incremental, da58dbd pi-style TUI, c31e624 /stats overlay, fecfd07 hide no-call periods); pushed 955394f..fecfd07 main -> main to github.com/gebeer/shitty-optchat; status now "## main...origin/main" (in sync, nothing ahead)

### 560+16 (level 4, tree record 1151, context 378 lines / 127.0 KB)

- **OFF** · 986→922→856→864→762 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none left; tool: Bash python edit on main (uncommitted): usage.ts table() filters empty rows, tui.ts usageTable simplified, test assertions; echo: bun test 19 pass/107 expects; stats shows only non-empty days (10-04 11/110/11 hit 90.1%; 10-05 4/303/8) and W40/W41; empty dir prints "day/week: no model calls"; tmux demo 120x40: after 1 turn only 10-05/W41 rows, Esc/Ctrl-D EXITED 0; tool: edit SPEC+README, bun test green, committed fecfd07 "feat(stats): hide periods without model calls in usage tables" (main 4 ahead, unpushed); talk: table() filters, aggregate() unchanged; user: ZERO likes TUI and /stats; asks push main, reply with range.
- **MED** · 469 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edited usage.ts table(), tui.ts usageTable, README/SPEC; echo: bun test 19 pass; real log: non-empty days/weeks only (10-04 11/110/11 90.1%, 10-05 4/303/8); tmux /stats Esc/Ctrl-D exit 0; tool: committed fecfd07 hide no-call periods in usage tables (main 4 ahead, unpushed); user: ZERO likes TUI, asks git push origin main + pushed range.

### 544+32 (level 5, tree record 1152, context 378 lines / 127.0 KB)

- **OFF** · 788→511 B: tool: Bash tmux demo of /stats overlay (120x30, 40x12): view/session tables, End scroll, q/Esc close, not sent to model, table cut at 40x12; talk: committed c31e624 "feat(tui): /stats overlay", 19 tests, main 3 ahead, unpushed. user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats` at render, keep aggregate(); if none left, dim 'no model calls'; bun test green, demo check, one commit on main, no push, short reply. tool: python edit usage.ts table() filter + tui.ts
- **MED** · 520→473 B: tool: Bash /stats demo tmux 120x30+40x12 OK: view, tables, q/Esc close; talk: committed c31e624 /stats, main 3 ahead unpushed; user: ZERO likes /stats; wants no-call day/week rows hidden in overlay and `optchat stats`, aggregate() kept, dim no model calls if none, one commit on main, no push; tool: python edit usage.ts table() filter, tui.ts, tests; echo: 19 pass; committed fecfd07, main 4 ahead; user: ZERO likes TUI; asks git push origin main, reply with pushed range.

### 512+64 (level 6, tree record 1153, context 378 lines / 127.0 KB)

- **OFF** · 673→645→547→506 B: user: ZERO approved feat/tui: ff-merge to main, no push, delete branch; then add TUI /stats (slash autocomplete, bordered scrollable overlay: usage day/week, stats(mem), session totals; Esc/q closes, never sent to model, plain mode ignores; README/SPEC, demo, one commit); later: hide no-call day/week rows in overlay and `optchat stats` (keep aggregate(); dim "no model calls" if none); likes TUI, wants push main; tool: tmux demo /stats OK; bun test 19 pass; talk: c31e624, fecfd07, main 4 ahead unpushed
- **MED** · 501 B: tool: Ctrl-O expand, 19 tests, squashed da58dbd; user: ZERO approved feat/tui: ff main, no push, delete branch; add TUI /stats: overlay (usage day/week, session totals), Esc/q closes, not sent to model, one commit; echo: ff'd, branch deleted, tests pass; user: ZERO likes /stats; hide no-call day/week rows in overlay + `optchat stats` (dim if none); then push origin main, reply pushed range; tool: tmux demo OK, edited usage/tui/tests; talk: c31e624 /stats, fecfd07 hide rows, main 4 ahead unpushed.

## Verdict

**Use MED as the V4.1 prompt-optimization baseline, not yet as a production default.** Both arms returned all 30 jobs. MED stays within NODE on **30/30**, retains **25/25** source job/hash pairs and uses **6** size retries. OFF fits only **26/30** after the full retry allowance, retains **23/25** hash pairs and uses **44** retries. OFF is faster/cheaper in this run (**10.1 s, $0.00522/job** versus MED **23.7 s, $0.00870/job**), but its clipped answers and dropped latest instructions are a poor starting point for reliable memory.

Medium is not a fidelity cure: it drops the user's entire push instruction at 568+8, loses `aggregate()` at 512+64, and imports instructions absent from the stretch at 560+8. Both settings preserve push-as-request, rather than inventing success, in the two audited high merges.

ZERO's correction supersedes the April-V4 probe and its four proposed tuning rounds. This is a fresh V4.1 reasoning comparison using only the unchanged DeepSeek-specific prompt; no old-model results enter these metrics.

## Rounds

### V4.1 baseline — design frozen before calls

- Explicit model: `deepseek/deepseek-v4.1-flash`; no moving latest alias. The [live endpoints API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints) identifies Novita's deployment as `deepseek/deepseek-v4.1-flash-20260910`, context 1,048,576, fp8. Listed USD/million: input $0.24, output $0.96, cache read $0.0048; metered usage, not this list, determines reported cost.
- Two arms: **OFF** `{enabled: false}` and **MED** `{effort: "medium"}`. Both pin `provider: {order: ["novita/fp8"], allow_fallbacks: false}`. Same prompt, source/context layout, 16,000 max output tokens, NODE 512 B, TRIES 5, unchanged size-retry protocol. No sampling parameters are explicitly set.
- Same 30 original jobs, tree end **1153**, covering message compression and merges up to 64 messages. Each replay rebuilds the source message or pair of stored child lines from the historical read-only chat; arm outputs do not feed later jobs. Review the exact stretch, not just historical Sonnet summaries.
- Prompt remains exactly the files committed in `6594dfc`. SHA-256: system `9c08ec458cd625858d5b7757aeeeebeb2f0f6eec4c239e8f327327e02d220752`; step `bd25f461f88f35c7b5df0eafcc0e2dcfa6550a41b631858f12ec520af2e4d22f`. Their known user-first/order tension is intentionally unchanged to establish a clean baseline.
- Foreground, resumable chunks only, alternating OFF and MED over matching job subsets; one process at a time shares the spend ledger. Chunk timing/cache warmth and endpoint load can affect latency and cost; this is one sample per job/arm, not a repeated statistical benchmark.
- Checks: first-try overshoot, final bytes, retries, empties, output/reasoning/cache tokens, per-job cost/latency; source-supported facts, kind attribution, exact hashes, user's instructions, and push-as-request at **560+16 / 512+64**. Their context ends at 575; successful push occurs at 576–578, outside those stretches. Actual push/range is valid in 576+2.

### V4.1 baseline — completed results

**Only variable changed: reasoning disabled versus medium.** All 60 job/arm outputs were reviewed against their exact source stretch. There were no empty replies, HTTP errors, cancelled calls or reruns in this baseline. All **110** returned calls identify `deepseek/deepseek-v4.1-flash` and provider `Novita`; OFF reports zero reasoning tokens, MED reports 118,487 total (3,291/call).

| check | OFF | MED |
|---|---|---|
| completed jobs / calls | 30 / 74 | 30 / 36 |
| first-try overshoots | 18/30 (60%) | 6/30 (20%) |
| size retries | 44 | 6 |
| final fits NODE | 26/30 | 30/30 |
| final mean / max | 497 / 762 B | 474 / 512 B |
| final inside requested 400–470 B band | 6/30 | 6/30 |
| multiline finals / non-ASCII finals | 0 / 2 | 0 / 0 |
| retained source job/hash pairs | 23/25 | 25/25 |
| leaves with wrong/mixed source kinds | 3/10 | 0/10 |
| direct user-bearing stretches starting user-first | 4/9 | 3/9 |
| latency median / mean / max | 7.6 / 10.1 / 29.6 s | 17.6 / 23.7 / 61.7 s |
| total metered cost | $0.15646633 | $0.26101950 |

**Conclusion:** medium reduces retries sharply and produces substantially better formed summaries, but costs 67% more and takes 2.35× the mean job latency under the observed cache conditions. It is the stronger correctness-oriented baseline. Neither setting reliably enforces the target band or user's-word priority. Freeze these results before any V4.1-specific prompt optimization; no tuning rounds were run.

## Source-fidelity review

Counts are diagnostics, not a semantic accuracy score: hash pairs count each exact hash once per source job (including repeated merge occurrences), not 25 distinct commits. Leaf-kind checks compare all kind tags in a final with that message's actual kind; they do not catch unsupported prose within a correctly tagged item. The nine direct user-bearing stretches exclude instructions merely mentioned inside echo asides.

| job / issue | OFF | MED |
|---|---|---|
| 555+1, talk only | Correct `talk:`, hashes/unpushed state retained, but **549 B after five attempts** | Correct talk summary, **495 B after one retry**; omits the explicit never-sent-to-model guarantee and turns-only distinction |
| 558+1, echo of old usage.ts | Adds `user:` instructions and a `tool:` call from context to an echo-only stretch | Echo-only description of the readout; no invented user/tool items |
| 564+1, test/stat readout | Imports prior `sed` test-import edit as a new `tool:` item | Keeps `echo:` and exact stats; still adds the prior `OPTCHAT_DIR=/tmp/nonexist` invocation and "dim" styling, neither visible in this readout |
| 566+1, tmux command without output | Says the after-turn day table **shows only non-empty rows** before any output is in the stretch | Describes the command/check and explicitly says **output not yet shown** |
| 571+1, SPEC excerpt | Faithful excerpt with 14 days/8 weeks | Faithful excerpt with 14 days/8 weeks; neither imports a separate README read |
| 572+1, edit/test/commit command without output | Relabels the command tail as `echo:` although no result is supplied | Keeps `tool:` and **no output shown**; no invented successful test/commit result |
| 552+8 / 544+16 | 552+8 remains **677 B** after five attempts; 544+16 drops all user instructions | Keeps user's hide-empty-rows instructions, but places tool/talk before user |
| 560+8, inherited user reference inside echo | Promotes the aside to `user:`; final drops the demo section | Also promotes the aside; imports "bun test green, demo check, 1 commit on main, no push" from context, not this stretch |
| 568+8, user's latest push/range request | Size retries drop **reply with pushed range**, preserving only push | First try includes the request; its 512-B retry **drops the entire user item** |
| 544+32, two successive user decisions | 788→511 B retry drops **fecfd07 and the latest push/range request**, leaving the earlier "no push" instruction | Retains both hashes and the latest push/range request, though not user-first |
| 512+64, high merge | Drops da58dbd and **reply with pushed range**, keeps `aggregate()` | Keeps all three hashes and pushed-range request, but drops **keep aggregate()**, slash autocomplete, `stats(mem)` and plain-mode behavior |

OFF's four oversized finals are **555+1 (549 B), 552+8 (677), 564+4 (549), 560+16 (762)**. The harness returns the shortest try after TRIES, not a fabricated hard-cropped success. Several nominally fitting OFF answers are visibly clipped: 554+2 ends "demo v", 552+4 ends ", m", 560+2 ends "selfcheck.test.ts ad", 560+4 ends "in selfc", 568+4 ends "empty periods inc". OFF 544+16 even copies the retry's **LIMIT delimiter `|`**, ending "ff-|". A valid byte count alone is not useful memory.

Both final **560+16** and **512+64** summaries retain an unpushed state/request, not a successful push. The context boundary audit remains valid for V4.1: exclusive limit 576, last context message 575; actual push 576–578 is outside these sources. Both arms retain the real **955394f..fecfd07** range at **576+2**, where the successful push is in the source. These findings do not imply all push-related user wording survived at neighboring merges.

All 30 source stretches were checked, including the unlisted jobs. Useful dense summaries coexist with important omissions: MED loses source provenance details at 552+8 (edit/test grouped under echo), and 560+1 loosely calls `usageTable` shared with the CLI when the shared function is `table()`. No arm invents a `work:` tag, and neither emits a multiline final. MED's clean leaf-kind count must not be mistaken for zero context leakage or perfect technical fidelity.

## Recommendation

For future **V4.1-specific** optimization, start from the unchanged `prompts/compact-deepseek.txt` + `prompts/compact-deepseek-step.txt`, explicit `deepseek/deepseek-v4.1-flash`, `novita/fp8` pin with fallbacks disabled, and **`reasoning: {effort: "medium"}`**. Keep OFF as the speed/cost diagnostic rather than selecting it as the default on this evidence.

The first follow-up should address user's-word preservation/order without changing model, provider or reasoning: rule 3's user-first priority conflicts with rule 5's chronological tag-order wording. Source isolation and retry fidelity still need their own later single-variable checks; do not call medium production-ready just because its byte/hash checks pass. Any candidate should repeat this same sample and then a small end-to-end V4.1 tree before a real switch.

No production transport or prompt changes were made; no old-model tuning and no additional V4.1 prompt-tuning rounds were run. SPEC §16.9 lives on main (`2ba9689`), not this branch; no SPEC edits.

## Spend and reproduction

- V4.1 baseline: **$0.417485829024** metered (OFF $0.156466328832 + MED $0.261019500192), all 110 calls matched to results.
- Shared session ledger: **$0.700043217984** recorded across 195 calls, including **$0.28255738896** before V4.1 (carried handover balance and completed April-V4 A2). Adding archived calibration **$0.14585926** plus a conservative **$0.02** allowance for the earlier cancelled request gives **$0.865902477984**, still below the unchanged **$2 total**. The ledger's $1.80 ceiling leaves room for those excluded amounts. Recorded totals are not an exact provider invoice.
- Raw results, prompt snapshots, reconstructed jobs: gitignored `dev/probe-out/v41/`; shared spend: `dev/probe-out/spend.jsonl`. No raw dumps are committed. `~/.optchat` is read-only; neither Claude nor optchat is launched.

```bash
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts run \
  --probe 3 --arms OFF --jobs 30 --end 1153 --take 1 \
  --out dev/probe-out/v41 --spend dev/probe-out/spend.jsonl --budget 1.8
# Repeat with MED and resume; never run concurrent ledger owners.
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts report \
  --probe 3 --out dev/probe-out/v41 --md docs/probes/compact-deepseek-v41.md
OPTCHAT_CLAUDE=/bin/false bun test
```

Checks: **21 tests pass, 0 fail** with `OPTCHAT_CLAUDE=/bin/false`. Probe tests use stubbed fetch/fake processes and check the explicit model, equal arm messages/provider, reasoning settings, bounded replay, shared budget and chunk resumption. Rebuilt source/context snapshots and prompt hashes were checked against this exact replay. Work stays on `feat/compact-probe`, unpushed.
