# B1 — small bug fixes with owner-filed issues

Base: `dev` `99d0a9400e`. Branch `codex/train3-b1`.

| PR | Author | Issue | Change | Risk |
|---|---|---|---|---|
| #6041 | Ingwannu | #6033 | `abort_restart()` restores the pre-update wanted intent instead of forcing `wanted = true` (desktop/src-tauri exit.rs, updater.rs) | Tauri; hosted macOS/Windows/Linux desktop jobs |
| #6019 | Ingwannu | #6017 | macOS ACL parser stops trusting the `user:0`/`root` display name as root identity | plugin trust; must only tighten |
| #6015 | Ingwannu | #6014 | picker route test binds real listeners instead of probing then releasing ports | test only plus a runtime option |
| #6011 | Ingwannu | #4191 | pins established-WebSocket failure behavior with a test and ADR | issue closes only if behavior is fixed |
| #6006 | Ingwannu | #6005 | translated Anthropic output schemas claim `strict` only when strict-eligible | adapter contract |
| #6026 | codingbooo | #5960 | `ocx models` derives catalog price estimates when no manual price is set | CLI output |
| #6034 | Ingwannu | #6032 | link relay strips provider credential headers | security boundary; dedicated review |

## Method

1. Kimi review per PR (verdict LAND / LAND-WITH-FIXES / HOLD); #6034 also gets the security verdict.
2. Squash each PR onto the branch in the table order, preserving the author; fold review fixes as separate commits.
3. Reconcile test-layout registries and the file-size ratchet once for the batch.
4. Local: `bun install`, `bun run typecheck`, the focused test files each PR touches, `bun run structure:check`,
   `bun run privacy:scan`.
5. Push, open the batch PR with the template, wait for exact-head CI, merge with `--admin --merge
   --match-head-commit`, then close the source PRs and issues with the merge commit.

## Aside evidence

Captured to `.tmp/aside/` for every PR and issue above. All seven issues are owner-filed today with reproduction and
code pointers that match the PR premises. #4191's thread records the owner's position (Sep 21) that an established
WebSocket dying mid-turn is a failed leg rather than an SSE fallback, plus two contributor data sets (Sep 23) asking for
a fallback, so a test-and-ADR PR does not by itself resolve that issue.
