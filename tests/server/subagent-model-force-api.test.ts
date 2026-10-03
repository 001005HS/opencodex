import { expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSubagentModelRoutes } from "../../src/server/management/subagent-model-routes";
import type { ManagementContext } from "../../src/server/management/context";
import { loadConfig } from "../../src/config";
import type { OcxConfig } from "../../src/types";
import { removeTreeWithRetry } from "../helpers/remove-tree";

function cfg(): OcxConfig {
  return { port: 10100, providers: {}, defaultProvider: "openai", subagentModels: ["retired/model"],
    claudeCode: { subagentEffort: "high", model: "keep", subagentModelForce: "combo/tev-auto" } };
}
function context(config: OcxConfig, body: unknown): ManagementContext {
  const url = new URL("http://localhost/api/subagent-models");
  return { url, config, version: "test", req: new Request(url, { method: "PUT", body: JSON.stringify(body) }),
    deps: { fetchAllModels: async () => [{ provider: "combo", id: "tev-auto" }], saveConfigPreservingClaudeCode: mock(() => {}) },
    convergeCodexCatalog: mock(async () => ({ status: "committed", changed: true, degraded: false, notices: [] } as const)),
    syncClaudeAgentDefsBestEffort: mock(async () => {}) };
}
const apply = async () => {};

test("force-only set/clear preserves roster and siblings without catalog or agent writes", async () => {
  for (const force of ["combo/tev-auto", null]) {
    const config = cfg(); const ctx = context(config, { force });
    const result = await handleSubagentModelRoutes(ctx, apply);
    expect(result?.status).toBe(200);
    expect(await result!.json()).toMatchObject({ force, applied: ["retired/model"] });
    expect(config.claudeCode).toMatchObject({ model: "keep", subagentEffort: "high" });
    expect(config.claudeCode?.subagentModelForce).toBe(force ?? undefined);
    expect(ctx.convergeCodexCatalog).not.toHaveBeenCalled();
    expect(ctx.syncClaudeAgentDefsBestEffort).not.toHaveBeenCalled();
  }
});

test("roster-only and mixed updates preserve partial-update semantics", async () => {
  const config = cfg();
  expect((await handleSubagentModelRoutes(context(config, { models: [] }), apply))?.status).toBe(200);
  expect(config.claudeCode?.subagentModelForce).toBe("combo/tev-auto");
  expect((await handleSubagentModelRoutes(context(config, { force: null, models: ["retained/model"] }), apply))?.status).toBe(200);
  expect(config.subagentModels).toEqual(["retained/model"]);
  expect(config.claudeCode?.subagentModelForce).toBeUndefined();
});

test("malformed, hidden and retained unavailable targets are rejected without writing", async () => {
  for (const force of [42, "", "bad\nmodel", "retired/model", "combo/tev-auto"]) {
    const config = cfg(); config.disabledModels = ["combo/tev-auto"];
    const ctx = context(config, { force });
    expect((await handleSubagentModelRoutes(ctx, apply))?.status).toBe(400);
    expect(ctx.deps.saveConfigPreservingClaudeCode).not.toHaveBeenCalled();
  }
});

test("persistence failure restores both Claude and roster state", async () => {
  const config = cfg(); const before = structuredClone(config);
  const ctx = context(config, { force: null, models: [] });
  ctx.deps.saveConfigPreservingClaudeCode = () => { throw new Error("fixture save failure"); };
  await expect(handleSubagentModelRoutes(ctx, apply)).rejects.toThrow("fixture save failure");
  expect(config).toEqual(before);
});

test("field-scoped durable force writes preserve concurrent disk edits and clear only the force leaf", async () => {
  const home = mkdtempSync(join(tmpdir(), "ocx-force-api-"));
  const previous = process.env.OPENCODEX_HOME;
  process.env.OPENCODEX_HOME = home;
  try {
    const path = join(home, "config.json");
    writeFileSync(path, JSON.stringify(cfg()));
    const live = loadConfig();
    const disk = cfg(); disk.claudeCode!.model = "concurrent-model"; disk.claudeCode!.subagentEffort = "max";
    writeFileSync(path, JSON.stringify(disk));
    const ctx = context(live, { force: null }); delete ctx.deps.saveConfigPreservingClaudeCode;
    expect((await handleSubagentModelRoutes(ctx, apply))?.status).toBe(200);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.claudeCode).toMatchObject({ model: "concurrent-model", subagentEffort: "max" });
    expect(saved.claudeCode.subagentModelForce).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.OPENCODEX_HOME; else process.env.OPENCODEX_HOME = previous;
    removeTreeWithRetry(home);
  }
});
