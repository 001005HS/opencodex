# B4 — native-main recovery fence

Base: `dev` `bf6c57c0d7` (after B3 #6062). Branch `codex/train3-b4`.

Previous D (B3): landed with exact-head CI; #6020's review findings and #5494 were fixed in the batch. Direction kept.

| PR | Author | Plan | Kimi verdict |
|---|---|---|---|
| #6043 | luvs01 | Carry. Last-reference release no longer resets the native-main gate over a recovery fence that a profile transaction published for the same home. | LAND (no code change; carry onto current dev). The new release test fails on dev without the fix. |

Held, with reasons:

- #6044 (link relay authentication): security review recorded a blocker that the PR thread already lists as open; the
  branch also conflicts with the relay rewrite in #6034/#5998. Not landable in this lane.
- #6051 (`.agents/skills` recipe): accurate and safe, but it creates a new skill root that neither `AGENTS.md` nor
  the hygiene tests know about; the owner and author left that as a maintainer decision.
- #6027: the owner's three blockers are still open on the head.
