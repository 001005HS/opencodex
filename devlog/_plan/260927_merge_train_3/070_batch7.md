# B7 — GUI bug fixes

Base: `dev` `429f4e0175` (after B6 #6069). Branch `codex/train3-b7`.

Previous D (B6): #5925 and #5977 landed. Scope note: the request covers bugs, and only enhancements must avoid the
GUI, so GUI bug fixes are in scope; earlier batches skipped them by a stricter reading.

| PR | Author | Change | Kimi | UI visible |
|---|---|---|---|---|
| #6025 | Ingwannu | Kiro device-login status reads get one bounded, cancellable operation (fetch, body, decode), so a stalled body can no longer hang the dialog or the finalizer | LAND; its test fails on dev | no |
| #6010 | Ingwannu | The provider deep-link test stops dispatching a second `hashchange` for a changed hash | LAND; flake from CI, not reproduced locally | no (test only) |
| #6007 | Ingwannu | With provider-table routing, the dashboard and the start/sync output warn that some mobile remote thread lists hide openai-tagged history (#5848 mitigation; the issue stays open) | APPROVE; two dev tests fail without it | yes: a hint under the authless or client-compaction switch |

The batch PR needs a screenshot for #6007. It is taken from this branch's proxy run with `HOME`, `OPENCODEX_HOME`
and `CODEX_HOME` all pointed at a temporary directory, so no real shell profile, Codex config or app integration is
touched, and uploaded through the `pr-assets` branch.
