# QuantDeus — Native WordPress production cutover

Status: staging architecture. No production cutover in this branch.

## Why this migration is required

The current GitHub Pages root launches WordPress Playground in a browser iframe. That is useful for reproducible QA, but it is not a shared server-side WordPress installation. Forum threads, inquiries, users and media therefore cannot be treated as one canonical multi-user database.

The target is a normal persistent WordPress server runtime.

## Target architecture

Browser
→ HTTPS
→ WordPress 7.1.2 and PHP
→ persistent MySQL or MariaDB
→ native wp-admin and Site Editor
→ Twenty Twenty-Five parent plus QuantDeus Horizon block child theme
→ quantdeus-core domain plugin
→ bounded external brokers where still needed
→ GitHub and OpenClaw as integrations, not the CMS runtime

GitHub remains source, CI and evidence. WordPress becomes the application and CMS runtime.

## Visual architecture

Reference principles studied before implementation:
- NASA: deep portal information architecture and grouped navigation across many domains;
- Capgemini: enterprise content governance;
- Qualtrics: product plus knowledge architecture with clear navigation;
- Harvard: broad institutional information architecture;
- Frutiger Aero: blue sky, water and air, greenery, glossy aqua surfaces and optimistic technology.

No source code, branding or proprietary visual identity is copied from those sites.

QuantDeus design system:
- DAY / EARTH: real sky, grass, water, glass, aqua and green;
- NIGHT / HORIZON: real cosmic imagery, deep navy, cyan and violet;
- native Dashicons for utility iconography;
- real JPG or WebP photography as primary imagery;
- no SVG illustration placeholders on the canonical native home experience;
- responsive navigation collapses at 1120px before it can overflow.

## Production requirements

Owner and infrastructure inputs still required:
1. A real WordPress host with PHP 8.3, persistent SQL and persistent uploads.
2. Install WordPress 7.1.2 and parent theme Twenty Twenty-Five.
3. Deploy quantdeus-core and quantdeus-horizon.
4. Configure QD_GITHUB_CLIENT_ID and QD_GITHUB_CLIENT_SECRET in server config, never Git.
5. Set Vercel QUANTDEUS_CANONICAL_ORIGIN to the final WordPress origin for Telegram broker return.
6. Confirm BotFather website origin if the origin changes.
7. Import real site photography into Media Library and retain source and licensing metadata.
8. Back up database and uploads before cutover.

A WordPress.com site quantdeus.wordpress.com exists, but connected site-scoped tooling currently reports that a paid WordPress.com plan is required. No upgrade, billing or DNS change is performed by this branch.

## Required live staging smoke

- root page
- Site Editor header, footer and templates
- desktop navigation and nested submenus
- mobile and tablet overlay menu
- login page
- Telegram Store Bot login
- GitHub OAuth with write, maintain and admin role mapping
- native wp-admin
- fail-closed admin guard
- Forum create and reply across two distinct user sessions
- guest service inquiry visible in the same admin database
- Services
- Ksenia hub
- Research, Federation and Nodes
- Media upload and responsive image generation
- XML sitemap, canonical metadata and schema layer
- accessibility keyboard, focus and contrast
- no horizontal overflow at 320, 375, 768, 1024 and 1440 widths

## Cutover gate

Do not replace GitHub Pages production until all checks above pass and the owner explicitly approves the cutover.

Rollback: keep the current GitHub Pages deployment intact until the new native host passes live smoke. DNS and origin changes must remain reversible.
