# ADR-6013 — decision recorded under "Anthropic account pause"

- Contract owner: [Providers and adapters](../providers-and-adapters.md#anthropic-account-pause)

## Decision Log

- Purpose and intent: Temporarily exclude one Claude OAuth account through the API, CLI and
  dashboard without deleting its login or conflating operator intent with runtime health.
- Existing implementation and constraints: Anthropic has its own manual/affinity/quota/model
  route selector; generic OAuth pause already owns persistence, DTOs and dashboard controls.
  Request preparation and refresh can await while the operator changes the selection.
- Alternatives considered: Add `pausedAnthropicAccountIds` to config, implement a second
  mutation endpoint, or merely expose the generic pause switch without selector changes.
- Selected approach: Reuse the protected auth store's optional `paused: true`, shared locked
  mutation, endpoint and translated controls. Filter Anthropic eligibility at each selector
  and validate live pause state at credential, commit and physical-send boundaries. Persist
  successful in-flight refresh rotation, but leave paused health unchanged on late failure.
  Keep typed local refusals across adapter/passthrough error projection after pacing, and
  classify routed cooldown using only usable unpaused members so resume and retry guidance
  remain distinct from login errors.
  Cooldown refusals carry the route position and retry seconds across pacing and dispatch,
  including disabled proactive pools; they never count as an upstream reachability failure.
- Why this approach: One authoritative row avoids config/auth split-write races and automatic
  cleanup follows account deletion. A UI-only toggle would still allow affinity, pool-off
  failover or a pre-wait bearer to select the paused account.
- Benefits, tradeoffs, and impact: No new config migration or translation keys; restart and
  reauthentication preserve pause. Already-sent turns finish normally. Additional store reads
  are limited to existing admission boundaries, and all-paused pools fail locally with 403.
  Per-account thresholds remain a separate slice of #6013. This is the TypeScript `dev`
  implementation; the maintainer must assess/port the corresponding Go paths on `dev2-go`
  at integration, rather than treating this local commit as cross-branch completion.
