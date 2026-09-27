# Closure — assigned-item disposition and dev CI

Depends on B1–B4 or an evidenced decision to hold a batch. This document becomes the lane ledger; it is not a release or deployment instruction. Update its tables as merges and GitHub actions actually happen. Do not mark an unrun check successful.

## Exact action map

| Item | Required action after implementation decisions |
| --- | --- |
| Carried #6081, #6083, #6082 | After the corresponding lane-owned PR merges, comment in English on each source PR with thanks, the merged PR URL and `dev` merge SHA, then close it as superseded. Verify coauthor trailer survived in the lane PR. |
| #6088 | After B4 merges and exact `dev` SHA is observed, comment with PR/commit link and the verification scope, then close. |
| Held #6076, #5964, #6030, #5831, #5539, #6085 | Post one precise English comment per PR naming the current blocker and evidence; leave open unless an exact duplicate/supersession is subsequently proved. Do not imply the proposal was merged. |
| Open #4956, #4761 | Comment in English with the partial-fix and remaining-contract evidence; leave open. Do not close from a warning or fixture-only change. |
| Lane-owned PRs | Each PR uses the repository Summary, Verification and Checklist template; includes focused command output, full-suite contention exception, security review where applicable, correct coauthor trailers, and current-head CI links. Resolve valid Codex/CodeRabbit findings before merge. |
| `dev` integration | Fetch `origin/dev` before every merge; prove ancestry and combined file-size/union/doc gates. Record merge SHAs. Since Cross-platform CI does not trigger on `dev` push, dispatch `workflow_dispatch` on exact `dev` and inspect expected jobs, event, head SHA, attempt and conclusions. Repair a lane-caused failure. |

## Evidence ledger

| Batch | Lane PR | Head and merged `dev` SHA | Local commands and result | Exact-head CI run | Source PR/issue action |
| --- | --- | --- | --- | --- | --- |
| B1 | #6101, then the batch PR | reviewed head `3d74920bfd` (source identical to `7663693894`); merge pending | adapter-focused 100 pass / 0 fail (88 before); red before fix | #6101 pull_request CI | #6081, #6083: close with thanks after merge |
| B2 | [#6099](https://github.com/lidge-jun/opencodex/pull/6099) | head `8812bb5dfc`, merged `6d64ea26a7` (squash, Co-authored-by luvs01 kept) | NativeTrayTests 59 assertions (53 before); trapped (exit 133) on old formatter | [36330651498](https://github.com/lidge-jun/opencodex/actions/runs/36330651498), every executed job success | #6082 closed as carried |
| B3 | no source PR planned | no merge | restart-focused baseline: 45 pass / 0 fail on `24b2f39b77`; safety audit holds #6085 | N/A | pending English PR comment |
| B4 | #6102, then the batch PR | reviewed head `a08c375912`; merge pending | Link-focused 40 pass / 1 win32 skip / 0 fail; 4 red before fix; `test:changed` 6007 pass / 46 fail, all 46 in three Claude integration files that pass 123/0 in isolation on the same commit (parallel contention, no import of `src/link`) | #6102 CI; Windows proof: dispatch [36331108394](https://github.com/lidge-jun/opencodex/actions/runs/36331108394) | #6088: close after merge with Windows log evidence |
| B6 | #6108, then the batch PR | reviewed head `4bfae6f055` plus review fixes (ensure parent marks itself; hint reads match writer caps); merge pending | sibling-home focused 161–174 pass / 0 fail; writer guards red before fix | #6108 CI | coordinator bug; hand off Claude intercept settings migration to the picker CA lane |

After #6099 merged, the three remaining slices were one commit behind `dev`. Rebasing and re-running each PR in turn would cost three serial CI cycles, so they are integrated as one batch PR on the new `dev`. The batch keeps one commit per slice with its trailers, and its exact-head CI is the union proof. The per-slice PRs are closed in favor of the batch once it merges.

Final `dev` CI run, expected jobs, failure repair, remaining risk and overlapping files: pending evidence.
