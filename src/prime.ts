// Priming (SPEC §6): a `claude -p` call that writes the view into the prompt cache with the spec's own marks and is
// killed as soon as the API has accepted the request. The real turn then reads the view from the cache. A cost
// optimization only: whatever goes wrong here is reported once, and the turn goes on without it.
import { type Block, type Claude, spawnClaude } from "./claude.ts";
import { PRIME_MAX_AGE, PRIME_TIMEOUT } from "./config.ts";
import { cutBlocks } from "./view.ts";

// `args` is the master's argv exactly (model, effort, tools, system prompt, MCP config): any difference is a cache miss
// `onUsage`: the input usage of message_start, all a killed call reports (its errors are the caller's, never the priming's)
export function createPrimer(o: { args: string[]; report: (m: string) => void; onUsage?: (model: string | undefined, usage: any) => void }) {
  let last: { view: string; at: number } | null = null, running: Promise<void> = Promise.resolve();
  let child: Claude | null = null, stopped = false, failed = false;

  async function run(view: string) {
    if (stopped || (last?.view === view && Date.now() - last.at < PRIME_MAX_AGE)) return;
    let claude: Claude | undefined, timedOut = false;
    const timer = setTimeout(() => ((timedOut = true), claude?.kill()), PRIME_TIMEOUT);
    try {
      claude = child = spawnClaude(o.args, { DISABLE_PROMPT_CACHING: "1" }); // no Claude Code marks: the API allows 4, and these are ours
      claude.send([...cutBlocks(view).map((text): Block => ({ type: "text", text, cache_control: { type: "ephemeral" } })), { type: "text", text: "ok" }]);
      for (let ev; (ev = await claude.next()); ) {
        if (ev.type === "result") throw new Error(String(ev.result ?? ev.subtype)); // failed before any response
        if (ev.type === "stream_event" && ev.event?.type === "message_start") { // accepted: the view is in the cache, the rest is not needed
          last = { view, at: Date.now() };
          failed = false;
          o.onUsage?.(claude.model(), ev.event.message?.usage);
          return;
        }
      }
      throw new Error(timedOut ? `no response after ${PRIME_TIMEOUT / 1000}s` : `claude exited (code ${await claude.exited}): ${(await claude.stderr()).trim().slice(-300) || "no error output"}`);
    } catch (e: any) {
      if (!failed) o.report(`priming failed, the turn goes on without it: ${e.message}`);
      failed = true;
    } finally {
      clearTimeout(timer);
      claude?.kill();
      child = null;
    }
  }

  return {
    // resolves once the view is primed (at once if it already is); never rejects. Calls queue up, so a view is never primed twice at once
    prime: (view: string) => (running = running.then(() => run(view))),
    stop() { stopped = true; child?.kill(); },
  };
}
