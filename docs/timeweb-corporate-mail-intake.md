# QuantDeus — Timeweb corporate email → agent intake (staging only)

**Address:** `info@quantdeus.ru`. **Status:** code ready for review; mailbox authentication and SMTP delivery unverified. No production changes.

## What works

- Pure Python 3 (no extra dependencies). `scripts/timeweb_mail_bridge.py --poll` connects to Timeweb IMAP SSL on port 993, selects INBOX read-only and uses `BODY.PEEK[]` to avoid marking messages read.
- Routes subjects/plain-text snippets: business automation → `unity`; partnerships → `seven-of-nine`; media/booking → `herald`; subscriptions → `herald`; support → `tuvok`; general → `seven-of-nine`.
- The classification is deterministic and deliberately simple, not an AI model. External email text is **untrusted input** and cannot authorize agent actions.
- Saves a privacy-sensitive event only into a private local directory outside any website/repository. Directory requires mode 0700; newly created queue files are mode 0600. Content hash prevents duplicate queue entries.
- Bounces, self-sent messages, auto-replies, bulk mail and oversized messages are ignored. Attachments/HTML are not parsed. No outbound mail, external API calls, GitHub Issues with email contents, newsletter subscriptions or automatic replies.

## Tests performed locally

`python3 -m unittest discover -s scripts/tests -p 'test_timeweb_mail_bridge.py'` — 7 tests passed on synthetic data. `python3 scripts/timeweb_mail_bridge.py --smoke` — offline synthetic route passed. CI and a live Timeweb test still need to run.

## Private operator setup (after owner authorization)

1. Verify Timeweb hosting environment permits Python 3, IMAP outbound connections, and a secure cron/service. Otherwise use another private runtime; never run a mailbox worker from the public site directory.
2. Check actual MX records: Timeweb expects `mx1.timeweb.ru` priority 10 and `mx2.timeweb.ru` priority 20. Verify real SPF, DKIM and DMARC separately before sending. Do not overwrite existing records blindly.
3. In an existing secure runtime, create a queue folder **outside** public_html, WordPress and the GitHub checkout, owned by its dedicated service user with `chmod 700`.
4. In the **private service runtime**, supply the existing combined secret `QD_MAIL_DATA` through a secure secrets facility (or separate `QD_MAIL_USER` and `QD_MAIL_PASSWORD` as legacy alternative), as well as `QD_MAIL_PRIVATE_QUEUE` (absolute private path) and `QD_MAIL_POLL_ENABLED=1`. The GitHub Actions repository secret **is not automatically injected into Timeweb**. Never print the secret or share it in chat.
5. `QD_MAIL_DATA` accepts JSON objects like `{"login":"info@quantdeus.ru","password":"PLACEHOLDER"}` (aliases `user`/`username`/`email` and `pass` are accepted), two `LOGIN: ...` / `PASSWORD: ...` lines, or two plain lines with username then password. `PLACEHOLDER` here is **not** a real secret. Invalid formats fail closed without logging values.
6. Run `python3 scripts/timeweb_mail_bridge.py --smoke`, tests, and `python3 scripts/timeweb_mail_bridge.py --auth-check` in the private runtime first. The auth-check verifies TLS login only, does not select folders or retrieve messages. Once verified, run `python3 scripts/timeweb_mail_bridge.py --poll` only inside the authorized private environment; output is aggregate counters only.
7. Send a controlled test message to the mailbox and verify one queued private record, dedupe on the next run, correct assigned_agent and zero outbound messages. A private consumer/agent broker must be added and authorized before agents can read actual messages. It must not publish PII to GitHub.
8. For SMTP, WordPress has an active `SMTP Mailer` plugin, but it is **not proof of configured SMTP**. Configure it via WordPress HTTPS admin with host `smtp.timeweb.ru`, port 465+SSL or 587+STARTTLS, authentication, and `info@quantdeus.ru` as sender. Use an owner-controlled test recipient, verify actual delivery and SPF/DKIM/DMARC. External sends remain disabled here.

## Manual GitHub authorization check (after code review and merge)

The repository Actions secret `QD_MAIL_DATA` is confirmed to **exist**, but GitHub does not reveal its contents or verify their format. A separate manual workflow `.github/workflows/timeweb-mail-auth-check.yml` accepts it via `${{ secrets.QD_MAIL_DATA }}` **only when manually launched against the reviewed `main` branch**, after PR merge. The login-only command never opens inbox folders, reads messages or sends email. Before merge the workflow cannot be used to validate this secret; **do not bypass the PR by running unreviewed scripts with credentials**.

Run from GitHub **Actions → QuantDeus — проверка авторизации почты Timeweb → Run workflow → main** after approved merge. Success proves IMAP login only; it does not prove DNS delivery, SMTP sending, private queue consumption, or access for agents.

## Outstanding limitations

- No Timeweb mailbox credentials are available in this agent session; therefore real inbox read, private agent handoff and SMTP sending have **not** been tested or activated.
- The local queue is an integration boundary, not a fully deployed agent runner; another approved and private worker must consume messages and create human-reviewed drafts. Existing public GitHub Actions cannot store customer email contents.
- The MVP only processes unread messages, up to 25 per poll. If incoming email has only HTML, its text snippet may be blank. The queue consumer must handle expiry, confidentiality, audit and backup policy.
- Newsletter opt-in is a **separate** system (#644, draft PR #645) and stays behind its own consent/production gates. Do not merge corporate inbound requests into marketing subscriber lists.

## References

- Timeweb official IMAP/SMTP settings: https://timeweb.com/ru/docs/pochta/osnovnye-voprosy-po-rabote-s-pochtoj/osnovnye-nastrojki-pochtovyh-klientov/
- Timeweb MX/SPF/DKIM/DMARC: https://timeweb.com/ru/docs/domeny/resursnye-zapisi-domena-dns-zapisi/nastrojka-dns-zapisej/mx-spf-dkim-dmarc/
- Canonical QuantDeus growth task: https://github.com/quantdeus/quantdeus.github.io/issues/644