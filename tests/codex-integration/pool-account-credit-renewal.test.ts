import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexPoolAuthenticationError, resolveCodexAuthContext } from "../../src/codex/auth-context";
import {
  clearCodexCooldownRecoveryProbeState,
  registerCodexCooldownRecoveryProbeWorker,
  runPoolCreditRenewal,
} from "../../src/codex/auth-api/pool-mode-gate";
import { readCodexAccountRecord, saveCodexAccountCredential } from "../../src/codex/account-store";
import { clearAccountNeedsReauth, isAccountNeedsReauth, markAccountNeedsReauth } from "../../src/codex/account-runtime-state";
import { clearAccountQuota, getAccountQuota, setAccountQuotaFromParsed, updateAccountQuota } from "../../src/codex/quota";
import { type CodexSpendableCredits } from "../../src/codex/quota-types";
import { resetQuotaQueryBackoffForTests } from "../../src/codex/quota-query-backoff";
import { clearCodexUpstreamHealth, clearThreadAccountMap } from "../../src/codex/routing";
import { clearPoolRotationState } from "../../src/codex/pool-rotation";
import { flushConfigDirHardeningForTests } from "../../src/config/paths";
import * as sweeper from "../../src/lib/state-store-sweeper";
import { setAsyncIcaclsRunnerForTests, setIcaclsRunnerForTests } from "../../src/lib/windows-secret-acl";
import type { OcxConfig } from "../../src/types";
import { removeTreeWithRetry } from "../helpers/remove-tree";

const ID = "fixture-pool-spender";
const whamUrl = "https://chatgpt.com/backend-api/wham/usage";
const HOUR = 3_600_000;
const ICACLS_OK = { success: true, exitCode: 0, timedOut: false, stdout: "" };
let home = "";
let now = 0;
let previousHome: string | undefined;
let previousCodexHome: string | undefined;
let previousFetch: typeof fetch;
let cfg: OcxConfig;
let calls: string[];

function seed(credits: CodexSpendableCredits | null = { hasCredits: true, balance: 5, observedAt: now - 180_000 }): void {
  clearAccountQuota(ID);
  updateAccountQuota(ID, 100, now + HOUR);
  setAccountQuotaFromParsed(ID, { credits });
}

const OMITTED = Symbol("omitted");

function usage(credits: unknown = { has_credits: true, balance: "5" }): Response {
  return Response.json({ plan_type: "pro", rate_limit: {
    ...(credits === OMITTED ? {} : { allowed: false }),
    secondary_window: { used_percent: 100, limit_window_seconds: 604_800, reset_at: Math.floor((now + HOUR) / 1000) },
  }, ...(credits === OMITTED ? {} : { credits }) });
}

function fetchWith(handler: () => Response | Promise<Response>): void {
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    calls.push(url);
    expect(url).toBe(whamUrl);
    return handler();
  }, { preconnect: previousFetch.preconnect });
}

const resolve = () => resolveCodexAuthContext(new Headers({ "x-codex-thread-id": "thread-a" }), cfg, "pool",
  { modelId: "gpt-5.5" });

beforeEach(() => {
  previousHome = process.env.OPENCODEX_HOME;
  previousCodexHome = process.env.CODEX_HOME;
  previousFetch = globalThis.fetch;
  home = mkdtempSync(join(tmpdir(), "ocx-pool-credit-renewal-"));
  process.env.OPENCODEX_HOME = home;
  process.env.CODEX_HOME = home;
  now = Math.floor(Date.now() / 1000) * 1000;
  spyOn(Date, "now").mockImplementation(() => now);
  setIcaclsRunnerForTests(() => ICACLS_OK);
  setAsyncIcaclsRunnerForTests(async () => ICACLS_OK);
  clearAccountQuota(); clearCodexUpstreamHealth(); clearThreadAccountMap(); clearPoolRotationState();
  resetQuotaQueryBackoffForTests(); clearAccountNeedsReauth(ID); clearCodexCooldownRecoveryProbeState();
  saveCodexAccountCredential(ID, { accessToken: "fixture-access", refreshToken: "fixture-refresh",
    expiresAt: now + 24 * HOUR, chatgptAccountId: "fixture-workspace" });
  calls = [];
  cfg = { port: 10100, defaultProvider: "openai", codexMainAccountHardLock: false,
    codexAccounts: [{ id: ID, email: "spender@example.test", isMain: false, plan: "pro" }],
    creditCodexAccountIds: [ID], pausedCodexAccountIds: ["__main__"], activeCodexAccountId: ID,
    providers: { openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex",
      authMode: "forward", codexAccountMode: "pool" } } } as OcxConfig;
  seed();
  fetchWith(() => usage());
});

