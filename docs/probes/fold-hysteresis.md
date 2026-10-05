# Fold hysteresis (2026-10-05)

Question: with the view at 100% of `VIEW`, almost every new message makes `fit()` merge a due
pair. A prompt cache only reuses an unchanged prefix, so the next prime writes everything from the
first changed byte again. Does a fold watermark help? A watermark means: once over the budget, fold
down to the watermark, then append freely until over again.

Method: `bun dev/fold-replay.ts --marks 100,95,90,85,80,75,70`. This is a read-only replay of
`~/.optchat`: `loadChat` with `repair: false`, no lock, no model calls. Every message goes through a
`fit()` with hysteresis and the final tree. All stored parents count as built. Same age rule as the
gist. Sizes are in KB (1000 bytes) of the rendered view, not tokens.

- **rewrite**: bytes from the first byte that differs from the previous view to the end. The
  value is 0 when the new view only appends. The closing `</chat>` line is left out of the
  compare.
- **prime**: what a prime writes with the real marks (`cutBlocks`, 50k/80k/100k chars). The prime
  writes from the last block cut that both views share before the first difference, to the end.
  So an append still rewrites the last block.
- **turn**: the view after each user message, compared with the view after the previous user
  message. The real chat has few long turns (26 intervals, 10 of them after the first fold), so
  the second table also replays a prime every k messages.
- **from**: means from the first fold on (message 478); before it, nothing ever folds.

Run: chat /home/gbr/.optchat: 921 of 925 messages replayed, 1837 stored nodes, 27 user messages; VIEW 128000, marks 50000/80000/100000; first fold at message 478
all sizes in KB (1000 bytes); 'msg' = per message, 'turn' = per user message; 'from' = means from the first fold on
| low | folds | merges | rewrite/msg mean | rewrite/msg total | rewrite/turn mean | turns w/o rewrite | prime/turn mean | prime/turn mean from | view mean | view mean from | lines mean from |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 100% | 331 | 579 | 31.0 | 28554.3 | 47.3 | 16/26 | 65.3 | 130.3 (10) | 93.7 | 127.8 | 361 |
| 95% | 20 | 596 | 2.4 | 2242.9 | 40.7 | 17/26 | 59.9 | 116.5 (10) | 92.2 | 124.6 | 351 |
| 90% | 10 | 576 | 1.2 | 1083.4 | 36.1 | 18/26 | 55.3 | 104.3 (10) | 90.6 | 121.3 | 340 |
| 85% | 7 | 597 | 0.8 | 723.6 | 26.7 | 20/26 | 46.8 | 82.2 (10) | 88.9 | 117.7 | 330 |
| 80% | 5 | 565 | 0.5 | 481.2 | 20.0 | 21/26 | 40.7 | 66.3 (10) | 87.5 | 114.8 | 323 |
| 75% | 4 | 559 | 0.4 | 385.6 | 16.7 | 22/26 | 37.3 | 57.6 (10) | 86.0 | 111.8 | 316 |
| 70% | 4 | 645 | 0.4 | 363.7 | 11.6 | 23/26 | 33.2 | 46.9 (10) | 83.7 | 107.0 | 300 |

prime write mean per prime (KB) if a prime came every k messages, from the first fold on
| low | k=2 | k=4 | k=8 | k=16 | k=32 |
|---|---|---|---|---|---|
| 100% | 115.5 | 126.7 | 130.3 | 130.3 | 130.3 |
| 95% | 35.7 | 44.4 | 61.8 | 94.1 | 127.1 |
| 90% | 27.7 | 31.8 | 39.6 | 56.9 | 93.1 |
| 85% | 22.9 | 25.6 | 31.1 | 42.1 | 68.4 |
| 80% | 18.9 | 20.7 | 24.2 | 31.8 | 46.6 |
| 75% | 16.9 | 18.5 | 21.7 | 27.6 | 40.2 |
| 70% | 16.4 | 18.0 | 20.9 | 27.6 | 41.8 |

## Reading

- At 100% (today), a turn's prime rewrites the whole view: 130 KB, after the first fold, for every
  interval of 8 messages or more. Even every 2 messages, it is 115 KB. The merge is most due near
  the old, low-level start of the view, so the first changed byte is almost always in block 1.
- Hysteresis removes nearly all fold events: 331 → 7 at 85%. Between folds, a prime writes only
  the last block (from the 100k cut to the end). That is the floor, about 17-20 KB.
- The cost is context. The mean view drops by 2.5% (95%), 5% (90%), 8% (85%) or 10% (80%) of the
  steady-state size.
- Below 80% the gain flattens. At 70% the view drops under the 100k mark, the last cut moves to
  80k, and the last block grows again.

## Choice: `FOLD_LOW = 0.85`

85% is the low end of the range that the user approved (85-90%). In this chat's real turns, it
cuts the prime write per turn after the first fold from 130 to 82 KB (-37%). With a prime every
2-4 messages, the cut is about -80%. 90% cuts only 20% on real turns. The cost is about 10 KB less
view (118 vs 128 KB mean, 330 vs 361 lines). 80% would save more (66 KB/turn) but drops 13 KB of
context. That is outside the approved range.

Not measured: tokens (the usage log counts tokens, not bytes), and the case where the compactor
lags behind. In the live fold, an unbuilt part counts as the placeholder size, so the fold ends
only when every view part is built (`view.ts`).

## Real check (2026-10-05, opus, scratch copy `/tmp/fh/oc`, not `~/.optchat`)

Three turns ("Reply with just: ok/two/three"), 80 s apart, through `dev/wire-proxy.ts`. The view at
start was 124.2/128 KB (97%) after the refold with `FOLD_LOW = 0.85`. No fold happened during the
run.

| call | cache write | cache read |
|---|---|---|
| prime 1 (cold: this view was never cached) | 61,202 | 5,499 |
| turn 1 | 343 | 66,701 |
| prime after turn 1 | 13,407 | 53,319 |
| turn 2 | 342 | 66,726 |
| prime after turn 2 | 13,430 | 53,319 |
| turn 3 | 342 | 66,749 |
| prime after turn 3 | 13,453 | 53,319 |

Usage log of the real chat (fold at 100%), 2026-10-05: every prime after a changed view wrote
60,256-61,875 tokens and read only 5,850 (the part before the view). With hysteresis, an
append-only prime reads everything up to the 100k cut and rewrites only the last block: 13.4k
tokens, -78%. The turns read the whole view as before.

The new `limits` field: turns logged `{five_hour: 0.21-0.22, seven_day: 0.22}`; primes log `null`
(they are killed at `message_start`, before the `rate_limit_event`).

Not seen in this run: a fold event. A fold rewrites once, from the first merged pair (about the
whole view), and then about every 15-25 KB of new messages at 85%.
