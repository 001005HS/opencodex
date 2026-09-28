# WP1 — implementation lanes

Previous cycle (WP0) conclusion: the roadmap and five decade docs are locked,
audited near-pass after three rounds; direction is one independent PR per item,
ordered #6154 → #5831 → #5099 → #5561 → #5956. WP1 implements all five in
parallel lanes and verifies each locally. WP2 publishes the PRs and drives Ubuntu
CI to green.

Base: `origin/dev` `cbe0d40daf` (two CI/desktop-only commits past the planning
base `eb7f0f0970`; none touches a lane file).

| Lane | Worktree | Branch | Decade doc | Executor write scope |
|---|---|---|---|---|
| quota-backoff | /private/tmp/rt5-ap/quota-backoff | codex/rt5-account-pool-quota-backoff | 010 | files in 010's change map |
| main-lock | /private/tmp/rt5-ap/main-lock | codex/rt5-account-pool-main-lock | 020 | files in 020's change map |
| antigravity | /private/tmp/rt5-ap/antigravity | codex/rt5-account-pool-antigravity | 050 + roadmap fold-backs 1-2 | 050's map plus the Logs roster and ten locale catalogs |
| anthropic-routes | /private/tmp/rt5-ap/anthropic-routes | codex/rt5-account-pool-anthropic-routes | 040 | 040's map |
| low-quota | /private/tmp/rt5-ap/low-quota | codex/rt5-account-pool-low-quota | 030 + roadmap fold-backs 3, R2-2, R3-3 | 030's map |

Each lane is a separate linked worktree, so executors never share a HEAD or an
index. Each executor may commit on its own branch and must not push, fetch into
shared refs, rebase other branches, or touch another worktree.

Per-lane acceptance (each must hold before WP1 C):

1. Carried contributor commits keep authorship or the PR carries the exact
   `Co-authored-by` trailer named in the decade doc.
2. The decade doc's focused tests exist, fail without the change where a
   red/green check is meaningful, and pass with it.
3. `bun run typecheck`, the decade doc's focused `bun test` files,
   `bun run test:changed`, `bun run structure:check` and
   `bun run privacy:scan` exit 0 in the lane worktree.
4. No cap in `tests/fixtures/file-size-baseline.json` is raised; any new test file
   is registered in both layout maps.
5. Owning `structure/` docs and `docs-site/` pages named in the decade doc are
   updated.

Cross-lane checks at WP1 C: `git merge-tree` of quota-backoff with main-lock
(expected conflict only in the shared recovery test), and of antigravity with
anthropic-routes (shared Responses dispatch files).

## Precedence (from the WP1 architect reflection)

The reflection returned ALIGNED for 040 and MISALIGNED for 010, 020, 030 and
050. Every gap was a spot where the decade doc predated the roadmap's
dispositions and fold-backs. Executors apply this order: `000_roadmap.md`
("Main dispositions" and every "Audit fold-back" section), then this document,
then the decade doc. Concretely:

- 010: an unusable HTTP 200 body is a failed read and keeps pacing. The
  status-only alternative is closed.
- 020: build from `dev` independently of #6154. Before push, verify the union
  with the quota-backoff branch.
- 030: the async flush drains before closing, runs before owner release, and is
  followed by the owner-generation fence. It requires both the normal-stop
  persistence test and the timeout cancellation test.
- 050: one per-request auth-refusal flag is shared by 401 and 403 and set before
  rotation. It requires the three-account 403 chain and 401-then-403 tests, plus
  the `oauth-account-403` roster, Logs and locale work.
