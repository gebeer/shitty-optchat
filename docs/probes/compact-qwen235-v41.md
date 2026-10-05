# Compactor comparison: Qwen3-235B Instruct vs. V4.1 Flash medium

Date 2026-10-05 · 30 real jobs from `~/.optchat` (read-only), replayed in their original order, sequentially per arm · NODE 512 B, TRIES 5 · script `dev/compact-probe.ts`

MED reuses the completed V4.1-medium baseline; no DeepSeek calls are repeated. QW uses explicit `qwen/qwen3-235b-a22b-2507` with reasoning omitted (non-thinking). Both use the unchanged DeepSeek-specific system/step, same historical source/context, `novita/fp8` pin with fallbacks disabled, 16,000 max output tokens and unchanged size retries. No gist-prompt arm, aliases, prompt tuning, Claude invocation or optchat launch. Parent jobs consume stored Sonnet children, not earlier outputs from either arm; this is not an end-to-end model tree. Native reasoning behavior differs by design and cache/load/run conditions differ, so cost and speed are observations, not isolated model-only effects.

## Summary

| arm | model / settings | jobs | overshoot 1st try | final bytes mean / max | final > NODE | retries / job | tokens / call: uncached input / cache read / cache write | output (reasoning) / call | cost / job | ×434 | latency / job mean / max | empty replies | observed provider |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MED | deepseek/deepseek-v4.1-flash (DeepSeek prompt, medium, novita/fp8) | 30 | 20% | 474 / 512 | 0 | 0.20 | 16278 / 23047 / 0 | 3444 (3291) | $0.00870 | $3.776 | 23.7 / 61.7 s | 0 | Novita |
| QW | qwen/qwen3-235b-a22b-2507 (same DeepSeek prompt, reasoning omitted (non-thinking), novita/fp8) | 30 | 57% | 479 / 936 | 3 | 1.07 | 40511 / 0 / 0 | 189 (0) | $0.00768 | $3.335 | 20.5 / 63.2 s | 0 | Novita |

Tokens are means per successful call, including size retries; reasoning is a subset of output, not additional tokens. Cost/job and latency/job include size retries. Failed/interrupted calls are excluded from arm means but remain in the spend ledger when metered. ×434 is an illustrative cost/job projection; the historical 434 counts calls including retries, not 434 distinct jobs. Cache warmth, chunk boundaries and endpoint load can affect cost/latency; one run is not a repeated-trial benchmark.

## Jobs side by side

Bytes per try (→ = a size retry), then the final line (the shortest try).

### 555+1 (level 0, tree record 1105, context 381 lines / 128.3 KB)

- **MED** · 979→495 B: talk: both parts done, nothing pushed, main 3 ahead of origin; merge: ff main to da58dbd, deleted feat/tui; /stats committed c31e624 "feat(tui): /stats overlay with slash-command completion", bun test 19/19, README+SPEC updated; /st offers stats completion; /stats bordered overlay: view stats, session totals, day/week tables; scroll arrows/PgUp/PgDn/Home/End, Esc or q closes; Esc with overlay open does not cancel a running turn; startup hint adds /stats, plain mode sends it as text; demo ok
- **QW** · 535→512 B: talk: Both parts done, main 3 commits ahead origin: 1) merged feat/tui (da58dbd) into main, deleted branch; 2) /stats overlay added on main c31e624: slash-autocomplete "/stats", opens bordered scrollable overlay (Esc/q closes) with view stats, session totals (turns only), usage day/week tables (dimmed 0-days), arrow/PgUp/PgDn/Home/End scroll; overlay never sent to model, hint mentions /stats, plain mode sends it as text; tested in demo (completion, open, scroll, close, mid-turn, narrow 40x12), bun test 19/1

### 554+2 (level 1, tree record 1106, context 380 lines / 128.2 KB)

- **MED** · 472 B: echo: 19 tests, 105 expects, 1119ms; commits c31e624 /stats overlay slash-command completion, da58dbd pi-style TUI, a5db61d OptMem import; main ahead 3 of origin; talk: ff-merged feat/tui into main da58dbd, branch deleted; /stats c31e624: slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain mode sends as text; 19 tests pass, README/SPEC updated, tmux demo verified incl 40x12; session totals count turns only.
- **QW** · 663→511 B: echo: 105 expect() calls Ran 19 tests across 1 file. [1119.00ms] c31e624 feat(tui): /stats overlay with slash-command completion da58dbd feat(tui): pi-style TUI for the chat on @earendil-works/pi-tui a5db61d feat(import): append new OptMem notes incrementally ## main...origin/main [ahead 3]; talk: optchat: ff-merged feat/tui into main (da58dbd), branch deleted; /stats overlay committed c31e624 (slash-only completion, bordered scrollable view+session+day/week tables, Esc/q closes, never sent to model, plain

### 552+4 (level 2, tree record 1107, context 380 lines / 128.2 KB)

- **MED** · 492 B: talk: /stats overlay works in tmux demo, README/SPEC next; tool: Bash ~/.claude/optchat main: python edit README.md+SPEC.md (/stats StatsPanel: view+session+day/week tables, Esc/q, not sent to model, plain mode sends text), bun test, commit "feat(tui): /stats overlay with slash-command completion"; echo: 19 pass; c31e624 on main over da58dbd, a5db61d; 3 ahead origin, unpushed; talk: ff-merged feat/tui, branch deleted; overlay slash-only completion, Esc/q closes; tmux demo ok incl. 40x12.
- **QW** · 944→511 B: talk: Overlay works in demo; updating README/SPEC, then committing. tool: Bash in ~/.claude/optchat on main: python edit (asserts once) of README.md (adds `/stats` panel paragraph: view, session token totals, usage tables; scroll keys; Esc/q closes; not sent to model) and SPEC.md (documents `/stats` overlay `StatsPanel`, plain mode sends it as text, code map), then bun test, git add -A, commit "feat(tui): /stats overlay with slash-command completion", git log/status; output not yet shown. echo: bun test 19

### 556+2 (level 1, tree record 1110, context 379 lines / 128.1 KB)

