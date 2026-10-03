import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClaudeEnv, buildNativeClaudeEnv } from "../../src/cli/claude";
import { entryParts, resolveSubagentForceModel } from "../../src/claude/subagent-model";
import { inspectSubagentForceStatus, subagentForceSupport } from "../../src/claude/subagent-force-status";
import { extractOcxRouteDirective } from "../../src/claude/inbound-model-options";
import { configDiagnosticsFromRaw, validateConfigCandidate } from "../../src/config/diagnostics";
import { removeTreeWithRetry } from "../helpers/remove-tree";
import type { OcxConfig } from "../../src/types";

const config = (force?: string): OcxConfig => ({ port: 10100, providers: {}, defaultProvider: "openai", claudeCode: { ...(force === undefined ? {} : { subagentModelForce: force }) } });
const deps = { forceAvailable: ["combo/tev-auto", "gpt-6.1-sol", "mock/model"], authDetect: {
  readClaudeJson: () => undefined, credentialsFileExists: () => false, keychainProbe: () => "absent" as const,
} };
const MODEL = "CLAUDE_CODE_SUBAGENT_MODEL";
const FORCE = "CLAUDE_CODE_SUBAGENT_MODEL_FORCE";

test("unset preserves env exactly; routed force uses shared combo alias and native launch adds neither", () => {
  const baseline = buildClaudeEnv(config(), 10100, {}, {}, deps);
  expect(baseline[MODEL]).toBeUndefined();
  expect(baseline[FORCE]).toBeUndefined();
  const forced = buildClaudeEnv(config("combo/tev-auto"), 10100, {}, {}, deps);
  expect(forced[MODEL]).toBe("ocx-claude-combo--tev-auto");
  expect(forced[FORCE]).toBe("1");
  delete forced[MODEL]; delete forced[FORCE];
  expect(forced).toEqual(baseline);
  const native = buildNativeClaudeEnv(config("combo/tev-auto"), {}, deps);
  expect(native[MODEL]).toBeUndefined(); expect(native[FORCE]).toBeUndefined();
});

test("exported values independently win and native launches retain exports", () => {
  for (const base of [{ [MODEL]: "exported" }, { [FORCE]: "0" }, { [MODEL]: "exported", [FORCE]: "0" }]) {
    const env = buildClaudeEnv(config("combo/tev-auto"), 10100, base, {}, deps);
    expect(env[MODEL]).toBe(base[MODEL] ?? "ocx-claude-combo--tev-auto");
    expect(env[FORCE]).toBe(base[FORCE] ?? "1");
    expect(buildNativeClaudeEnv(config("combo/tev-auto"), base, deps)).toMatchObject(base);
  }
});

test("alias resolution reuses roster provider/native semantics and authoritative million boundary", () => {
  for (const entry of deps.forceAvailable) {
    const c = config(entry);
    const { alias } = entryParts(entry, c);
    expect(resolveSubagentForceModel(c, { [alias]: 999999 }, deps.forceAvailable)).toBe(alias);
    expect(resolveSubagentForceModel(c, { [alias]: 1000000 }, deps.forceAvailable)).toBe(`${alias}[1m]`);
  }
});

test("unsafe, stale and retained unavailable targets warn and inject neither variable", () => {
  for (const force of ["bad\nmodel", "missing/model", "combo/tev-auto"]) {
    const warnings: string[] = [];
    const env = buildClaudeEnv({ ...config(force), subagentModels: [force] }, 10100, {}, {}, { ...deps, forceAvailable: [], warn: line => warnings.push(line) });
    expect(env[MODEL]).toBeUndefined(); expect(env[FORCE]).toBeUndefined(); expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain(force);
  }
});

test("invalid hand edits degrade without losing providers; strict candidate validation rejects them", () => {
  const invalid = config("bad\nmodel");
  expect(validateConfigCandidate(invalid).ok).toBe(false);
  const diagnostics = configDiagnosticsFromRaw(JSON.stringify(invalid));
  expect(diagnostics.config.claudeCode?.subagentModelForce).toBeUndefined();
  expect(diagnostics.warnings.some(warning => warning.includes("subagentModelForce"))).toBe(true);
});

test("forced wire model outranks legacy roster directive without changing unset routing", () => {
  const body = { model: "ocx-claude-combo--tev-auto", system: "<!-- ocx-route: ocx-claude-other--model -->" };
  expect(extractOcxRouteDirective(body, config())).toBe("ocx-claude-other--model");
  expect(extractOcxRouteDirective(body, config("combo/tev-auto"))).toBe(body.model);
});

test("version boundary and read-only settings key presence are bounded and private", async () => {
  for (const version of [null, "bad"]) expect(subagentForceSupport(version)).toBe("unknown");
  expect(subagentForceSupport("2.1.256")).toBe("unsupported");
  for (const version of ["2.1.257", "2.2.0", "3.0.0"]) expect(subagentForceSupport(version)).toBe("supported");
  const dir = mkdtempSync(join(tmpdir(), "ocx-force-status-"));
  try {
    for (const key of [MODEL, FORCE]) {
      const text = JSON.stringify({ env: { [key]: "private-value" } });
      writeFileSync(join(dir, "settings.json"), text);
      const result = await inspectSubagentForceStatus(true, dir, async () => "2.1.257");
      expect(result).toMatchObject({ support: "supported", settingsOverride: true, settingsReadable: true });
      expect(JSON.stringify(result)).not.toContain("private-value");
      expect(readFileSync(join(dir, "settings.json"), "utf8")).toBe(text);
    }
    writeFileSync(join(dir, "settings.json"), "{");
    expect(await inspectSubagentForceStatus(false, dir, async () => null)).toMatchObject({ targetValid: false, support: "unknown", settingsReadable: false });
  } finally { removeTreeWithRetry(dir); }
});
