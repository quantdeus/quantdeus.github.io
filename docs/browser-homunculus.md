# 🌐 Browser Homunculus

Browser Homunculus is a bounded web-execution worker for QuantDeus. It is intentionally **not a 27th canonical strategic agent**: the main registry remains at 26 agents, while this worker is an execution capability owned by Control Tower.

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
- run bounded natural-language browser tasks when Vercel AI Gateway is configured;
- create ordinary accounts when the site permits automation and no human verification gate blocks the flow.

It stops instead of trying to bypass CAPTCHA, anti-bot challenges, passkeys, 2FA, SMS/email verification, payment screens, or other human gates.

## Secrets

Never put credentials into an Issue or Vercel request. Use these optional GitHub Actions secrets:

- QD_BROWSER_EMAIL
- QD_BROWSER_USERNAME
- QD_BROWSER_PASSWORD
- QD_BROWSER_PHONE
- QD_BROWSER_RECOVERY_EMAIL
- AI_GATEWAY_API_KEY for chat mode

Optional repository variable:

- AI_GATEWAY_MODEL

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

With AI_GATEWAY_API_KEY configured, the manifest may use:

~~~json
{
  "version": 1,
  "mode": "chat",
  "url": "https://example.com",
  "allowed_domains": ["example.com"],
  "instruction": "Open the pricing documentation and report where the free-tier limits are stated."
}
~~~

The runtime uses vercel-labs/agent-browser AI chat through Vercel AI Gateway. Allowed-domain restrictions remain active.

## Vercel queue endpoint

POST /api/quantdeus/browser

Authorization:

Authorization: Bearer $BROWSER_DISPATCH_SECRET

If BROWSER_DISPATCH_SECRET is absent, CRON_SECRET is used as the fallback.

QUANTDEUS_GITHUB_TOKEN must have permission to create Issues. The endpoint never receives account passwords; it only queues secret slot names.

## Human-control boundary

Browser work must remain reversible and traceable. Spending, purchases, contracts, sensitive outreach, CAPTCHA/anti-bot bypass, and verification challenges are not autonomously completed.
