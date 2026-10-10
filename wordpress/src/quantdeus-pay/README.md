# QuantDeus Pay — manual Sberbank invoices (draft)

**State:** implementation in draft PR only. Nothing in production is modified. This plugin is intended for the canonical WordPress site at https://quantdeus.whf.bz, not the legacy Vercel Store.

## Features

- WordPress administrator creates an invoice under QuantDeus Pay · Счета, with a fixed amount in RUB and the service name in the post title.
- Admin changes status from Draft to Issued, producing an opaque 192-bit invoice URL on the /pay/ page.
- Page displays Sberbank, owner-provided phone number +79209869904, invoice amount, and safe manual transfer instructions.
- Clicking "Я перевёл" changes Issued to Claimed only. **It never marks the invoice Paid**.
- Admin confirms Paid only after checking actual bank receipt/statement. Optional external fiscal receipt URL can be attached to the invoice.
- Only users with manage_options can manage invoices. Buyer details are not collected. Invoice records have REST exposure disabled.
- The plugin creates a DRAFT page containing the shortcode [quantdeus_pay] on activation, unless /pay/ already exists. The page is never silently published.
- Invoice pages send no-store/noindex/no-referrer headers (caching layers in front of WP must also respect them).

## Installation / release checklist

1. Owner confirms which lawful seller is receiving money: NPD/self-employed, sole proprietor, or company; verifies the Sberbank recipient matches +79209869904.
2. Obtain a WP database backup and snapshot installed plugins before installing. Check for an existing /pay/ page.
3. Upload the quantdeus-pay folder to wp-content/plugins and activate the new plugin on a staging WordPress first.
4. Create a NON-LIVE draft invoice. Enter an amount (1–1,000,000 RUB), choose Issued, save, and copy its private link.
5. Test guest link, invalid token, nonces, rate limits, cancelled invoices, mobile display, and role permissions.
6. Test customer "Я перевёл": admin sees Claimed only. Client must not gain Pro rights, files or other paid goods automatically.
7. Test admin marking Paid only following bank-statement matching. Validate manual receipt issuance and document refunds/support process.
8. Confirm site-wide CDN/proxy cache excludes /pay/ invoice URLs. Validate PHP syntax with php -l and conduct real WP integration testing.
9. Publish /pay/ and launch only after human sign-off and completed QA. Provide truthful recipient and refund/contact information.
10. For production rollback, deactivate plugin and unpublish /pay/; retain order evidence and issued receipts according to applicable requirements.

## Payment-law boundary

The site generates payment instructions and an internal status record, **not a fiscal receipt, bank checkout session, verified SBP business QR, or online KKT**. A phone-number transfer may work from a customer's bank app but does not prove a business payment until reconciled.

For eligible NPD sellers, create and issue the customer receipt in "Мой налог". Other merchant types may require compliant online fiscal KKT and an OFD; merchant obligations do not disappear just because users transfer to a phone number. Do not advertise the module as "ККТ/54-ФЗ compliant" without a separate fiscal integration.

Official references:
- FNS NPD receipts, 2026: https://www.nalog.gov.ru/rn53/news/activities_fts/16643640/
- FNS KKT for transfers from individuals: https://www.nalog.gov.ru/rn91/ifns/ifns7/info/12508344/
- Official SBP business QR onboarding: https://sbp.nspk.ru/faq/business

## Technical boundaries

- No card data, no bank credential/token, no payment initiation, no automatic verification, no webhook claiming payment.
- The invoice URL is an unguessable bearer link; someone with a leaked URL could falsely press "Я перевёл", but cannot approve payment.
- Invoice records stay in WordPress data, not public GitHub. Do not print tokens in analytics, issues, support threads, referrer headers or public logs.
- Price is immutable after initial issue. Corrections use a new invoice. No partial payments in MVP.
- Separate later stages: server-side financial ledger, human-reviewed reconciliation, eligible fiscal-receipt provider, optionally approved business-SBP integration.
- No changes to current WooCommerce, WordPress core, published theme, auth, user Pro entitlements, existing service requests, Telegram bot, or production deployment in this draft.

**Handoff:** Seven coordinates, Guardian checks role gating + token secrecy, QA checks WordPress behavior, CEO approves production and banking/fiscal obligations.
