# Release train 5 — account-pool lane closeout ledger

Terminal outcome per item. Updated as PRs open, CI completes, and the
coordinator merges. "Open PR" means a PR against `dev` with green Ubuntu CI on
its current head; "dropped" names the reason.

| Item | Outcome | PR | Head | Ubuntu CI | Notes |
|---|---|---|---|---|---|
| #6154 quota query backoff (fixes #6153) | merged | #6179 | 34de6063a9 (dev) | green | carry+fix, credit Terry Tan; #6154 and #6153 closed by coordinator |
| #5831 stale main lock, two-window WHAM | fence PR #6183 (base dev) + held draft #6188 (stacked) | #6183 / #6188 | d39cd0e162 / b8df28e51b | see CI | parser exception held for provider confirmation; #5831 closure left to maintainers |
| #5099 Antigravity 403 validation rotation | merged | #6180 | 2b81455a87 (dev) | green | narrow slice; health store/probes deferred; #5099 closed with credit |
| #5561 Anthropic model routes | merged | #6181 | dev (issue closed) | green | follow-ups (affinity preservation, GET validation) on codex/rt5-account-pool-followups |
| #5956 low-quota protection (refs #5649) | open PR | #6182 | d57bd9bb2f | see CI | coordinator security fixes + two Codex findings fixed |

## Deferred

- #5099 persistent health store, background recovery probes and
  `healthProbeEnabled`: deferred. They steer credential selection from
  persisted state, and the maintainer's changes-requested review about the
  all-flagged fallback is unresolved. A later proposal needs its own state
  authority, invalidation and security review (see 050).
- #5649 OS desktop notification: out of this backend-only train; the #5956
  slice ships a log line and an authenticated events API.


Follow-up branch `codex/rt5-account-pool-followups` carries the non-blocking notes the coordinator recorded on #6179 (nonterminal 401/403 recovery cadence, epoch success clearing the stale shared deadline) and #6181 (affinity preservation across routes, validated settings GETs). Its PR opens after #6182 lands.