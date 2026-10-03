# WP8 review reconciliation

Final acceptance reviews are part of the existing WP8 scope. Their findings do not become exclusions or a claim that missing evidence proves missing functionality. The source implementation checkpoint and first structural ledger pass in 084–085 are historical candidate evidence; this review round must close before publication acceptance.

## Product and discovery findings

- Snapshot target recovery: `023cc8b1ec` preserves locally observed stopped-runtime and client-role guidance for the new snapshot callers, while keeping arbitrary transport errors generic and legacy follow behavior unchanged. Both new commands have no-transport message regressions. `bun test tests/cli/cli-observe-snapshot.test.ts tests/cli/cli-log-follow.test.ts tests/cli/cli-companion-usage.test.ts` passed 77 tests, 591 assertions. Four real root-CLI candidate executions independently observed exit 1, empty stdout, zero transport calls and the appropriate start/hub guidance.
- Runnable parent and alias discovery: `8b55e44658` adds descendants to exact capability results, renders them alongside runnable-parent help, canonicalizes the actual access-key aliases and chooses recovery tokens from the canonical path. Exact root alias usage and execution argv remain unchanged. The same checkpoint escapes generated flag-table cells and preserves optional values. `bun test tests/cli/cli-help-paths.test.ts tests/cli/cli-help-navigation.test.ts tests/cli/cli-help-recovery.test.ts tests/ci-workflows/skill-ocx-generated.test.ts tests/cli/cli-capability-data.test.ts` passed 86 tests, 2152 assertions. Tests render Markdown and verify the three intended cells; an old recovery-index mutation fails rather than silently suggesting the wrong path.
- Local provider option validation: `ac6e1b3181` applies the existing completed-candidate management validator to explicit auth/path overrides before registration, saving or synchronization. The scoped independent review passed. `bun test tests/cli/cli-provider.test.ts tests/cli/cli-provider-sync-result.test.ts tests/cli/cli-provider-lifecycle-runtime.test.ts` passed 138 tests, 785 assertions, including eight refused and nine accepted completed-row cases. Existing unflagged behavior remains unchanged.
- Planning table rendering: `db9997ad36` escapes literal union separators in the affected existing tables without rewriting their historical contracts.

The discovery/generator repair belongs in the foundation PR and the provider repair in its child. Main carries those already-tested commits to their owning branches, regenerates each branch's own capability-derived chapters, and propagates parents upward with ordinary merge commits. Different layers must not receive top-layer generated content. Every changed PR head needs new CI. No PR merge, force push or native stack registration is involved.

## Acceptance-record findings

The independent semantic audit confirmed all 22 historical execution logs and their counts, plus the fourteen exclusions and one whole-row alias. It rejected acceptance of the numerator until these record defects are repaired:

- Six rows need their specific executed behavior evidence joined, rather than a generic discovery-suite reference. Existing Kiro proof can be reused; missing connectivity/import/Lab/connected-sync evidence is verified through bounded isolated owner or CLI tests.
- Connected-machine synchronization must join the GUI machine routes and `syncConnectedClient`, not Aside-profile synchronization.
- Placeholder invocations need exact parser-supported operands; effective-prompt text and stack observations remain distinct.
- Blank/unrelated source anchors and generic precaution text need actual GUI/CLI/common-owner field-and-effect arguments.
- Target-qualified workflows must distinguish local persistence and optional sync from runtime CRUD, and connected `/v1/usage` from management `/api/usage`. Local custom-model inventory does not become runtime inventory.
- Final P09 quota limits must describe the implemented per-key path; stale pending language remains only in historical evidence.

Three disjoint immutable-source reading packets produce row corrections; main integrates them into the sole ledger. Source reads are pinned to the named Git revision while branch work proceeds. A separate proof packet identifies and executes only the missing relevant behavior. The ignored validator additionally rejects blank source anchors and placeholder invocations; it remains a structural check, never a substitute for the same reviewer's semantic re-review. Counts are recomputed after integration, not forced to the previous value.

Final source binding, reviewed ledger/negative fixtures, frozen CLI QA and current-head CI remain open closing conditions. Historical source hashes and earlier failures are retained rather than overwritten as passes.
