# B6 — direct MCP calls in code mode, attested live startup health

Base: `dev` `7d8459388c` (after B5 #6066). Branch `codex/train3-b6`.

Previous D (B5): #5953 and #6027 landed with their review fixes; #5180 and the #4055 docs landed. Direction kept.

| Item | Plan | Review |
|---|---|---|
| #5925 (mdwsk88) | Carry head `06fa8855b` as is. A routed provider's undeclared `mcp__<server>__<tool>` call is folded into the client's declared custom `exec` code-mode tool instead of failing the turn with a 502. | Kimi review LAND; dedicated security review of the undeclared-tool admission: BLOCKER no (recovery needs a client-declared custom `exec` and an actual routed conversion; arguments stay JSON data; explicit and namespaced declarations win). |
| #5977 (RHODIZSECURITY) | Carry, then close the hold that kept it out of round 2: the server signs a local-read response with `LOCAL_ATTESTATION_PROOF_HEADER` over the request nonce, `fetchBoundLocalManagementRead` verifies it when a caller opts in, and `ocx status` opts in, so a listener that took the port cannot supply a `protected` startup verdict. | Kimi review: the bug is real on dev; the fix reuses the attestation already used by `/healthz` and system restart. |

Held from this round's reviews, with reasons, for the outcome ledger: #4177 (no loop exists on dev; the rest is a
feature), #4732 (perf rework against `snapshot-select.ts` and measurements needed from the author), #5539 (reverses
test-locked behavior without a reproduction), #4961 (issue withholds a design), #4143 (needs the reporter's desktop
routing details).
