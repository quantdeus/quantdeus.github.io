# [P0][MIRROR][DEPENDENCY] Remove Vercel AI Gateway dependency for model-provider

## Problem

The mirror swarm fails due to the dependency on the Vercel AI Gateway, which requires a valid credit card on file. This blocks the mirror from generating text or producing repair artifacts.

### Evidence
- Current workflow: `generateText({ model: MODEL })` routes through the Vercel AI Gateway.
- No working model provider available; billing is unavailable.

### Required Fix

1. **Remove the hard dependency** on the Vercel AI Gateway for model generation.
2. **Reuse an existing QuantDeus model-provider path** with fail-closed behavior.
3. **Ensure deterministic evidence collection** if no model provider is available.
4. **Preserve OIDC verification, safe repair paths, and QA checks** without auto-merging.

### Acceptance Criteria
- The mirror should not fail silently; it must produce a bounded repair artifact (e.g., a PR or Issue).
- The solution must be auditable, reversible, and bounded to avoid unintended side effects.
- No direct-main writes or auto-merge.

## Target Agent
- `control-tower` (for implementation)
- `sherlock` (for diagnostics and falsification)

## Labels
- `coord:task`
- `coord:ready`
- `agent:control-tower`
- `quantdeus-target-agent:control-tower`