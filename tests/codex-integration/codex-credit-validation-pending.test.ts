import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearAccountNeedsReauth, clearAccountQuota, handleCodexAuthAPI } from "../../src/codex/auth-api";
import { readCodexAccountRecord, saveCodexAccountCredential } from "../../src/codex/account-store";
import { isCodexAccountUsable } from "../../src/codex/account-usability";
import { resetQuotaQueryBackoffForTests } from "../../src/codex/quota-query-backoff";
import { clearCodexUpstreamHealth } from "../../src/codex/routing";
import { saveConfig } from "../../src/config";
import { flushConfigDirHardeningForTests } from "../../src/config/paths";
import { setLiveStateStoreConfig } from "../../src/lib/state-store-registrations";
import { setAsyncIcaclsRunnerForTests, setIcaclsRunnerForTests } from "../../src/lib/windows-secret-acl";
import { resetLifecycleDrainStateForTests } from "../../src/server/lifecycle";
import type { OcxConfig } from "../../src/types";
import { removeTreeWithRetry } from "../helpers/remove-tree";

const ID = "credit-pending";
const ICACLS_OK = { success: true, exitCode: 0, timedOut: false, stdout: "" };
const usageUrl = "https://chatgpt.com/backend-api/wham/usage";
const responsesUrl = "https://chatgpt.com/backend-api/codex/responses";
let home = "";
let previousHome: string | undefined;
let previousCodexHome: string | undefined;
let previousFetch: typeof fetch;
let warmups = 0;

function config(creditCodexAccountIds: string[]): OcxConfig {
  return { port: 10100, providers: {}, defaultProvider: "openai", creditCodexAccountIds,
    codexAccounts: [{ id: ID, email: "pending@example.test", plan: "pro", isMain: false }] } as OcxConfig;
}

function fullWeekWith(credits: unknown): Response {
  return Response.json({ plan_type: "pro", rate_limit: {
    secondary_window: { used_percent: 100, limit_window_seconds: 604_800,
      reset_at: Math.floor((Date.now() + 3_600_000) / 1000) },
  }, credits });
}

function serve(credits: unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === usageUrl) return fullWeekWith(credits);
    if (url === responsesUrl) {
      warmups++;
      return new Response('data: {"type":"response.completed"}\n\n', { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`unexpected fixture fetch: ${url}`);
  }) as typeof fetch;
}

async function dashboardRefresh(cfg: OcxConfig): Promise<void> {
  const req = new Request("http://localhost/api/codex-auth/accounts/refresh", { method: "POST" });
  const response = await handleCodexAuthAPI(req, new URL(req.url), cfg, undefined, "gui-session");
  expect(response?.status).toBe(200);
}

function pending(cfg: OcxConfig): void {
  saveConfig(cfg);
  setLiveStateStoreConfig(cfg);
  saveCodexAccountCredential(ID, { accessToken: "pending-access", refreshToken: "pending-refresh",
    expiresAt: Date.now() + 3_600_000, chatgptAccountId: "pending-workspace" }, { validationPending: true });
  expect(isCodexAccountUsable(cfg, ID)).toBe(false);
}

beforeEach(() => {
  resetLifecycleDrainStateForTests();
  previousHome = process.env.OPENCODEX_HOME;
  previousCodexHome = process.env.CODEX_HOME;
  previousFetch = globalThis.fetch;
  home = mkdtempSync(join(tmpdir(), "ocx-credit-pending-"));
  mkdirSync(join(home, "codex"), { recursive: true });
  process.env.OPENCODEX_HOME = home;
  process.env.CODEX_HOME = join(home, "codex");
  setIcaclsRunnerForTests(() => ICACLS_OK);
  setAsyncIcaclsRunnerForTests(async () => ICACLS_OK);
  clearAccountQuota(); clearAccountNeedsReauth(ID); clearCodexUpstreamHealth(); resetQuotaQueryBackoffForTests();
  warmups = 0;
});

