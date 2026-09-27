# B3 — quota activation, update launcher, link join, settings reads, account selection, combo exhaustion

Base: `dev` `06d7914e6a` (after B2 #6061). Branch `codex/train3-b3`.

Previous D (B1+B2): both batches landed with exact-head CI (35 success, 5 path-skipped each). Direction kept: serialized
carries with review fixes as separate commits. Lesson: build only inside B, after A.

| Item | Author | Plan | Fixes to fold |
|---|---|---|---|
| #6049 | luvs01 | Carry. Bounded, non-blocking read of the global Codex config on the settings poll path. | Layout registries: union with #6048's compaction. |
| #6037 | luvs01 | Carry. `systemd-run` resolves only from trusted root-owned paths, probed off the event loop. | `src/update/job.ts` import conflict: keep both imports (file lands at 1999 of 2000 lines). |
| #6042 | luvs01 | Carry. The Remote Link join key leaves only after the tunnel's listener ownership is proven twice. | None required; the connect-phase race stays documented in `structure/remote-link.md` as the PR states. |
| #6020 | terrytan95 | Carry; resolves #6018. Deadline-first quota activation with bounded backoff. | Retry records carry the credential generation, so an old credential's failure cannot hold back a replacement; a local `native main busy` refusal retries in one minute without growing the backoff; drop the duplicate delete. |
| #6056 | luvs01 | Close as superseded by #6020. On dev the retained earliest deadline already starts an idle window once, and #6020 stops the polling. | — |
| #6050 | luvs01 | Carry. `ocx account clear`; an account id `auto` wins over the reserved word; clearing works while main is paused. | Rewrite the dev test that pinned the old 409; revert its unrelated `shadow` default and `strategy` doc hunks; union the layout registries. |
| #5494 | (issue, found through Aside) | Implement. A 429 whose body says the token-plan quota "has been exhausted" is account exhaustion, so the combo target takes the long hold instead of being offered again every 60 s. | Regression test next to the combo exhaustion tests. |

Held: #6027 (owner's three blockers are still open on a draft head), #6030 and #6003 (drafts), GUI PRs.

Security-boundary items: #6037 (updater command execution) and #6042 (link join credential) have dedicated Kimi
security reviews with no blocker recorded in this unit.
