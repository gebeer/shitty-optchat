#!/usr/bin/env bun
// Test double for `claude -p --input-format stream-json`: logs what it is given, answers from a script.
//   FAKE_CLAUDE_LOG     jsonl file: {argv, env, pid} at start, then {message} per user message
//   FAKE_CLAUDE_SCRIPT  json array, one step per user message (the last one repeats), or {"processes": [steps, ...]}
//                       with one such array per process started (the last one repeats). A step is one of
//                         {reply, stop_reason?}   a `result` with that text
//                         {is_error, reply}       an error `result`
//                         {exit, stderr}          die with that code, writing stderr
//                         {hang}                  never answer (messages that arrive are still logged)
//                         {events: [...]}         raw events printed in order; the pseudo events
//                                                 {"$wait": true}    block until another user message arrives (it is logged)
//                                                 {"$replay": true}  print the replay event of the latest message
//                                                 {"$take": true}    print a replay event for each message that arrived
//                                                                    meanwhile, as claude takes them (no wait)
//                                                 {"$hang": true}    never go on, like {hang}
//                                                 {"$sleep": ms}     pause (a demo sees the stream arrive)
// It exits when its stdin closes (also while hung) and on SIGTERM (the default action).
import { appendFileSync, readFileSync } from "node:fs";

const log = process.env.FAKE_CLAUDE_LOG!, all = JSON.parse(readFileSync(process.env.FAKE_CLAUDE_SCRIPT!, "utf8"));
const started = readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"argv"')).length; // processes before this one
const script: any[] = Array.isArray(all) ? all : all.processes[Math.min(started, all.processes.length - 1)];
const put = (o: object) => appendFileSync(log, JSON.stringify(o) + "\n");
const emit = (o: object) => console.log(JSON.stringify(o));
put({ argv: process.argv.slice(2), env: { DISABLE_PROMPT_CACHING: process.env.DISABLE_PROMPT_CACHING, CLAUDE_CODE_PROMPT_CACHE_TTL: process.env.CLAUDE_CODE_PROMPT_CACHE_TTL }, pid: process.pid });

// stdin is read all the time (a message is logged when it arrives); next() takes the oldest one not yet taken
const inbox: any[] = [];
let last: any, closed = false, wake = () => {};
void (async () => {
  for await (const line of console) if (line.trim()) { const m = JSON.parse(line); put({ message: m }); inbox.push(m); wake(); }
  closed = true;
  wake();
})();
const next = async () => {
  while (!inbox.length && !closed) await new Promise<void>((r) => (wake = r));
  return inbox.length ? (last = inbox.shift()) : null;
};
// Never answers, but goes on reading stdin like a hung claude: a closed stdin (the parent is gone) ends the process.
// A step that stops reading leaves a hung-up stdin unread, and bun's event loop then spins at 100% CPU, orphaned.
const hang = async () => { while (await next()); process.exit(0); };

for (let n = 0; await next(); n++) {
  const s = script[Math.min(n, script.length - 1)];
  if (s.exit !== undefined) (process.stderr.write(s.stderr ?? ""), process.exit(s.exit));
  if (s.hang) await hang();
  if (s.events) {
    for (const e of s.events) {
      if (e.$wait) await next();
      else if (e.$replay) emit({ type: "user", isReplay: true, message: { role: "user", content: last.message.content } });
      else if (e.$take) while (inbox.length) emit({ type: "user", isReplay: true, message: { role: "user", content: (last = inbox.shift()).message.content } });
      else if (e.$hang) await hang();
      else if (e.$sleep) await Bun.sleep(e.$sleep);
      else emit(e);
    }
    continue;
  }
  emit({
    type: "result", subtype: "success", is_error: !!s.is_error, result: s.reply ?? "", stop_reason: s.stop_reason ?? "end_turn",
    usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 5 },
  });
}
