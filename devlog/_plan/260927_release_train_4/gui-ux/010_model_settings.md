# Phase 010 — routed-model capability editing (#6058)

**Decision:** carry the contributor change from `0798999c6f`, preserve attribution with a `Co-authored-by` trailer, and repair it on a `codex/t4-gui-ux-*` branch based on the newest `origin/dev`. Do not push the contributor fork.

## Diff-level map

- **NEW** `gui/src/components/ModelSettingsDialog.tsx`: use the existing narrow dialog shell; seed from declarations rather than observed catalog values; send only changed axes; distinguish confirmed save plus failed refresh from unknown save. The PR currently treats the `unknown` error phase as busy, disabling Cancel and trapping the dialog; busy must mean an in-flight request only. Keep fields and Close/Cancel or retry usable on error. Return focus to the row trigger after close.
- **MODIFY** `gui/src/pages/Models.tsx` and `gui/src/pages/models-shared.ts`: show one Edit control only for routed, non-custom, non-combo rows; load the saved row after a successful mutation; stay under the `Models.tsx` 2,792-line cap by moving logic into sibling files if needed.
- **MODIFY** all ten `gui/src/i18n/{en,de,fr,ja,ko,ru,tr,vi,zh-TW,zh}.ts`: exact same keys, translated semantics, long-string layout proof. `cd gui && bun test tests/locale-parity.test.ts` checks key sets; `cd gui && bun run lint:i18n` checks visible JSX copy; neither proves translation meaning, so inspect long translations in-browser.
- **MODIFY** `src/server/management/model-routes.ts`, `model-rows.ts`, `route-registry.ts`: validate provider, exact model ID and all axes at ingress; reject a positive fractional context value that floors to zero; wrap mutation/persistence in existing `commitProviderPatch` so an unpublished failed save restores live config graph and a published write is not falsely rolled back; avoid false no-op on retry; clear the provider discovery cache only after commit, and converge the catalog. Route projection distinguishes declared and inherited modalities/efforts. Unreleased input-validation findings are kept in ignored scratch until fixed.
- **MODIFY** `src/cli/models-runtime.ts`, `models-runtime-subcommands.ts`, `capabilities.ts`; **REGENERATE** `skills/ocx/references/01_management_surface.md`: CLI and API parity, safe clear spelling.
- **NEW** `tests/server/model-settings-management-api.test.ts`, `tests/cli/cli-models-set.test.ts`, `gui/tests/model-settings-dialog.test.tsx`; **MODIFY** `tests/codex-integration/codex-convergence-contract.test.ts`, both test-layout inventories. Include save-throw-then-retry, no-op, null clear, empty ladder, effective default, duplicate modalities, cache invalidation, and Cancel/Escape after a network error.
- **MODIFY** `structure/gui-and-management-api.md` and `docs-site/src/content/docs/reference/management-api.md`: explain durable-write semantics, clear/no-reasoning distinction and UI behavior.

## Activation and proof

With synthetic provider/model entries in an isolated `OPENCODEX_HOME`, inspect the Models row at desktop and 400px, open Edit by pointer and keyboard, save a single axis, reload, restore all, and capture before/after plus loading/empty/error/long-locale views. API tests force save failure, then identical retry: durable config and live rows must agree after the retry. A `contextWindow: 0.5` request must be 400 without mutation. A failed catalog refresh after a confirmed save must say the save occurred and offer recovery, not invite a duplicate write. Verify CLI no-op and clear output against route receipts. Run focused tests, `test:changed`, typecheck, GUI test/lint plus `cd gui && bun test tests/locale-parity.test.ts` and `cd gui && bun run lint:i18n`/build, privacy, structure, skill surface, `bun test tests/ci-workflows/file-size-ratchet.test.ts`, then exact-head CI. Security review checks management admission and no secret exposure.

## Rollback and boundary

Existing provider per-model maps remain readable if this editor is reverted. Do not change custom-model ownership or native OpenAI rows. This phase does not edit the user's actual config or Codex home.
