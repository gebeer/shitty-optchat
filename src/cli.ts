#!/usr/bin/env bun
// optchat: no command starts the chat (repl.ts); the commands below are one-shot.
import { writeFileSync } from "node:fs";
import { browseHtml } from "./browse.ts";
import { DIR } from "./config.ts";
import { importOptmem } from "./import.ts";
import { serveMcp } from "./mcp.ts";
import { repl } from "./repl.ts";
import { loadChat } from "./store.ts";
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
  } else if (cmd === "mcp") { // started by claude through --mcp-config
    await serveMcp(DIR);
  } else if (cmd === "import-optmem") {
    const mem = await importOptmem(DIR, arg);
    console.log(`imported ${mem.root.length} notes into ${DIR}; ${mem.tree.size} free nodes built, ${mem.view.length} view lines`);
  } else if (!cmd) {
    await repl(DIR);
  } else {
    console.error("usage: optchat [view | browse [out.html] | import-optmem [LOG.txt] | mcp]   (no command: the chat; data dir: $OPTCHAT_DIR or ~/.optchat)");
    process.exit(cmd === "--help" || cmd === "-h" ? 0 : 2);
  }
} catch (e: any) {
  console.error(`optchat: ${e.message}`);
  process.exit(1);
}
