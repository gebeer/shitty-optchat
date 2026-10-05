// Writes the fake-claude script for dev/tui-demo.sh. Every call is a new process that answers its first message, so each
// turn plays the same stream: the recorded tool calls (src/fixtures/turn-tools.jsonl) slowed down, then a thought, a long
// tool output (after it, claude takes the messages sent meanwhile), a failing tool and a Markdown answer. The compactor and the priming get the same stream; they cope.
import { readFileSync, writeFileSync } from "node:fs";

const fixture = readFileSync(new URL("../src/fixtures/turn-tools.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const slow = (events: any[], ms: number) => events.flatMap((e) => (e.type === "stream_event" || e.type === "user" ? [{ $sleep: ms }, e] : [e]));
const delta = (delta: object) => ({ type: "stream_event", event: { type: "content_block_delta", delta } });
const said = (content: object[]) => ({ type: "assistant", message: { content } });
const words = (text: string) => text.match(/\S+\s*/g)!.flatMap((w) => [{ $sleep: 25 }, delta({ type: "text_delta", text: w })]);
const tool = (id: string, name: string, input: object) => said([{ type: "tool_use", id, name, input }]);
const result = (id: string, content: string, is_error = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });
const answer = `## Demo answer

The view has **three** parts. Inline \`code\`, a [link](https://example.com) and a list:

- first item
- second item with *emphasis*

\`\`\`ts
const x = 1; // a code block
\`\`\`

> A quote to close.`;
const final = fixture.at(-1);
const demo = [
  ...slow(fixture.slice(0, -1), 40), { $sleep: 600 },
  delta({ type: "thinking_delta", thinking: "", estimated_tokens: 42 }), said([{ type: "thinking", thinking: "" }]),
  tool("t1", "Bash", { command: "seq 1 15" }), { $sleep: 900 }, result("t1", Array.from({ length: 15 }, (_, i) => `${i + 1}`).join("\n")), { $take: true },
  tool("t2", "Read", { file_path: "/nonexistent" }), { $sleep: 600 }, result("t2", "File does not exist.", true),
  ...words(answer), said([{ type: "text", text: answer }]), final,
];
writeFileSync(process.argv[2], JSON.stringify([{ events: demo }]));
