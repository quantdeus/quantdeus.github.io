# QuantDeus WordPress production on Vercel

Status: **chosen production hosting architecture**  
Date: 2026-10-02  
Tracks: #359, #372, PR #379

## Decision

**Vercel is the production hosting platform for QuantDeus.**

The target application runtime is native WordPress 7.1.2 packaged as a PHP HTTP container and deployed through Vercel Container Functions / `Dockerfile.vercel`.

WordPress Playground remains CI/preview only.

## Runtime topology

```
Internet
  ↓
Vercel Edge / CDN
  ↓
QuantDeus WordPress container (PHP + WordPress 7.1.2)
  ├─ quantdeus-aero theme
  ├─ quantdeus-core plugin
  ├─ native /wp-admin/
  ├─ REST /wp-json/quantdeus/v1/*
  └─ native WordPress routing
        ↓
External durable state
  ├─ MySQL-compatible database
  └─ object storage for Media Library uploads
```

## Why state is external

Vercel Container Functions are stateless. The container image is treated as immutable application code.

Therefore:

- WordPress database must be external and persistent;
- `wp-content/uploads` must be offloaded to durable object storage;
- sessions/application records must not rely on local disk;
- themes/plugins shipped by QuantDeus are deployed from GitHub as part of the image.

## Database

WordPress requires a MySQL/MariaDB-compatible database.

Preferred Vercel-connected option for the staging slice:

- Railway MySQL connected to the Vercel project through the Vercel/Railway integration.

The exact paid/free plan, region and database creation remain owner-controlled infrastructure inputs.

## Media

Preferred production model:

- WordPress Media Library remains the editor UX;
- a QuantDeus storage adapter offloads uploaded media to durable object storage;
- local container disk is never the source of truth.

Vercel Blob is acceptable if the adapter is implemented and verified. An S3-compatible backing store is also acceptable.

## Native WordPress admin

The following stay native:

- Dashboard
- Posts
- Pages
- Media
- Users
- Appearance
- Menus
- Customizer / Site Identity
- Tools
- Settings
- QuantDeus CPTs and moderation screens
- Forum / services / inquiries / Ksenia content

### Immutable-code constraint

Because Vercel containers are stateless, production theme/plugin source must be Git-backed and image-baked.

Do not rely on runtime filesystem mutation for durable plugin/theme installs or source editing.

WordPress content/admin remains native; application code changes go through GitHub → preview → QA → Vercel deploy.

This is intentional infrastructure hardening, not a fake admin replacement.

## Existing Vercel project

A current Vercel project named `quantdeus` already exists and is serving production deployments.

Migration rule:

1. do not replace the existing dispatcher/auth production deployment in-place;
2. first build the WordPress container as a reversible preview/staging deployment;
3. attach durable DB/storage;
4. smoke `/`, `/wp-admin/`, auth, Forum, Store, Media uploads and guest inquiries;
5. only then perform an owner-approved routing/domain cutover.

## Production environment names

Values must never be committed.

Expected categories:

- WordPress DB host/name/user/password/port;
- WordPress salts/keys;
- canonical WordPress URL;
- Telegram auth/broker inputs;
- GitHub OAuth/staff verifier inputs;
- media/object-storage credentials.

## Acceptance gates

Before cutover:

- Vercel container build succeeds;
- WordPress 7.1.2 boots server-side;
- external MySQL connection passes;
- Media Library upload survives container replacement;
- native /wp-admin/ works;
- Primary Menu and Customizer work;
- Telegram ordinary-user auth works;
- GitHub staff auth + RBAC works;
- Forum/Store/guest inquiry flows work;
- no local-disk persistence assumption;
- rollback deployment is documented.
