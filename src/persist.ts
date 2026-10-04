// The data dir is a git repo of its own (gist §10), committed after every turn. A git failure never fails a turn: it is returned.
import { existsSync, writeFileSync } from "node:fs";

async function git(dir: string, ...args: string[]) {
  // an identity and no signing of our own: the commit must work on a machine with neither, and never wait for a passphrase
  const p = Bun.spawn(["git", "-C", dir, "-c", "user.name=optchat", "-c", "user.email=optchat@localhost", "-c", "commit.gpgsign=false", ...args], { stdout: "ignore", stderr: "pipe" });
  const err = new Response(p.stderr).text();
  const code = await p.exited;
  return { code, err: (await err).trim() || `git ${args[0]} exited with code ${code}` };
}

async function run(dir: string, msg: string): Promise<string | null> {
  try {
    if (!existsSync(`${dir}/.git`)) { // init here even inside another repo: `add -A` must never reach the outer one
      const r = await git(dir, "init", "-q");
      if (r.code) return r.err;
    }
    if (!existsSync(`${dir}/.gitignore`)) writeFileSync(`${dir}/.gitignore`, "lock\n");
    let r = await git(dir, "add", "-A");
    if (r.code) return r.err;
    r = await git(dir, "diff", "--cached", "--quiet"); // exit 1: there is something to commit
    if (r.code === 0) return null;
    if (r.code !== 1) return r.err;
    r = await git(dir, "commit", "-q", "-m", msg);
    return r.code ? r.err : null;
  } catch (e: any) {
    return e.message; // git is not installed, the dir is gone, ...
  }
}

let last: Promise<unknown> = Promise.resolve(); // one git at a time: two commits at once collide on the index lock
export const commitData = (dir: string, msg: string): Promise<string | null> => (last = last.then(() => run(dir, msg)));
