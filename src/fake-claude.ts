#!/usr/bin/env bun
// Test double for `claude -p --input-format stream-json`: logs what it is given, answers from a script.
//   FAKE_CLAUDE_LOG     jsonl file: {argv, env, pid} at start, then {message} per user message
//   FAKE_CLAUDE_SCRIPT  json array, one step per user message (the last one repeats):
//                       {reply}, {reply, stop_reason}, {is_error}, {exit, stderr}, {hang}
import { appendFileSync, readFileSync } from "node:fs";

const log = process.env.FAKE_CLAUDE_LOG!, script: any[] = JSON.parse(readFileSync(process.env.FAKE_CLAUDE_SCRIPT!, "utf8"));
const put = (o: object) => appendFileSync(log, JSON.stringify(o) + "\n");
put({ argv: process.argv.slice(2), env: { DISABLE_PROMPT_CACHING: process.env.DISABLE_PROMPT_CACHING, CLAUDE_CODE_PROMPT_CACHE_TTL: process.env.CLAUDE_CODE_PROMPT_CACHE_TTL }, pid: process.pid });
let n = 0;
for await (const line of console) {
  if (!line.trim()) continue;
  put({ message: JSON.parse(line) });
  const s = script[Math.min(n++, script.length - 1)];
  if (s.exit !== undefined) (process.stderr.write(s.stderr ?? ""), process.exit(s.exit));
  if (s.hang) await new Promise(() => {});
  console.log(JSON.stringify({
    type: "result", subtype: "success", is_error: !!s.is_error, result: s.reply ?? "", stop_reason: s.stop_reason ?? "end_turn",
    usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 5 },
  }));
}
