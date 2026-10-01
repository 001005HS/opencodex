import { createLegacySpendLedger } from "../helpers/legacy-spend-ledger";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  createSpendReservationLedger, configureSharedSpendLedger, DEFAULT_SPEND_RESERVATION_POLICY, parseSpendJournalRecord,
  type SpendJournal, type SpendReservationPolicy,
} from "../../src/lib/spend-reservation-ledger";
import { acquireOwnedSpendHome } from "../helpers/owned-spend-home";
import { removeTreeWithRetry } from "../helpers/remove-tree";
import { admitHttpWorkflowTurn, workflowDecisionRefusalResponse } from "../../src/server/workflow-refusal";
import { createResponsesSendBudget } from "../../src/server/responses/request-send-budget";
import { createRequestSpendTracker } from "../../src/server/responses/request-spend";

const salt = "5".repeat(64);
const alias = (kind: string, id: string) => createHash("sha256").update(salt).update("\0").update(kind).update("\0").update(id).digest("hex").slice(0, 32);
const pool = (id: string) => alias("pool", id);
const policy = (poolAliases?: unknown, overrides: Partial<SpendReservationPolicy> = {}): SpendReservationPolicy => ({
  ...DEFAULT_SPEND_RESERVATION_POLICY, pool: { maxTokens: 100 }, poolAliases, ...overrides,
});
const journal = (records: unknown[] = []): SpendJournal & { lines: string[] } => {
  const lines = records.map(record => JSON.stringify(record));
  return { lines, read: () => [...lines], append: line => { lines.push(line); },
    rewrite: next => { lines.splice(0, lines.length, ...next); } };
};
const checkpoint = (entries: Array<[string, number, number]>) => ({
  v: 1, kind: "checkpoint", at: 1,
  scopes: entries.map(([id, settled, unresolved]) => ({ scope: "pool", alias: pool(id), settled, unresolved, seenAt: 1 })), sends: [],
});
const reserve = (ledger: ReturnType<typeof createSpendReservationLedger>, sendId: string, poolId = "provider", tokens = 1, alreadySent = false) =>
  ledger.reserve({ sendId, scopes: { poolId }, inputTokens: tokens, outputCeilingTokens: 0, alreadySent });

