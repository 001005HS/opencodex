/**
 * Stable discovery facade: literal metadata and types have separate pure owners.
 * The transitive dependency boundary is checked by the CLI capability tests.
 * Command modules must never enter this graph: their top-level usage constants
 * can become undefined through an ESM cycle. This is not an execution sandbox.
 */
import { CAPABILITIES } from "./capabilities-base";
import type { Capability } from "./capability-types";

export { CAPABILITIES, HEAD_CAPABILITIES } from "./capabilities-base";
export type {
  CapabilityRoute,
  CapabilityFlag,
  CapabilityJsonMode,
  Capability,
  HeadCapability,
} from "./capability-types";

/** Capabilities that drive `route`, for `ocx capabilities --route`. */
export function capabilitiesForRoute(path: string): Capability[] {
  return CAPABILITIES.filter(cap => cap.routes.some(r => r.path === path));
}

/** Every `(method, path)` pair any capability drives. */
export function capabilityRouteKeys(): Set<string> {
  const keys = new Set<string>();
  for (const cap of CAPABILITIES) {
    for (const route of cap.routes) keys.add(`${route.method} ${route.path}`);
  }
  return keys;
}

/** Rendered command path, e.g. `ocx account pause`. */
export function capabilityInvocation(cap: Capability): string {
  return `ocx ${cap.command.join(" ")}`;
}
