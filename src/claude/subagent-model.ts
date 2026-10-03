import type { OcxConfig } from "../types";
import { claudeCodeAlias, claudeCodeNativeAlias } from "./alias";
import { AUTO_CONTEXT_OFF, shouldMarkOneMillion, stripOneMillionMarker, withOneMillionMarker } from "./context-windows";
import { hasOwnProvider } from "../config";
import { knownModelIdsForProvider } from "../router";
import { decodeRoutedModelIdOrThrow } from "../providers/slug-codec";
import { SAFE_AGENT_MODEL_ID } from "../config/subagent-models";
export { SAFE_AGENT_MODEL_ID } from "../config/subagent-models";

/** Roster entry -> alias + display parts. Entries are bare native slugs or "provider/id".
 * Codex-facing encoded ids (`provider/vendor-model`) decode to the native slash id first
 * so the alias joins the raw-native context-window map (context-windows.ts). */

/**
 * Generated subagent defs cannot rely on the parent's auto-context compaction
 * pairing, so their [1m] marker follows the AUTHORITATIVE window only: mark when
 * the effective window (exact selector, then the canonical [1m] form, then bare)
 * is genuinely >= 1M; strip an inherited unsafe marker back to the bare selector;
 * with no window information, keep the selector as it was. Genuine routed [1m]
 * ids are preserved through the canonical-exact lookup. (#854)
 */
export function withSubagentContextMarker(selector: string, windows: Record<string, number>): string {
  const bare = stripOneMillionMarker(selector);
  const wasMarked = selector !== bare;
  const canonicalExact = wasMarked ? `${bare}[1m]` : selector;
  const authoritativeWindow = windows[selector] ?? windows[canonicalExact] ?? windows[bare];
  if (typeof authoritativeWindow === "number" && authoritativeWindow > 0) {
    return shouldMarkOneMillion(authoritativeWindow, AUTO_CONTEXT_OFF)
      ? (withOneMillionMarker(selector, windows) ?? selector)
      : bare;
  }
  return wasMarked ? selector : bare;
}
export function entryParts(entry: string, config: OcxConfig): { alias: string; id: string; provider: string } {
  const slash = entry.indexOf("/");
  if (slash > 0) {
    const provider = entry.slice(0, slash);
    const prov = hasOwnProvider(config.providers, provider) ? config.providers[provider] : undefined;
    const id = prov
      ? decodeRoutedModelIdOrThrow(entry.slice(slash + 1), knownModelIdsForProvider(provider, prov, config))
      : entry.slice(slash + 1);
    return { alias: claudeCodeAlias(provider, id), id, provider };
  }
  return { alias: claudeCodeNativeAlias(entry), id: entry, provider: "native" };
}

/** Resolve only currently exposed entries; retained roster rows are not exposure proof. */
export function resolveSubagentForceModel(config: OcxConfig, windows: Record<string, number>, available: readonly string[]): string | null {
  const entry = config.claudeCode?.subagentModelForce;
  if (typeof entry !== "string" || !SAFE_AGENT_MODEL_ID.test(entry)) return null;
  try {
    const parts = entryParts(entry, config);
    if ((config.disabledModels ?? []).some(disabled => {
      try { return entryParts(disabled, config).alias === parts.alias; } catch { return false; }
    })) return null;
    const exposed = available.some(candidate => {
      try { return entryParts(candidate, config).alias === parts.alias; } catch { return false; }
    });
    if (!exposed) return null;
    return withSubagentContextMarker(parts.alias, windows);
  } catch {
    return null;
  }
}
