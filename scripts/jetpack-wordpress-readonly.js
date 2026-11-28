'use strict';
// Public Jetpack WordPress.com REST snapshot for QuantDeus Seven (no OAuth, no writes).
// Authenticated MCP is a separate owner-approved connection; never call this MCP.
const fs = require('node:fs');
const path = require('node:path');
const SITE_ID = 258399627;
const API = 'https://public-api.wordpress.com/rest/v1.1/sites/' + SITE_ID;
const OUTPUT = path.join('artifacts', 'seven-native', 'jetpack-public.json');

function clean(value, max = 110) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function canonicalLink(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.hostname !== 'quantdeus.ru') return null;
    return url.href.slice(0, 240);
  } catch { return null; }
}
async function publicGet(suffix) {
  const response = await fetch(API + suffix, {
    method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('WordPress.com public REST HTTP ' + response.status);
  const body = await response.json();
  if (!body || typeof body !== 'object' || body.error) {
    throw new Error('WordPress.com REST invalid/error response');
  }
  return body;
}
async function run() {
  const snapshot = {
    source: 'WordPress.com public REST for Jetpack-connected site (not authenticated MCP)',
    site_id: SITE_ID, site_url: 'https://quantdeus.ru',
    checked_at: new Date().toISOString(), mode: 'public-read-only', status: 'blocked',
  };
  try {
    const site = await publicGet('?fields=ID,name,URL');
    if (Number(site.ID) !== SITE_ID || canonicalLink(site.URL) === null) {
      throw new Error('Jetpack site identity mismatch');
    }
    const posts = await publicGet('/posts/?status=publish&number=8&fields=ID,title,URL,date,modified');
    if (!Array.isArray(posts.posts) || !Number.isFinite(Number(posts.found))) {
      throw new Error('Unexpected public posts response');
    }
    snapshot.status = 'ok';
    snapshot.site_name = clean(site.name, 90);
    snapshot.published_posts_found = Number(posts.found);
    snapshot.recent_published_posts = posts.posts.slice(0, 8).map(post => ({
      id: Number.isInteger(Number(post.ID)) ? Number(post.ID) : null,
      title: clean(post.title),
      url: canonicalLink(post.URL),
      published: /^\d{4}-\d\d-\d\d/.test(String(post.date || ''))
        ? String(post.date).slice(0, 10) : null,
    }));
  } catch (error) {
    // Fail closed for data consumption; preserve the exact unavailable state.
    // No tokens, raw API payloads or private data are written to the artifact.
    snapshot.reason = clean(error?.message || 'Public REST unavailable', 140);
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('JETPACK_PUBLIC_READONLY', snapshot.status,
    snapshot.status === 'ok' ? snapshot.published_posts_found : snapshot.reason);
}
run().catch(error => {
  console.error('JETPACK_SNAPSHOT_FATAL', clean(error.message, 100));
  process.exitCode = 1;
});
