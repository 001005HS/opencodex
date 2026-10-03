# wp1 — Keep discovery pure and make room for complete task documentation

Depends on wp0. Class C3. Layer 1. No management behavior or user-state changes. Outcome: the existing 74 declarations remain compatible while metadata, exact usage and generated chapters can grow without breaking import or file-size boundaries.

## Exact change map

| Kind | Path | Before → after |
| --- | --- | --- |
| NEW | src/cli/capability-types.ts | Move CapabilityRoute, CapabilityFlag, CapabilityJsonMode, Capability and HeadCapability declarations here; add only optional readonly usage?: string. No runtime imports. |
| NEW | src/cli/capabilities-base.ts | Move existing HEAD_CAPABILITIES and CAPABILITIES literal data byte-faithfully; type-only imports from capability-types. No handler/config/Lab dependencies. |
| MODIFY | src/cli/capabilities.ts | Preserve public type/function/array export names and existing order. Aggregate/re-export pure data only. capabilityInvocation remains canonical token joining; exact usage is a separate rendering concern. |
| MODIFY | src/cli/capabilities-command.ts | Its explicit JSON projection currently drops unknown metadata fields. Add usage only when cap.usage is defined; preserve every existing field and no-usage shape. |
| MODIFY | src/cli/help.ts | For a leaf with usage, render its exact Usage line and omit only that leaf's incomplete-operand warning. With no usage, preserve existing Command/partial-grammar output exactly. Matching and aliases stay in help-catalog. |
| MODIFY | scripts/generate-ocx-skill-surface.ts | Export deterministic renderManagementSurfaces() returning a filename→text map; retain renderManagementSurface() as the index renderer for existing callers. Write/check compact 01_management_surface.md plus flat 01_surface_<domain>.md chapters. Canonical capability headings do not change; optional usage appears beneath. |
| MODIFY | tests/cli/cli-capabilities.test.ts | Replace the no-relative-import syntax assertion with a stronger transitive pure-data allowlist boundary; no command/config/Lab import, dynamic import or unexpected dependency. Preserve all rendering/route/debt assertions. |
| NEW | tests/cli/cli-capability-data.test.ts | Exercise graph refusal fixtures, type-only edges, optional usage JSON/rendering compatibility, aliases and default output. Exercise runCapabilities --json itself with an explicit usage fixture; a helper-only rendering check cannot certify serializer propagation. |
| MODIFY | tests/ci-workflows/skill-ocx.test.ts | Compare every generated file to its owner map; index links resolve; every capability appears once across chapters. Scan all shipped references for command/consent rules, not only the old five-file list. |
| NEW | structure/cli-management.md | Move existing CLI help/capability/management-client contracts from runtime into this owner; preserve factual content and links. Describe pure metadata and generated chapter contract after it exists. |
| MODIFY | structure/runtime.md, structure/manifest.json, structure/INDEX.md | Replace moved prose with explicit owner links; add Tier 5 CLI doc with src/cli ownership and regenerate index. Do not raise 600-line cap or describe unbuilt phases as implemented. |
| MODIFY/NEW | skills/ocx/references/01_management_surface.md, 01_surface_<domain>.md, skills/ocx/SKILL.md | Index/domain navigation replaces one growing generated blob. Remove 'safe at any time' blanket claims; distinguish non-config-mutating probes from cost-free observation. |

Chapter domains are stable command-family groups: lifecycle, providers-models, accounts, agents-routing, integrations, observe-system, access-remote, lab. Resolve each root into exactly one group; unknown roots fail generation instead of disappearing. The index includes all canonical invocation links and derived counts. Generated filenames are a closed owner-produced set; check fails for missing/stale content. No arbitrary filesystem cleanup.

## Field chain and safeguards

usage literals → pure typed metadata → additive capabilities JSON → help and generated reference. No persisted deserializer is introduced. Existing omissions serialize as before. Help consumers do not import execution modules. Metadata purity is a test-time static import-graph assertion (E3), not a sandbox: dynamic evaluated code can evade a naive scanner, so disallow dynamic imports/require in these modules and keep literal-data review. Runtime enforcement layer: none; wording is 'checked dependency boundary'.

## Acceptance

- Original capability/HEAD JSON is identical except intentionally absent optional fields; count/order/root aliases unchanged.
- A verified usage leaf renders operands; a legacy leaf retains exact prior help; alias resolution and recovery destinations stay canonical.
- A synthetic data module importing a handler/config/Lab fails the graph guard; legal data/type edges pass.
- Regeneration then --check succeeds; a changed/missing generated chapter fails; counts derive from arrays, never handwritten totals.
- All generated chapters <2000 lines and structure docs ≤600; existing source caps are unchanged.
- Focused commands: baseline four contract files plus new cli-capability-data and existing cli-help-paths/navigation/recovery files. No GUI render/build needed for this code-free visual surface.

## Shared completion contract

This phase follows 002_terminal_ux.md and 003_verification_strategy.md. Main owns registry/dispatch integration, layout-map registration, generated output and Git branch state; executor write scopes are disjoint and named before B. Existing method/path/body semantics come from the referenced source inventories, not endpoint-name guessing.

Update the phase's capability domain, generated references, relevant public CLI pages and owning structure contracts in the same layer. Every new test file enters scripts/test-layout/layout.json and tests/fixtures/test-layout-expected.json. Existing tests are retained; no baseline cap increases or green-on-retry acceptance.

Planned new test paths below become executable verification only after B creates them. The current baseline gates in 003 have actually run. C invokes the exact focused files, typecheck, structure and skill-surface checks, privacy where data is handled, a source-bound cxc receipt and real isolated CLI QA (stdout/stderr/exit/teardown). A successful function mock is transport proof only; relevant existing server tests or isolated real handlers verify accepted state. No live user proxy, credentials or upstream requests.

Before P>A, revalidate this document against the parent layer and record the prior D conclusion. Consult an architect for actual decision changes; independent A review is separate. C must preserve saved-versus-applied/refused outcomes. D records exact checks and ledger evidence before the next cycle. Publishing is main-owned; this request stops at open PRs.
