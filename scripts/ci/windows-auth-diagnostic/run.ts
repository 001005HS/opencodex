// Temporary manual diagnostic. Never a release gate; never run on a user host.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, watch, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { release as osRelease } from "node:os";
import { OutputCapture } from "./output";

const BASE = "0818ea1812a028e1c14cd0b0511b44863407bc52";
const BRANCH = "refs/heads/codex/diagnostic-261004-windows-auth-0818-v2";
const files = [
  "tests/server/server-management-auth.test.ts", "tests/server/sidebar-star-state.test.ts",
  "tests/server/startup-action-control-elevation.test.ts", "tests/service/autostart-health.test.ts",
  "tests/service/service-auth-qualified-localhost.test.ts", "tests/service/service-child-ownership.test.ts",
];
const argv = [process.execPath, "test", "--isolate", "--timeout", "60000", ...files];
const repo = resolve(import.meta.dir, "../../..");
const artifacts = join(repo, ".tmp/windows-auth-artifacts");
const authorizedHost = process.platform === "win32" && process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REF === BRANCH;
const summary: Record<string, unknown> = { purpose: "NON-RELEASE", releaseEvidence: false,
  baseSha: BASE, context: "six-file batch only; prior batches omitted", argv: ["bun", ...argv.slice(1)],
  nativeClaim: "post-error residual snapshot, not exact historical failed child operation", testExit: null };
