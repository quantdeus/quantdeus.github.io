# QuantDeus Pay — NPD/self-employed manual Sberbank invoices (draft)

**State:** Production is LIVE using a theme-local module on https://quantdeus.whf.bz. This PR contains the matching standalone plugin source and remains draft pending safe migration away from theme-local code. See PRODUCTION_DEPLOYMENT_2026-10-10.md.

## Live fixed-price services and real manual invoices (2026-10-10)

- **Business automation: 25 000 ₽**, own QuantDeus service, eligible NPD flow. Public service page: https://quantdeus.whf.bz/services/business-automation/.
- The shortcode [quantdeus_pay_automation] now renders a **live self-service invoice form for individuals**. Server sets exactly 2,500,000 kopecks, generates a new private 192-bit invoice token and redirects by HTTP 303 to /pay/?qd_invoice=...; the buyer pays independently in their bank app by Sberbank phone number. **This is a real bill and transfer instruction, not online acquiring or a bank-initiated debit.**
- The public form requires the buyer to acknowledge service terms and individual buyer type; verifies the WordPress nonce, rejects bots by honeypot and limits issuance to 3 attempts per 30 minutes per IP pseudonym. No client name or card details stored. Individuals only; businesses (ИП/ООО) request a manually prepared invoice after obtaining buyer INN/details securely.
- The admin invoice editor now requires a checkbox confirming **the invoice covers the owner's own NPD-eligible service** when issuing manual invoices. Customer clicking «Я перевёл» can only mark claimed; admin confirms paid after a **bank statement check**, then issues a real FNS «Мой налог» receipt.
- **Ksenia Cherednikova performance: 50 000 ₽**, published at https://quantdeus.whf.bz/services/ksenia-concert/. The site accepts **booking requests**, not money for the artist via Anton's NPD account. Seller/payee and payment instructions must be agreed with Ksenia before direct settlement. No concert checkout through the automation-only form.
- Services overview: https://quantdeus.whf.bz/services/ shows both prices and links.
- PHP release checks in GitHub Actions include deterministic real-invoice-object creation with a mocked bank (no real payments), invalid nonce, wrong payer class, missing terms, bot honeypot and rate-limit rejection.
- The active WordPress Twenty Twenty-Five theme keeps a separate PHP module. Theme publishes create rollback snapshots; **20261010-172952-4c9q7u** is the snapshot for the v0.3 rollout.

**Operational limits:** No bank statement API, no automatic settlement verification, no card acquisition and no real tax receipt issuance through the plugin. Invoice generation is active, transfer completion is manually checked by owner. Card-transfer NPD receipts must be created promptly at settlement via «Мой налог». Seller identification, consumer-facing terms, return rules and buyer support information should be completed before high-volume sales.
## Features

- WordPress administrator creates an invoice under QuantDeus Pay · Счета, with a fixed amount in RUB and the service name in the post title.
- Admin changes status from Draft to Issued, producing an opaque 192-bit invoice URL on the /pay/ page.
- Page displays Sberbank, owner-provided phone number +79209869904, invoice amount, and safe manual transfer instructions.
- Clicking "Я перевёл" changes Issued to Claimed only. **It never marks the invoice Paid**.
- Admin confirms Paid only after checking actual bank receipt/statement. A separate **NPD receipt delivery** checkbox tracks whether an authentic HTTPS receipt link from **ФНС «Мой налог»** has been recorded and sent to the buyer; it is only an admin attestation, **not** an API connection to FNS.
- Only users with manage_options can manage invoices. Buyer details are not collected. Invoice records have REST exposure disabled.
- Buyer tax category is set at issuance (individual: 4%, company or sole proprietor: 6%), locked afterward; for company/sole-proprietor receipts the owner must obtain required buyer details directly through a secure channel, not a GitHub issue.
- The plugin creates a DRAFT page containing the shortcode [quantdeus_pay] on activation, unless /pay/ already exists. The page is never silently published.
- Invoice pages send no-store/noindex/no-referrer headers (caching layers in front of WP must also respect them).

## Installation / release checklist

1. **Tax setup: owner identified the seller as a self-employed taxpayer under НПД** (2026-10-10). Before accepting live payments, confirm current active NPD registration and that **+79209869904** really receives money into the seller's own Sberbank account. No seller name, personal tax ID, login or account statement must be committed to public GitHub.
2. Obtain a WP database backup and snapshot installed plugins before installing. Check for an existing /pay/ page.
3. Upload the quantdeus-pay folder to wp-content/plugins and activate the new plugin on a staging WordPress first.
4. Create a NON-LIVE draft invoice. Enter an amount (1–1,000,000 RUB), choose Issued, save, and copy its private link.
5. Test guest link, invalid token, nonces, rate limits, cancelled invoices, mobile display, and role permissions.
6. Test customer "Я перевёл": admin sees Claimed only. Client must not gain Pro rights, files or other paid goods automatically.
7. Test admin marking Paid only following bank-statement matching. In «Мой налог», record the real sale, select customer category, enter service description, actual receipt amount and date, and **issue/send a valid FNS receipt**. Only then tick the separate admin attestation and attach its HTTPS URL (the checkbox records delivery timestamp). Document refunds/support process.
8. Confirm site-wide CDN/proxy cache excludes /pay/ invoice URLs. Validate PHP syntax with php -l and conduct real WP integration testing.
9. Publish /pay/ and launch only after human sign-off and completed QA. Provide truthful recipient and refund/contact information.
10. For production rollback, deactivate plugin and unpublish /pay/; retain order evidence and issued receipts according to applicable requirements.

