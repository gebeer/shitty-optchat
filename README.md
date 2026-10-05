# optchat

An implementation of Victor Taelin's [OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449).
OptChat is a chat that never ends. Its history is its memory. The memory is a binary summary tree.

## What this implementation does

- A Bun harness drives `claude -p` (Claude Code). It runs on a Claude subscription, not on API billing.
- Each user message starts one fresh `claude` call. The call gets the current view of the summary tree.
- A compactor writes the summaries in the background: DeepSeek V4.1 Flash through OpenRouter (API billing), or sonnet through `claude -p` when no OpenRouter key is found.
- A priming call writes the view into the prompt cache before the turn. This makes turns cheaper.
- An MCP server gives the model two tools: `zoom` opens a summary, and `date` gives the time of a message.

[SPEC.md](SPEC.md) has the details. Section 11 lists the deviations from the gist.

## Requirements

- [Bun](https://bun.sh).
- [Claude Code](https://docs.claude.com/en/docs/claude-code), logged in.
- For the compactor: an OpenRouter API key, as `OPENROUTER_API_KEY=...` in a `.env` file in the repository (gitignored) or in the environment. Without it the compactor uses `claude -p`. Set `OPTCHAT_COMPACTOR=claude` to use `claude -p` anyway.

## Install

Clone the repository, install the one dependency ([pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui), for the TUI) and make a symlink to the entry point:

```sh
git clone https://github.com/gebeer/shitty-optchat.git
(cd shitty-optchat && bun install)
ln -s "$PWD/shitty-optchat/src/cli.ts" ~/bin/optchat
```

Make sure that `~/bin` is in your `PATH`.

## Usage

| Command | What it does |
| --- | --- |
| `optchat` | Starts the chat. On a terminal it is a TUI in the style of pi. With piped input, each line is one message. |
| `optchat view` | Prints the view that the model sees. |
| `optchat browse [out.html]` | Writes the full tree to an HTML file. The default file is `optchat.html`. |
| `optchat stats` | Prints the token usage per day (last 14 days) and per ISO week (last 8 weeks). Periods without model calls are hidden. |
| `optchat import-optmem [LOG.txt]` | Adds the new notes from an OptMem log. A second run adds nothing. Close the chat first. The default log is `~/.optmem/memory/LOG.txt`. |

The data is in `~/.optchat`. Set `OPTCHAT_DIR` to use a different directory.
The data directory is a git repository. The harness makes a commit after each turn.
Only one chat can run on a data directory at a time.

### Keys

| Key | Effect |
| --- | --- |
| Enter | Sends the message. During a turn, the running call gets it. |
| Shift-Enter, Ctrl-J | Starts a new line. |
| Up, Down | Shows the messages that you sent before. |
| Esc | Cancels the current turn. |
| Ctrl-C | Cancels the current turn. When idle, it clears the editor. Press it two times to exit. |
| Ctrl-D | Exits (when the editor is empty). |
| Ctrl-Z | Stops the chat. Type `fg` to continue. |
| Ctrl-O | Expands or collapses the output of all tool boxes. |

Type `/stats` (the editor completes slash commands) to open a stats panel: the view, the token totals of this session and the usage tables of `optchat stats`. Up, Down, PgUp, PgDn, Home and End scroll it. Esc or `q` closes it. The model does not get `/stats`.

Type `/summaries` or `/s` to show or hide a panel at the top right with the compactor calls: the running ones with their time, then the finished ones with the summary line they wrote. It needs a terminal at least 100 columns wide. The editor keeps the keys while the panel is shown.

To try the TUI without model calls, run `dev/tui-demo.sh`. It uses a fake `claude` and a scratch directory in `/tmp/oc-tui`.

## Status

- This project is early.
- It is for a single user.
- Memory merges are not yet tested on real data.
