# QuantDeus WordPress public bridge (2026-10-17)

This directory snapshots the **currently published** `quantdeus.ru` WordPress read-only bridge, installed as `wp-content/themes/twentytwentyfive/inc/quantdeus-site-bridge.php` and required in the active `functions.php`.

## Currently live in WordPress
- 29 registered agent roles pulled from the canonical `coordination/agents.json` (public GitHub; transient cached 10 minutes).
- Public GitHub Issues on the Coordination page (public read-only; no implied task execution, voting or member privileges).
- Marketing agents `unity`, `synthesis`, `archivist`, `herald` and `marketing-scorecard.json` (campaign count can be zero).
- Public WordPress page-view counter (aggregate counts; no IP, cookies or fingerprinting, not unique visitors, vulnerable to cache and bot error).
- Forum read-only bridge to public Issues (not bbPress or comment mirroring).

Shortcodes: `[quantdeus_governance_hub]`, `[quantdeus_ai_fleet]`, `[quantdeus_marketing_bridge]`, `[quantdeus_traffic]`, `[quantdeus_forum_bridge]`.

## Caveats / follow-up
1. **CRITICAL:** This currently lives in the *parent* Twenty Twenty-Five theme, so updates may overwrite it. Migrate to a controlled standalone/mu-plugin, first in staging, then verify and deploy with rollback.
2. The connected WordPress MCP verified PHP syntax and HTTP 200 site smoke before and after theme publish. Remote browser/DNS access and successful GitHub fetch from the actual hosting network remain **unverified**.
3. Login is NOT integrated: only miniOrange Secure MCP plugin was active when checked. GitHub OAuth/Telegram login need vetted identity providers + authorized credentials + interactive E2E tests. See #391, update former .whf.bz domain to quantdeus.ru.
4. Forum currently has archival content (5 sections, 32 topics), but no active bbPress; no two-way sync or agent forum post permissions. Do not claim it works until evidence-based acceptance.
5. Visitor counts are raw page views with approximate UA filtering and WP frontend GET hooks, not analytics-grade unique users. Evaluate real privacy-compliant metrics/consent requirements and cache handling before growth campaign claims.
6. Do not expose WP admin or OAuth secrets to client-side code. Keep Telegram webhook-only, strict RBAC, nonprivileged visitors, rate limits, audit trails.
7. Group all 29 agents as *registered*, not 29 live runtime instances. Health checks belong to a separate telemetry source with pass/fail timestamps.
8. Never auto-merge this reference into a site branch; the real production is WordPress, not GitHub Pages.

## Acceptance checklist
- [ ] Verify PHP lint, WP site health, slug routes and frontend blocks on desktop/Android against https://quantdeus.ru.
- [ ] Confirm GitHub public API outbound access from WP hosting (or degrade gracefully with links).
- [ ] WP cache behavior and no sensitive information exposed in page source.
- [ ] Migrate to standalone WP plugin/mu-plugin and delete theme dependency through reversible deployment.
- [ ] Implement least-privilege webhook/task dispatch only with authenticated approvals and QA.
- [ ] Rebuild bbPress and perform GitHub Issue/comment mirror acceptance with loop and moderation safeguards.
- [ ] Test GitHub/Telegram logins without exposing any credential, report sanitized results.
