// Print what dev/wire-proxy.ts logged: per request the model, the block structure of system, tools and
// messages with cache marks (*), and usage. Usage: bun dev/wire.ts <log.jsonl> [last N requests]
import { readFileSync } from "node:fs";

const [path, last] = process.argv.slice(2);
const byId = new Map<number, any>(); // a request has a `req` record and, if its response ended, a `res` record
for (const l of readFileSync(path, "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(l); byId.set(r.id, { ...byId.get(r.id), ...r }); }
const recs = [...byId.values()].filter((r) => r.req?.messages);
const blk = (b: any) => `${b.type}:${b.len}${b.cc ? "*" : ""}`;
for (const r of recs.slice(-(Number(last) || recs.length))) {
  const q = r.req, u = r.usage;
  console.log(`#${r.id} ${q.model} status=${r.status ?? "pending"}${r.aborted ? " ABORTED" : ""}${u ? ` in=${u.input_tokens} read=${u.cache_read_input_tokens} write=${u.cache_creation_input_tokens} out=${u.output_tokens}` : ""}`);
  if (r.rl && Object.keys(r.rl).length) console.log(`  ratelimit: ${Object.entries(r.rl).map(([k, v]) => `${k.replace("anthropic-ratelimit-", "")}=${v}`).join(" ")}`);
  console.log(`  system: ${q.system.map(blk).join(" ")}   tools: ${q.tools.map((t: any) => t.name).join(",") || "-"}`);
  for (const m of q.messages) {
    const b = m.blocks;
    console.log(`  ${m.role}: ${b.length > 12 ? `${b.slice(0, 4).map(blk).join(" ")} … ${b.length} blocks … ${b.slice(-2).map(blk).join(" ")}` : b.map(blk).join(" ")}`);
  }
}
