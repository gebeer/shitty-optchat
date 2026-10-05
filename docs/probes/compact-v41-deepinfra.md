# Compactor provider comparison: V4.1 medium DeepInfra vs. Novita

Date 2026-10-05 · 30 real jobs from `~/.optchat` (read-only), replayed in their original order, sequentially per arm · NODE 512 B, TRIES 5 · script `dev/compact-probe.ts`

MED reuses the completed Novita V4.1-medium baseline read-only; no Novita compactor jobs are rerun. DI uses the same explicit `deepseek/deepseek-v4.1-flash` and `reasoning: {effort: "medium"}`, pinned to `deepinfra/fp8` with fallbacks disabled. Both endpoints advertise fp8. Only the provider pin changes in the submitted request: unchanged DeepSeek-specific system/step, same historical source/context, 16,000 max output tokens and unchanged size retries; no sampling overrides. No aliases, prompt tuning, Claude invocation or optchat launch. Parent jobs consume stored Sonnet children, not earlier outputs from either arm; this is not an end-to-end V4.1 tree. Provider defaults, cache warmth and run/load conditions can differ, so one replay cannot establish statistical fidelity equivalence or isolate provider-only speed effects.

## Summary

| arm | model / settings | jobs | overshoot 1st try | final bytes mean / max | final > NODE | retries / job | tokens / call: uncached input / cache read / cache write | output (reasoning) / call | cost / job | ×434 | latency / job mean / max | empty replies | observed provider |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MED | deepseek/deepseek-v4.1-flash (DeepSeek prompt, medium, novita/fp8) | 30 | 20% | 474 / 512 | 0 | 0.20 | 16278 / 23047 / 0 | 3444 (3291) | $0.00870 | $3.776 | 23.7 / 61.7 s | 0 | Novita |
| DI | deepseek/deepseek-v4.1-flash (same DeepSeek prompt, medium, deepinfra/fp8) | 30 | 50% | 473 / 512 | 0 | 0.60 | 10229 / 29181 / 0 | 1826 (1667) | $0.00368 | $1.596 | 26.5 / 92.6 s | 0 | DeepInfra |

Tokens are means per successful call, including size retries; reasoning is a subset of output, not additional tokens. Cost/job and latency/job include size retries. Failed/interrupted calls are excluded from arm means but remain in the spend ledger when metered. ×434 is an illustrative cost/job projection; the historical 434 counts calls including retries, not 434 distinct jobs. Cache warmth, chunk boundaries and endpoint load can affect cost/latency; one run is not a repeated-trial benchmark.

## Jobs side by side

Bytes per try (→ = a size retry), then the final line (the shortest try).

### 555+1 (level 0, tree record 1105, context 381 lines / 128.3 KB)

- **MED** · 979→495 B: talk: both parts done, nothing pushed, main 3 ahead of origin; merge: ff main to da58dbd, deleted feat/tui; /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion", bun test 19/19, README+SPEC updated; /st offers stats completion; /stats bordered overlay: view stats, session totals, day/week tables; scroll arrows/PgUp/PgDn/Home/End, Esc or q closes; Esc with overlay open does not cancel a running turn; startup hint adds /stats, plain mode sends it as text; demo ok
- **DI** · 899→491 B: talk: done, nothing pushed, main 3 ahead origin; ff main to da58dbd, deleted feat/tui; /stats commit c31e624, bun test 19 pass, README/SPEC updated; /st completes to stats (slash only); bordered overlay: view stats + session turn totals + day/week tables (empty days dim), scroll arrows/PgUp/PgDn/Home/End, Esc/q closes; never sent to model, Esc open doesn't cancel turn; hint adds /stats, plain mode sends it as text; demo-verified, 40x12 ok; restart optchat or dev/tui-demo.sh, type /stats

### 554+2 (level 1, tree record 1106, context 380 lines / 128.2 KB)

- **MED** · 472 B: echo: 19 tests, 105 expects, 1119ms; commits c31e624 /stats overlay slash-command completion, da58dbd pi-style TUI, a5db61d OptMem import; main ahead 3 of origin; talk: ff-merged feat/tui into main da58dbd, branch deleted; /stats c31e624: slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text; 19 tests pass, README/SPEC updated, tmux demo verified incl 40x12; session totals count turns only.
- **DI** · 675→512 B: echo: bun test 19 pass/0 fail, 105 expects (1119ms); git log main: c31e624 "feat(tui): /stats overlay with slash-command completion", da58dbd "feat(tui): pi-style TUI for the chat on @earendil-works/pi-tui", a5db61d "feat(import): append new OptMem notes incrementally"; ## main...origin/main [ahead 3]; talk: optchat: ff-merged feat/tui into main (da58dbd), branch deleted; /stats overlay committed c31e624 (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to mo

### 552+4 (level 2, tree record 1107, context 380 lines / 128.2 KB)

- **MED** · 492 B: talk: /stats overlay works in tmux demo, README/SPEC next; tool: Bash ~/.claude/optchat main: python edit README.md+SPEC.md (/stats StatsPanel: view+session+day/week tables, Esc/q, not sent to model, plain mode sends text), bun test, commit "feat(tui): /stats overlay with slash-command completion"; echo: 19 pass; c31e624 on main over da58dbd, a5db61d; 3 ahead origin, unpushed; talk: ff-merged feat/tui, branch deleted; overlay slash-only completion, Esc/q closes; tmux demo ok incl. 40x12.
- **DI** · 718→504 B: talk: overlay verified in demo, updating README/SPEC then committing; tool: Bash on main edited README.md (/stats panel: view, session token totals, usage tables, scroll keys, Esc/q closes, not sent to model) and SPEC.md (/stats StatsPanel, plain mode sends it as text, code map), bun test, git add, commit "feat(tui): /stats overlay with slash-command completion"; echo: 19 tests pass; c31e624 on main over da58dbd/... a5db61d, main 3 ahead origin, unpushed; talk: ff-merged feat/tui into main, branch d

### 556+2 (level 1, tree record 1110, context 379 lines / 128.1 KB)

