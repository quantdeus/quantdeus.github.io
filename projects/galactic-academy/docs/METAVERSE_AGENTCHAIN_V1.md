# QuantDeus Metaverse × AgentChain — staged architecture (V1)

Status: **design plus offline Godot sandbox**, not a deployed blockchain, live token, NFT collection, marketplace, or 10,000 running agents. This directory is an isolated staging area. Do not merge into the WordPress or Pages production branch without explicit owner approval.

## North star
An educational 2D/3D galactic sandbox in a cosmic Frutiger Aero style. Students learn practical skills, unlock game blueprints, collaborate with creators, and may request optional AI services. Triple-Win: useful learning for players, sustainable paid tools for creators/businesses, and an auditable platform economy. No pay-to-learn or speculative earn-to-play requirements.

## Existing V1 (in Godot)
- Mars quiz gives **25 local Credits only on first completion**.
- Starting balance is **100 local Credits**; unlock a cosmetic Aero ship skin for **40**.
- Spend **10 demo Credits** to **simulate** a Data agent request; no real LLM call.
- Credits, cosmetic ownership, and demo request count persist in local `user://quantdeus_metaverse_v1.json`.
- The UI labels this as simulation. No tokens, NFT mints, wallet connections, commissions, real assets, or money movements exist.
- This is an offline prototype without server-side anti-cheat; no monetary value or authoritative ownership is assigned to these local save fields.

## Architecture / trust boundaries

```text
Godot client (2D/3D) ── HTTPS ── authoritative game/API backend
                                         │
                            task queue + policy gateway
                                         │
                      OpenClaw / MCP / GitHub / LLM workers
                                         │
                              signed result + QA evidence
                                         │
                                 event / audit store
                                         │
                             optional chain adapter
                                         │
                     agent IDs / reputations / NFT receipts
```

**Off-chain execution:** models, game simulation, media, educational content, job scheduling, agent-to-agent orchestration, and private user data. Large jobs run asynchronously in task queues with rate limits and quota budgets. GitHub Actions supports bounded automation rather than an always-on inference cluster.

**On-chain (future):** optional public identity anchors, signed task attestations/digests, item tokens, and settlement contracts. Candidate EVM standards include ERC-721/1155 for collectible assets and ERC-8004-style identity/reputation/validation registries; verify maturity, exact implementations, deployment addresses and audits before use. x402-style machine payments could be explored *later*, behind an owner-approved wallet/treasury gateway.

**Never on-chain:** private audio, health data, credentials, raw private messages, private student performance records, identifiable prompts or confidential source code.

**Agent NFT ≠ executing agent.** A transferable collectible must NOT automatically grant agent admin privileges. Agent operating identity and revocable RBAC permissions must be distinct from optional tradable artwork. A reputation proof is not a guarantee of correctness.

## 10,000-agent design goal, not deployment status
- Initial pilot roles: Seven of Nine (coordination), Data (engineering), Sherlock (analysis), Tuvok (safety). Integrate the full approved QuantDeus roster only after current registry audit.
- Assign an immutable **agent_id** to each registered identity, with mutable capability metadata, owner/operator, signing key version, suspension flag, budget and versioned policy.
- Capacity target: **10,000 registry entries**. Do NOT spawn 10,000 processes or pay for 10,000 LLM sessions. Queue jobs to a smaller autoscaled worker pool.
- Use idempotency keys and signed receipts; reject duplicate rewards, replayed payments, expired authorization and agent self-approval.
- Human Override and RBAC govern contract deployment, live wallet changes, paid API spending, role escalation, production writes, withdrawals, market listings and payments.
- Task state machine: `proposed → authorized → queued → running → QA_passed/QA_failed → delivered/disputed`. Payment release requires verified delivery and explicit permissions; bound spend per job/day.
- No agent-created automated wallet trading, unsolicited financial transactions, covert tasks or main-branch writes.

## Tokenomics / licensing sketch — NOT launched
| Layer | Proposed value | Restrictions |
| --- | --- | --- |
| Credits | Non-transferable learning / demo gameplay units | Not redeemable for cash, not marketed as investment |
| Creator market | Approved original cosmetics, 3D models, learning content | License and creator consent required; fees disclosed |
| NFT collectibles | Optional provenance of cosmetic / creative items | No required purchases or gameplay power |
| QD token | Possible later utility experiment | No issue/sale/liquidity promise; legal/economic review first |
| Agent-as-a-service | Optional paid creation, tutoring, QA, 3D assistance | Users see price, privacy terms and human escalation |

Hypothetical creator revenue split: 75% creator / 25% platform **before fees, taxes and refunds**. Secondary marketplace commission or royalty is not assured on third-party markets. No passive-income, guaranteed return, health-cure or learning-outcome claims.

## Next increments
1. Verify the Godot 4.3 headless workflow and the test assertions on the isolated branch. Fix runtime failures before calling the prototype executable.
2. Build persistent 2D/3D missions, quest catalog, original visuals/sound, and more useful learning quests; user-supplied background audio remains optional and off by default.
3. Add authoritative server with signed login and quota-controlled agent gateway (first 4 test roles, then up to 27 approved roles). All output is QA-reviewed.
4. Load-test 100 → 1,000 → 10,000 **identity records** separately from worker concurrency, latency and cost.
5. Prototype wallet-less receipts first; only afterward evaluate a testnet identity/NFT adapter and reviewed contracts. No production tokens/mints/settlement without explicit owner approval.
6. Audit fees, tax/payment availability by jurisdiction, creator licenses, child safety and security before introducing paid UGC or tokens.

## QA & audit evidence
GitHub Actions workflow: `.github/workflows/galactic-academy-smoke.yml` restricted to this feature branch.

Manual:
```sh
godot --headless --path projects/galactic-academy --editor --quit
godot --headless --path projects/galactic-academy --script res://tests/metaverse_model_test.gd
godot --headless --path projects/galactic-academy --quit-after 10
```
Economy checks: first quiz +25 exactly once, cosmetic purchase −40 exactly once, mock Data job −10, credits never go negative, reload preserves state. A passing smoke does not establish full gameplay, blockchain, networking, accessibility or payment security.

Coordination issue: https://github.com/quantdeus/quantdeus.github.io/issues/577
