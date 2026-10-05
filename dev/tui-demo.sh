#!/bin/sh
# The TUI on a scratch data dir with the fake claude (no model calls): each message gets the same slowed-down demo stream
# (tool calls, a thought, Markdown; see tui-demo.ts). Usage: dev/tui-demo.sh [--keep]  (--keep reuses the chat in /tmp/oc-tui)
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
dir=/tmp/oc-tui
[ "$1" = "--keep" ] || rm -rf "$dir" "$dir.log" "$dir.json"
mkdir -p "$dir" && touch "$dir.log"
bun "$here/dev/tui-demo.ts" "$dir.json"
OPTCHAT_DIR=$dir OPTCHAT_COMPACTOR=claude OPTCHAT_CLAUDE=$here/src/fake-claude.ts FAKE_CLAUDE_LOG=$dir.log FAKE_CLAUDE_SCRIPT=$dir.json exec bun "$here/src/cli.ts"
