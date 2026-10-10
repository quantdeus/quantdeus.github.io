# QuantDeus Pay — WordPress production deployment record

**Date:** 2026-10-10 · **Origin:** https://quantdeus.whf.bz · **Mode:** owner-approved NPD/manual-transfer MVP.

## Confirmed changes

- On live WordPress 7.1.3 / PHP 8.3.33 / theme Twenty Twenty-Five 1.5, activated payment code via a **theme-local standalone module**, because the connected MCP WordPress abilities do not currently expose third-party ZIP plugin upload/installation.
- Created theme file: `wp-content/themes/twentytwentyfive/inc/quantdeus-pay.php` — copied from this branch's `wordpress/src/quantdeus-pay/quantdeus-pay.php`, omitting its WordPress plugin activation hook.
- Added include to the active theme `functions.php`, guarded by `!class_exists('QD_Pay', false)` to allow eventual replacement with the standalone plugin.
- Theme publish completed successfully. Pre- and post-release checks returned HTTP 200 for WP admin, homepage, newest post and newest page, including visitor checks.
- Initial theme-file rollback snapshot ID: **`20261010-170137-xxnay3`**.
- Second UI refinement: on `/pay/` without invoice token, render a branded landing screen with `/services/` link instead of a misleading invalid-invoice error. This code also passed theme-draft-check and was published with backup **`20261010-170614-7knl9e`**.
- Published `/pay/` page ID **396** with shortcode `[quantdeus_pay]`: https://quantdeus.whf.bz/pay/
- Added link and description on existing public `/services/` page ID **16**.
- Set Rank Math robots on page 396: `noindex, nofollow, noarchive`.
- WordPress page-scoped caches cleared for page 396 and page 16. No WP page-cache plugin detected. Proxy/CDN caches were not directly audited.
- Live CPT discovery confirmed `qd_pay_invoice` is registered, admin-only `manage_options` capability, no public post exposure.

## Boundaries and remaining checks

- The **standalone ZIP plugin was not installed**. PR #557 remains a draft source package. **The running implementation is the equivalent module inside the current active theme.**
- The module only issues manual bank transfer instructions and admin-controlled invoice status. A customer's `claimed` state is not paid. No card capture or bank webhook.
- FNS `Мой налог` NPD receipt is a separate real obligation for each taxable sale. The module records only a human-entered HTTPS receipt link and attestation; it does not create a fiscal receipt.
- User stated **NPD/self-employed** seller mode. Payment phone: `+79209869904`, Sberbank, as provided by owner. Account recipient, active NPD registration, customer terms and real bank settlement not independently verified by the deployment.
- No real invoice/payment/refund was initiated during deployment; **end-to-end bank settlement, actual NPD receipt delivery and reverse/refund tests are unverified**.
- External public HTTP fetch from this agent environment could not resolve the host; MCP reported saved published page and live checks; do not claim browser/device acceptance testing until completed.
- **Important:** Twenty Twenty-Five receives theme updates. Such an update may overwrite theme-local `functions.php` and `inc/quantdeus-pay.php`. Migrate to a standalone plugin or a persistent child theme before next theme update and rehearse a rollback.

## Reversal

1. Unpublish WordPress page **396** using `mosmcp__page-unpublish` to immediately hide checkout.
2. Remove the Services card if rollback needs full navigation cleanup.
3. For undoing only the landing-screen refinement, restore snapshot **`20261010-170614-7knl9e`**; for a full rollback of QuantDeus Pay theme integration, restore the earlier snapshot **`20261010-170137-xxnay3`** via `mosmcp__theme-restore-backup` (`confirm=true`) if the deployed module causes a theme error; inspect live theme drift first.
4. Confirm the site loads and `qd_pay_invoice` is no longer active.
5. Do not delete historical payment records/legitimate receipt evidence if live transactions are later accepted.

## Follow-up for Seven / Guardian / QA

- Verify the actual invoice editor, admin-only transitions, token links, guest claim, mobile layout and outgoing bank transfer flow with a **test invoice only**.
- Check 54-FZ/422-FZ NPD flow and legal seller disclosures; receipts for transfer to bank card are issued at settlement: https://www.nalog.gov.ru/rn19/news/activities_fts/16641439/
- Confirm full live browser rendering, no cache leakage on `/pay/?qd_invoice=...`, and accessibility.
- Plan stable **true standalone plugin install**, then remove theme include. **Do not activate both** without a guarded migration test; current guard skips theme include if the plugin loads first.
