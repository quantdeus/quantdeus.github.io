# QuantDeus Prisma fallback

This is a separate standby control plane for QuantDeus on Prisma Compute.

## Safety model

- Primary QuantDeus production is not switched by this deployment.
- Prisma runs as standby, not active-active.
- No Prisma cron is provisioned, preventing duplicate swarm execution.
- The canonical agent roster is copied from `coordination/agents.json` at build time.
- `POST /dispatch` is fail-closed while the Prisma runtime has no independent model/provider credential.
- Activation of mutation-capable agent work requires an explicit failover gate and QA smoke.

## Endpoints

- `GET /` — minimal fallback landing page.
- `GET /health` — standby state and canonical agent count.
- `GET /agents` — all canonical QuantDeus agents.
- `GET /agents/:id` — one agent manifest.
- `POST /dispatch` — currently fail-closed with HTTP 503.

## Deployment

The GitHub workflow `.github/workflows/prisma-fallback-deploy.yml` uses GitHub OIDC and
`prisma/cloud-deploy-action@v1`; no Prisma service token is stored in GitHub.

The branch `infra/prisma-fallback` is the reversible preview path. After QA, merging the
same files to `main` updates the Prisma production branch while leaving the existing
QuantDeus primary hosting untouched.
