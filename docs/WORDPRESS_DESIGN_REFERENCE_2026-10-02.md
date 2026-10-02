# WordPress portal design reference — 2026-10-02

Status: implementation reference for Issues #359 and #372.

## Studied references

- WordPress.org Showcase: NASA is listed as a featured WordPress community site; the Showcase also includes large government, publication, culture and enterprise sites.
- NASA.gov public information architecture: broad top-level topic navigation, multi-level exploration menus, search, featured content, mission/topic hubs and large editorial media surfaces.
- WordPress 7.1.2: current stable security release as of 2026-10-02.

## QuantDeus translation

We copy principles, not code or branding:

1. Portal hierarchy beats landing-page stacking.
2. Native WordPress Pages/CPTs/taxonomies own content.
3. Native Appearance → Menus owns the global Primary Menu.
4. Native Media Library / Customizer owns portal imagery.
5. Native /wp-admin/ remains the control plane.
6. theme.json exposes design tokens to the native block editor.
7. Header/navigation collapses before labels collide; desktop stays restrained and mobile/tablet uses a scrollable hamburger panel.
8. Real photography, space and nature imagery is content; glass, aqua, green and cosmic lighting are CSS presentation layers.
9. NASA imagery is used only under its published media guidelines with source attribution and no implied endorsement.
10. QuantDeus keeps its own Cosmic Frutiger Aero / Neon Horizon identity rather than imitating NASA branding.

## Non-goals

- no third-party page builder;
- no fake admin panel;
- no SVG scenery placeholders;
- no copying protected site source/design;
- no production cutover in this staging PR.
