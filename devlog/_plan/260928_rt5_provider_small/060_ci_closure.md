# wp6 — CI closure

For each lane PR: rebase onto the latest `origin/dev` when it moved or conflicts, push with
`--force-with-lease` to the lane's own branch only, then confirm Ubuntu CI on the exact head:
`gh pr view <N> --json headRefOid,statusCheckRollup` and
`gh run list --commit <sha> --json databaseId,event,status,conclusion,workflowName`.
The full expected set of PR checks must appear on the exact head and pass: typecheck, the
four test shards, gates, hygiene, enforce-target, and desktop shell. A required check that
never appears is missing evidence, not a pass. The coordinator dispatches the manual
Windows/macOS runs once at the end, so those are out of this lane.
Pending, skipped, cancelled, or older-head results are not green. A failing leg is diagnosed
from its job log (`gh api repos/lidge-jun/opencodex/actions/jobs/<id>/logs`) and fixed inside
the lane's write scope, or reported to the coordinator when the cause is outside it.