function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "ignore" });
  if (result.exitCode !== 0) throw new Error("diagnostic git precondition failed");
  return result.stdout.toString().trim();
}
async function terminate(child: Bun.Subprocess): Promise<void> {
  if (child.exitCode !== null) { await child.exited; return; }
  // Only a PID retained from our own spawn. No image-wide or service termination.
  const killer = Bun.spawn([join(process.env.SystemRoot!, "System32/taskkill.exe"), "/PID", String(child.pid), "/T", "/F"],
    { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
  const timer = setTimeout(() => { killer.kill(); child.kill(); }, 3000);
  try { await killer.exited; if (child.exitCode === null) child.kill(); await child.exited; }
  finally { clearTimeout(timer); }
}
let observer: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
let test: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
let watcher: ReturnType<typeof watch> | undefined;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let batchTimer: ReturnType<typeof setTimeout> | undefined;
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let control = "", captureDetected = false, captureKill: Promise<void> | undefined;
let readyResolve!: () => void;
let readyReject!: (e: Error) => void;
const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
function requestSeen(): void {
  if (captureDetected || !existsSync(join(control, "request.json"))) return;
  captureDetected = true;
  summary.firstErrorSignaled = true;
  let requestTime = Date.now();
  try {
    const path = join(control, "request.json");
    if (statSync(path).size > 4096) throw new Error("oversize");
    const request = JSON.parse(readFileSync(path, "utf8")) as { requestTimeMs: number };
    if (!Number.isSafeInteger(request.requestTimeMs) || request.requestTimeMs > Date.now() + 1000) throw new Error("invalid");
    requestTime = request.requestTimeMs;
  } catch { summary.signalInvalid = true; }
  const remaining = Math.max(0, Math.min(5000, 5000 - (Date.now() - requestTime)));
  summary.observerStartLagMs = Date.now() - requestTime;
  captureTimer = setTimeout(() => {
    if (observer && observer.exitCode === null) {
      summary.observerTimeout = true;
      captureKill = terminate(observer);
    }
  }, remaining);
}
const output = new OutputCapture(line => {
  if (line === "READY") readyResolve(); else requestSeen();
});

type JsonRecord = Record<string, unknown>;
function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Interpret bounded native evidence; never copy paths, messages, or unknown fields. */
export function readNativeCapture(path: string): JsonRecord {
  const result: JsonRecord = { nativeCaptureStatus: "invalid", nativeCaptureComplete: false };
  let text: string;
  try {
    const fd = openSync(path, "r");
    try {
      const bytes = Buffer.alloc(262145);
      let length = 0;
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length > 262144) return { ...result, nativeCaptureStatus: "oversized" };
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    } finally { closeSync(fd); }
  } catch (error) {
    return { ...result, nativeCaptureStatus: record(error) && error.code === "ENOENT" ? "missing" : "unreadable" };
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return result; }
  const flags = ["observerGap", "truncated", "inaccessible", "rootMissing"] as const;
  if (!record(value) || value.schemaVersion !== 1 || flags.some(key => typeof value[key] !== "boolean")
    || !Array.isArray(value.entries) || value.entries.length > 64) return result;
  for (const key of flags) result[`native${key[0]!.toUpperCase()}${key.slice(1)}`] = value[key];
  const id = (v: unknown) => typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
  const numeric = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v);
  if (value.hresult !== undefined && !numeric(value.hresult)) return result;
  let failures = value.hresult !== undefined && value.hresult !== 0 ? 1 : 0;
  for (const entry of value.entries) {
    if (!record(entry) || !id(entry.id)) return result;
    const codes = ["deleteOpenWin32", "deleteOpenHresult", "metadataWin32", "metadataHresult", "rmHresult", "rmEndHresult"];
    for (const key of [...codes, "hresult", "daclHresult"]) {
      if (entry[key] !== undefined && !numeric(entry[key])) return result;
      if ((codes.includes(key) && entry[key] === undefined) || (entry[key] !== undefined && entry[key] !== 0)) failures++;
    }
    for (const key of ["reparseSkipped", "daclTruncated", "ownersTruncated"]) {
      if (entry[key] !== undefined && typeof entry[key] !== "boolean") return result;
      if (entry[key] === true) failures++;
    }
    if (!numeric(entry.attributes) || !id(entry.fileIdentity) || typeof entry.reparseSkipped !== "boolean") failures++;
    if (typeof entry.nullDacl !== "boolean" || !Array.isArray(entry.dacl) || entry.dacl.length > 16) failures++;
    else for (const ace of entry.dacl) {
      if (!record(ace) || !numeric(ace.type) || (ace.mask !== null && !numeric(ace.mask))
        || typeof ace.inherited !== "boolean" || typeof ace.principalClass !== "string"
        || !["current", "group", "other"].includes(ace.principalClass)) return result;
    }
    if (!Array.isArray(entry.owners) || entry.owners.length > 16) failures++;
    else if (entry.owners.some(owner => !record(owner) || !id(owner.processId))) return result;
  }
  result.nativeQueryFailureCount = failures;
  result.nativeEntryCount = value.entries.length;
  const complete = !flags.some(key => value[key]) && value.entries.length > 0 && failures === 0;
  result.nativeCaptureComplete = complete;
  result.nativeCaptureStatus = value.rootMissing ? "vanished" : complete ? "complete" : "partial";
  return result;
}
/** Keep known exits across result/artifact failures; harvesting can only fail a zero exit. */
export async function assessDiagnosticOutcome(
  summary: JsonRecord, supervisorExit: number,
  harvest: (recordTestExit: (value: unknown) => boolean) => Promise<boolean>,
): Promise<number> {
  let knownExit = supervisorExit;
  summary.supervisorExit = supervisorExit;
  try {
    const failed = await harvest(value => {
      if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 4294967295) return false;
      knownExit = value; summary.testExit = value; return true;
    });
    return knownExit !== 0 ? knownExit : failed ? 1 : 0;
  } catch {
    summary.preparationOrRunnerFailed = true;
    summary.evidenceHarvestFailed = true;
    return knownExit !== 0 ? knownExit : 1;
  }
}

/** Cleanup/publication failure must not replace the already captured nonzero exit. */
export async function finalizeDiagnosticOutcome(
  summary: JsonRecord, knownExit: number, finish: () => Promise<void>,
): Promise<number> {
  try { await finish(); return knownExit; }
  catch { summary.finalizationFailed = true; return knownExit !== 0 ? knownExit : 1; }
}

