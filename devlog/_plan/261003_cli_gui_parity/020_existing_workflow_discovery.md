# wp2 — Declare the operational CLI that already exists

Depends on wp1. Class C3. Finish layer 1. Outcome: users/agents can discover existing task-specific verbs and exact operands without reverse-engineering source, while false route claims are removed rather than propagated.

## Exact change map

NEW pure data leaves: src/cli/capabilities-provider-models.ts, capabilities-accounts.ts, capabilities-agents-routing.ts, capabilities-integrations.ts, capabilities-observe-system.ts, capabilities-access-remote.ts, capabilities-lab.ts. MODIFY capabilities-base.ts and capabilities.ts to move ownership once and aggregate each command exactly once. Leaves import only Capability types, never handlers. Preserve relative ordering of existing entries where possible; do not hide duplicates through last-wins merging.

Use the command/route/flag matrix in the source inventory and 004/005: provider edit/test/quota/presets/account-mode/selected; models live/edit/visibility/selected/presets/new-policy/context/shadow; alias; combo CRUD; route-policy reads; account/current/switch/auth and policy leaves; agent and v2; client/Desktop/Grok operations; storage/debug/usage/system; access/remote and actual local Lab commands. Internal/hidden executables remain excluded. Only implemented leaves are declared in this phase; later missing actions are not advertised early.

MODIFY src/cli/registry.ts and help.ts to remove the incorrect 'read-only Lab' description and reflect supported public groups. No new handler dispatch is introduced. Exact usage strings come from inspected handlers; flags which take values remain distinct from booleans. Add details for local versus management transport, user confirmation, caller-spend probes and safe read-back sequences.

MODIFY src/server/management/route-registry.ts and tests/cli/cli-capabilities.test.ts only with evidence: shrink declaration debt when real HTTP calls are registered; do not invent HTTP calls for local provider/custom-model/Lab commands. Correct stale Lab 'no CLI' reasons to the actual local equivalent or narrower remaining runtime debt. Temporarily mark the falsely advertised timeline/Cursor routes as owned deferred work (wp6/wp7, these tracked phase docs), then remove that temporary debt in the implementing layer. No session-only reason is weakened.

MODIFY skills/ocx/SKILL.md and references/02_json_shapes.md, 03_recipes.md, 04_failure_semantics.md, 05_remote_hub.md. Preserve consent/secret handoff rules. Correct incomplete discovery examples once indexed; distinguish legacy 64 usage errors, missing JSON support and local/live target semantics. Generated chapters are regenerated, not hand edited. Public docs reference/cli.md and reference/cli/{providers-accounts,agents,lifecycle}.md are the verified existing topic pages; extend the appropriate one rather than inventing a parallel root.

NEW tests/cli/cli-capability-workflows.test.ts and tests/ci-workflows/skill-ocx-workflows.test.ts compare declared operand/flag examples with independently specified representative real handler invocations on isolated fixtures. Preserve the existing route ratchet, negative CLI argument tests and skill secret checks. Complete grammar is not proven by testing only the first word.

## Acceptance

Each baseline DISCOVERY_ONLY row has a canonical capability/help path and a task recipe or clear reference. Each declared management method/path is actually driven by that command; local equivalents use routes:[] plus honest transport detail. Capabilities --route works for newly indexed HTTP operations. No empty route lookup is misreported as proof of feature absence.

Human-only and secret-returning tasks remain handoffs. No examples spend live quota, create keys, pair machines, star GitHub or copy plaintext credentials into agent transcripts. Unknown child help and --help remain offline and write-free. Metadata/skill tests, pure import boundary, route registry, structure, privacy and generated-surface check must pass before layer 1 publication.

## Shared completion contract

This phase follows 002_terminal_ux.md and 003_verification_strategy.md. Main owns registry/dispatch integration, layout-map registration, generated output and Git branch state; executor write scopes are disjoint and named before B. Existing method/path/body semantics come from the referenced source inventories, not endpoint-name guessing.

Update the phase's capability domain, generated references, relevant public CLI pages and owning structure contracts in the same layer. Every new test file enters scripts/test-layout/layout.json and tests/fixtures/test-layout-expected.json. Existing tests are retained; no baseline cap increases or green-on-retry acceptance.

Planned new test paths below become executable verification only after B creates them. The current baseline gates in 003 have actually run. C invokes the exact focused files, typecheck, structure and skill-surface checks, privacy where data is handled, a source-bound cxc receipt and real isolated CLI QA (stdout/stderr/exit/teardown). A successful function mock is transport proof only; relevant existing server tests or isolated real handlers verify accepted state. No live user proxy, credentials or upstream requests.

Before P>A, revalidate this document against the parent layer and record the prior D conclusion. Consult an architect for actual decision changes; independent A review is separate. C must preserve saved-versus-applied/refused outcomes. D records exact checks and ledger evidence before the next cycle. Publishing is main-owned; this request stops at open PRs.
