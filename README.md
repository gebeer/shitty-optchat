# optchat

An implementation of Victor Taelin's [OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449).
OptChat is a chat that never ends. Its history is its memory. The memory is a binary summary tree.

## What this implementation does

- A Bun harness drives `claude -p` (Claude Code). It runs on a Claude subscription, not on API billing.
- Each user message starts one fresh `claude` call. The call gets the current view of the summary tree.
- A compactor on sonnet writes the summaries in the background.
- A priming call writes the view into the prompt cache before the turn. This makes turns cheaper.
- An MCP server gives the model two tools: `zoom` opens a summary, and `date` gives the time of a message.

[SPEC.md](SPEC.md) has the details. Section 11 lists the deviations from the gist.

## Requirements

- [Bun](https://bun.sh).
- [Claude Code](https://docs.claude.com/en/docs/claude-code), logged in.

## Install

Clone the repository and make a symlink to the entry point:

```sh
git clone https://github.com/gebeer/optchat.git
ln -s "$PWD/optchat/src/cli.ts" ~/bin/optchat
```

Make sure that `~/bin` is in your `PATH`.

## Usage

| Command | What it does |
| --- | --- |
| `optchat` | Starts the chat. |
| `optchat view` | Prints the view that the model sees. |
| `optchat browse [out.html]` | Writes the full tree to an HTML file. The default file is `optchat.html`. |
| `optchat stats` | Prints the token usage per day (last 14 days) and per ISO week (last 8 weeks). |
| `optchat import-optmem [LOG.txt]` | Imports an OptMem log into an empty chat. The default log is `~/.optmem/memory/LOG.txt`. |

The data is in `~/.optchat`. Set `OPTCHAT_DIR` to use a different directory.
The data directory is a git repository. The harness makes a commit after each turn.
Only one chat can run on a data directory at a time.

### Keys

| Key | Effect |
| --- | --- |
| Enter | Sends the message. |
| Ctrl-C | Cancels the current turn. When idle, press it two times to exit. |
| Ctrl-D | Exits (on an empty line). |
| Ctrl-Z | Stops the chat. Type `fg` to continue. |

## Status

- This project is early.
- It is for a single user.
- Memory merges are not yet tested on real data.
