# QuantDeus Native WordPress

This directory is the production-target WordPress package. It replaces the browser-local Playground architecture with a real PHP + SQL WordPress runtime.

## Runtime baseline

- WordPress 7.1.2 pinned production baseline
- PHP 8.3 recommended
- MySQL 8 or MariaDB 10.6+
- HTTPS
- persistent filesystem for uploads
- persistent SQL database
- scheduled database and file backups

The old wordpress/blueprint.json remains a test and preview artifact only. It is not a production database and must never be used as the canonical multi-user runtime.

## Theme

wp-content/themes/quantdeus-horizon is a block child theme of the official Twenty Twenty-Five theme.

The production design uses:
- native Site Editor and Full Site Editing;
- native WordPress Navigation block with responsive overlay menu;
- native templates, template parts and patterns;
- real photographic imagery;
- Dashicons for utility iconography instead of SVG illustration placeholders;
- DAY / EARTH and NIGHT / HORIZON visual modes.

The home pattern currently references licensed or credited real imagery from Filipe Nobre on Unsplash and NASA/GSFC Scientific Visualization Studio. Before final launch, import remote photography into the WordPress Media Library and retain source and credit metadata so WordPress can generate responsive image sizes.

## Application plugin

The existing wordpress/src/quantdeus-core remains the first-party domain plugin. It extends WordPress instead of replacing it:
- CPTs and taxonomies;
- roles and capabilities;
- Telegram member login;
- server-side GitHub staff OAuth;
- guest inquiries;
- forum data;
- Federation and research evidence fields;
- REST integrations.

All content, users, comments, inquiries and moderation persist in the shared WordPress database.

## Native staff authentication

Preferred production flow:

1. /login/ calls /wp-json/quantdeus/v1/github/start.
2. WordPress creates OAuth state server-side.
3. Browser is redirected to GitHub.
4. Callback returns to WordPress.
5. WordPress checks repository permission.
6. admin maps to administrator; write or maintain maps to qd_moderator.
7. /wp-admin/ remains native and fail-closed.

Required server constants, values never committed to Git:
- QD_GITHUB_CLIENT_ID
- QD_GITHUB_CLIENT_SECRET
- optional QD_GITHUB_ADMIN_REPOSITORY

## Telegram authentication

Telegram ordinary-user login keeps the QuantDeus Store Bot broker. Production must set Vercel QUANTDEUS_CANONICAL_ORIGIN to the final native WordPress origin. The returned assertion is consumed by the local WordPress REST broker. Telegram never grants moderator or administrator privilege.

## Admin model

There is exactly one canonical content and admin control plane: native /wp-admin/.

Use Site Editor for header, footer, templates, styles and navigation. Use Pages, Posts, Media, Users, Plugins, Settings and the QuantDeus content types from quantdeus-core for site operations.

Do not create a replacement dashboard or a second CMS.

## Deployment

See docs/NATIVE_WORDPRESS_CUTOVER.md. Production cutover requires owner approval after the native staging host passes desktop, mobile, auth, forum, inquiry and wp-admin smoke.
