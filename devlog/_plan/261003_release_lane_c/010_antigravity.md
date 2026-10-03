# Claude 5.5 usage attribution while preserving discovered wire routing

Depends on: audited roadmap and explicit ROADMAP LOCKED. Revalidate current dev and #6497 before B. No new public type/enum or persistence field is introduced.

## Exact file map

MODIFY src/providers/antigravity-models.ts only in ANTIGRAVITY_USAGE_BASE_BY_ID (currently :754-775). Preserve discoveredAntigravityEffortWireModelId precedence (:667), snapshot scoping, partial-family behavior and existing 4.6 IDs. Add only deterministic known Claude 5.5 base/tier usage identities before return rev:

```diff
+  for (const base of ["claude-sonnet-5-5", "claude-opus-5-5"]) {
+    rev[base] = base;
+    for (const effort of ANTIGRAVITY_DISCOVERY_EFFORTS) rev[`${base}-${effort}`] = base;
+  }
   return rev;
```

MODIFY src/usage/expected-prices.ts after existing Antigravity 4.6 rows (:367-374): adapt the eight 5.5 rows from #6497, retaining existing CLAUDE_SONNET_55/CLAUDE_OPUS_55 constants; ALL eight status fields are verified-derived. Source text says derived Anthropic reference price, not CCA billing. Verify the cited underlying vendor price before carrying a fresh verifiedAt date; do not invent current-price evidence. Preserve 4.6 historical overlay rows.

MODIFY tests/usage/usage-cost.test.ts membership assertion at :466 from 152 to 160 and include all eight new keys in its reviewed expected set, then adjacent existing Claude 5.5 price cases: add google-antigravity derived source assertions for the base and each tier with literal expected tuples (Sonnet 2/10/0.2/2.5; Opus 4/20/0.2/5, confirmed in the official pricing table on 2026-10-03). Assert 4.6 identity/cost unchanged and unknown future suffix identity unchanged; use tests/usage/usage-summary.test.ts if durable aggregation-level coverage is missing. Check file-size cap before adding; if at cap use NEW tests/usage/usage-antigravity-55.test.ts and register it in both scripts/test-layout/layout.json and tests/fixtures/test-layout-expected.json with the existing usage domain shape. No lowered caps/skips.

MODIFY structure/providers-and-adapters.md :557-559: append that deterministic known 5.5 usage normalization is independent of discovery and does not migrate saved routing. MODIFY docs-site/src/content/docs/guides/providers.md at Antigravity guidance: reference costs are derived estimates; use discovered models/efforts; do not claim #6502 resolved without a successful matching request. Review all manifest owners for src/providers and src/usage; amend only affected prose.

## Routing evidence decision before implementation

Inspect the existing intended Antigravity discovery path and credential availability without printing secrets. After unlock, bound model discovery and at most a minimal request for the reported saved Sonnet 5.5-high selection; retain only wire IDs/effort/status and redacted endpoint identity. No account configuration or installed-service restart. If credentials are absent or discovery/request fails, record that exact limitation and leave #6502 unresolved. Existing #6501 controlled fixture proof does not prove live entitlement or backend availability.

Static 5.5 fallback, 4.6 retirement, inferred context/image metadata, and cross-generation aliases are NOT in the patch above. Adding static fallback requires evidence plus P/A amendment with exact maps/tests. That amendment must cover medium default, xhigh/max/ultra clamp, suffix override, complete/partial/empty discovery and snapshot invalidation using an unbundled family so a new fallback cannot make invalidation coverage tautological.

## Acceptance and commands (planned; NOT RUN at initial gate)

- All known 5.5 base/low/medium/high usage spellings normalize deterministically without requiring registration; unknown model suffixes remain exact; historical 4.6 stays itself. Both src/usage/cost.ts and src/usage/summary.ts consume canonicalAntigravityUsageModel. src/adapters/google.ts:95 also calls it for a Gemini-only rejection predicate; Claude normalization must leave that behavior unchanged.
- Exact discovered family remains authoritative; explicit high plus conflicting low effort yields high wire and no thinkingConfig. Complete/partial/empty discovery, restart/outage and home/destination/generation isolation keep existing tests green.
- Eight reference-price rows carry verified-derived; literal tuple assertions and a source assertion prove provenance. No charge/billing claim.
- Run each affected file in its own Bun process: tests/adapters/google/antigravity-discovered-families.test.ts, tests/adapters/google/google-antigravity-wire.test.ts, tests/adapters/google/antigravity-static-catalog.test.ts, tests/providers/provider-antigravity-effort-families.test.ts, tests/providers/provider-antigravity-family-catalog.test.ts, tests/providers/provider-antigravity-wire-snapshot.test.ts, tests/usage/usage-cost.test.ts, tests/usage/usage-summary.test.ts, tests/providers/provider-registry-parity.test.ts.
- Run bun run typecheck; bun run privacy:scan; bun run structure:check; focused layout and file-size guards; bun run test:changed after examining its scope. Full local suite exception: concurrent stabilization worktrees share resources; record focused commands/counts and remaining platform/CI coverage in PR.
- Independent implementation/security review, actual applicable exact-head PR CI and maintained source credit precede review readiness.

Credit for adapted source: Co-authored-by: Prince <princepal9120@gmail.com>. Source #6497 stays open; report the withheld routing/migration delta explicitly.
