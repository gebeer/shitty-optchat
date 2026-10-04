// `claude -p` child processes: stream-json user messages in, stream-json events out (SPEC §4).
import { appendFileSync } from "node:fs";
import { KILL_GRACE } from "./config.ts";

export type Block = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

// Every child that is still running. None may outlive the harness: an orphaned claude finishes its request on the
// subscription and lingers, so each gets SIGTERM when the harness exits or is signalled (SIGKILL can't be caught).
const live = new Set<{ kill(signal?: NodeJS.Signals): void }>();
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => live.forEach((c) => c.kill()));
  for (const [sig, no] of [["SIGINT", 2], ["SIGHUP", 1], ["SIGTERM", 15]] as const) process.on(sig, () => process.exit(128 + no)); // runs the exit hook
}

// the flags every call shares; callers add --mcp-config, --safe-mode, ...
export const baseArgs = (model: string, effort: string, systemFile: string, tools: string) => [
  "-p", "--model", model, "--effort", effort,
  "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
  "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config",
  "--system-prompt-file", systemFile, "--tools", tools,
];

// `tap`: a file that gets every raw stdout line, to record a stream for a fixture (never commit one of a real chat)
export function spawnClaude(args: string[], env: Record<string, string> = {}, tap?: string) {
  const child = Bun.spawn([process.env.OPTCHAT_CLAUDE ?? "claude", ...args], {
    env: { ...process.env, CLAUDE_CODE_PROMPT_CACHE_TTL: "5m", ...env }, // 5m marks only: a 5m mark after a 1h one is a 400
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
  });
  hook();
  live.add(child);
  child.exited.then(() => live.delete(child));
  const stderr = new Response(child.stderr).text(); // drained, so the pipe never fills
  const reader = child.stdout.getReader(), dec = new TextDecoder();
  let buf = "";
  return {
    send(blocks: Block[]) {
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: blocks } }) + "\n");
      child.stdin.flush();
    },
    // the next event, undefined when the process closed its output
    async next(): Promise<any> {
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (tap && line.trim()) appendFileSync(tap, `${line}\n`);
          try { if (line.trim()) return JSON.parse(line); } catch {}
          continue;
        }
        const { value, done } = await reader.read();
        if (done) return undefined;
        buf += dec.decode(value, { stream: true });
      }
    },
    // the next `result` event; throws if the process ends first
    async result(): Promise<any> {
      for (let e; (e = await this.next()); ) if (e.type === "result") return e;
      throw new Error(`claude exited (code ${await child.exited}) before its result: ${(await stderr).trim().slice(-300)}`);
    },
    kill(grace = KILL_GRACE) { // SIGTERM, and SIGKILL if it is still there after `grace` ms
      child.kill();
      const t = setTimeout(() => child.kill("SIGKILL"), grace);
      t.unref();
      child.exited.then(() => clearTimeout(t));
    },
    exited: child.exited,
    stderr: () => stderr,
  };
}
export type Claude = ReturnType<typeof spawnClaude>;
