// TEMPORARY NON-RELEASE DIAGNOSTIC. Never ship this branch or its source overlay.
import { createHash } from "node:crypto";
import { appendFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export const EVENTS = new Set([
  "arm", "server-stop-start", "server-stop-end", "native-barrier-start", "native-barrier-end",
  "config-barrier-start", "config-barrier-end", "acl-barrier-start", "acl-barrier-end",
  "remove-start", "remove-error", "remove-success", "remove-terminal", "fixture-end",
  "config-flight-start", "config-flight-end", "acl-spawn", "acl-exit", "reap-add", "reap-end",
  "reap-root", "reap-match", "quota-cadence", "quota-activation", "quota-resolve", "quota-load",
  "owner-close-start", "owner-close-ok", "owner-close-error", "claim-close-start", "claim-close-ok",
  "claim-close-error", "profile-close-start", "profile-close-ok", "profile-close-error",
  "spend-close-start", "spend-close-ok", "spend-close-error", "fd-close-start", "fd-close-ok",
]);
export function opaque(salt: string, value: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 24);
}
export function within(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../");
}
export interface RecorderOptions {
  control: string; artifacts: string; allowedTempRoot: string; salt: string;
}
export function createRecorder(options: RecorderOptions) {
  let root = "", canonicalRoot = "", seq = 0, signaled = false, truncated = false;
  let writeFailures = 0;
  const maxEvents = 2048;
  const relId = (p: string, base: string) => opaque(options.salt, relative(base, p).replaceAll("\\", "/").toLowerCase() || ".");
  return (kind: unknown, path?: unknown, number?: unknown, extra?: unknown, code?: unknown): void => {
    try {
      if (typeof kind !== "string" || !EVENTS.has(kind)) return;
      if (kind === "arm") {
        if (root || typeof path !== "string" || !/^ocx-management-auth-[a-zA-Z0-9]{6}$/.test(basename(path))) return;
        const realAllowed = realpathSync.native(options.allowedTempRoot);
        const realRoot = realpathSync.native(path);
        if (!within(realAllowed, realRoot)) return;
        root = resolve(path); canonicalRoot = realRoot;
      }
      if (!root) return;
      const now = Date.now();
      const row: Record<string, unknown> = { seq: ++seq, epochMs: now, monotonicMs: performance.now(), event: kind,
        processId: opaque(options.salt, `pid:${process.pid}`), writeFailures };
      if (typeof path === "string") {
        const abs = resolve(path);
        const lexicalMatch = within(root, abs);
        row.lexicalMatch = lexicalMatch;
        row.pathId = lexicalMatch ? relId(abs, root) : opaque(options.salt, `outside:${abs.toLowerCase()}`);
        try {
          const canonical = realpathSync.native(abs);
          row.canonicalMatch = within(canonicalRoot, canonical);
          if (row.canonicalMatch) row.canonicalPathId = relId(canonical, canonicalRoot);
          row.spellingChanged = abs.toLowerCase() !== canonical.toLowerCase();
        } catch { row.canonicalUnavailable = true; }
      }
      if (typeof number === "number" && Number.isSafeInteger(number)) {
        if (kind === "acl-spawn" || kind === "acl-exit") row.childId = opaque(options.salt, `pid:${number}`);
        else row.value = number;
      }
      if (typeof number === "boolean") row.flag = number;
      if (typeof extra === "number" && Number.isSafeInteger(extra)) row.extra = extra;
      if (kind === "remove-error") row.code = ["EPERM", "EACCES", "EBUSY", "ENOTEMPTY", "ENOENT"].includes(String(code)) ? code : "OTHER";
      if (kind === "remove-error" && path === root && !signaled) {
        // Signal publication never waits for capture and never changes the retry schedule.
        signaled = true;
        const request = { root, requestTimeMs: now };
        writeFileSync(join(options.artifacts, "first-error.json"), JSON.stringify(row), { flag: "wx" });
        try {
          writeFileSync(join(options.control, "request.tmp"), JSON.stringify(request), { flag: "wx" });
          renameSync(join(options.control, "request.tmp"), join(options.control, "request.json"));
        } catch { row.signalFailed = true; }
      }
      if (seq <= maxEvents) appendFileSync(join(options.artifacts, "events.jsonl"), JSON.stringify(row) + "\n");
      else if (!truncated) {
        truncated = true;
        appendFileSync(join(options.artifacts, "events.jsonl"), JSON.stringify({ event: "truncated", maxEvents }) + "\n");
      }
    } catch { writeFailures++; } // Observation must never replace the original test error.
  };
}