afterEach(async () => {
  mock.restore();
  globalThis.fetch = previousFetch;
  clearAccountQuota(); clearCodexUpstreamHealth(); clearThreadAccountMap(); clearPoolRotationState();
  resetQuotaQueryBackoffForTests(); clearAccountNeedsReauth(ID); clearCodexCooldownRecoveryProbeState();
  await flushConfigDirHardeningForTests();
  setIcaclsRunnerForTests(null);
  setAsyncIcaclsRunnerForTests(null);
  if (previousHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousHome;
  if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = previousCodexHome;
  removeTreeWithRetry(home);
});

test("without renewal, an opted-in pool account leaves selection when its credit evidence expires", async () => {
  seed({ hasCredits: true, balance: 5, observedAt: now });
  await expect(resolve()).resolves.toMatchObject({ kind: "pool", accountId: ID });
  now += 300_001;
  await expect(resolve()).rejects.toBeInstanceOf(CodexPoolAuthenticationError);
  expect(calls).toEqual([]);
});

test.each([false, true])("hidden-dashboard sweep renews pool credits at three minutes and admits past original expiry (unlimited=%j)", async unlimited => {
  const original = now;
  seed({ hasCredits: true, ...(unlimited ? { unlimited: true } : { balance: 5 }), observedAt: now });
  let worker: (() => void) | undefined;
  spyOn(sweeper, "registerStateSweepAfterTick").mockImplementation(registration => { worker = registration.afterTick; });
  registerCodexCooldownRecoveryProbeWorker(cfg);
  now += 179_999;
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([]);
  now++;
  expect(worker).toBeDefined();
  worker!();
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
  expect(getAccountQuota(ID)?.credits?.observedAt).toBe(now);
  now = original + 300_001;
  await expect(resolve()).resolves.toMatchObject({ kind: "pool", accountId: ID });
});

test.each([503, 429])("failed renewal HTTP %s keeps the old evidence, refuses after expiry and is paced", async status => {
  const observedAt = getAccountQuota(ID)!.credits!.observedAt;
  fetchWith(() => new Response("{}", { status }));
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
  expect(getAccountQuota(ID)?.credits?.observedAt).toBe(observedAt);
  expect(isAccountNeedsReauth(ID)).toBe(false);
  now += 120_001;
  await expect(resolve()).rejects.toBeInstanceOf(CodexPoolAuthenticationError);
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
});

test.each([
  ["empty", { has_credits: false, balance: "0" }],
  ["retracted", null],
])("renewal with %s credits cannot authorize expired evidence", async (_name, credits) => {
  fetchWith(() => usage(credits));
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
  now += 120_001;
  await expect(resolve()).rejects.toBeInstanceOf(CodexPoolAuthenticationError);
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
});

test("a read that omits credits never renews the clock and is retried only after backoff", async () => {
  const observedAt = getAccountQuota(ID)!.credits!.observedAt;
  fetchWith(() => usage(OMITTED));
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
  expect(getAccountQuota(ID)?.credits?.observedAt).toBe(observedAt);
  now += 60_000;
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([whamUrl]);
});

test.each(["missing", "retracted", "zero", "restricted", "overage", "fresh"])("%s credit evidence never initiates renewal", async condition => {
  const credits: CodexSpendableCredits = { hasCredits: true, balance: 5, observedAt: now - 180_000 };
  if (condition === "zero") credits.balance = 0;
  if (condition === "restricted") credits.allowed = false;
  if (condition === "overage") credits.overageLimitReached = true;
  if (condition === "fresh") credits.observedAt = now - 179_999;
  if (condition === "missing") { clearAccountQuota(ID); updateAccountQuota(ID, 100, now + HOUR); }
  else seed(condition === "retracted" ? null : credits);
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([]);
});

test.each(["no-consent", "paused", "reauth", "reset", "not-pool-mode"])("%s excludes pool credit renewal", async condition => {
  if (condition === "no-consent") cfg.creditCodexAccountIds = [];
  if (condition === "paused") cfg.pausedCodexAccountIds = ["__main__", ID];
  if (condition === "reauth") markAccountNeedsReauth(ID, undefined, readCodexAccountRecord(ID)?.generation);
  if (condition === "reset") updateAccountQuota(ID, 0, now + HOUR);
  if (condition === "not-pool-mode") cfg.providers.openai!.codexAccountMode = "direct";
  await runPoolCreditRenewal(cfg, now);
  expect(calls).toEqual([]);
});

test("overlapping sweeps share one renewal read", async () => {
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  fetchWith(async () => { await gate; return usage(); });
  const first = runPoolCreditRenewal(cfg, now);
  const second = runPoolCreditRenewal(cfg, now);
  release();
  await Promise.all([first, second]);
  expect(calls).toEqual([whamUrl]);
  expect(getAccountQuota(ID)?.credits?.observedAt).toBe(now);
});
