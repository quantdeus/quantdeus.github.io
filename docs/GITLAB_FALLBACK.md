# GitLab hot-standby fallback

## Purpose

GitHub remains the canonical QuantDeus control plane. GitLab is a hot-standby continuity target so a GitHub outage does not remove the tracked project, swarm registries, scripts, skills, public surfaces, or branch/tag history.

The mirror is intentionally one-way during normal operation:

`GitHub primary → GitLab hot standby`

It does **not** create a second autonomous coordinator.

## What is mirrored

The mirror pushes all Git branches and tags. That includes the tracked QuantDeus control-plane content such as:

- `AGENTS.md`
- `coordination/agents.json`
- `coordination/homunculi.json`
- `coordination/agent-cron-map.json`
- doctrine, skills, OpenClaw/Hermes scripts, QA code
- website/public surfaces and Vercel dispatcher source
- GitHub workflow source files as ordinary tracked files

Because the full repository is mirrored, every canonical agent definition travels with the fallback snapshot.

## What is not mirrored

Git transport does not copy platform state outside the repository. In particular it does not copy:

- GitHub Actions secrets
- GitHub Issues, pull requests, comments, checks, run history, artifacts, environments or repository settings
- external runtime state in Vercel/OpenClaw/Telegram/WordPress
- private connected-source data

Those credentials and integrations must be provisioned independently on GitLab before an emergency promotion can execute external actions.

## Arming the mirror

Create the destination project in GitLab, then configure the GitHub repository:

- repository variable `GITLAB_MIRROR_REPOSITORY`: GitLab namespace/project path, for example `quantdeus/quantdeus`
- repository secret `GITLAB_MIRROR_TOKEN`: dedicated GitLab token with permission to push to that project
- optional repository variable `GITLAB_MIRROR_HOST`: defaults to `gitlab.com`

The workflow never prints the token and uses an ephemeral credential file that is removed after the push.

If the variables are missing, the workflow reports that standby is not armed and exits successfully so normal QuantDeus QA is not blocked.

## Continuity verification

The GitLab mirror contains `.gitlab-ci.yml`. Its credentialless smoke job checks the canonical agent/homunculi registries and syntax-checks critical coordinator/runtime scripts.

This verifies that the fallback snapshot contains the swarm. It does not grant mutation authority or reproduce private integrations.

## Promotion and recovery

Promotion is manual and requires an explicit CEO/admin directive.

1. Freeze/disable the GitHub→GitLab mirror before accepting emergency writes on GitLab.
2. Confirm GitLab continuity CI is green.
3. Configure only the minimum GitLab CI variables/integrations required for the emergency lane.
4. Record emergency changes in GitLab commits/MRs.
5. When GitHub returns, reconcile divergent commits before re-enabling mirroring.

The GitHub mirror is fast-forward-only. If GitLab diverges after emergency promotion, the mirror fails instead of force-overwriting fallback work.