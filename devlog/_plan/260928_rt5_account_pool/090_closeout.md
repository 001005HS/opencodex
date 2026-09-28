# Release train 5 — account-pool lane closeout ledger

Terminal outcome per item. Updated as PRs open, CI completes, and the
coordinator merges. "Open PR" means a PR against `dev` with green Ubuntu CI on
its current head; "dropped" names the reason.

| Item | Outcome | PR | Head | Ubuntu CI | Notes |
|---|---|---|---|---|---|
| #6154 quota query backoff (fixes #6153) | open PR (draft) | #6179 | b8b5c53738 | queued | carry+fix, credit Terry Tan |
| #5831 stale main lock, two-window WHAM | open PR (draft, stacked on #6179) | #6183 | c619392b63 | queued | carry; provider topology decision held for maintainers |
| #5099 Antigravity 403 validation rotation | open PR (draft) | #6180 | 582c18ef2f | queued | narrow slice; needs screenshot waiver/capture; health store/probes deferred |
| #5561 Anthropic model routes | open PR (draft) | #6181 | 3e48aab75d | queued | reimplement |
| #5956 low-quota protection (refs #5649) | open PR (draft) | #6182 | d41eab5c4b | queued | carry+fix, credit codingbo |

## Deferred

- #5099 persistent health store, background recovery probes and
  `healthProbeEnabled`: deferred. They steer credential selection from
  persisted state, and the maintainer's changes-requested review about the
  all-flagged fallback is unresolved. A later proposal needs its own state
  authority, invalidation and security review (see 050).
- #5649 OS desktop notification: out of this backend-only train; the #5956
  slice ships a log line and an authenticated events API.