describe("historical pool identity continuity", () => {
  test("unmapped historical debt fails closed across labels, providers, pruning and restart", () => {
    const disk = journal([checkpoint([["provider-old-label", 100, 0]])]);
    for (let restart = 0; restart < 2; restart += 1) {
      const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(), now: () => 100_000 });
      ledger.prune();
      for (const id of ["provider", "provider-old-label", "unrelated-provider"]) {
        expect(reserve(ledger, `${restart}-${id}`, id)).toMatchObject({ reserved: false, denial: { reason: "pool-history-unresolved" } });
      }
      expect(ledger.snapshot("pool", "provider-old-label")?.settled).toBe(100);
    }
  });

  test("explicit aliases aggregate each original balance once, including canonical history", () => {
    const disk = journal([checkpoint([["label-a", 40, 0], ["label-b", 0, 30], ["provider", 20, 0]])]);
    const aliases = { [pool("label-a")]: "provider", [pool("label-b")]: "provider", [pool("provider")]: "provider" };
    let ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(aliases, { compactAfterRecords: 1 }), now: () => 2 });
    expect(ledger.checkPoolContinuity()).toBeUndefined();
    expect(ledger.snapshot("pool", "provider")).toEqual({ settled: 60, unresolved: 30, reserved: 0, exhausted: false });
    expect(reserve(ledger, "new", "provider", 10).reserved).toBe(true);
    expect(ledger.settle("new", { inputTokens: 10, outputTokens: 0 })).toBe(true);
    expect(ledger.settle("new", { inputTokens: 10, outputTokens: 0 })).toBe(false);
    // Clearing config never removes durable evidence. Repeated replay/compaction never adds
    // a migrated copy of a balance or charges a canonical self-alias twice.
    for (let restart = 0; restart < 3; restart += 1) {
      ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(undefined, { compactAfterRecords: 1 }), now: () => 3 });
      expect(ledger.checkPoolContinuity()).toBeUndefined();
      expect(ledger.snapshot("pool", "provider")).toEqual({ settled: 70, unresolved: 30, reserved: 0, exhausted: true });
      expect(reserve(ledger, `denied-${restart}`)).toMatchObject({ reserved: false, denial: { reason: "spend-limit-exceeded", projected: 101 } });
    }
    expect(disk.lines.join("\n")).not.toContain("label-a");
    expect(disk.lines.join("\n")).not.toContain("provider");
  });

  test("old open/dispatched sends become unresolved exactly once; duplicate send IDs remain refused", () => {
    const old = ["a", "b"].flatMap(id => [
      { v: 1, kind: "reserve", send: alias("send", id), targets: [{ scope: "pool", alias: pool(`label-${id}`) }], tokens: 30, at: 1 },
      ...(id === "b" ? [{ v: 1, kind: "dispatch", send: alias("send", id), at: 1 }] : []),
    ]);
    const disk = journal(old);
    const aliases = { [pool("label-a")]: "provider", [pool("label-b")]: "provider" };
    for (let count = 0; count < 2; count += 1) {
      const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(aliases), now: () => 2 });
      expect(ledger.checkPoolContinuity()).toBeUndefined();
      expect(ledger.snapshot("pool", "provider")?.unresolved).toBe(60);
      expect(reserve(ledger, "a")).toMatchObject({ reserved: false, denial: { reason: "duplicate-send-id" } });
    }
  });

  test("a live original reservation settles/refunds once after explicit linking", () => {
    const ledger = createSpendReservationLedger({ salt, policy: policy(), now: () => 2 });
    expect(reserve(ledger, "pending", "label", 40).reserved).toBe(true);
    expect(reserve(ledger, "refund", "label", 10).reserved).toBe(true);
    ledger.reconfigure(policy({ [pool("label")]: "provider" }));
    expect(ledger.checkPoolContinuity()).toBeUndefined();
    expect(ledger.abandon("refund")).toBe(true);
    expect(ledger.settle("pending", { inputTokens: 30, outputTokens: 0 })).toBe(true);
    expect(ledger.snapshot("pool", "provider")).toEqual({ settled: 30, reserved: 0, unresolved: 0, exhausted: false });
  });

  test("zero/abandoned-only historical scopes do not create debt", () => {
    const ledger = createSpendReservationLedger({ journal: journal([checkpoint([["empty-old", 0, 0]])]), salt, policy: policy(), now: () => 2 });
    expect(reserve(ledger, "new").reserved).toBe(true);
  });

  test("unknown history and aggregate exhaustion survive retention and capacity pressure", () => {
    const disk = journal([checkpoint([["label-a", 60, 0], ["label-b", 40, 0]])]);
    const ledger = createSpendReservationLedger({ journal: disk, salt,
      policy: policy({ [pool("label-a")]: "provider", [pool("label-b")]: "provider" }, { retentionMs: 1, maxTrackedScopes: 2 }), now: () => 100 });
    expect(ledger.checkPoolContinuity()).toBeUndefined();
    ledger.prune();
    expect(ledger.snapshot("pool", "provider")?.settled).toBe(100);
    expect(reserve(ledger, "new").reserved).toBe(false);
    expect(ledger.snapshot("pool", "provider")?.settled).toBe(100);
  });

  test("under-limit historical components remain while their canonical group is active", () => {
    const disk = journal([checkpoint([["label", 40, 0]])]);
    let now = 2;
    const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy({ [pool("label")]: "provider" }, { retentionMs: 5 }), now: () => now });
    expect(reserve(ledger, "pending", "provider", 10).reserved).toBe(true);
    now = 100;
    ledger.prune();
    expect(ledger.snapshot("pool", "provider")).toMatchObject({ settled: 40, reserved: 10 });
  });

  test("observe-only records already-sent requests while ambiguity still blocks new dispatches", () => {
    const disk = journal([checkpoint([["unknown-label", 40, 0]])]);
    const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(), now: () => 2 });
    const tracker = createRequestSpendTracker({ provider: "provider-display", spendPoolId: "provider", usageLogInputTokens: 10 }, undefined, ledger);
    expect(tracker.charge()).toBe(false);
    expect(tracker.charge({ alreadySent: true })).toBe(true);
    tracker.settle({ inputTokens: 8, outputTokens: 0 });
    expect(ledger.snapshot("pool", "provider")?.settled).toBe(8);
    expect(ledger.snapshot("pool", "unknown-label")?.settled).toBe(40);
    expect(reserve(ledger, "new").reserved).toBe(false);
  });

  test("malformed or conflicting maps fail closed without clearing ceilings or saved links", () => {
    const disk = journal([checkpoint([["label", 40, 0]])]);
    const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy({ [pool("label")]: "provider" }), now: () => 2 });
    expect(ledger.checkPoolContinuity()).toBeUndefined();
    for (const aliases of [null, [], { label: "provider" }, { [pool("label")]: "different-provider" }]) {
      ledger.reconfigure(policy(aliases));
      expect(ledger.policy.pool.maxTokens).toBe(100);
      expect(ledger.checkPoolContinuity()?.reason).toBe("pool-history-unresolved");
      expect(reserve(ledger, "new").reserved).toBe(false);
      expect(ledger.snapshot("pool", "provider")?.settled).toBe(40);
    }
    ledger.reconfigure(policy());
    expect(ledger.checkPoolContinuity()).toBeUndefined();
  });

  test("evidence write failure cannot publish a mapping or erase historical balances", () => {
    const disk = journal([checkpoint([["label", 40, 0]])]);
    disk.append = () => { throw new Error("synthetic write failure"); };
    const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy({ [pool("label")]: "provider" }), now: () => 2 });
    expect(reserve(ledger, "new")).toMatchObject({ reserved: false, denial: { reason: "reserve-not-durable" } });
    expect(ledger.snapshot("pool", "provider")).toBeUndefined();
    expect(ledger.snapshot("pool", "label")?.settled).toBe(40);
    expect(disk.lines).toHaveLength(1);
  });

  test("complete invalid metadata at the final line fails closed and survives attempted compaction", () => {
    const invalid = { ...checkpoint([["label", 40, 0]]), poolContinuity: { v: 1, kind: "pool-continuity", at: 1, bindings: [{ alias: "bad", canonical: pool("provider") }] } };
    const disk = journal([invalid]);
    let ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(), now: () => 2 });
    expect(ledger.corruptRecords).toBe(1);
    expect(ledger.checkPoolContinuity()?.reason).toBe("journal-corrupt");
    ledger.reconfigure(policy(undefined, { pool: {}, compactAfterRecords: 1 }));
    reserve(ledger, "observed", "provider", 1, true);
    ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(), now: () => 3 });
    expect(ledger.corruptRecords).toBe(1);
  });

  test("a v1 checkpoint remains parseable when compatibility metadata is omitted by an old reader", () => {
    const disk = journal();
    const ledger = createSpendReservationLedger({ journal: disk, salt, policy: policy(undefined, { compactAfterRecords: 1 }), now: () => 2 });
    reserve(ledger, "new", "provider", 30);
    ledger.settle("new", { inputTokens: 25, outputTokens: 0 });
    expect(disk.lines.every(line => parseSpendJournalRecord(line) !== undefined)).toBe(true);
    const oldView = JSON.parse(disk.lines[0]!);
    delete oldView.poolContinuity;
    // Unmodified old readers retain raw v1 counters, but cannot prove canonical continuity.
    expect(parseSpendJournalRecord(JSON.stringify(oldView))).toBeDefined();
    const restart = createSpendReservationLedger({ journal: disk, salt, policy: policy(), now: () => 3 });
    expect(restart.checkPoolContinuity()).toBeUndefined();
    expect(restart.snapshot("pool", "provider")?.settled).toBe(25);
  });
});


