# GitLab passive repository mirror

## Purpose

GitHub remains the canonical QuantDeus control plane. GitLab keeps a one-way copy of repository branches and tags so the tracked source remains available if GitHub has an outage.

The GitLab project is a **passive repository copy**. QuantDeus CI and continuity checks run on GitHub Actions; GitLab CI is intentionally disabled to avoid consuming GitLab shared-runner minutes.

Normal direction:

`GitHub primary → GitLab repository copy`

GitLab does not create a second autonomous coordinator and does not write back to GitHub.

## What is mirrored

The GitHub Actions mirror pushes Git branches and tags, including the tracked QuantDeus control-plane content:

- `AGENTS.md`
- `coordination/agents.json`
- `coordination/homunculi.json`
- `coordination/agent-cron-map.json`
- doctrine, skills, scripts and QA source
- website/public surfaces and Vercel dispatcher source
- GitHub workflow source files as ordinary tracked files

Git transport does not copy platform state outside the repository, including GitHub Actions secrets, Issues, pull requests, run history, artifacts, environments, repository settings, or external Vercel/OpenClaw/Telegram/WordPress state.

## Credentials and synchronization

The GitHub repository uses:

- repository variable `GITLAB_MIRROR_REPOSITORY`: GitLab namespace/project path
- repository secret `GITLAB_MIRROR_TOKEN`: dedicated GitLab credential with permission to push to the destination project
- optional repository variable `GITLAB_MIRROR_HOST`: defaults to `gitlab.com`

The workflow never prints the token and uses an ephemeral credential file. Missing credentials leave the mirror unarmed without blocking unrelated GitHub QA.

The mirror is fast-forward-only. If GitLab has commits that are not ancestors of GitHub `main`, the job stops and requires reconciliation; it never force-pushes.

## Promotion and recovery

The GitLab copy is a source recovery option, not a pre-provisioned execution environment. Promotion requires an explicit CEO/admin directive.

1. Disable the GitHub-to-GitLab mirror before accepting emergency writes on GitLab.
2. Reconcile emergency GitLab commits with GitHub before re-enabling the mirror.
3. Run required QA on GitHub Actions after recovery.

GitLab CI is not configured for this project. GitLab shared-runner compute minutes are not used by the passive mirror.
