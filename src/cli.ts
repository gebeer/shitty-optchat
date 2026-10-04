#!/usr/bin/env bun
// optchat: no command starts the chat (repl.ts); the commands below are one-shot.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { browseHtml } from "./browse.ts";
import { DIR } from "./config.ts";
import { importOptmem } from "./import.ts";
import { serveMcp } from "./mcp.ts";
import { repl } from "./repl.ts";
import { loadChat } from "./store.ts";
import { aggregate, table } from "./usage.ts";
import { render } from "./view.ts";

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "view") { // read-only, no lock
    const { mem, problems } = loadChat(DIR, { repair: false });
    problems.forEach((p) => console.error(p));
    console.log(render(mem));
  } else if (cmd === "browse") {
    const out = arg ?? "optchat.html", { mem, problems } = loadChat(DIR, { repair: false });
    problems.forEach((p) => console.error(p));
    writeFileSync(out, browseHtml(mem));
    console.log(`wrote ${out}: ${mem.root.length} messages, ${mem.tree.size} nodes`);
  } else if (cmd === "stats") { // read-only, no lock
    const f = `${DIR}/usage.jsonl`, text = existsSync(f) ? readFileSync(f, "utf8") : "", { day, week } = aggregate(text, new Date());
    const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[22m` : s);
    console.log(`${table("day", day, dim)}\n\n${table("week", week, dim)}`);
  } else if (cmd === "mcp") { // started by claude through --mcp-config
    await serveMcp(DIR);
  } else if (cmd === "import-optmem") {
    const mem = await importOptmem(DIR, arg);
    console.log(`imported ${mem.root.length} notes into ${DIR}; ${mem.tree.size} free nodes built, ${mem.view.length} view lines`);
  } else if (!cmd) {
    await repl(DIR);
  } else {
    console.error("usage: optchat [view | stats | browse [out.html] | import-optmem [LOG.txt] | mcp]   (no command: the chat; data dir: $OPTCHAT_DIR or ~/.optchat)");
    process.exit(cmd === "--help" || cmd === "-h" ? 0 : 2);
  }
} catch (e: any) {
  console.error(`optchat: ${e.message}`);
  process.exit(1);
}
