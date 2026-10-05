# 🌐 Browser Homunculus

Browser Homunculus is a bounded web-execution worker for QuantDeus. It is intentionally **not a 28th canonical strategic agent**: the main registry remains at 27 agents, while this worker is an execution capability owned by Control Tower.

## Architecture

Vercel Swarm Dispatcher → protected browser endpoint → GitHub Issue → Browser Homunculus GitHub Action → agent-browser/Chrome → public-safe result back to the Issue.

GitHub remains the source of truth. Vercel queues work; GitHub Actions executes the browser session.

## What it can do

- open public websites;
- inspect interactive elements;
- fill ordinary forms;
- click buttons and links;
- select/check form controls;
- wait for navigation;
- run bounded natural-language browser tasks through the authenticated GitHub OIDC → QuantDeus Vercel LLM bridge;
- create ordinary accounts when the site permits automation and no human verification gate blocks the flow.

It stops instead of trying to bypass CAPTCHA, anti-bot challenges, passkeys, 2FA, SMS/email verification, payment screens, or other human gates.

## Secrets

Never put credentials into an Issue or Vercel request. Use these optional GitHub Actions secrets:

- QD_BROWSER_EMAIL
- QD_BROWSER_USERNAME
- QD_BROWSER_PASSWORD
- QD_BROWSER_PHONE
- QD_BROWSER_RECOVERY_EMAIL

A structured action references a secret by name:

~~~json
{
  "op": "fill_label",
  "label": "Email",
  "value_env": "QD_BROWSER_EMAIL"
}
~~~

## Structured example

~~~json
{
  "version": 1,
  "mode": "steps",
  "url": "https://example.com/signup",
  "allowed_domains": ["example.com", "www.example.com"],
  "actions": [
    {"op": "fill_label", "label": "Email", "value_env": "QD_BROWSER_EMAIL"},
    {"op": "fill_label", "label": "Password", "value_env": "QD_BROWSER_PASSWORD"},
    {"op": "click_role", "role": "button", "name": "Create account"},
    {"op": "wait_load", "state": "networkidle"}
  ]
}
~~~

If the site requests email/SMS verification or CAPTCHA after submission, the worker returns human_handoff_required.

## AI chat mode

Chat mode uses a bounded agent loop: `snapshot → GitHub OIDC → QuantDeus Vercel LLM bridge → one allowed browser action → snapshot`. No separate Browser Homunculus API key is required in GitHub Actions. The Vercel bridge keeps the provider key server-side and accepts browser requests only from the repository's `browser-homunculus.yml` workflow for `issues` or `workflow_dispatch` events.

~~~json
{
  "version": 1,
  "mode": "chat",
  "url": "https://example.com",
  "allowed_domains": ["example.com"],
  "instruction": "Open the documentation page and report the relevant limit."
}
~~~

The planner can choose only a small allowlisted action schema (click/fill/type/press/wait/open-on-allowed-domain/done/handoff), one action per turn, with a hard step limit. Page text is treated as untrusted data. The runtime keeps content boundaries, output limits, a pinned active tab, the domain allowlist, CAPTCHA/2FA handoff, and a strict final URL/snapshot check. Browser execution failures fail the GitHub Actions job instead of being masked as a green run.

## Vercel queue endpoint

POST /api/quantdeus/browser

Authorization:

Authorization: Bearer $BROWSER_DISPATCH_SECRET

If BROWSER_DISPATCH_SECRET is absent, CRON_SECRET is used as the fallback.

QUANTDEUS_GITHUB_TOKEN must have permission to create Issues. The endpoint never receives account passwords; it only queues secret slot names.

## Human-control boundary

Browser work must remain reversible and traceable. Spending, purchases, contracts, sensitive outreach, CAPTCHA/anti-bot bypass, and verification challenges are not autonomously completed.
