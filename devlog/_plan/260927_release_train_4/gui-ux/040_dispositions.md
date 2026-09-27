# Phase 040 — auth, config, account and issue disposition

## PR decisions

- **#4649 and #4644 — defer:** The draft changes credential persistence and has not passed the explicit security review required by `MAINTAINERS.md`. Keep the PR and issue open; the current screenshot file also violates repository hygiene. The security analysis and any pre-disclosure repair plan stay in ignored `.tmp/gui-ux/4649-security-review.md`, not this public devlog. This workaround cannot be called Safari AutoFill itself. A later adoption is a new scoped phase after security and real iOS standalone proof.
- **#5932 — defer from this lane:** its `ProviderAuthPanel.tsx`, `useProviderAccountPools.ts`, provider workspace types, and OAuth account DTO overlap the account-pool lane. Do not touch those files here. The account-pool lane should determine whether a plan badge is still missing after its work; leave PR open with an ownership and current-conflict comment.
- **#2355 — defer this old branch; consider a new scoped issue later:** eight conflicts across `src/config.ts`, server lifecycle, CLI and dashboard. A safe version would require a resident-vs-disk config identity, low-privilege status read, warning/retry UI and tests for managed save versus external edit. Its `docs/pr-assets/` screenshot cannot be carried. The config/picker lanes may move those owners during this train; leave the PR open with current file evidence.
- **#5408 — defer wholesale:** 7,790 insertions across 67 files, six current conflicts and account-pool overlap. Do no cherry-pick until individual behavior gaps are identified in the current provider workspace; this lane performs suitability judgment only. Leave a concrete English comment and keep it open.

## Issue decisions

- **#3379 — hold open:** journal deletion and custom Usage ranges already landed, but the remaining Codex selector rename is absent. `gui/src/components/CodexAccountPickerSetting.tsx` only toggles picker visibility; `src/server/management/config-routes.ts` has no selector-name edit API. Generic OAuth `alias` is a different field. This touches picker/account ownership, so record the gap and avoid a duplicate implementation in this GUI lane.
- **#4189:** current ZCode client integration and Z.AI provider APIs are separate. The report does not identify a ZCode upstream login/API contract. Ask the issue author in English whether they mean the ZCode client using OpenCodex, Z.AI API-key upstream, or a distinct login; leave open pending answer and do not add a fake `zcode` provider card.

For every deferred PR or issue, post one evidence-backed English comment with the disposition. Do not close a contributor PR merely for being large or stale. An adopted contributor PR closes only after a replacement lands and a credit trailer plus replacement link are present.