## Payment-law boundary

The site generates payment instructions and an internal status record, **not a fiscal receipt, bank checkout session, verified SBP business QR, or online KKT**. A phone-number transfer may work from a customer's bank app but does not prove a business payment until reconciled.

For eligible NPD sellers, create and issue the customer receipt in «Мой налог». Under art. 2(2.2) 54-FZ, a valid NPD seller **does not need a separate online-KKT for their eligible NPD sales**, but still owes the **FNS NPD receipt for every taxable payment**. For a customer sending a transfer to a personal bank card, FNS guidance says to issue/send the receipt **at the time of settlement**; the 9th-of-next-month option concerns **other** non-cash settlement methods, not ordinary card transfers. Do not misstate the private invoice link as a fiscal receipt or automatic FNS integration. Other tax modes may require ordinary online KKT.

Official references:
- FNS NPD receipts, 2026: https://www.nalog.gov.ru/rn53/news/activities_fts/16643640/
- FNS KKT for transfers from individuals: https://www.nalog.gov.ru/rn91/ifns/ifns7/info/12508344/
- Official SBP business QR onboarding: https://sbp.nspk.ru/faq/business

## Canonical НПД operating workflow (2026-10-10)

**Permitted starting lane:** only the owner's personally performed, independently sold eligible services (for example, their own AI automation implementation/consulting and original work). Eligibility depends on the actual contractual arrangement, not the site's marketing label.

1. Admin creates an invoice for the exact gross amount and selects buyer type: individual (4% NPD) or business (6% NPD for legal entities and sole proprietors). Tax is calculated by FNS, **not added to the invoice by this plugin**.
2. Admin issues the private invoice link and sends it to the actual client. For a business buyer, obtain required details including INN privately for the FNS receipt; never disclose buyer PII in a public issue or PR.
3. Customer independently transfers to Sberbank by phone. The checkout's «Я перевёл» sets claimed only. No screenshot or click proves settlement.
4. Admin matches receipt in the Sberbank account, amount and payer to the invoice, then separately marks paid.
5. **At the time of a transfer to a card**, create the real receipt in «Мой налог» with correct customer category, service, date and gross amount; send it to buyer. Store the HTTPS receipt URL and tick «Я сформировал чек и передал его заказчику». The plugin records only the administrator's attestation and timestamp.
6. If receipt is absent after paid, admin UI warns fiscal follow-up is incomplete. No fake receipt is generated; customer cannot trigger fulfillment or receipt attestation.
7. For refund, reconcile actual bank refund and separately correct/annul the NPD receipt in «Мой налог» where applicable. A WordPress refund status alone does not reverse an FNS receipt.

**Limits and eligibility:** NPD income cap 2.4 million RUB/year, normally 4% on income from individuals and 6% from businesses. No employees under employment contracts. NPD generally **does not permit agency, commission or mandate services on another person's behalf**. Do not use this own-services checkout for concert-booking agency commissions or resale of third-party products without a separate arrangement and tax analysis.

**Not automated acquiring:** a displayed Sberbank phone number is only a transfer instruction, not an automatic business-SBP channel or payment guarantee.

Official sources:
- FNS NPD: https://npd.nalog.ru/
- FNS 2026 receipts and KKT exemption: https://www.nalog.gov.ru/rn53/news/activities_fts/16643640/
- FNS 2026 card-transfer receipt deadline: https://www.nalog.gov.ru/rn19/news/activities_fts/16641439/
- FNS agency and commission restrictions: https://www.nalog.gov.ru/rn92/news/activities_fts/10960229/
- FNS «Мой налог»: https://lknpd.nalog.ru/

## Technical boundaries

- No card data, no bank credential/token, no payment initiation, no automatic verification, no webhook claiming payment.
- The invoice URL is an unguessable bearer link; someone with a leaked URL could falsely press "Я перевёл", but cannot approve payment.
- Invoice records stay in WordPress data, not public GitHub. Do not print tokens in analytics, issues, support threads, referrer headers or public logs.
- Price is immutable after initial issue. Corrections use a new invoice. No partial payments in MVP.
- Separate later stages: server-side financial ledger, human-reviewed reconciliation, eligible fiscal-receipt provider, optionally approved business-SBP integration.
- No changes to current WooCommerce, WordPress core, published theme, auth, user Pro entitlements, existing service requests, Telegram bot, or production deployment in this draft.

**Handoff:** Seven coordinates, Guardian checks role gating + token secrecy, QA checks WordPress behavior, CEO approves production and banking/fiscal obligations.
