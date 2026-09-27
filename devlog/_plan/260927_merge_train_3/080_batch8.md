# B8 — Remote Link relay and enrollment, sidecar probe, Windows Desktop proxy report

Base: `dev` `29cef45a86` (after B7 #6070; open issues reached 40). Branch `codex/train3-b8`.

| PR | Author | Change | Review |
|---|---|---|---|
| #6064 | luvs01 | Enrollment cancellation and commit share one terminal outcome: a tunnel exit aborts the connection transaction, an exit after commit keeps the key, and an exit before commit drains local rollback before revoking | APPROVE; security BLOCKER no; negative control fails the three advertised cases |
| #6068 | luvs01 | The Child relay authenticates and streams on one socket with a one-use, direction-tagged proof; pending rotation keys are accepted; no plain-fetch fallback (supersedes closed #6044) | LAND; security BLOCKER no; Windows segfault hold passed on the exact head (fork run) |
| #6067 | luvs01 | The web-search probe is released when the error body settles, not on status alone (follow-up to #6047) | APPROVE; new tests fail on dev |
| #6065 | kaladinhonor | `ocx doctor` and Desktop status report a Windows system proxy that bypasses Desktop first-party | APPROVE; prior hold points fixed |

Order: #6064 before #6068, resolving their shared tail of `structure/remote-link.md`; new layout entries go on
existing lines. Security reviews for #6064 and #6068 are recorded in scratch.
