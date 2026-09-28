# Release train 5 — account-pool lane closeout ledger

Terminal outcome per item. Updated as PRs open, CI completes, and the
coordinator merges. "Open PR" means a PR against `dev` with green Ubuntu CI on
its current head; "dropped" names the reason.

| Item | Outcome | PR | Head | Ubuntu CI | Notes |
|---|---|---|---|---|---|
| #6154 quota query backoff (fixes #6153) | open PR | #6179 | b531355702 | see CI | carry+fix, credit Terry Tan; Codex findings (post-reset key, hard-lock deadline) fixed |
| #5831 stale main lock, two-window WHAM | split: fence PR #6183 (stacked on #6179) + held draft #6188 (stacked on #6183) | #6183 / #6188 | 81b3ee04fa / 09a756487a | see CI | owner review: parser exception held for provider confirmation; account list shows published cache |
| #5099 Antigravity 403 validation rotation | open PR (draft) | #6180 | 761f3b1cfd | tests green; enforce-target needs screenshot | coordinator: capture Logs label or apply gui-screenshot-waived (no-local-runs rule) |
| #5561 Anthropic model routes | open PR | #6181 | 8a6c7952fe | see CI | coordinator finding (route names in client errors) and Codex fallback Retry-After finding fixed |
| #5956 low-quota protection (refs #5649) | open PR | #6182 | 3545ec36e0 | see CI | coordinator security review: per-server ledger, honest logged status |

## Deferred

- #5099 persistent health store, background recovery probes and
  `healthProbeEnabled`: deferred. They steer credential selection from
  persisted state, and the maintainer's changes-requested review about the
  all-flagged fallback is unresolved. A later proposal needs its own state
  authority, invalidation and security review (see 050).
- #5649 OS desktop notification: out of this backend-only train; the #5956
  slice ships a log line and an authenticated events API.