test("rootless HTTP and passthrough preflight refuse before any synthetic fetch", () => {
  const previous = process.env.OPENCODEX_HOME;
  const home = mkdtempSync(join(tmpdir(), "ocx-pool-history-"));
  process.env.OPENCODEX_HOME = home;
  const release = acquireOwnedSpendHome();
  try {
    writeFileSync(join(home, "spend-ledger.salt"), salt + "\n", { mode: 0o600 });
    writeFileSync(join(home, "spend-ledger.jsonl"), JSON.stringify(checkpoint([["old-label", 100, 0]])) + "\n", { mode: 0o600 });
    configureSharedSpendLedger(policy());
    let syntheticFetches = 0;
    const decision = admitHttpWorkflowTurn(new Headers());
    expect(decision).toMatchObject({ admitted: false, reason: "workflow-pool-history-unresolved" });
    if (!decision || decision.admitted) syntheticFetches += 1;
    else {
      const response = workflowDecisionRefusalResponse(decision);
      expect(response.status).toBe(429);
      expect(response.headers.get("x-opencodex-local-refusal")).toBe("workflow_pool_history_unresolved");
    }
    const budget = createResponsesSendBudget({ req: new Request("https://fixture.example.test/v1/responses"), options: {}, logCtx: { model: "fixture", provider: "provider" } });
    expect(budget).toBeInstanceOf(Response);
    if (!(budget instanceof Response)) syntheticFetches += 1;
    expect(syntheticFetches).toBe(0);
    configureSharedSpendLedger(policy({ [pool("old-label")]: "provider" }));
    expect(admitHttpWorkflowTurn(new Headers())).toBeUndefined();
    const mappedBudget = createResponsesSendBudget({ req: new Request("https://fixture.example.test/v1/responses"), options: {}, logCtx: { model: "fixture", provider: "provider-display", spendPoolId: "provider" } });
    expect(mappedBudget).toBeInstanceOf(Response);
    if (mappedBudget instanceof Response) {
      expect(mappedBudget.status).toBe(429);
      expect(mappedBudget.headers.get("x-opencodex-local-refusal")).toBe("workflow_spend_exhausted");
    } else syntheticFetches += 1;
    expect(syntheticFetches).toBe(0);
    const otherPool = createResponsesSendBudget({ req: new Request("https://fixture.example.test/v1/responses"), options: {}, logCtx: { model: "fixture", provider: "provider", spendPoolId: "unspent-provider" } });
    expect(otherPool).not.toBeInstanceOf(Response);
  } finally {
    release();
    if (previous === undefined) delete process.env.OPENCODEX_HOME;
    else process.env.OPENCODEX_HOME = previous;
    removeTreeWithRetry(home);
  }
});