- **MED** · 461 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables, in the /stats overlay and in `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash cd ~/.claude/optchat: git status -sb, cat -n src/usage.ts, grep table\|aggregate callers to read usage table code
- **DI** · 450 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day and week tables, in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing is left, show a dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash in optchat read git status -sb, cat -n src/usage.ts, grep table(/aggregate( callers; output unseen

### 558+1 (level 0, tree record 1111, context 379 lines / 128.1 KB)

- **MED** · 492 B: echo: main ahead 3; src/usage.ts (59 lines): logUsage appends {date,kind,model,usage} to usage.jsonl; CallKind turn\|compact\|prime; Row period/calls/input/read/write/output; isoWeek; aggregate(text,now,days=14,weeks=8), lines without kind=turn, bad lines skipped; hit read/(input+read+write); table(title,rows,dim) right-aligns; grep: cli.ts:25 reads usage.jsonl, l.27 prints day/week dim tables; tui.ts:85 usageTable via accent, l.212 reads usage.jsonl; selfcheck.test.ts:410 test 2026-10-04.
- **DI** · 393 B: tool: Bash read optchat src/usage.ts (full), callers aggregate()/table() (cli.ts:25,27; tui.ts:85,212; selfcheck.test.ts:410), git status main ahead 3; echo: logUsage writes {date,kind,model,usage} to usage.jsonl, KINDS turn\|compact\|prime, isoWeek, aggregate(text,now,14,8) skips unreadable lines/legacy=turn, hit=read/(input+read+write), table(title,rows,dim) right-aligns nums; no edits yet.

### 560+1 (level 0, tree record 1114, context 380 lines / 128.1 KB)

- **MED** · 484 B: echo: read optchat src/tui.ts, usage.ts, selfcheck.test.ts, cli.ts (read-only, no changes): usageTable (muted title, calls-empty periods dimmed) shared by cli `stats` and tui /stats; k() formats k/M; header hint adds /stats; StatsPanel: View stats(mem), session turns/input/read/write/output/hit%, day + ISO-week tables from usage.jsonl, Esc/q closes, scroll footer; cli stats read-only no lock; test: legacy lines=turns, bad lines skipped, 2026-10-02..04 hit 65.0%, W39/W40, W53 edge
- **DI** · 464 B: echo: sed read optchat src/tui.ts + usage.ts/selfcheck.test.ts/cli.ts (main, /stats empty-row work): usageTable(title,rows) wraps table() with accent header, dims periods whose calls are all 0; hint line now "Enter sends ... Ctrl-O expands tools · /stats ..."; T = okhsl colors; cli.ts stats prints table("day",day)/table("week",week); test "usage aggregation" (legacy lines=turns, bad lines skipped, day[2] turn1/compact1/prime1, hit 65.0%, isoWeek W39/W40/W53).

### 556+4 (level 2, tree record 1115, context 380 lines / 128.1 KB)

- **MED** · 508 B: user: ZERO likes /stats; change: hide empty rows (no model calls) in day/week tables, /stats overlay, `optchat stats` (shared table code; filter at render, keep aggregate()); if none left, dim 'no model calls'; bun test green, check demo, one commit on main, no push; tool: Bash ~/.claude/optchat git status, cat src/usage.ts, grep callers; echo: main ahead 3 origin/main; usage.ts table(title,rows,dim) shared cli.ts:27/tui.ts:85; unchanged; tool: read tui.ts 80-220, selfcheck.test.ts 400-430, cli.ts 20-30
- **DI** · 742→512 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day and week tables, in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if none left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply; tool: Bash git status + cat src/usage.ts + grep table(/aggregate( callers in ~/.claude/optchat (output not yet shown); echo: main "## main...origin/main [ahead 3]"; usage.ts aggregate

### 552+8 (level 3, tree record 1116, context 380 lines / 128.1 KB)

- **MED** · 508 B: talk: /stats overlay ok; echo: c31e624 "feat(tui) /stats overlay" on main, docs updated, 19 tests pass; talk: feat/tui ff-merged, branch deleted, main 3 ahead origin unpushed; user: ZERO likes /stats; hide empty day/week table rows (no model calls) in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is), dim 'no model calls' if none left; bun test green, demo check, one commit on main, no push; tool: Bash read usage.ts; echo: table() shared cli.ts:27/tui.ts:85
- **DI** · 492 B: talk: /stats overlay works; tool: Bash edited README+SPEC, tests 19 pass; echo: c31e624, main 3 ahead origin; talk: feat/tui ff-merged, branch deleted, 40x12 ok; user: ZERO likes /stats; one change: hide empty rows (no model calls) in day/week tables, in /stats overlay and `optchat stats` (shared table code; filter at render); if none, dim 'no model calls'; bun test green, demo check, one commit, no push; tool: Bash cat usage.ts, grep callers; echo: shared cli.ts:27/tui.ts:85; no changes

### 544+16 (level 4, tree record 1117, context 380 lines / 128.1 KB)

- **MED** · 466 B: tool: tmux demo octui (/stats overlay); echo: mid-turn "/stats"+Esc not sent to model (log user i0,i13), q/Esc close, EXITED 0; talk: /stats overlay committed c31e624 (slash completion, 19 tests pass); feat/tui ff-merged main da58dbd, branch deleted, unpushed; user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats`, at render, keep aggregate(), else dim 'no model calls'; tests green, demo check, one commit main, no push.
- **DI** · 494 B: tool: tmux demo (120x30/40x12): /stats overlay View 13 msgs, tables, q/Esc close; mid-turn "/stats"+Esc not sent to model (log i0,i13); talk: /stats overlay committed c31e624 (slash-command completion); feat/tui ff-merged into main, branch deleted, main 3 ahead origin, unpushed; user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats` at render, keep aggregate(); if none, dim 'no model calls'; bun test green, demo check, one commit on main, no push.

### 561+1 (level 0, tree record 1121, context 379 lines / 127.3 KB)

- **MED** · 473 B: tool: Bash python3 heredoc edits src (assert each old text occurs once): usage.ts table(title,all,dim) filters rows to KINDS.some(k=>r.calls[k]), returns dim("<title>: no model calls") if none; tui.ts usageTable -> table(title,rows,s=>s), single line T.dim else text/accent; selfcheck.test.ts expects table("day",day) first tokens ["day","2026-10-04"] and table("day",day.slice(0,2))=="day: no model calls"; greps ^import.*usage in selfcheck.test.ts, tui.ts; output unseen.
- **DI** · 572→529→494 B: tool: Bash python3 edit (asserts each match once) for hiding empty periods in stats tables: src/usage.ts table(title, all, dim) filters rows via KINDS.some(calls) at render, keeps aggregate; if none left returns dim "title: no model calls"; src/tui.ts usageTable restyled (header accent, rows text, single "no model calls" dim); src/selfcheck.test.ts expects table("day", day) lines [day,2026-10-04] and table("day", day.slice(0,2))="day: no model calls"; then greps usage imports; uncommitted.

### 564+1 (level 0, tree record 1123, context 382 lines / 128.2 KB)

- **MED** · 418 B: echo: bun test 19 pass/0 fail 107 expects 1084ms; bun src/cli.ts stats day 2026-10-04 turn 11 compact 110 prime 11 in 4,328 read 8,497,674 write 930,584 out 74,897 hit 90.1%, 2026-10-05 turn 4 compact 303 prime 8 in 342,349 read 20,017,373 write 5,412,788 out 129,924 hit 77.7%; week 2026-W40 same as 10-04, W41 same as 10-05; OPTCHAT_DIR=/tmp/nonexist stats prints dim "day: no model calls" and "week: no model calls"
- **DI** · 417 B: echo: bun test 19 pass/0 fail, 107 expects, 1084ms; `bun src/cli.ts stats` real data day 2026-10-04: turn 11, compact 110, prime 11, input 4,328, cache read 8,497,674, write 930,584, output 74,897, hit 90.1%; 2026-10-05: 4/303/8, in 342,349, read 20,017,373, write 5,412,788, out 129,924, hit 77.7%; week W40 same as 10-04, W41 same as 10-05; OPTCHAT_DIR=/tmp/nonexist -> "day: no model calls", "week: no model calls"

### 560+2 (level 1, tree record 1125, context 377 lines / 127.3 KB)

- **MED** · 484 B: echo: read optchat /stats code: tui.ts usageTable l.85 dims zero-call rows, openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck test l.400-420; no edits. tool: Bash python edit (optchat main, uncommitted): usage.ts table() filters no-call rows (aggregate() unchanged), dim "<title>: no model calls" if none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls); selfcheck.test.ts asserts empty days hidden; greps usage imports in tests/tui.
- **DI** · 510 B: echo: read optchat code to hide empty rows in /stats: tui.ts usageTable l.85 dims zero-call rows, openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck aggregation test l.400-420; tool: Bash python edit optchat main (uncommitted, output unseen): usage.ts table() filters rows with no model calls (aggregate() unchanged), returns dim "<title>: no model calls"; tui.ts usageTable (accent header, dim no-calls line); selfcheck.test.ts adds assertions (empty days hidden, "day: no model calls")

### 566+1 (level 0, tree record 1126, context 381 lines / 128.1 KB)

- **MED** · 283 B: tool: Bash tmux demo octui 120x40 (dev/tui-demo.sh): /stats overlay captured empty, q closes, send "first message", reopen /stats after turn, capture tail, grep "no model calls"/"2026-10-05", Esc, Ctrl-D, EXITED, kill session; checks empty-row hiding in overlay; output not yet shown
- **DI** · 227 B: tool: Bash tmux demo octui 120x40 dev/tui-demo.sh: "/stats" before a turn shows no model calls; after "first message" (10s) + "/stats" shows tables; grep for "no model calls"/"2026-10-05 "; Esc, Ctrl-D -> EXITED; session killed

### 560+4 (level 2, tree record 1127, context 378 lines / 127.5 KB)

- **MED** · 506 B: echo: read tui.ts usageTable, cli.ts stats (user: hide no-call rows in day/week tables in overlay + `optchat stats`, filter at render, keep aggregate()); tool: Bash python edit (uncommitted): usage.ts table() drops empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; echo: selfcheck.test.ts:11 imports {aggregate,hit,isoWeek}, tui.ts:14 {aggregate,table}; tool: sed -i adds table to test import; bun test, `bun src/cli.ts stats` real + OPTCHAT_DIR=/tmp/nonexist, output unseen.
- **DI** · 676→582→503 B: user: hide empty (no model calls) rows in day/week tables in /stats overlay and `optchat stats`, filter at rendering, keep aggregate(); if none left show dim 'no model calls'; bun test green, demo check, one commit, no push; tool: read usage.ts table()/aggregate() (cli.ts:27, tui.ts:85); edit: table() filters no-call rows, dim "<title>: no model calls", tui usageTable simplified, selfcheck asserts; echo: selfcheck imports table, tui.ts:14 aggregate,table,Row; tool: Bash sed -i, bun test, stats run.

### 567+1 (level 0, tree record 1132, context 379 lines / 127.7 KB)

- **MED** · 465 B: echo: tmux capture, TUI demo /stats overlay (dev/tui-demo.sh, /tmp/oc-tui): empty: View 0 messages, no turns yet, "day: no model calls", "week: no model calls", footer /tmp/oc-tui opus-high, Esc/q closes; after turn: 13 messages 2026-10-05, view 0.9/128 KB (1%), all summarized, session 1 turn input 4 read 6,851 write 7,205 out 324 hit 48.7%, day 2026-10-05 turn 1 compact 1 prime 2 input 12 read 13,702 write 28,112 out 696 hit 32.8%, week 2026-W41 same; EXITED 0
- **DI** · 469 B: echo: tmux demo (dev/tui-demo.sh, /tmp/oc-tui, 120x40) /stats overlay on empty chat shows "View: 0 messages", "This session: no turns yet", "day: no model calls"/"week: no model calls", bordered "Esc/q closes"; after "first message": 13 msgs, view 0.9/128 KB (1%), all summarized, 1 turn input 4/read 6,851/write 7,205/out 324/hit 48.7%; day 2026-10-05 1/1/2, 12/13,702/28,112/696, 32.8%; W41 same; closed q, Esc, Ctrl-D EXITED 0; empty-row hiding verified uncommitted.

### 566+2 (level 1, tree record 1133, context 378 lines / 127.4 KB)

- **MED** · 406 B: tool: Bash tmux demo octui 120x40 dev/tui-demo.sh to check /stats overlay with hidden empty rows (uncommitted): opened /stats on empty chat, closed q, sent "first message", reopened; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.
- **DI** · 541→501 B: tool: Bash tmux demo (octui 120x40, dev/tui-demo.sh) checked /stats overlay hiding empty rows: /stats on empty chat, q closed it, sent "first message", reopened /stats after turn, grepped "no model calls"/"2026-10-05" rows, Esc, Ctrl-D, EXITED check, killed session; echo: empty chat dim "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0; uncommitted.

### 571+1 (level 0, tree record 1134, context 381 lines / 128.0 KB)

- **MED** · 501 B: echo: SPEC.md CLI text: `optchat view` prints current view, read-only, no lock; `optchat stats` reads usage.jsonl read-only, no lock, prints 2 plain tables for last 14 local days and 8 ISO weeks (local dates, oldest first, empty periods included); columns calls per kind turn/compact/prime, input, cache read, cache write, output tokens, hit = read/(input+read+write); only header dim and only on a terminal, no costs, no charts; `optchat browse [out.html]` one self-contained HTML page with the view.
- **DI** · 466 B: echo: optchat SPEC.md cmd docs: `optchat view` prints the current view; `optchat stats` reads usage.jsonl read-only, prints two plain tables (last 14 local days, last 8 ISO weeks, oldest first, empty periods included): calls per kind (turn/compact/prime), input, cache read, cache write, output tokens, hit = read/(input+read+write); only the header is dim, only on a terminal; no costs/charts; `optchat browse [out.html]` one self-contained HTML page with the view.

### 564+4 (level 2, tree record 1136, context 376 lines / 126.8 KB)

- **MED** · 738→510 B: echo: bun test 19 pass/0 fail after hiding empty rows in table(); `optchat stats` data: days 2026-10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 2026-10-05 (4/303/8, hit 77.7%), weeks W40/W41; talk: overlay; tool: tmux octui 120x40 dev/tui-demo.sh /stats: opened empty chat, q, "first message", reopened, Esc, Ctrl-D, killed (uncommitted); echo: empty chat: "day/week: no model calls", "no turns yet"; one turn -> only 2026-10-05 (turn 1/compact 1/prime 2, hit 32.8%) and 2026-W41; footer 0.9/128 EXITED 0
- **DI** · 772→503 B: echo: bun test 19 pass/0 fail/107 expects; `optchat stats`: non-empty days only (2026-10-04: turn 11/compact 110/prime 11, hit 90.1%; 10-05: 4/303/8, hit 77.7%), weeks W40/W41; empty dir -> "day"/"week: no model calls"; talk: next overlay in demo; tool: tmux demo (120x40, dev/tui-demo.sh): /stats empty chat, q, "first message", reopen, Esc, Ctrl-D; echo: empty chat: no-calls lines + "no turns yet"; after 1 turn only 2026-10-05 (turn 1/compact 1/prime 2, hit 32.8%) + 2026-W41; EXITED 0; uncommitted.

### 570+2 (level 1, tree record 1137, context 380 lines / 127.9 KB)

- **MED** · 507 B: tool: Bash sed -n 566,572p SPEC.md read SPEC stats paragraph (read-only, hiding-empty-rows task); echo: SPEC.md l.566-572 still states old behaviour: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days + 8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); header dim on tty only; no costs/charts; `optchat browse [out.html]` starts; needs update.
- **DI** · 567→493 B: tool: Bash sed -n 566,572p SPEC.md (read SPEC stats paragraph); echo: SPEC.md l.566-572 read-only for hiding-empty-rows task, still old behaviour: optchat view prints view no lock; optchat stats reads usage.jsonl, two plain tables, last 14 local days + 8 ISO weeks, oldest first, empty periods included; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); only header dim on tty; no costs/charts; optchat browse [out.html] starts; needs update

### 572+1 (level 0, tree record 1138, context 380 lines / 127.9 KB)

- **MED** · 479 B: tool: Bash in ~/.claude/optchat: python3 heredoc edits SPEC.md (empty periods hidden at rendering via table(); aggregate() unchanged; dim 'day: no model calls'/'week: no model calls' line, also in /stats overlay; 'only the header (and that line) is dim') and README.md (periods without model calls hidden); then bun test tail -2, git add -A, commit 'feat(stats): hide periods without model calls in usage tables' (Co-Authored-By Claude Opus 5.5), git log/status; no output shown.
- **DI** · 692→494 B: tool: Bash python3 heredoc in optchat (main) subbed SPEC.md l.566-572 stats text: periods without model calls hidden at rendering (table(), aggregate() keeps them), none left -> dim "day: no model calls"/"week: no model calls" incl. /stats overlay, header (and that line) dim; README stats row "Periods without model calls are hidden"; then bun test (tail -2), git add -A, commit -q "feat(stats): hide periods without model calls in usage tables" (table() drops empty day/week rows, aggregate()

### 568+4 (level 2, tree record 1139, context 379 lines / 127.7 KB)

- **MED** · 670→491 B: tool: Bash grep README.md/SPEC.md for stats docs (14 days/ISO week/dim header/empty periods); echo: README.md:40 `optchat stats` = usage per day/ISO week; SPEC.md:494 dim 3-line stats(mem) header, l.568 14 local days/8 ISO weeks oldest first, empty; tool: Bash sed SPEC.md 566-572 (read-only, hide-empty-rows task); echo: SPEC still old: reads usage.jsonl, two plain tables (same periods), "empty periods included", cols kind turn/compact/prime, input, cache, output, hit; dim header on tty.
- **DI** · 574→512 B: tool: grep README.md/SPEC.md for stats docs to update (hide-empty-rows task); echo: README.md:40 `optchat stats` = token usage per day (last 14 days) and per ISO week (last 8 weeks); SPEC.md:494 dim header of three lines from stats(mem), SPEC.md:568 stats text still old: reads usage.jsonl, two plain tables, last 14 local days/8 ISO weeks (oldest first, "empty periods included"), cols calls per kind turn/compact/prime, input, cache read/write, output, hit, header dim only on tty, no costs/charts; tool: sed -

### 572+2 (level 1, tree record 1140, context 381 lines / 128.2 KB)

- **MED** · 509 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in table(), aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; echo: 107 expect() calls, 19 tests 0 fail [1157ms], fecfd07 feat(stats): hide periods without model calls in usage tables, main...origin/main [ahead 4]
- **DI** · 456 B: tool: Bash in ~/.claude/optchat on main (hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in table(), aggregate() unchanged; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables"; echo: bun test 19 pass/0 fail (107 expects, 1157ms), commit fecfd07 (same subject); main...origin/main [ahead 4].

### 560+8 (level 3, tree record 1141, context 375 lines / 126.7 KB)

- **MED** · 901→504 B: user: hide no-call rows in day/week tables, /stats overlay + `optchat stats`, filter at rendering, keep aggregate(); else dim "no model calls"; bun test green, demo check, 1 commit on main, no push; tool: Bash python edit (uncommitted): usage.ts table() filters empty rows and tui.ts usageTable simplified; tests +assertions; echo: bun test 19 pass/0 fail 107 expects; stats non-empty days only (10-04, 10-05); tool: /stats: 1 turn -> 10-05 row only, no-calls line if empty, Ctrl-D EXITED 0; uncommitted.
- **DI** · 519→506 B: user: hide no-model-call rows in day/week tables (/stats overlay + `optchat stats`), keep aggregate(); tool: python edit main uncommitted: usage.ts table() drops empty rows, dim "<title>: no model calls"; tui.ts usageTable simplified; echo: bun test 19 pass; stats real: only non-empty days/weeks (10-04 turn 11/compact 110/prime 11 hit 90.1%; 10-05 4/303/8 77.7%), empty dir "day/week: no model calls"; tool: demo /stats 120x40: empty chat no-calls + "no turns yet"; 1 turn -> 10-05 row, W41; uncommitted.

### 574+1 (level 0, tree record 1142, context 381 lines / 128.2 KB)

- **MED** · 498 B: talk: day/week tables no longer show empty rows in /stats and optchat stats; committed main fecfd07, not pushed, 4 ahead origin; table() drops zero-call rows, aggregate() unchanged; empty table shows dim day: no model calls / week: no model calls (prefix added since optchat stats has no titles); bun test 19 pass, 2 new checks; real log shows only 2026-10-04/05, W40/W41; empty dir prints both lines; demo /stats dim before turn 1, single 2026-10-05/W41 row after, clean exit; README/SPEC updated.
- **DI** · 462 B: talk: day/week tables hide rows with no model calls in /stats overlay and optchat stats; table() filters at render, aggregate() unchanged, shared code; committed main fecfd07, not pushed, 4 ahead of origin; empty table -> dim 'day: no model calls'/'week: no model calls' (prefix added; optchat stats has no titles); bun test 19 pass, 2 new checks (hidden empty days, all-empty dim line); real log only 2026-10-04/05, W40/W41; demo /stats ok; README+SPEC updated.

### 572+4 (level 2, tree record 1146, context 381 lines / 128.0 KB)

- **MED** · 488 B: tool: Bash in ~/.claude/optchat main: edited SPEC.md + README.md (table() hides no-model-call periods, aggregate() unchanged, dim no-calls line); bun test 19 pass; committed fecfd07 "feat(stats): hide empty usage-table periods"; main 4 ahead of origin, unpushed; talk: empty day/week rows now hidden in /stats overlay and `optchat stats`, dim no-calls line if none left; user: ZERO tested the TUI and likes it, asked to push main to origin (git push origin main), reply with pushed range.
- **DI** · 712→566→496 B: tool: Bash in ~/.claude/optchat on main: edited SPEC.md + README.md (table() hides periods without model calls, aggregate() unchanged, dim "day/week: no model calls" line); bun test 19 pass/107 expects; committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; 4 ahead, unpushed; talk: hid empty rows in /stats overlay + `optchat stats`, README/SPEC updated; user: ZERO tested the TUI and likes it; push main to origin (git push origin main), reply with the pushed range.

### 568+8 (level 3, tree record 1148, context 380 lines / 127.5 KB)

- **MED** · 586→512 B: tool: Bash grep README/SPEC stats docs; echo: README l.40 14d/8 ISO wks, SPEC l.494, l.568 stats para "empty periods included", needs update; tool: Bash sed SPEC l.566-572; echo: no edits; tool: Bash (optchat main) edited SPEC.md+README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats and `optchat stats`, dim "no model calls" if none left;
- **DI** · 471 B: tool: grep README/SPEC "14 days\|ISO week\|dim header\|periods without"; echo: README l.40, SPEC l.494/l.568 say "empty periods included", needs update; tool: edited SPEC.md+README.md stats row, bun test 19 pass, committed fecfd07, main 4 ahead origin, unpushed; talk: table() hides empty day/week rows in /stats overlay and `optchat stats`; dim "day:/week: no model calls" if none left; user: ZERO tested TUI, likes it; asks to push main to origin, reply with pushed range.

### 576+2 (level 1, tree record 1150, context 380 lines / 127.7 KB)

- **MED** · 377 B: tool: Bash in ~/.claude/optchat: git status -sb, log origin/main..main, git push origin main, status again; echo: main was 4 ahead (a5db61d import optmem incremental, da58dbd pi-style TUI, c31e624 /stats overlay, fecfd07 hide no-call periods); pushed 955394f..fecfd07 main -> main to github.com/gebeer/shitty-optchat; status now "## main...origin/main" (in sync, nothing ahead)
- **DI** · 392 B: user: push main to origin and reply with pushed range; tool: Bash in ~/.claude/optchat git log origin/main..main and git push origin main; echo: main was 4 ahead (fecfd07 hide periods without model calls, c31e624 /stats overlay, da58dbd pi-style TUI, a5db61d incremental import); pushed 955394f..fecfd07 main -> main to github.com/gebeer/shitty-optchat.git; main now in sync with origin/main.

### 560+16 (level 4, tree record 1151, context 378 lines / 127.0 KB)

- **MED** · 469 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edited usage.ts table(), tui.ts usageTable, README/SPEC; echo: bun test 19 pass; real log: non-empty days/weeks only (10-04 11/110/11 90.1%, 10-05 4/303/8); tmux /stats Esc/Ctrl-D exit 0; tool: committed fecfd07 hide no-call periods in usage tables (main 4 ahead, unpushed); user: ZERO likes TUI, asks git push origin main + pushed range.
- **DI** · 773→507 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edit main: usage.ts table() filters empty rows, tui.ts usageTable simplified, test asserts; echo: bun test 19 pass (107 expects); stats only non-empty days/weeks (10-04 11/110/11 hit 90.1%, 10-05 4/303/8), empty dir "day/week: no model calls"; demo checked; committed fecfd07 (main 4 ahead, unpushed); user: ZERO likes /stats; asks `git push origin main` and the pushed range.

### 544+32 (level 5, tree record 1152, context 378 lines / 127.0 KB)

- **MED** · 520→473 B: tool: Bash /stats demo tmux 120x30+40x12 OK: view, tables, q/Esc close; talk: committed c31e624 /stats, main 3 ahead unpushed; user: ZERO likes /stats; wants no-call day/week rows hidden in overlay and `optchat stats`, aggregate() kept, dim no model calls if none, one commit on main, no push; tool: python edit usage.ts table() filter, tui.ts, tests; echo: 19 pass; committed fecfd07, main 4 ahead; user: ZERO likes TUI; asks git push origin main, reply with pushed range.
- **DI** · 487 B: tool: tmux demo /stats overlay OK, never sent to model; talk: committed c31e624 "feat(tui): /stats overlay", 19 tests, main 3 ahead unpushed; user: ZERO likes /stats; hide empty day/week rows in overlay + `optchat stats` (aggregate unchanged); dim 'no model calls' if none; tool: edit usage.ts table(), tui.ts; echo: bun test 19 pass; real log filtered; empty dir 'no model calls'; demo ok; committed fecfd07, main 4 ahead unpushed; user: asks `git push origin main`, reply pushed range.

### 512+64 (level 6, tree record 1153, context 378 lines / 127.0 KB)

- **MED** · 501 B: tool: Ctrl-O expand, 19 tests, squashed da58dbd; user: ZERO approved feat/tui: ff main, no push, delete branch; add TUI /stats: overlay (usage day/week, session totals), Esc/q closes, not sent to model, one commit; echo: ff'd, branch deleted, tests pass; user: ZERO likes /stats; hide no-call day/week rows in overlay + `optchat stats` (dim if none); then push origin main, reply pushed range; tool: tmux demo OK, edited usage/tui/tests; talk: c31e624 /stats, fecfd07 hide rows, main 4 ahead unpushed.
- **DI** · 844→503 B: user: ZERO approved feat/tui: ff-merge main, no push, delete branch; add TUI /stats overlay (usage day/week, session totals), Esc/q closes, not sent to model, plain mode ignores; README/SPEC, one commit, no push. tool: Ctrl-O expands tool boxes, 19 tests pass, squashed da58dbd. echo: ff-merged, branch deleted, unpushed. user: likes /stats; wants no-call day/week rows hidden in overlay and `optchat stats` (keep aggregate()); likes TUI, asks `git push origin main`. talk: c31e624, fecfd07; not pushed.

## Verdict

**Lower metered cost confirmed; equal fidelity not confirmed.** DeepInfra retains all source hashes and fits all 30 finals, but needs three times as many size retries, invents an observation for a pending demo command, corrupts an import readout during retry, and drops important user wording. Keep Novita as the reference baseline rather than silently promoting DeepInfra as fidelity-equivalent.

### Endpoint, quantization and reasoning

Pinned **`deepinfra/fp8`**, fallbacks disabled. The live endpoint API advertises **fp8 for both DeepInfra and Novita**. DeepInfra: context **1,048,576**, max completion **131,072**, supports `reasoning` and `reasoning_effort`. This matches the advertised quantization class, not proof of identical serving kernels, weights or provider defaults.

Listed prices per million tokens at the probe start:

| pinned endpoint | input | output | cache read |
|---|---:|---:|---:|
| Novita fp8 | $0.24 | $0.96 | $0.0048 |
| DeepInfra fp8 | **$0.14** | **$0.42** | **$0.0042** |

These are the API's quoted prices; do not apply its discount field again. All comparisons below use actual returned metering, not list-price estimates.

**Important settings finding:** both current routes translate our unchanged OpenRouter request `reasoning: {effort: "medium"}` to native **low**. Two tiny streaming diagnostics, separate from compactor jobs, used OpenRouter's actual upstream-body echo:

- DeepInfra: native model `deepseek-ai/DeepSeek-V4.1-Flash`, `reasoning: {enabled: true, effort: "low"}`, max_tokens 16,000; returned `OK`, 11 reasoning tokens / 46 reasoning characters, **0.903 s**, **$0.0000105336**.
- Novita control: native `reasoning_effort: "low"`, forwarded `enable_thinking` value redacted by OpenRouter, max_tokens 16,000; returned `OK`, 13 reasoning tokens / 54 reasoning characters, **1.666 s**, **$0.0000223344**.

No requested setting was changed to compensate. All **48 real compactor dispatches** still request **medium**, and all observed responses report **DeepInfra** and the explicit V4.1 model. The tiny diagnostics establish the current translation, not retrospective proof of the original baseline's upstream payload or an independent inspection of provider internals. Call this a comparison at **the same requested medium setting**, not a test of literal native medium. The original Novita baseline recorded requested medium but did not capture its native upstream body.

### Smoke gate

First historical job **555+1**, reused as job one in the full sample:

- **899→491 B**, one size retry, **22.793 s**, **$0.006410765592**.
- Correct `talk:` kind, both source hashes **da58dbd/c31e624**, explicit **nothing pushed**, main 3 ahead, merge/commit/tests/demo and `/stats` behavior retained. No obvious invented fact or wrong-source topic. Session-own-turns-only detail is omitted.
- Same saved Novita job: **979→495 B**, **30.070 s**, **$0.013574914848**.
- Straight-line 30-job projection including both diagnostics: **$0.19235583576**, about **11m24s**. One-job projection, not a guarantee; source sizes, size retries, cache and load can change it.

The smoke was sane and comfortably below the run cap, so the user's conditional approval was followed: the remaining 29 jobs ran automatically, without a second go-ahead. No Gemma full run occurred; its smoke-only latency rejection is committed separately.

### Full sample metrics

| metric, same 30 jobs | Novita V4.1 medium (MED) | DeepInfra V4.1 medium (DI) |
|---|---:|---:|
| successful completions, including size retries | 36 | 48 |
| first-answer overshoot | 6/30 (20%) | 15/30 (50%) |
| finals ≤512 bytes | **30/30** | **30/30** |
| final bytes mean / max | 474.4 / 512 | 472.7 / 512 |
| finals in target 400–470 B | 6/30 | 7/30 |
| total size retries | **6** | **18** |
| size retries/job | 0.20 | 0.60 |
| exact source hash pairs retained, first / final | **25/25 / 25/25** | **25/25 / 25/25** |
| novel hashes absent from source and context, final | 0 | 0 |
| wrong/mixed source-kind sets on single-message jobs | 0/10 | 1/10 |
| direct-user first, where present in source | 3/9 | 4/9 |
| entire direct-user item missing | 1/9 (568+8) | 0/9 |
| mean time/job, including size retries | **23.7 s** | **26.5 s** |
| median / max time/job | 17.6 / 61.7 s | 20.1 / 92.6 s |
| first-response mean | 19.1 s | 16.2 s |
| metered cost/job | **$0.00870** | **$0.00368** |
| sample cost, including size retries | **$0.26102** | **$0.11032** |

Hash pairs mean distinct hash occurrences per exact source/job, not unique hashes across the entire sample. User/tag checks are narrow indicators: keeping a `user:` tag or every hash does **not** establish instruction/fact fidelity. Source-kind checking above covers only the ten single-message jobs; merged-job provenance defects are reviewed separately below.

Observed cost/job is **57.7% lower**, while mean job time is **11.9% higher**. The first responses were faster on average, but the extra size retries and long tails erased that speed advantage. These are one-run observations, not repeated-trial timing or statistical equivalence results.

DI returned **48/48 HTTP 200 responses**, all finish **stop**, with **zero transport retries, empty replies or failed/interrupted jobs**. Nine foreground chunks each performed an unmetered endpoint-price lookup before their first paid call; the corresponding job clock includes that lookup and request/response artifact logging. No backoff or failed-request time inflated this sample.

DI metering: **1,891,693 prompt tokens**, **1,400,704 cache-read tokens (74.0%)**, zero cache-write, **87,639 output tokens**, including **80,012 reasoning tokens**. MED: 1,415,717 prompt, 829,696 cached (58.6%), zero cache-write, 123,988 output including 118,487 reasoning. DI has 35/48 calls with nonzero metered reasoning; a simple call returning zero reasoning is not evidence that the requested mode was disabled. Lower prices, greater cache coverage and less total returned reasoning all contribute to the observed cost saving; it is not a cache-independent price comparison.

All finals are single-line. One violates the ASCII-only reminder: **560+1** retains a Unicode middle dot (`·`) in the quoted startup hint. It still fits **464 UTF-8 bytes**. There are no oversized finals and no hash losses during retries, but clipping remains visible at **554+2 (`never sent to mo`), 552+4 (`branch d`), 556+4 (`usage.ts aggregate`), 572+1 (`aggregate()`) and 568+4 (`tool: sed -`)**. The shared retry asks for a displayed 512-byte prefix; byte compliance can conceal lost endings and factual changes.

### Fabrication and instruction-preservation review

All 30 exact source stretches and both arms' finals were reviewed, with first attempts inspected for retry-induced failures. Main findings and useful counterexamples:

| job / exact source | DeepInfra finding | Novita reference |
|---|---|---|
| 555+1, completed merge/stats talk | Sane smoke: correct hashes, explicit nothing pushed, tests/demo and main 3 ahead | Also faithful |
| 554+2 / 552+4, dense results and reports | Retries clip at `never sent to mo` / `branch d`, losing later plain-mode, demo and session-accounting details | Rephrases to retain more of the tail |
| 556+2, user request + read command | Keeps aggregate(), rendering-only change, dim fallback, tests/demo, conventional main commit, no push, short reply; output unseen | Also faithful |
| 558+1, echo-only code/readout | Adds a preceding **tool:** event from context; mixed tool/echo instead of the source's echo-only kind | Echo-only |
| 560+1, old code/test echo | Useful readout, no invented completed fix; quotes one non-ASCII middle dot | Also read-only, but loosely calls usageTable shared with CLI |
| 556+4, user/read chain | Keeps core user constraints; retry loses the last read command and clips the echo | Keeps the final read command |
| 552+8, direct user change request | **Drops `keep aggregate() as is` on its first, already fitting answer**; loses conventional/on-main/short-reply wording too | Keeps aggregate() and on-main |
| 544+16, demo/report/user merge | Keeps aggregate(), fallback, tests/demo/main/no-push instructions; folds actual demo output under tool instead of separate echo | Keeps echo provenance; also imports da58dbd from context |
| 561+1, edit/grep command without output | No invented successful grep/test; final retry drops the explicit "result unseen" qualifier | Explicit output unseen |
| 564+1, actual tests/stats echo | Accurate counts but imports CLI invocation and empty-dir path from context | Has the same invocation/path import (plus dim styling not visible in plain output) |
| 560+2, old readout then pending edit | Keeps echo and tool separate and explicitly says output unseen; no fabricated test/grep outcome | Also faithful |
| 566+1, tmux command without any result | **Invented observation:** says before-turn `/stats` **shows no model calls**, after-turn **shows tables**, and describes EXITED/session-killed outcome despite no supplied output | Describes requested capture/check, **output not yet shown** |
| 560+4, old import echo then pending sed/test command | First answer is faithful. **Size retries create a user item from context and change the echo to `selfcheck imports table`**, although the actual readout lacks table and the following sed addition has no result yet | Keeps old import and pending command, output unseen |
| 567+1, actual demo echo | Preserves actual counts/EXITED 0, but imports q/Esc/Ctrl-D actions and uncommitted state from context | Echo-only with actual counts |
| 566+2 / 564+4, supplied demo results | Useful, source-supported test/demo outcomes and exit state | Also faithful |
| 571+1 / 570+2, stale SPEC text/read | Faithfully preserves old "empty periods included" behavior and the need to update; no fabricated edit | Also faithful |
| 572+1, docs/test/commit command without output | No invented pass, commit hash or completed push; clipped command tail, no explicit output-unseen qualifier | Keeps output unseen |
| 568+4, read-only docs chain | Reorders/collapses old-doc facts under the first echo; final pending `sed` item is clipped | Preserves separate command/result sequence |
| 572+2 / 574+1, actual commit echo/report | Correct fecfd07, tests, ahead/unpushed state, table()/aggregate() and dim fallback | Also faithful |
| 560+8, inherited user aside | Promotes the nested aside to user and loses demo exit details | Also promotes/imports user wording from context; retains exit |
| 572+4, latest direct push/range request | Retains push main and reply with pushed range after two retries | Also retains request |
| 568+8, latest direct push/range request | **Retains the latest user item in 471 B**, a genuine win; loses aggregate() wording | Fits but drops the entire latest user item |
| 576+2, actual successful push | Correct 955394f..fecfd07, all hashes, main now in sync; **adds a user request from context**, although source is tool/echo only | Correct actual push and source-kind sequence |
| 560+16, pending push/range request | Keeps latest push/range, aggregate(), fecfd07 and main 4 ahead/unpushed | Also keeps them |
| 544+32, earlier no-push then latest push request | Preserves both hashes, aggregate() and latest push/range; drops earlier no-push/one-commit wording | Keeps earlier wording as well as latest request |
| 512+64, high merge | First answer keeps latest pushed-range reply instruction; **retry drops that instruction**, dim fallback and main 4 ahead. Keeps aggregate() and plain-mode behavior, and records push as pending | Keeps latest pushed-range reply and ahead/unpushed state, but drops aggregate() and plain-mode wording |

No final introduces a novel commit hash or falsely says a push succeeded before the historical source contains its result. The boundary audit remains unchanged: **560+16/512+64** end at exclusive message limit **576**; actual push at 576–578 is outside their source/context. At **576+2**, where success really is supplied, DI correctly records the pushed range and in-sync state. No replay leak or harness/source mismatch was found.

However, **no novel hash does not mean no fabrication**: the pending demo observation and wrong import readout are unsupported outcomes. Context/user-tag leakage, dropped aggregate() wording and lost pushed-range reply instruction remain real fidelity defects. Novita also has known defects (missing latest user at 568+8, context-imported instructions, lost aggregate() at 512+64); it is not production-ready merely because all hashes/bytes pass.

### Recommendation

Keep the saved **Novita V4.1 requested-medium baseline** as the reference. **DeepInfra fp8 is a credible lower-cost candidate, but not confirmed fidelity-equivalent under the unchanged prompt/retry protocol.** Byte/hash compliance matches, and it fixes one missing-user case, but new unsupported observations/import state and instruction loss prevent a blanket replacement recommendation. It is also not faster end-to-end in this sample.

No provider fallback, reasoning/request change, prompt tuning, production transport edit or end-to-end tree test was performed. Future prompt/retry optimization should target source/result boundaries and user-instruction preservation rather than treating fitting bytes as success. The current upstream-low translation is documented, not "fixed" by silently changing the user's requested medium JSON. No SPEC edits; §16.9 stays on main (`2ba9689`).

### Spend and reproduction

Full DI sample including the reused smoke: **$0.110315498832**. Two settings diagnostics: **$0.000032868**. Total recorded for this run: **$0.110348366832**, below the **$5/run** cap. The 30-job Novita reference was reused with zero new compactor calls; the tiny Novita settings control above is separate and charged to this run.

Raw results, complete actual request/response bodies, endpoint snapshots, both native upstream diagnostics and manual-review extracts: gitignored **`dev/probe-out/v41-deepinfra/`**. Baseline/source/prompt snapshots reused read-only in place from `dev/probe-out/v41/`; shared metering ledger `dev/probe-out/spend.jsonl`. No secrets or raw scratch artifacts committed.

```bash
# Historical commands. All 30 DI jobs are complete; successful jobs skip on resume.
OPTCHAT_CLAUDE=/bin/false bun --preload ./dev/probe-out/v41-deepinfra/log-requests.ts dev/compact-probe.ts run \
  --probe 7 --arms DI --jobs 30 --end 1153 --take 4 \
  --out dev/probe-out/v41-deepinfra --spend dev/probe-out/spend.jsonl --budget 5
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts report \
  --probe 7 --out dev/probe-out/v41-deepinfra --md docs/probes/compact-v41-deepinfra.md
OPTCHAT_CLAUDE=/bin/false bun dev/probe-out/v41-deepinfra/validate.ts --complete
python dev/probe-out/v41-deepinfra/analyze.py
OPTCHAT_CLAUDE=/bin/false bun test
```

Checks: **21 tests pass, 0 fail, 166 expect() calls**. Stubbed initial/retry DI requests match MED exactly except the provider pin; foreign arms cannot invoke Claude and exhausted/invalid budgets refuse dispatch. Ignored validation verifies all 30 exact historical source/context snapshots, unchanged prompt bytes/hashes, every actual initial/size-retry request, all 48 matching successful responses, both current upstream-low diagnostics, and exact ledger costs. All paid work was foreground/resumable, in chunks of at most four jobs; no background process, Claude or optchat launch, chat writes or push. Unrelated `docs/probes/compactor-candidates-research.md` was left untouched.

Sources: [live OpenRouter endpoint/quantization/pricing API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints); [DeepInfra model API](https://deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash/api). Native settings evidence is the saved OpenRouter upstream echo, not an inference from token counts alone.