afterEach(async () => {
  globalThis.fetch = previousFetch;
  resetLifecycleDrainStateForTests();
  clearAccountQuota(); clearAccountNeedsReauth(ID); clearCodexUpstreamHealth(); resetQuotaQueryBackoffForTests();
  await flushConfigDirHardeningForTests();
  setIcaclsRunnerForTests(null);
  setAsyncIcaclsRunnerForTests(null);
  if (previousHome === undefined) delete process.env.OPENCODEX_HOME;
  else process.env.OPENCODEX_HOME = previousHome;
  if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = previousCodexHome;
  removeTreeWithRetry(home);
});

test("explicit validation clears a pending opted-in account that holds spendable credits at a full window", async () => {
  const cfg = config([ID]);
  pending(cfg);
  serve({ has_credits: true, balance: "5" });
  await dashboardRefresh(cfg);
  expect(warmups).toBe(1);
  expect(readCodexAccountRecord(ID)?.codexValidationPending).toBeUndefined();
  expect(isCodexAccountUsable(cfg, ID)).toBe(true);
});

test.each([
  ["without credit consent", [] as string[], { has_credits: true, balance: "5" }],
  ["with an empty balance", [ID], { has_credits: false, balance: "0" }],
  ["with retracted credits", [ID], null],
])("a full window %s keeps the account pending and spends no validation request", async (_name, ids, credits) => {
  const cfg = config(ids);
  pending(cfg);
  serve(credits);
  await dashboardRefresh(cfg);
  expect(warmups).toBe(0);
  expect(readCodexAccountRecord(ID)?.codexValidationPending).toBe(true);
  expect(isCodexAccountUsable(cfg, ID)).toBe(false);
});

test("passive reads never validate a pending opted-in account", async () => {
  const cfg = config([ID]);
  pending(cfg);
  serve({ has_credits: true, balance: "5" });
  const req = new Request("http://localhost/api/codex-auth/accounts/refresh", { method: "POST" });
  expect((await handleCodexAuthAPI(req, new URL(req.url), cfg, undefined, "admin-token"))?.status).toBe(200);
  expect(warmups).toBe(0);
  expect(readCodexAccountRecord(ID)?.codexValidationPending).toBe(true);
});

test("reauthentication of an opted-in account with spendable credits validates instead of deferring", async () => {
  const cfg = config([ID]);
  pending(cfg);
  const oauth = await import("../../src/oauth");
  const oauthStore = await import("../../src/oauth/store");
  const openUrl = await import("../../src/lib/open-url");
  await oauthStore.saveCredential("chatgpt", { access: "reauth-access", refresh: "reauth-refresh",
    expires: Date.now() + 300_000, email: "pending@example.test", accountId: "pending-workspace" });
  const spies = [
    spyOn(oauth, "startLoginFlow").mockResolvedValue({ url: "https://example.test/oauth" }),
    spyOn(oauth, "getLoginStatus").mockReturnValue({ done: true, loggedIn: true } as ReturnType<typeof oauth.getLoginStatus>),
    spyOn(openUrl, "openUrl").mockImplementation(async () => ({ status: "started" as const })),
    spyOn(globalThis, "setTimeout").mockImplementation(((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
      if (delay === 2_000) queueMicrotask(() => callback(...args));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout),
  ];
  serve({ has_credits: true, balance: "5" });
  try {
    const req = new Request("http://localhost/api/codex-auth/login", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ID, reauth: true }) });
    const started = await (await handleCodexAuthAPI(req, new URL(req.url), cfg))!.json() as { flowId: string };
    let state = { status: "pending" } as { status: string; validationPending?: boolean };
    for (let attempt = 0; attempt < 500 && state.status === "pending"; attempt += 1) {
      const statusReq = new Request(`http://localhost/api/codex-auth/login-status?flowId=${started.flowId}`);
      state = await (await handleCodexAuthAPI(statusReq, new URL(statusReq.url), cfg))!.json() as typeof state;
      if (state.status === "pending") await new Promise<void>(done => setImmediate(done));
    }
    expect(state.status).toBe("done");
    expect(state.validationPending).toBeUndefined();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  expect(warmups).toBe(1);
  expect(readCodexAccountRecord(ID)?.codexValidationPending).toBeUndefined();
});