test("actual old-reader compaction preserves raw spend; compatible rollback resolves every alias exactly once", () => {
  const disk = journal([checkpoint([["old-label", 40, 0]])]);
  const modern = createSpendReservationLedger({ journal: disk, salt,
    policy: policy({ [pool("old-label")]: "provider" }, { compactAfterRecords: 1 }), now: () => 2 });
  expect(reserve(modern, "modern", "provider", 8).reserved).toBe(true);
  modern.settle("modern", { inputTokens: 8, outputTokens: 0 });
  expect(modern.snapshot("pool", "provider")?.settled).toBe(48);
  const old = createLegacySpendLedger({ journal: disk, salt,
    policy: { ...DEFAULT_SPEND_RESERVATION_POLICY, compactAfterRecords: 1 }, now: () => 3 });
  expect(old.corruptRecords).toBe(0);
  // Unsupported old binaries can still write a newly account-qualified label and strip
  // compatibility metadata. Do not claim an automatic downgrade barrier or its enforcement.
  expect(old.reserve({ sendId: "old-again", scopes: { poolId: "new-old-label" }, inputTokens: 12, outputCeilingTokens: 0 }).reserved).toBe(true);
  old.settle("old-again", { inputTokens: 12, outputTokens: 0 });
  const returned = createSpendReservationLedger({ journal: disk, salt,
    policy: policy({ [pool("old-label")]: "provider" }), now: () => 4 });
  expect(returned.checkPoolContinuity()?.reason).toBe("pool-history-unresolved");
  expect(returned.snapshot("pool", "new-old-label")?.settled).toBe(12);
  returned.reconfigure(policy({ [pool("old-label")]: "provider", [pool("provider")]: "provider", [pool("new-old-label")]: "provider" }));
  expect(returned.checkPoolContinuity()).toBeUndefined();
  expect(returned.snapshot("pool", "provider")?.settled).toBe(60);
});
