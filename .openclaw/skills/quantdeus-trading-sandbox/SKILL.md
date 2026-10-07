---
name: quantdeus-trading-sandbox
description: QuantDeus BingX VST-only trading research lane with deterministic risk gates and QA quorum.
version: 1.0.0
---

# QuantDeus Trading Sandbox

Use this skill only for BingX **Production Simulated / VST** trading research. Real-money trading is outside this skill.

## Hard rules

- Environment is always `prod-vst`; never request or infer `prod-live`.
- Use only the allowlisted USDT perpetual symbols returned by the broker status tool.
- A proposed order needs two independent approvals from `qa-syntax`, `qa-contract`, `qa-repair` before submission.
- The deterministic broker risk gate is authoritative. If it returns `NO_TRADE`, do not retry by changing inputs merely to pass the gate.
- Market storm, stale data, excessive spread/funding/volatility, daily drawdown, excess leverage, excessive position risk, missing TP/SL, insufficient reward/risk or too many open positions all mean no new position.
- Never use martingale, loss chasing, cross margin, withdrawals, transfers or claims of guaranteed profit.
- Do not target a fixed number of trades. Zero trades is a valid and often correct outcome.

## Workflow

1. Read broker status and policy.
2. Analyze the allowlisted markets using multiple independent signal families.
3. Produce a trade hypothesis with falsifier, entry direction, leverage <= broker max, quantity, stop-loss and take-profit.
4. Ask at least two QA agents to independently approve/reject the exact proposal.
5. Call the broker assessment tool.
6. Only if QA quorum and deterministic assessment both approve, submit the VST paper order.
7. Record result, fees/PnL and whether the original hypothesis survived. Never report a simulated result as real-money performance.

## Connection

The broker URL and token are injected by the trusted QuantDeus OpenClaw runtime. BingX API credentials never belong in prompts, Issues, PRs or model-visible tool output.
