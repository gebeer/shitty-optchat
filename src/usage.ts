// Usage of every model call (SPEC §10): one JSON line per call in <dir>/usage.jsonl, and `optchat stats` reading it back.
import { appendFileSync } from "node:fs";
import { dayOf } from "./tree.ts";

export type CallKind = "turn" | "compact" | "prime";
export const KINDS: CallKind[] = ["turn", "compact", "prime"];

// `model` as the stream reports it (init or message_start); the stream reports no effort, so none is logged.
// Never throws: a failed write costs the line, not the call. Returns the error message, if any.
export function logUsage(dir: string, kind: CallKind, model: string | undefined, usage: any): string | undefined {
  try { appendFileSync(`${dir}/usage.jsonl`, `${JSON.stringify({ date: new Date().toISOString(), kind, model: model ?? null, usage: usage ?? null })}\n`); }
  catch (e: any) { return `usage.jsonl: ${e.message}`; }
}

export type Row = { period: string; calls: Record<CallKind, number>; input: number; read: number; write: number; output: number };
const two = (n: number) => String(n).padStart(2, "0");
// ISO 8601 week of the local date: the week (Monday first) belongs to the year of its Thursday
export function isoWeek(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)); // that week's Thursday
  const jan1 = new Date(t.getFullYear(), 0, 1);
  return `${t.getFullYear()}-W${two(1 + Math.floor(Math.round((t.getTime() - jan1.getTime()) / 864e5) / 7))}`;
}

// the last `days` local days and the last `weeks` ISO weeks up to `now`, oldest first; lines without a kind are turns
// (the log before 2026-10-04 had turns only), unreadable lines are skipped
export function aggregate(text: string, now: Date, days = 14, weeks = 8) {
  const ago = (k: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
  const row = (period: string): Row => ({ period, calls: { turn: 0, compact: 0, prime: 0 }, input: 0, read: 0, write: 0, output: 0 });
  const day = Array.from({ length: days }, (_, k) => row(dayOf(ago(days - 1 - k))));
  const week = Array.from({ length: weeks }, (_, k) => row(isoWeek(ago(7 * (weeks - 1 - k)))));
  for (const line of text.split("\n")) {
    let e: any;
    try { e = line.trim() && JSON.parse(line); } catch { continue; }
    const d = new Date(e?.date);
    if (!e || isNaN(d.getTime())) continue;
    const kind: CallKind = KINDS.includes(e.kind) ? e.kind : "turn", u = e.usage ?? {};
    for (const r of [day.find((r) => r.period === dayOf(d)), week.find((r) => r.period === isoWeek(d))]) {
      if (!r) continue;
      r.calls[kind]++;
      r.input += u.input_tokens ?? 0;
      r.read += u.cache_read_input_tokens ?? 0;
      r.write += u.cache_creation_input_tokens ?? 0;
      r.output += u.output_tokens ?? 0;
    }
  }
  return { day, week };
}

export const hit = (r: Row) => { const all = r.input + r.read + r.write; return all ? `${((100 * r.read) / all).toFixed(1)}%` : "–"; };

// a plain table, numbers right-aligned; `dim` wraps the header (the CLI passes identity when stdout is not a terminal)
export function table(title: string, rows: Row[], dim = (s: string) => s) {
  const n = (x: number) => x.toLocaleString("en-US");
  const head = [title, ...KINDS, "input", "cache read", "cache write", "output", "hit"];
  const body = rows.map((r) => [r.period, ...KINDS.map((k) => n(r.calls[k])), n(r.input), n(r.read), n(r.write), n(r.output), hit(r)]);
  const w = head.map((h, c) => Math.max(h.length, ...body.map((b) => b[c].length)));
  const fmt = (cells: string[]) => cells.map((s, c) => (c ? s.padStart(w[c]) : s.padEnd(w[c]))).join("  ");
  return [dim(fmt(head)), ...body.map(fmt)].join("\n");
}