// Importing the outcome functions for focused checks must never launch the runner.
if (import.meta.main) {
let code = 1;
try {
  if (!authorizedHost) {
    throw new Error("host scope");
  }
  mkdirSync(artifacts, { recursive: true });
  const head = git(["rev-parse", "HEAD"]);
  if (head !== process.env.GITHUB_SHA || git(["rev-parse", "HEAD^"]) !== BASE || Bun.version !== "1.4.0" || !Bun.revision.startsWith("34cbb9a40")) throw new Error("identity");
  const delta = git(["diff", "--name-only", BASE, "HEAD"]).split("\n");
  if (delta.some(p => p !== ".github/workflows/ci.yml" && !p.startsWith("scripts/ci/windows-auth-diagnostic/"))) throw new Error("delta");
  const overlay = join(import.meta.dir, "observations.patch");
  const baseline = JSON.parse(readFileSync(join(import.meta.dir, "baseline.json"), "utf8")) as Record<string, string>;
  for (const [path, hash] of Object.entries(baseline)) {
    if (createHash("sha256").update(readFileSync(join(repo, path))).digest("hex") !== hash) throw new Error("source drift");
  }
  git(["apply", "--check", overlay]); git(["apply", overlay]);
  summary.diagnosticSha = head;
  summary.overlaySha256 = createHash("sha256").update(readFileSync(overlay)).digest("hex");
  summary.bun = Bun.version;
  summary.bunRevision = Bun.revision;
  summary.originalBunRevision = "34cbb9a40";
  summary.originalImageVersion = "20260925.250.1";
  summary.osBuild = osRelease().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
  // These two runner metadata fields are bounded before export; no environment dump.
  summary.image = (process.env.ImageOS ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
  summary.imageVersion = (process.env.ImageVersion ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64);
  if (!process.env.RUNNER_TEMP || !process.env.SystemRoot) throw new Error("runner paths absent");
  control = mkdtempSync(join(process.env.RUNNER_TEMP, "ocx-wauth-control-"));
  const allowedTempRoot = mkdtempSync(join(process.env.RUNNER_TEMP, "ocx-wauth-tests-"));
  writeFileSync(join(control, "session.json"), JSON.stringify({ runId: randomUUID(), salt: randomBytes(32).toString("hex"), allowedTempRoot }));
  watcher = watch(control, requestSeen);
  observer = Bun.spawn([join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(import.meta.dir, "collect.ps1"),
    "-ControlDir", control, "-ArtifactDir", artifacts], { cwd: repo, stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });
  const observerOut = output.drain(observer.stdout, "observer");
  const observerErr = output.drain(observer.stderr, "observer-error");
  void observer.exited.then(() => readyReject(new Error("observer exited before ready")));
  readyTimer = setTimeout(() => readyReject(new Error("observer readiness timeout")), 30000);
  await ready; clearTimeout(readyTimer);
  test = Bun.spawn([join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(import.meta.dir, "batch.ps1"),
    "-BunPath", process.execPath, "-RepoDir", repo, "-ControlDir", control], { cwd: repo, env: { ...process.env, TMP: allowedTempRoot, TEMP: allowedTempRoot, TMPDIR: allowedTempRoot,
    OCX_WAUTH_CONTROL: control, OCX_WAUTH_ARTIFACTS: artifacts }, stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });
  const drains = Promise.all([output.drain(test.stdout), output.drain(test.stderr)]);
  let batchKill: Promise<void> | undefined;
  // Native job supervisor enforces the original480s batch. This outer bound
  // additionally allows30s for Add-Type and unblocks pipes even after parent exit.
  batchTimer = setTimeout(() => {
    summary.supervisorTimeout = true; output.cancel("batch"); batchKill = terminate(test!);
  }, 510000);
  const supervisorExit = await test.exited;
  code = await assessDiagnosticOutcome(summary, supervisorExit, async recordTestExit => {
  const resultPath = join(control, "test-result.json");
  if (existsSync(resultPath) && statSync(resultPath).size <= 8192) {
    const result = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
    for (const key of ["testStarted", "batchTimeout", "jobAssigned", "descendantsTerminated"]) summary[key] = result[key] === true;
    if (result.testExit !== null && !recordTestExit(result.testExit)) summary.batchResultInvalid = true;
    if (Number.isSafeInteger(result.nativeError)) summary.batchNativeError = result.nativeError;
  } else summary.batchResultMissing = true;
  await drains; if (batchKill) await batchKill; clearTimeout(batchTimer);
  Object.assign(summary, output.summary());
  requestSeen();
  if (!captureDetected) { summary.firstErrorSignaled = false; await terminate(observer!); }
  else { await observer!.exited; if (captureKill) await captureKill; }
  if (captureTimer) clearTimeout(captureTimer);
  output.cancel("observer");
  await Promise.all([observerOut, observerErr]);
  Object.assign(summary, output.summary());
  summary.observerExit = observer!.exitCode;
  summary.nativeSnapshotPresent = existsSync(join(artifacts, "native.json"));
  summary.firstErrorRecorded = existsSync(join(artifacts, "first-error.json"));
  const nativeRequired = captureDetected || summary.firstErrorRecorded === true;
  Object.assign(summary, nativeRequired ? readNativeCapture(join(artifacts, "native.json"))
    : { nativeCaptureStatus: "not-requested", nativeCaptureComplete: false });
  const eventsFile = join(artifacts, "events.jsonl");
  const eventsText = existsSync(eventsFile) && statSync(eventsFile).size <= 1048576 ? readFileSync(eventsFile, "utf8") : "";
  const events = eventsText.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { event: string; writeFailures?: number });
  summary.targetCaseArmed = events.some(row => row.event === "arm");
  summary.targetRemovalObserved = events.some(row => ["remove-success", "remove-terminal"].includes(row.event));
  summary.traceTruncated = events.some(row => row.event === "truncated");
  summary.traceWriteFailure = events.some(row => Number(row.writeFailures ?? 0) > 0);
  summary.observerGap = !summary.targetCaseArmed || !summary.targetRemovalObserved || summary.traceWriteFailure
    || (nativeRequired && (!captureDetected || summary.nativeCaptureComplete !== true || observer!.exitCode !== 0 || summary.observerTimeout === true));
  return Boolean(summary.observerGap || supervisorExit !== 0 || summary.batchResultMissing || summary.batchResultInvalid
    || !summary.jobAssigned || !summary.descendantsTerminated || summary.supervisorTimeout || summary.pipeReadFailure
    || Number(summary.batchNativeError ?? 0) !== 0);
  });
} catch {
  summary.preparationOrRunnerFailed = true; // Never dump paths, exception text or child output.
} finally {
  code = await finalizeDiagnosticOutcome(summary, code, async () => {
    for (const timer of [readyTimer, batchTimer, captureTimer]) if (timer) clearTimeout(timer);
    watcher?.close();
    output.cancel("batch"); output.cancel("observer");
  });
  for (const child of [test, observer]) {
    if (child) code = await finalizeDiagnosticOutcome(summary, code, () => terminate(child));
  }
  if (captureKill) code = await finalizeDiagnosticOutcome(summary, code, () => captureKill!);
  code = await finalizeDiagnosticOutcome(summary, code, async () => {
    Object.assign(summary, output.summary());
    // Outside the authorized hosted environment do not even create artifact directories.
    if (authorizedHost && existsSync(artifacts)) writeFileSync(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  });
}
console.log("NON-RELEASE diagnostic complete; sanitized artifact contains outcome and observation gaps.");
process.exit(code);
}
