# optchat

An implementation of Victor Taelin's [OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449): a chat that never ends. The history is the memory. The memory is a binary tree of summaries.

[SPEC.md](SPEC.md) has the details. SPEC §11 lists the deviations from the gist.

## How it works

| Part | What it does |
| --- | --- |
| Turn | Each message starts one new `claude -p` call (Claude Code, subscription). The call gets the view: the summary lines that fit in 128 KB. |
| Priming | Before a turn, a short call writes the view into the prompt cache. The turn then reads it from the cache. |
| Compactor | Writes the summary lines in the background. Default: DeepSeek V4.1 Flash on OpenRouter (API billing). Fallback: Sonnet through `claude -p`. |
| Fold | When the view is full, the oldest pairs merge into their parent summary, down to 85% of the budget. Then new messages append freely. This keeps the cached prefix stable. |
| Tools | An MCP server gives the model `zoom` (open a summary) and `date` (the time of a message). |

## Requirements

- [Bun](https://bun.sh)
- [Claude Code](https://docs.claude.com/en/docs/claude-code), logged in
- Optional: an OpenRouter key for the compactor (see [Configuration](#configuration))

## Install

```sh
git clone https://github.com/gebeer/shitty-optchat.git
(cd shitty-optchat && bun install)        # one dependency: pi-tui
ln -s "$PWD/shitty-optchat/src/cli.ts" ~/bin/optchat
```

`~/bin` must be in your `PATH`.

## Commands

| Command | Effect |
| --- | --- |
| `optchat` | Starts the chat. On a terminal: a TUI like pi. With piped input: one message per line. |
| `optchat view` | Prints the view that the model gets. |
| `optchat browse [out.html]` | Writes the full tree to an HTML file (default `optchat.html`). |
| `optchat stats` | Prints the token use per day (14 days) and per ISO week (8 weeks). |
| `optchat import-optmem [LOG.txt]` | Adds the new notes of an OptMem log (default `~/.optmem/memory/LOG.txt`). See below. |

`import-optmem`:

- Close the chat first. The command takes the lock.
- It adds only the notes after the last import. A second run adds nothing.
- Each note keeps its own date (12:00 local time).
- A half-written last record stays for the next run.
- It refuses a log that is shorter, or that changed at the last imported note.

## Keys

| Key | Effect |
| --- | --- |
| Enter | Sends the message. During a turn, the running call gets it. |
| Shift-Enter, Ctrl-J | New line |
| Up, Down | Earlier messages |
| Esc | Cancels the turn |
| Ctrl-C | Cancels the turn, or clears the editor. Two times: exit. |
| Ctrl-D | Exit (editor empty) |
| Ctrl-Z | Stops the chat. `fg` continues it. |
| Ctrl-O | Expands or collapses all tool output |
| Ctrl-G | Opens the editor text in `$VISUAL`, `$EDITOR` or `vi`. The edited text comes back unsent. |

## Slash commands

The editor completes them. The model does not get them.

| Command | Effect |
| --- | --- |
| `/stats` | Panel: the view, the totals of this session, the usage tables. Arrows, PgUp, PgDn, Home, End scroll. Esc or `q` closes. |
| `/summaries`, `/s` | Shows or hides a panel at the top right: the running compactor calls with their time, then the finished calls with their summary line. Needs 100 columns. The editor keeps the keys. |

## Footer

- Line 1: the data directory, the view size, the summary backlog.
- Line 2: the tokens of this session's turns and primings (`↑` input, `↓` output, `R` cache read, `W` cache write, `CH` cache hit), then the model and effort.

## Data

| Path in the data directory | Content |
| --- | --- |
| `chat/main/*.jsonl` | The messages, one file per day |
| `chat/tree/*.jsonl` | The summary nodes. A node never changes after it is written. |
| `usage.jsonl` | One line per model call: kind, model, tokens. Compactor lines add `cost` (USD) and `provider`. Turn lines add `limits` (use of the 5-hour and 7-day subscription windows, 0–1). |

- Default directory: `~/.optchat`
- The directory is a git repository. optchat makes a commit after each turn.
- Only one chat can use a directory at a time.

## Configuration

| Setting | Effect |
| --- | --- |
| `OPTCHAT_DIR` | The data directory |
| `OPTCHAT_MODEL` | The model of the turns (default `opus`) |
| `OPTCHAT_PERMISSION_MODE` | The permission mode of the turns. Default `bypassPermissions`: the model runs tools without a prompt. |
| `OPTCHAT_COMPACTOR=claude` | Uses `claude -p` for the compactor |
| `OPENROUTER_API_KEY` | The OpenRouter key: in `.env` in the repository (gitignored), or in the environment. Without a key, the compactor uses `claude -p`. |

Other values (effort, view size, fold mark, compactor model) are constants in `src/config.ts`.

## Development

- `bun test`: 22 tests, about 1 s, no model calls.
- `dev/tui-demo.sh`: the TUI with a fake `claude` and a scratch directory, no model calls.
- `docs/probes/`: the measurements behind the compactor choice and the fold mark.

## Status

- Early. For one user.
- The real chat has more than 900 messages and summaries up to level 9.
- Known defect: the compactor sometimes adds facts that are not in the messages. The `/s` panel shows each new summary line.
