# QuantDeus · восстановление форума

Goal: turn the historical public WordPress forum archive into real bbPress forums/topics without deleting the source or inventing missing replies.

## Verified production facts (2026-10-31)

- Production is self-hosted WordPress 7.1.4 at https://quantdeus.ru, active theme Twenty Twenty-Five.
- Published /forum/ page #40 links to read-only /forum-archive/ page #78.
- The public archive contains 5 sections and 32 topic summaries. It says another 189 replies are saved in a separate backup; those reply records have not been located or verified.
- bbPress is not in the installed plugin list. There is no custom qd_forum_thread type on production.
- Existing native WordPress MCP abilities allow plugin activation but do not include plugin installation.
- An unrelated unpublished global-styles theme draft already exists. Do NOT publish that draft as a side effect of forum work.

## Installer / recovery process

1. First capture and verify a restorable database and files backup. Locate the separate source backup containing the 189 replies before attempting to claim full historic restoration.
2. On staging, install official bbPress, configure registration, forum privacy, participant/moderator roles, anti-spam, and comment approval. Keep all roles server-side.
3. Package this directory as a regular WordPress plugin ZIP (the PHP file must be inside the top-level quantdeus-forum-recovery folder), upload via WP-admin > Plugins > Add New > Upload Plugin, and activate it.
4. Under Tools > QuantDeus · форум, review the 5-section/32-topic preview and run the one-time admin + nonce import. Repeat runs are idempotent via _qdfr_archive_key metadata; the archive page is not touched.
5. Verify newly created bbPress forums/topics, URLs, timestamps and authorship disclaimers. The importer attributes the act of importing to the authorized administrator; it does NOT claim the admin wrote the historical original content.
6. Import the historical 189 replies only after checking the original SQL/XML backup, correct topic mapping, author/timestamp integrity and duplication. This plugin intentionally does not invent these replies or accept unverified public JSON.
7. After QA passes, replace the placeholder on WordPress page #40 with the shortcode [quantdeus_live_forum]. Keep a visible link to /forum-archive/ and keep GitHub Issues as a separate read-only coordination stream.
8. Test with two accounts: anonymous can read but cannot create/reply; member can create and reply with persistent saved state; member cannot lock/hide; moderator can moderate; report/spam controls operate; pagination/search/mobile work; no automatic outbound GitHub writes.
9. For rollback, keep the original archive and pre-migration DB backup, remove the shortcode from page #40, and deactivate the importer without deleting bbPress data. If content itself must be rolled back, restore the database snapshot deliberately.

## Scope boundaries

The importer migrates the 32 topic previews from the public archive into a real database-backed forum, not the 189 replies. It never automatically runs, never installs bbPress, never modifies the production theme and never changes member permissions. A GitHub PR does not deploy the website.

Related tracking: #167, #175, #176, #391, #579.

## Snapshot and automated QA

- Live public archive page #78 was read and preserved on 2026-11-01 as `archive-source-20261101.json`, with its original HTML in the `html` field, not as a second public page.
- The captured source comprises 5 sections and 32 preview records, including 27 public GitHub Issues previews. Summaries are not necessarily the original full posts.
- The 189 historical replies are **unverified and not present** in this source snapshot. Locate the source SQL/XML backup, validate authors and thread mappings, and import only verified replies.
- `node --test scripts/qa/forum-archive-snapshot.test.mjs` is part of the existing WordPress CI workflow and checks source counts, importer nonce/capability/idempotence guards and explicit reply-restore limitations.
- Do not merge, install, switch page #40 or publish live until bbPress, secure login, staging migrations and guest/member/moderator verification all pass. No production writes were made by the archive capture.
