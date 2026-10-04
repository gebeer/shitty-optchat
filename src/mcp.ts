// `optchat mcp` (SPEC §9): a read-only stdio MCP server with zoom and date (gist §7.1).
// It reads the chat from disk on each call and never takes the lock, so it runs beside the harness.
import { loadChat } from "./store.ts";
import { type Mem, built, coords, getNode, localTime, msgText } from "./tree.ts";
import { flat } from "./view.ts";

export const TOOLS = [
  {
    name: "zoom",
    description: "Open the line id+n of the view into the two lines of n/2 under it; n = 1 gives the message whole.",
    inputSchema: { type: "object", properties: { id: { type: "integer" }, n: { type: "integer" } }, required: ["id", "n"] },
  },
  {
    name: "date",
    description: "The date and time of message id.",
    inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
];

export function zoom(mem: Mem, id: unknown, n: unknown): string {
  const c = coords(id as number, n as number, mem.root.length), none = `No line ${id}+${n}.`;
  if (!c) return none;
  if (c.l === 0) return `${id}+0|${msgText(mem.root[c.i])}`; // the message whole, newlines kept
  const kids = [getNode(mem, c.l - 1, 2 * c.i), getNode(mem, c.l - 1, 2 * c.i + 1)];
  if (!built(mem, c.l, c.i) || !kids[0] || !kids[1]) return none;
  const half = (n as number) / 2;
  return kids.map((k, j) => `${(id as number) + j * half}+${half}|${flat(k.text)}`).join("\n");
}

export const date = (mem: Mem, id: unknown) =>
  Number.isInteger(id) && (id as number) >= 0 && (id as number) < mem.root.length ? localTime(mem.root[id as number].date) : `No message ${id}.`;

function call(dir: string, name: string, args: any) {
  // ponytail: reloads both streams on every call; cache by file mtime if it gets slow
  const { mem } = loadChat(dir, { repair: false, view: false });
  if (name === "zoom") return zoom(mem, args?.id, args?.n);
  if (name === "date") return date(mem, args?.id);
  throw new Error(`unknown tool ${name}`);
}

export async function serveMcp(dir: string) {
  const send = (m: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  for await (const line of console) {
    let req: any;
    try { req = JSON.parse(line); } catch { continue; }
    if (req?.id === undefined) continue; // notifications get no answer
    const { id, method, params } = req;
    if (method === "initialize") send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "optchat", version: "1" } } });
    else if (method === "ping") send({ id, result: {} });
    else if (method === "tools/list") send({ id, result: { tools: TOOLS } });
    else if (method === "tools/call") {
      try { send({ id, result: { content: [{ type: "text", text: call(dir, params?.name, params?.arguments) }] } }); }
      catch (e: any) { send({ id, result: { content: [{ type: "text", text: `error: ${e.message}` }], isError: true } }); }
    } else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}
