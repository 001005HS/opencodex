# Phase 020 — mixed combo Vision Sidecar enrollment (#4932)

**Decision:** reimplement the contributor's cohesive behavior after Phase 010, with attribution, against current `combo-routes.ts`. The old branch's GUI work is reusable, but its server route has a 200-success hole for a missing provider and can overwrite an image-capable declaration with text-only.

## Diff-level map

- **MODIFY** `gui/src/combo-capabilities.ts`, `combo-workspace-data.ts`, `components/combo-workspace-controls.tsx`, `pages/Combos.tsx`: permit image input when every member is known and text-only members can be declared; reject audio-only rows rather than treating every non-image row as text; name exactly which members receive a sidecar declaration; fail closed for unknown catalog entries; keep the primary save action and clear loading/error states.
- **MODIFY** all ten `gui/src/i18n/` locale modules, including the missing Vietnamese translations; no English-only hint in JSX.
- **MODIFY** `src/server/management/combo-routes.ts`: accept request-only `visionSidecarTargets`, validate exact member ownership, configured provider existence, current modality declaration and image-input gate before any mutation. Reject a missing provider or an already-image-capable submitted target instead of returning 200 after silently skipping/overwriting it. Write each eligible text-only `inputModalities` declaration into the provider map while preserving other capabilities, and do not persist the request-only field under `combos`.
- **MODIFY** `structure/catalog.md`, `structure/config.md`, `structure/dashboard-and-usage.md`, `docs-site/src/content/docs/guides/{combos,sidecars}.md`; **MODIFY** `tests/routing/combo-management-api.test.ts` and `tests/gui/combo-workspace-data.test.ts`; register any new files in both test-layout inventories.

## Activation and proof

In an isolated proxy, create a mixed combo from one image-capable and one text-only synthetic member; inspect the hint before save, save, then read back the per-model modality patch and combo behavior. Unknown member, disabled image input, non-member target, missing configured provider, already-image-capable submitted sidecar target and audio-only row each fail without config mutation or a false success receipt. Edit that model's capability through Phase 010 afterward and verify the combo state remains truthful. Browser proof includes desktop/400px, keyboard, empty/loading/error, and at least one long locale; screenshot before/after. Run focused regressions, `test:changed`, typecheck, GUI full tests/lint/build plus `cd gui && bun run lint:i18n` and `cd gui && bun test tests/locale-parity.test.ts`, structure/privacy and exact-head CI.

## Rollback and boundary

Do not overwrite sibling per-model context/reasoning axes. If the generated modality declaration cannot be distinguished from an operator's existing declaration, the implementation must preserve the existing one and explain that behavior; rollback must never delete operator-owned facts.