- **MED** · 461 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day+week tables, in the /stats overlay and in `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if nothing left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, don't push; short reply; tool: Bash cd ~/.claude/optchat: git status -sb, cat -n src/usage.ts, grep table\|aggregate callers to read usage table code
- **QW** · 369 B: user: ZERO likes /stats; requests hide empty rows (no model calls) in day/week tables (overlay and `optchat stats`), share table code, render dim "no model calls" if all empty, keep aggregate() as is; tool: Bash cd ~/.claude/optchat, git status -sb, cat -n src/usage.ts, grep -n "table(\|aggregate(" src/*.ts, to read usage table code and callers for filtering at render

### 558+1 (level 0, tree record 1111, context 379 lines / 128.1 KB)

- **MED** · 492 B: echo: main ahead 3; src/usage.ts (59 lines): logUsage appends {date,kind,model,usage} to usage.jsonl; CallKind turn\|compact\|prime; Row period/calls/input/read/write/output; isoWeek; aggregate(text,now,days=14,weeks=8), lines without kind=turn, bad lines skipped; hit read/(input+read+write); table(title,rows,dim) right-aligns; grep: cli.ts:25 reads usage.jsonl, l.27 prints day/week dim tables; tui.ts:85 usageTable via accent, l.212 reads usage.jsonl; selfcheck.test.ts:410 test 2026-10-04.
- **QW** · 464 B: echo: src/usage.ts:1-59 defines logUsage(dir,kind,model,usage) to append {date,kind,model,usage} to usage.jsonl, aggregate(text,now,days,weeks) parses it into daily/weekly Row[] with calls/input/read/write/output/hit, table(title,rows,dim) formats plain dim header and right-aligned numbers; callers: cli.ts stats cmd, tui.ts /stats overlay, selfcheck.test.ts; KINDS=["turn","compact","prime"], isoWeek() by local Thursday, hit() from cache read/(input+read+write)

### 560+1 (level 0, tree record 1114, context 380 lines / 128.1 KB)

- **MED** · 484 B: echo: read optchat src/tui.ts, usage.ts, selfcheck.test.ts, cli.ts (read-only, no changes): usageTable (muted title, calls-empty periods dimmed) shared by cli `stats` and tui /stats; k() formats k/M; header hint adds /stats; StatsPanel: View stats(mem), session turns/input/read/write/output/hit%, day + ISO-week tables from usage.jsonl, Esc/q closes, scroll footer; cli stats read-only no lock; test: legacy lines=turns, bad lines skipped, 2026-10-02..04 hit 65.0%, W39/W40, W53 edge
- **QW** · 227 B: echo: usageTable() now hides empty rows (no model calls) in day/week tables, shows dim 'no model calls' if all empty; shared table code updated in usage.ts, used by /stats overlay and `optchat stats`; test passes, demo verified

### 556+4 (level 2, tree record 1115, context 380 lines / 128.1 KB)

- **MED** · 508 B: user: ZERO likes /stats; change: hide empty rows (no model calls) in day/week tables, /stats overlay, `optchat stats` (shared table code; filter at render, keep aggregate()); if none left, dim 'no model calls'; bun test green, check demo, one commit on main, no push; tool: Bash ~/.claude/optchat git status, cat src/usage.ts, grep callers; echo: main ahead 3 origin/main; usage.ts table(title,rows,dim) shared cli.ts:27/tui.ts:85; unchanged; tool: read tui.ts 80-220, selfcheck.test.ts 400-430, cli.ts 20-30
- **QW** · 596→512 B: user: ZERO likes /stats; one change: hide empty rows (no model calls) in day and week tables, in /stats overlay and `optchat stats` (shared table code; filter at rendering, keep aggregate() as is); if none left show dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply; tool: Bash git status + cat usage.ts + grep table(/aggregate( callers in ~/.claude/optchat; echo: repo state "## main...origin/main [ahead 3]", src/usage.ts has aggregate/table shared

### 552+8 (level 3, tree record 1116, context 380 lines / 128.1 KB)

- **MED** · 508 B: talk: /stats overlay ok; echo: c31e624 "feat(tui) /stats overlay" on main, docs updated, 19 tests pass; talk: feat/tui ff-merged, branch deleted, main 3 ahead origin unpushed; user: ZERO likes /stats; hide empty day/week table rows (no model calls) in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is), dim 'no model calls' if none left; bun test green, demo check, one commit on main, no push; tool: Bash read usage.ts; echo: table() shared cli.ts:27/tui.ts:85
- **QW** · 936→936→936→936→936 B: talk: overlay works in demo; tool: Bash on optchat main edited README (`/stats` panel: view, session totals, usage tables, Esc/q closes, not sent to model) + SPEC (StatsPanel, plain mode sends text), bun test 19 pass; echo: committed c31e624 "feat(tui): /stats overlay with slash-command completion" (main 3 ahead origin, unpushed); talk: feat/tui ff-merged, branch deleted; demo ok incl. 40x12; session totals count turns only; user: ZERO likes /stats; one change: hide empty rows (no model calls) in day/week tables, in /stats overlay and `optchat stats` (shared table code; filter at render, keep aggregate() as is); if none left dim 'no model calls' line; bun test green, check in demo, one conventional commit on main, no push, short reply; tool: Bash git status, cat usage.ts, grep callers; echo: main ahead 3 of origin; table(title, rows, dim) shared by cli.ts:27 and tui.ts:85; read tui.ts/test/cli.ts spots; nothing changed yet

### 544+16 (level 4, tree record 1117, context 380 lines / 128.1 KB)

- **MED** · 466 B: tool: tmux demo octui (/stats overlay); echo: mid-turn "/stats"+Esc not sent to model (log user i0,i13), q/Esc close, EXITED 0; talk: /stats overlay committed c31e624 (slash completion, 19 tests pass); feat/tui ff-merged main da58dbd, branch deleted, unpushed; user: ZERO likes /stats; hide empty (no model calls) day/week rows in overlay and `optchat stats`, at render, keep aggregate(), else dim 'no model calls'; tests green, demo check, one commit main, no push.
- **QW** · 948→512 B: tool: Bash tmux demo octui (optchat main, uncommitted /stats overlay) at 120x30 and 40x12; echo: overlay shows View 13 msgs 1%, session 1 turn hit 48.7%, day/week tables, End scrolls (9-34 of 34); q/Esc close; mid-turn "/stats"+Esc keeps "Working", not sent to model (log user i0,i13 only); 40x12 fits but day table cut "...", editor overlaps edges; EXITED 0; Ctrl-O docs README:58, SPEC:519,536; read SPEC/README keys (no /stats yet). talk: /stats overlay committed c31e624 "feat(tui): /stats overlay with slash

### 561+1 (level 0, tree record 1121, context 379 lines / 127.3 KB)

- **MED** · 473 B: tool: Bash python3 heredoc edits src (assert each old text occurs once): usage.ts table(title,all,dim) filters rows to KINDS.some(k=>r.calls[k]), returns dim("<title>: no model calls") if none; tui.ts usageTable -> table(title,rows,s=>s), single line T.dim else text/accent; selfcheck.test.ts expects table("day",day) first tokens ["day","2026-10-04"] and table("day",day.slice(0,2))=="day: no model calls"; greps ^import.*usage in selfcheck.test.ts, tui.ts; output unseen.
- **QW** · 339 B: tool: Bash edited src/usage.ts table() to filter out periods with no model calls and show dim "title: no model calls", updated tui.ts usageTable to use it (accent header, text rows, dim fallback), adapted selfcheck.test.ts test to expect filtered days and "no model calls" line; grep confirmed imports; changes uncommitted, not yet tested.

### 564+1 (level 0, tree record 1123, context 382 lines / 128.2 KB)

- **MED** · 418 B: echo: bun test 19 pass/0 fail 107 expects 1084ms; bun src/cli.ts stats day 2026-10-04 turn 11 compact 110 prime 11 in 4,328 read 8,497,674 write 930,584 out 74,897 hit 90.1%, 2026-10-05 turn 4 compact 303 prime 8 in 342,349 read 20,017,373 write 5,412,788 out 129,924 hit 77.7%; week 2026-W40 same as 10-04, W41 same as 10-05; OPTCHAT_DIR=/tmp/nonexist stats prints dim "day: no model calls" and "week: no model calls"
- **QW** · 297 B: echo: 0 fail, 107 expects, 19 tests; `optchat stats` output (2026-10-04: turn 11/compact 110/prime 11/input 4.3k/read 8.5M/write 930k/output 74.9k/hit 90.1%; 2026-10-05: turn 4/compact 303/prime 8/input 342k/read 20.0M/write 5.4M/output 130k/hit 77.7%); empty day/week tables show "no model calls"

### 560+2 (level 1, tree record 1125, context 377 lines / 127.3 KB)

- **MED** · 484 B: echo: read optchat /stats code: tui.ts usageTable l.85 dims zero-call rows, openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck test l.400-420; no edits. tool: Bash python edit (optchat main, uncommitted): usage.ts table() filters no-call rows (aggregate() unchanged), dim "<title>: no model calls" if none left; tui.ts usageTable simplified (accent header, text rows, dim no-calls); selfcheck.test.ts asserts empty days hidden; greps usage imports in tests/tui.
- **QW** · 433 B: echo: read optchat code to hide empty rows in /stats: tui.ts usageTable dims zero-call rows (l.85), openStats uses aggregate day/week; cli.ts stats prints table(); selfcheck test l.400-420; tool: python edit of usage.ts table() now filters no-model-call rows, returns dim "<title>: no model calls" if all filtered, tui.ts usageTable simplified, selfcheck.test.ts adds assertions for hidden rows and no-calls line, greps usage imports

### 566+1 (level 0, tree record 1126, context 381 lines / 128.1 KB)

- **MED** · 283 B: tool: Bash tmux demo octui 120x40 (dev/tui-demo.sh): /stats overlay captured empty, q closes, send "first message", reopen /stats after turn, capture tail, grep "no model calls"/"2026-10-05", Esc, Ctrl-D, EXITED, kill session; checks empty-row hiding in overlay; output not yet shown
- **QW** · 860→870→870→870→870 B: tool: Bash {"command":"tmux kill-session -t octui 2>/dev/null; tmux new-session -d -s octui -x 120 -y 40 \"dev/tui-demo.sh; echo EXITED \\$?; sleep 600\"; sleep 1.5; tmux send-keys -t octui \"/stats\" Enter; sleep 0.7; echo \"== empty\"; tmux capture-pane -p -t octui \| sed 's/ *$//' \| grep -v '^$' \| head -30; tmux send-keys -t octui q; tmux send-keys -t octui \"first message\" Enter; sleep 10; tmux send-keys -t octui \"/stats\" Enter; sleep 0.7; echo \"== after turn\"; tmux capture-pane -p -t octui \| sed 's/ *$//' \| grep -v '^$' \| tail -22; tmux capture-pane -p -e -t octui \| grep -a \"no model calls\\\|2026-10-05 \" \| cat -v \| cut -c1-80; tmux send-keys -t octui Escape; sleep 0.2; tmux send-keys -t octui C-d; sleep 1; tmux capture-pane -p -t octui \| grep EXITED; tmux kill-session -t octui","description":"Check /stats overlay empty and after a turn"}

### 560+4 (level 2, tree record 1127, context 378 lines / 127.5 KB)

- **MED** · 506 B: echo: read tui.ts usageTable, cli.ts stats (user: hide no-call rows in day/week tables in overlay + `optchat stats`, filter at render, keep aggregate()); tool: Bash python edit (uncommitted): usage.ts table() drops empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; echo: selfcheck.test.ts:11 imports {aggregate,hit,isoWeek}, tui.ts:14 {aggregate,table}; tool: sed -i adds table to test import; bun test, `bun src/cli.ts stats` real + OPTCHAT_DIR=/tmp/nonexist, output unseen.
- **QW** · 890→439 B: echo: read optchat code to hide empty rows in /stats (user: hide no-call rows in day/week tables, overlay and `optchat stats`, filter at render, keep aggregate()): tui.ts usageTable, cli.ts stats, selfcheck test l.400-420; tool: Bash python edit (main, uncommitted, output unseen): usage.ts table() filters empty rows, dim "<title>: no model calls" if none; tui.ts usageTable simplified; selfcheck adds assertions; then greps usage imports

### 567+1 (level 0, tree record 1132, context 379 lines / 127.7 KB)

- **MED** · 465 B: echo: tmux capture, TUI demo /stats overlay (dev/tui-demo.sh, /tmp/oc-tui): empty: View 0 messages, no turns yet, "day: no model calls", "week: no model calls", footer /tmp/oc-tui opus-high, Esc/q closes; after turn: 13 messages 2026-10-05, view 0.9/128 KB (1%), all summarized, session 1 turn input 4 read 6,851 write 7,205 out 324 hit 48.7%, day 2026-10-05 turn 1 compact 1 prime 2 input 12 read 13,702 write 28,112 out 696 hit 32.8%, week 2026-W41 same; EXITED 0
- **QW** · 764→395 B: user: wants /stats overlay to hide empty day/week table rows, show dim 'no model calls' if none; talk: updated usage.ts table() to filter zero-call rows, return dim 'no model calls' line if empty; tui.ts simplified; selfcheck.test.ts assertions added; echo: bun test 19 pass, 0 fail (107 expects); `optchat stats` CLI shows non-empty rows only; demo overlay verified on empty chat and after turn

### 566+2 (level 1, tree record 1133, context 378 lines / 127.4 KB)

- **MED** · 406 B: tool: Bash tmux demo octui 120x40 dev/tui-demo.sh to check /stats overlay with hidden empty rows (uncommitted): opened /stats on empty chat, closed q, sent "first message", reopened; echo: empty chat shows "day: no model calls", "week: no model calls", "no turns yet"; after one turn only 2026-10-05 row (turn 1, compact 1, prime 2, hit 32.8%) and 2026-W41 week row; footer 0.9/128 KB; Esc/Ctrl-D EXITED 0.
- **QW** · 596→508 B: tool: Bash tmux demo (octui, 120x40, dev/tui-demo.sh) to check /stats overlay with hidden empty rows: opens /stats on empty chat, closes with q, sends "first message", reopens /stats after the turn, greps "no model calls"/"2026-05" rows with colours, Esc, Ctrl-D, checks EXITED, kills session; echo: tmux demo of /stats overlay with empty rows hidden (uncommitted): empty chat shows "day: no model calls" and "week: no model calls", "no turns yet"; after one turn only the 2026-10-05 day row (turn 1, compact

### 571+1 (level 0, tree record 1134, context 381 lines / 128.0 KB)

- **MED** · 501 B: echo: SPEC.md CLI text: `optchat view` prints current view, read-only, no lock; `optchat stats` reads usage.jsonl read-only, no lock, prints 2 plain tables for last 14 local days and 8 ISO weeks (local dates, oldest first, empty periods included); columns calls per kind turn/compact/prime, input, cache read, cache write, output tokens, hit = read/(input+read+write); only header dim and only on a terminal, no costs, no charts; `optchat browse [out.html]` one self-contained HTML page with the view.
- **QW** · 492 B: echo: `optchat view`: print current view (read-only, no lock); `optchat stats`: read usage.jsonl (read-only, no lock), print two plain tables—last 14 local days and last 8 ISO weeks (local dates, oldest first, empty periods included)—with columns: calls per kind (turn/compact/prime), input, cache read, cache write, output tokens, hit ratio = read / (input + read + write); header dim only on terminal; no costs/charts; `optchat browse [out.html]`: self-contained HTML page with the view

### 564+4 (level 2, tree record 1136, context 376 lines / 126.8 KB)

- **MED** · 738→510 B: echo: bun test 19 pass/0 fail after hiding empty rows in table(); `optchat stats` data: days 2026-10-04 (turn 11/compact 110/prime 11, hit 90.1%) and 2026-10-05 (4/303/8, hit 77.7%), weeks W40/W41; talk: overlay; tool: tmux octui 120x40 dev/tui-demo.sh /stats: opened empty chat, q, "first message", reopened, Esc, Ctrl-D, killed (uncommitted); echo: empty chat: "day/week: no model calls", "no turns yet"; one turn -> only 2026-10-05 (turn 1/compact 1/prime 2, hit 32.8%) and 2026-W41; footer 0.9/128 EXITED 0
- **QW** · 739→512 B: echo: bun test passed (19 tests, 0 fail, 107 expects) after the empty-row hiding edit; `optchat stats` on real data shows only non-empty days (2026-10-04: turn 11/compact 110/prime 11, hit 90.1%; 2026-10-05: 4/303/8, hit 77.7%) and weeks W40/W41; with empty data dir prints "day: no model calls" and "week: no model calls". tool: tmux demo (octui, 120x40, dev/tui-demo.sh) of /stats overlay with empty rows hidden: opened /stats on empty chat, q, "first message", reopened, Esc, Ctrl-D, session killed; echo: emp

### 570+2 (level 1, tree record 1137, context 380 lines / 127.9 KB)

- **MED** · 507 B: tool: Bash sed -n 566,572p SPEC.md read SPEC stats paragraph (read-only, hiding-empty-rows task); echo: SPEC.md l.566-572 still states old behaviour: `optchat view` prints view (no lock); `optchat stats` reads usage.jsonl, two plain tables, last 14 local days + 8 ISO weeks, oldest first, "empty periods included"; cols calls per kind turn/compact/prime, input, cache read/write, output, hit=read/(input+read+write); header dim on tty only; no costs/charts; `optchat browse [out.html]` starts; needs update.
- **QW** · 363 B: tool: Bash read SPEC.md l.566-572 for stats paragraph; echo: optchat SPEC.md l.566-572 states `optchat stats` shows last 14 days and 8 ISO weeks with empty periods included, calls by kind turn/compact/prime, input, cache read/write, output, hit ratio, only header dim on tty, no costs/charts, needs update to reflect hidden empty rows and "no model calls" message

### 572+1 (level 0, tree record 1138, context 380 lines / 127.9 KB)

- **MED** · 479 B: tool: Bash in ~/.claude/optchat: python3 heredoc edits SPEC.md (empty periods hidden at rendering via table(); aggregate() unchanged; dim 'day: no model calls'/'week: no model calls' line, also in /stats overlay; 'only the header (and that line) is dim') and README.md (periods without model calls hidden); then bun test tail -2, git add -A, commit 'feat(stats): hide periods without model calls in usage tables' (Co-Authored-By Claude Opus 5.5), git log/status; no output shown.
- **QW** · 316 B: tool: Bash updated SPEC.md and README.md to document empty period hiding in usage tables (table() filters at render, aggregate unchanged, dim "no model calls" line), ran bun test, committed "feat(stats): hide periods without model calls in usage tables" (c38e0a8) with Co-Authored-By, tree clean, main 3 ahead origin

### 568+4 (level 2, tree record 1139, context 379 lines / 127.7 KB)

- **MED** · 670→491 B: tool: Bash grep README.md/SPEC.md for stats docs (14 days/ISO week/dim header/empty periods); echo: README.md:40 `optchat stats` = usage per day/ISO week; SPEC.md:494 dim 3-line stats(mem) header, l.568 14 local days/8 ISO weeks oldest first, empty; tool: Bash sed SPEC.md 566-572 (read-only, hide-empty-rows task); echo: SPEC still old: reads usage.jsonl, two plain tables (same periods), "empty periods included", cols kind turn/compact/prime, input, cache, output, hit; dim header on tty.
- **QW** · 485 B: tool: Bash grep of README.md/SPEC.md for stats docs (l.40/494/568) shows `optchat stats` prints last 14 days/8 ISO weeks, oldest first, empty periods included, dim header on tty, no costs/charts; echo: SPEC.md l.566-572 confirms `optchat stats` reads usage.jsonl, tables for last 14 days/8 ISO weeks (local dates), empty periods included, columns: calls by kind (turn/compact/prime), input, cache read/write, output, hit ratio; needs update to hide empty rows and show "no model calls"

### 572+2 (level 1, tree record 1140, context 381 lines / 128.2 KB)

- **MED** · 509 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): python edit of SPEC.md (periods without model calls hidden in table(), aggregate() keeps them; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; then bun test, git add -A, commit "feat(stats): hide periods without model calls in usage tables", git log/status; echo: 107 expect() calls, 19 tests 0 fail [1157ms], fecfd07 feat(stats): hide periods without model calls in usage tables, main...origin/main [ahead 4]
- **QW** · 290 B: tool: Bash edited SPEC.md (hide empty periods in `table()`, aggregate unchanged, dim "no model calls" line in /stats and `optchat stats`), README.md, ran bun test, committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; echo: 19/19 tests pass, main 4 ahead origin

### 560+8 (level 3, tree record 1141, context 375 lines / 126.7 KB)

- **MED** · 901→504 B: user: hide no-call rows in day/week tables, /stats overlay + `optchat stats`, filter at rendering, keep aggregate(); else dim "no model calls"; bun test green, demo check, 1 commit on main, no push; tool: Bash python edit (uncommitted): usage.ts table() filters empty rows and tui.ts usageTable simplified; tests +assertions; echo: bun test 19 pass/0 fail 107 expects; stats non-empty days only (10-04, 10-05); tool: /stats: 1 turn -> 10-05 row only, no-calls line if empty, Ctrl-D EXITED 0; uncommitted.
- **QW** · 598→511 B: user: hide empty rows in /stats overlay and `optchat stats` day/week tables, show dim "<title>: no model calls" if all empty; talk: usage.ts table() now filters zero-call rows, returns dim no-calls line if none; tui.ts usageTable simplified; test adds assertions; echo: bun test 19 pass, 107 expects; `optchat stats` shows non-empty days/weeks only (2026-10-04 turn 11/compact 110/prime 11 hit 90.1%, 10-05 4/303/8 77.7%), empty dir prints "day: no model calls"/"week: no model calls"; tmux demo verified: empty

### 574+1 (level 0, tree record 1142, context 381 lines / 128.2 KB)

- **MED** · 498 B: talk: day/week tables no longer show empty rows in /stats and optchat stats; committed main fecfd07, not pushed, 4 ahead origin; table() drops zero-call rows, aggregate() unchanged; empty table shows dim day: no model calls / week: no model calls (prefix added since optchat stats has no titles); bun test 19 pass, 2 new checks; real log shows only 2026-10-04/05, W40/W41; empty dir prints both lines; demo /stats dim before turn 1, single 2026-10-05/W41 row after, clean exit; README/SPEC updated.
- **QW** · 407 B: talk: The day and week tables now hide empty rows in both `/stats` overlay and `optchat stats` (fecfd07); table() filters zero-call rows, aggregate() unchanged; dim "day: no model calls"/"week: no model calls" shown when empty; prefix distinguishes sections; 19/19 tests pass (empty days hidden, dim line on no data); demo verified on real and empty data; README/SPEC updated; main 4 ahead origin, unpushed.

### 572+4 (level 2, tree record 1146, context 381 lines / 128.0 KB)

- **MED** · 488 B: tool: Bash in ~/.claude/optchat main: edited SPEC.md + README.md (table() hides no-model-call periods, aggregate() unchanged, dim no-calls line); bun test 19 pass; committed fecfd07 "feat(stats): hide empty usage-table periods"; main 4 ahead of origin, unpushed; talk: empty day/week rows now hidden in /stats overlay and `optchat stats`, dim no-calls line if none left; user: ZERO tested the TUI and likes it, asked to push main to origin (git push origin main), reply with pushed range.
- **QW** · 812→517→517→498 B: tool: Bash in ~/.claude/optchat (main, hide-empty-rows task): edited SPEC.md (table() hides periods without model calls, aggregate() unchanged; dim "day/week: no model calls" line, also in /stats overlay) and README.md stats row; bun test 19 pass (107 expects); committed fecfd07 "feat(stats): hide periods without model calls in usage tables"; main 4 ahead of origin, unpushed. talk: hid empty rows in day/week tables, `/stats` overlay and `optchat stats`; `table()` filters, aggregate() unchanged

### 568+8 (level 3, tree record 1148, context 380 lines / 127.5 KB)

- **MED** · 586→512 B: tool: Bash grep README/SPEC stats docs; echo: README l.40 14d/8 ISO wks, SPEC l.494, l.568 stats para "empty periods included", needs update; tool: Bash sed SPEC l.566-572; echo: no edits; tool: Bash (optchat main) edited SPEC.md+README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead origin, unpushed; talk: table() hides empty day/week rows (aggregate() unchanged) in /stats and `optchat stats`, dim "no model calls" if none left;
- **QW** · 848→848→836→836→836 B: tool: Bash grep README.md/SPEC.md for "14 days\|ISO week\|dim header\|periods without" (hide-empty-rows task); echo: README l.40 stats row "per day (last 14 days) and per ISO week (last 8)", SPEC l.494 header, l.568 stats paragraph; tool: Bash sed SPEC l.566-572 (read-only); echo: still says "empty periods included", old behaviour, needs update; nothing edited. tool: Bash in ~/.claude/optchat (main): edited SPEC.md + README.md stats row; bun test 19 pass; committed fecfd07 "feat(stats): hide periods without model calls in usage tables", main 4 ahead of origin, unpushed. talk: table() hides empty day/week rows (aggregate() unchanged), in /stats overlay and `optchat stats`; dim "day:/week: no model calls" if none left; demo checked. user: ZERO tested TUI, likes it; asks to `git push origin main`, then reply with the pushed range.

### 576+2 (level 1, tree record 1150, context 380 lines / 127.7 KB)

- **MED** · 377 B: tool: Bash in ~/.claude/optchat: git status -sb, log origin/main..main, git push origin main, status again; echo: main was 4 ahead (a5db61d import optmem incremental, da58dbd pi-style TUI, c31e624 /stats overlay, fecfd07 hide no-call periods); pushed 955394f..fecfd07 main -> main to github.com/gebeer/shitty-optchat; status now "## main...origin/main" (in sync, nothing ahead)
- **QW** · 327 B: tool: Bash git push origin main; echo: pushed optchat main to origin (955394f..fecfd07): a5db61d feat(import): append new OptMem notes incrementally, da58dbd feat(tui): pi-style TUI on pi-tui, c31e624 feat(tui): /stats overlay with slash-command, fecfd07 feat(stats): hide empty rows in usage tables; main now 4 ahead of origin

### 560+16 (level 4, tree record 1151, context 378 lines / 127.0 KB)

- **MED** · 469 B: user: hide no-call rows in /stats overlay + `optchat stats` day/week tables, keep aggregate(), dim "no model calls" if none; tool: edited usage.ts table(), tui.ts usageTable, README/SPEC; echo: bun test 19 pass; real log: non-empty days/weeks only (10-04 11/110/11 90.1%, 10-05 4/303/8); tmux /stats Esc/Ctrl-D exit 0; tool: committed fecfd07 hide no-call periods in usage tables (main 4 ahead, unpushed); user: ZERO likes TUI, asks git push origin main + pushed range.
- **QW** · 1010→523→523→509 B: user: hide empty rows in /stats overlay and `optchat stats` day/week tables, keep aggregate(), show dim "no model calls" if none; tool: Bash python edit on main (uncommitted): usage.ts table() filters no-call rows, tui.ts usageTable simplified, test assertions added; echo: bun test 19 pass (107 expects); stats real data shows only non-empty days/weeks (2026-10-04 11/110/11, 90.1%; 2026-10-05 4/303/8), empty dir prints "day/week: no model calls"; tmux demo overlay checked (1 turn: only 2026-10-05 row, W41

### 544+32 (level 5, tree record 1152, context 378 lines / 127.0 KB)

- **MED** · 520→473 B: tool: Bash /stats demo tmux 120x30+40x12 OK: view, tables, q/Esc close; talk: committed c31e624 /stats, main 3 ahead unpushed; user: ZERO likes /stats; wants no-call day/week rows hidden in overlay and `optchat stats`, aggregate() kept, dim no model calls if none, one commit on main, no push; tool: python edit usage.ts table() filter, tui.ts, tests; echo: 19 pass; committed fecfd07, main 4 ahead; user: ZERO likes TUI; asks git push origin main, reply with pushed range.
- **QW** · 1068→605→511 B: user: ZERO wants empty (no model calls) rows hidden in /stats overlay and `optchat stats` day/week tables, keep aggregate() unchanged, show dim "no model calls" if none left; tool: python edit usage.ts table() to filter no-call rows and return dim message, tui.ts usageTable simplified, selfcheck.test.ts adds assertions; echo: bun test 19 pass (107 expects), `optchat stats` on real data shows only 2026-10-04/10-05, empty dir prints "day/week: no model calls", tmux demo 120x40 and 40x12 verifies overlay with

### 512+64 (level 6, tree record 1153, context 378 lines / 127.0 KB)

- **MED** · 501 B: tool: Ctrl-O expand, 19 tests, squashed da58dbd; user: ZERO approved feat/tui: ff main, no push, delete branch; add TUI /stats: overlay (usage day/week, session totals), Esc/q closes, not sent to model, one commit; echo: ff'd, branch deleted, tests pass; user: ZERO likes /stats; hide no-call day/week rows in overlay + `optchat stats` (dim if none); then push origin main, reply pushed range; tool: tmux demo OK, edited usage/tui/tests; talk: c31e624 /stats, fecfd07 hide rows, main 4 ahead unpushed.
- **QW** · 868→605→498 B: user: ZERO approved feat/tui: (1) ff-merge feat/tui into main, delete branch, no push; (2) add TUI /stats overlay with slash autocomplete, usage day/week and session/view stats, Esc/q closes, not sent to model, plain mode ignores; update README/SPEC, bun test, demo; user: likes /stats, wants empty (no model calls) rows hidden in /stats overlay and `optchat stats`, show dim "day/week: no model calls" if none; then push main to origin; tool: ff-merged feat/tui (da58dbd) into main, deleted branch

## Verdict

**Keep V4.1 Flash medium as the baseline.** All 30 Qwen jobs returned, but only **27/30** finals fit 512 B, versus **30/30** for MED. Qwen was **13.7% faster** and **11.7% cheaper** per job in this run; it needed **32 size retries versus 6**, retained **17/25 source hash pairs versus 25/25**, dropped important instructions and invented an unobserved commit. The modest speed/cost saving does not justify switching under this unchanged prompt/protocol.

This evaluates compatibility with the existing DeepSeek-specific prompt, not Qwen's best possible performance with a tailored prompt. No prompt optimization or production switch was made; MED still has fidelity defects of its own.

## Rounds

### Qwen3-235B Instruct — frozen setup

- **QW:** explicit `qwen/qwen3-235b-a22b-2507`, non-thinking, reasoning and include_reasoning omitted entirely. **MED:** completed `deepseek/deepseek-v4.1-flash` baseline with `{effort: "medium"}`, reused without new DeepSeek calls.
- Both pin `provider: {order: ["novita/fp8"], allow_fallbacks: false}`; unchanged `compact-deepseek.txt` + `compact-deepseek-step.txt`, source/context layout, max_tokens 16000, NODE 512 B, TRIES 5 and size-retry text. No sampling parameters explicitly set. Native reasoning behavior differs by design, and cache/load/run conditions differ.
- Exact same 30 jobs, tree end **1153**, historical source messages/stored Sonnet children; outputs from these arms do not feed later merges. Source/context snapshots are preserved in the gitignored output directory. This is not an end-to-end Qwen tree or a repeated-trial benchmark.
- Reuse the verified **555+1** smoke rather than paying twice: 8.911 s first call, 19.260 s including one retry, 535→512 B, $0.007391142. It returned zero thinking and clipped the final test count to `19/1`; retain this defect, do not rerun/cherry-pick.
- The [live endpoint API](https://openrouter.ai/api/v1/models/qwen/qwen3-235b-a22b-2507/endpoints) lists Novita fp8, context 131,072, max completion 16,384; USD/million input $0.09, output $0.58. No cache-read price is listed. Report actual usage costs/cache tokens, not assumptions about caching support.
- Prompt hashes remain identical to `6594dfc`: system `9c08ec458cd625858d5b7757aeeeebeb2f0f6eec4c239e8f327327e02d220752`; step `bd25f461f88f35c7b5df0eafcc0e2dcfa6550a41b631858f12ec520af2e4d22f`.
- Foreground/resumable chunks, one ledger owner, $1.80 recorded-spend ceiling within the $2 overall cap. Review source-supported facts, kind tags, hash retention, user's instructions, retry clipping and push-as-request at 560+16/512+64. No full Qwen3.5-27B or Mistral probe: those were stopped after a slow smoke / rejected HTTP 429 smoke respectively.

### Qwen3-235B Instruct — completed 30-job comparison

| check | V4.1 MED | Qwen QW |
|---|---|---|
| Returned jobs / API calls | 30 / 36 | 30 / 62 |
| First try exceeds 512 B | 6/30 (20%) | 17/30 (57%) |
| Size retries total / per job | 6 / 0.20 | 32 / 1.07 |
| Final at most 512 B | 30/30 | 27/30 |
| Final bytes mean / max | 474.4 / 512 | 479.3 / 936 |
| Final within prompt's 400–470 B target | 6/30 | 4/30 |
| Exact source hash pairs retained in final | 25/25 | 17/25 |
| Wrong/mixed kind tags in single-message leaves | 0/10 | 1/10 |
| User-first / entire user item missing, direct user-bearing stretches | 3/9 / 1/9 | 5/9 / 2/9 |
| Latency/job mean / median / max, including retries | 23.699 / 17.598 / 61.667 s | 20.454 / 14.366 / 63.233 s |
| First-response latency mean | 19.058 s | 10.444 s |
| Cost/job, including retries | $0.00870065 | $0.00768428 |
| Metered sample cost, including smoke | $0.26101950 (reused) | $0.23052828 |

Hash retention counts each distinct `(job, exact source hash)` pair; context-only hashes are excluded. User-first is a tag-order check, **not** instruction completeness: it counts nine stretches with direct user items, excluding inherited user references inside echo at 560+4/560+8. QW's two entirely missing user items are 544+16 and 572+4; MED's is 568+8. These overlapping historical merges are not independent conversations or a universal quality score.

All **62 QW calls** returned the explicit requested model, **Novita**, `finish_reason: stop`, zero reasoning tokens and zero reasoning characters. No empty replies, HTTP failures or interrupted jobs occurred in this round. There were no multiline finals; 571+1 has one non-ASCII em dash. QW reported **zero cached tokens**; MED's substantial cached input means the small cost gap is specific to these observed cache conditions.

QW's three oversized finals exhausted all five attempts:

- **552+8:** 936→936→936→936→936 B, the exact same text every time.
- **566+1:** 860→870→870→870→870 B; final is the first/shortest, **860 B**.
- **568+8:** 848→848→836→836→836 B; final **836 B** still includes the user's latest push/range request.

The harness keeps the shortest returned try, **not** a hard-cropped success. All calls ended normally; these byte failures are not API output-token truncation. The unchanged retry explicitly asks the line to end at a displayed 512-B prefix. QW often follows that cut literally rather than re-summarizing: exact hash retention falls from **24/25 on first answers to 17/25 on finals**, with seven additional lost pairs during retries. Thus this result measures the prompt **and** existing retry protocol together.

### Source-fidelity pass

All 30 exact source stretches were reviewed, with context available for attribution checks. Representative failures and counterexamples:

| job / source | QW final finding | MED reference |
|---|---|---|
| 555+1, report | 535→512 B clips `bun test 19/19` to **`19/1`** | Well-formed 495-B report |
| 554+2 / 552+4, merges | Prefix-like retries end **`, plain`** / **`echo: bun test 19`**; 552+4 loses a5db61d, c31e624 and da58dbd | Preserves hashes and merge/unpushed state |
| 556+2, direct user instruction | 369 B, yet omits bun-test/demo checks, one conventional commit on main, **don't push**, and short reply | Retains those constraints |
| 560+1, echo of old code/test assertions only | Says rows **now hidden**, code updated, **test passes, demo verified**; none of those outcomes is in the source | Describes the old readout without claiming the update; loosely calls usageTable shared with CLI |
| 561+1, edit/grep command only | **“grep confirmed imports”** despite no output | Explicitly says output unseen |
| 560+4, two children | 890→439 B effectively keeps the first child, dropping the import fix and test/stats invocation in the second | Keeps the second tool item, pending output |
| 567+1, echo-only demo capture | Adds **user/talk** items and bun-test/CLI outcomes from context; these are not part of the echo | Keeps actual demo counts and echo kind |
| 566+2 / 564+4 | Cuts a demo date to **`2026-05`** (source `2026-10-05`), ends **`turn 1, compact`**; other merge ends **`echo: emp`**, losing overlay result | Keeps usable demo result and state |
| 572+1, edit/test/commit command without output | Invents commit **c38e0a8**, clean tree and main **3 ahead**; hash absent from both source and context | Keeps command-only provenance and **no output shown** |
| 572+2 / 574+1, actual result and report | Useful, source-supported **fecfd07**, tests and main 4 ahead/unpushed; not every QW summary is defective | Also faithful |
| 560+8, inherited user aside | Promotes aside to user, recasts source tool changes as talk, loses **keep aggregate()**, clips demo tail | Also imports user constraints from context, but retains aggregate() |
| 572+4, latest user push/range request | First answer includes it; retries drop the **entire latest user item** | Preserves request and range instruction |
| 568+8, same late instruction | Keeps push/range request, but final **836 B** cannot fit | Fits 512 B, but drops the entire user item: a real MED counterexample |
| 576+2, actual successful push | Correct **955394f..fecfd07** and all four commits, then falsely says **main now 4 ahead** | Correctly says main is now in sync |
| 560+16 / 544+32 | Retries lose **fecfd07** and latest push/range request; 544+32 also lacks c31e624 | Retains hashes, request and pending/unpushed state |
| 512+64, high merge | Retains push **as a request**, but loses **reply with pushed range**, aggregate(), c31e624/fecfd07 and main's 4-ahead/unpushed state | Retains hashes and push/range request, but also loses aggregate() |

The earlier context boundary audit still holds: for **560+16** and **512+64**, exclusive limit **576**, last context message **575**; the actual push command/result at 576–578 is outside their source/context. Neither QW final invents a successful push in these two jobs, but **560+16 drops the latest push request entirely** and 512+64 loses the requested range reply. At 576+2, where push success really is supplied, QW's stale 4-ahead state is independently wrong.

QW is capable of concise, useful output at jobs such as 558+1, 571+1, 572+2 and 574+1. Its higher user-first count does not outweigh omitted constraints, unsupported outcomes and byte failures. MED's perfect final byte/hash checks likewise do **not** establish perfect memory: besides 568+8 and aggregate() at 512+64, its previous review found context-imported user instructions at 560+8 and loose technical provenance at 560+1.

## Recommendation

**Stay with explicit `deepseek/deepseek-v4.1-flash`, `reasoning: {effort: "medium"}`, `novita/fp8` with fallbacks disabled**, and the current DeepSeek system/step as the baseline for later V4.1-specific prompt optimization. Do not replace it with Qwen235 under the unchanged settings on this sample.

The next optimization remains user-instruction preservation/order, followed by source isolation and retry fidelity as separate changes; MED is not production-ready merely because its byte/hash checks pass. Qwen-specific tailoring and an end-to-end model tree were not run or authorized. No production changes or SPEC edits; SPEC §16.9 remains on main (`2ba9689`).

## Spend and reproduction

- QW's full 30-job sample cost **$0.2305282815**, including the reused **$0.007391142** smoke; new spend after full-round approval was **$0.2231371395**. MED's reused **$0.261019500192** incurred **no new spend**.
- Shared session ledger: **$0.962637995484** across **258 metered calls**. Adding archived calibration **$0.14585926** plus the existing cancelled-request allowance **$0.02** gives **$1.128497255484** conservatively accounted against the unchanged **$2 total**. The $1.80 recorded-spend ceiling leaves room for those exclusions. Do not present this as an exact provider invoice; the Mistral HTTP 429 smoke returned no metered usage.
- Raw results/prompt/source snapshots: gitignored `dev/probe-out/qwen235/`; shared ledger `dev/probe-out/spend.jsonl`. `MED.jsonl` is a physical copy of the prior baseline; `QW.jsonl` starts with the reused smoke, relabeled without an API call. Preserve the ledger on resume.

```bash
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts run \
  --probe 4 --arms QW --jobs 30 --end 1153 --take 1 \
  --out dev/probe-out/qwen235 --spend dev/probe-out/spend.jsonl --budget 1.8
OPTCHAT_CLAUDE=/bin/false bun dev/compact-probe.ts report \
  --probe 4 --out dev/probe-out/qwen235 --md docs/probes/compact-qwen235-v41.md
OPTCHAT_CLAUDE=/bin/false bun test
```

Checks: **21 tests pass, 0 fail, 140 expect() calls** with `OPTCHAT_CLAUDE=/bin/false`; probe tests use stubbed fetch and fake processes, including omitted reasoning on initial/retry QW requests. Ignored `dev/probe-out/qwen235/validate.ts` verifies all 30 rebuilt source/context snapshots, unchanged prompt bytes/hashes, byte-identical reused MED, reused smoke, 62 QW call records and matched ledger costs, and the sub-$2 conservative accounting.

No Claude or optchat launched; `~/.optchat` read-only. Work stays on `feat/compact-probe`, unpushed. No attribution lines added to commits.
