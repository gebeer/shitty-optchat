// Gist §1 constants and SPEC §2 settings. Sizes are UTF-8 bytes, marks are characters.
import { homedir } from "node:os";

export const NODE = 512;
export const VIEW = 128_000;
export const JOBS = 8;
export const TRIES = 5;
export const RETRY = 10_000; // ms
export const CALL_TIMEOUT = 300_000; // ms: a compactor call with no result by then fails like any other
export const KILL_GRACE = 5_000; // ms: a killed claude gets SIGTERM first, SIGKILL if it is still running after this
export const CAP = 30_000;
export const MARKS = [50_000, 80_000, 100_000];

export const MASTER_MODEL = process.env.OPTCHAT_MODEL ?? "opus";
export const MASTER_EFFORT = "high";
export const MASTER_TOOLS = "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch";
export const MASTER_PERMISSION = process.env.OPTCHAT_PERMISSION_MODE ?? "bypassPermissions";
export const COMPACT_MODEL = "sonnet";
export const COMPACT_EFFORT = "medium";
export const PRIME_MAX_AGE = 270_000; // ms: 5 min cache TTL minus margin
export const PRIME_TIMEOUT = 30_000; // ms: a priming call the API hasn't accepted by then is given up on
export const PRIME_IDLE = 1_000; // ms: how long the view must stay unchanged before it is primed in the background

export const DIR = process.env.OPTCHAT_DIR ?? `${homedir()}/.optchat`;
