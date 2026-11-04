/**
 * QuantDeus Federation Bridge v0.1
 * A read-only WordPress metadata snapshot + a testable QDRP staging gate.
 *
 * This tool NEVER writes to WordPress, Cloudflare, or a production branch.
 * A decision from this module is not a credential; an independent trusted
 * runtime must enforce it before authorizing any GitHub write.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'coordination/federation-bridge.json');
const policyPath = resolve(root, 'coordination/qdrp-wordpress-site-access.json');

export function loadBridgeConfig() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function loadQdrpPolicy() {
  return JSON.parse(readFileSync(policyPath, 'utf8'));
}

const allowedActions = new Map([
  ['read_only_diagnostics', 0],
  ['analysis', 40],
  ['issue_proposal', 40],
  ['scoped_staging_edit', 60],
  ['draft_pull_request', 60],
  ['release_candidate_in_staging', 80],
  ['bounded_agent_coordination', 95],
]);

function deny(reason) {
  return { allowed: false, reason, grant: null };
}

function isSafePath(path) {
  if (typeof path !== 'string' || !path.startsWith('wordpress/')) return false;
  if (path.length > 256 || path.includes('\\') || path.includes('\0')) return false;
  if (path.split('/').some(segment => segment === '..' || segment === '.')) return false;
  return true;
}

function validSignature(payload, signature, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest();
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Input is an independently signed, time-limited evidence envelope.
 * A caller cannot alter the score or scope without invalidating the signature.
 */
export function evaluateQdrp(request, envelope, secret, now = Date.now()) {
  if (!request || !envelope || !envelope.payload || !validSignature(envelope.payload, envelope.signature, secret)) {
    return deny('missing_or_invalid_independent_attestation');
  }
  const p = envelope.payload;
  const action = request.action;
  if (!allowedActions.has(action)) return deny('action_denied');
  if (request.environment !== 'staging') return deny('live_or_unknown_environment_denied');
  if (typeof request.agent_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(request.agent_id)) return deny('unverified_agent_identity');
  if (p.agent_id !== request.agent_id) return deny('agent_mismatch');
  if (p.issuer !== 'quantdeus-independent-review-authority') return deny('invalid_issuer');
  const issued = Date.parse(p.issued_at);
  const expires = Date.parse(p.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 60000 || expires <= now) return deny('expired_or_invalid_grant');
  if (expires <= issued || expires - issued > 15 * 60 * 1000) return deny('grant_exceeds_15_minute_limit');
  if (!Number.isInteger(p.score) || p.score < 0 || p.score > 100) return deny('invalid_reputation');
  if (p.score < allowedActions.get(action)) return deny('insufficient_reputation');
  if (!Array.isArray(p.allowed_actions) || !p.allowed_actions.includes(action)) return deny('action_out_of_scope');
  if (typeof p.issue !== 'string' || !/^https:\/\/github\.com\/quantdeus\/quantdeus\.github\.io\/issues\/\d+$/.test(p.issue)) return deny('missing_issue_link');
  if (!Array.isArray(p.reviews) || !p.reviews.includes('tuvok') || !p.reviews.includes('data')) return deny('independent_review_missing');
  if (p.agent_id === 'tuvok' || p.agent_id === 'data') return deny('self_review_must_be_independent');
  if (p.ci_pass !== true || typeof p.rollback_ref !== 'string' || p.rollback_ref.length < 8) return deny('ci_or_rollback_missing');
  if (!Array.isArray(p.allowed_path_prefixes) || !p.allowed_path_prefixes.length) return deny('resource_scope_missing');
  if (!isSafePath(request.resource)) return deny('resource_outside_staging_wordpress');
  if (!p.allowed_path_prefixes.some(prefix => typeof prefix === 'string' && isSafePath(prefix) && request.resource.startsWith(prefix))) return deny('file_out_of_scope');
  if (typeof request.branch !== 'string' || !/^(agent|qdrp|feature|feat)\/[a-z0-9._/-]+$/.test(request.branch) || request.branch.includes('..')) {
    return deny('protected_or_invalid_branch');
  }
  if (request.repo !== 'quantdeus/quantdeus.github.io') return deny('wrong_repository');
  return {
    allowed: true,
    reason: 'staging_only_verified_attestation',
    grant: {
      agent_id: p.agent_id,
      action,
      resource: request.resource,
      branch: request.branch,
      expires_at: p.expires_at,
      issue: p.issue,
      score: p.score
    }
  };
}

/** Public metadata only: no private/draft posts, passwords, user records or HTML bodies. */
export function sanitizeWpItems(items, kind, siteUrl) {
  if (!Array.isArray(items)) throw new TypeError('invalid_wordpress_response');
  const host = new URL(siteUrl).hostname;
  return items.filter(x => x && x.status === 'publish')
    .filter(x => Number.isInteger(x.id) && typeof x.link === 'string')
    .filter(x => { try { const u = new URL(x.link); return u.protocol === 'https:' && u.hostname === host; } catch { return false; } })
    .slice(0, 25)
    .map(x => ({
      kind, id: x.id,
      slug: String(x.slug || '').slice(0, 200),
      link: x.link,
      modified: String(x.modified || '').slice(0, 30),
      // Treated as untrusted data and never rendered as executable HTML.
      title: String(x.title?.rendered ?? x.title ?? '').replace(/<[^>]*>/g, '').slice(0, 180)
    }));
}

export async function capturePublicWordPress({ fetchImpl = fetch, siteUrl = 'https://quantdeus.ru', maxPerType = 25 } = {}) {
  if (new URL(siteUrl).origin !== 'https://quantdeus.ru') throw new Error('unexpected_wordpress_site');
  const output = { source: siteUrl, mode: 'read_only', types: {}, errors: [] };
  for (const kind of ['posts', 'pages']) {
    const params = new URLSearchParams({
      per_page: String(Math.min(25, Math.max(1, maxPerType))),
      page: '1', status: 'publish',
      _fields: 'id,slug,status,link,modified,title'
    });
    try {
      const response = await fetchImpl(siteUrl + '/wp-json/wp/v2/' + kind + '?' + params, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('http_' + response.status);
      output.types[kind] = { status: 'ok', items: sanitizeWpItems(await response.json(), kind, siteUrl) };
    } catch (e) {
      output.types[kind] = { status: 'unverified', items: [] };
      output.errors.push({ kind, reason: String(e?.message || e).slice(0, 120) });
    }
  }
  return output;
}

export function makeFederationReport(manifest, wpResult, timestamp = new Date().toISOString()) {
  return {
    generated_at: timestamp,
    authority: 'snapshot_only_no_live_write',
    wordpress: { plugin: manifest.wordpress.active_plugin, public_snapshot: wpResult },
    cloudflare: {
      inventory_observed_at: manifest.documented_at,
      verified_service_ids: manifest.cloudflare.account_scoped_worker_ids,
      seven_bridge_service_bindings: manifest.cloudflare.existing_service_bindings,
      github_dispatch_status: manifest.cloudflare.github_webhook_or_dispatch,
      live_runtime_status: manifest.cloudflare.live_telemetry
    },
    gates: {
      production_publish: 'explicit_per_change_ceo_approval_required',
      agent_write_authority: 'not_provisioned_by_this_script',
      wp_git_sync_settings: 'unverified'
    }
  };
}

async function main() {
  const verb = process.argv[2];
  if (!['snapshot', 'inventory'].includes(verb)) {
    console.error('Usage: node scripts/quantdeus-federation-bridge.mjs snapshot|inventory [--out /tmp/report.json]');
    process.exitCode = 2;
    return;
  }
  const manifest = loadBridgeConfig();
  const outIndex = process.argv.indexOf('--out');
  const dest = outIndex < 0 ? null : process.argv[outIndex + 1];
  if (outIndex >= 0 && !dest) throw new Error('missing_output_path');
  const wp = verb === 'snapshot'
    ? await capturePublicWordPress({ siteUrl: manifest.wordpress.site, maxPerType: manifest.wordpress.public_rest.max_per_type })
    : { mode: 'not_queried', types: {}, errors: [] };
  const report = makeFederationReport(manifest, wp);
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (dest) {
    writeFileSync(dest, serialized);
    console.log('Federation bridge report written: ' + dest);
  } else {
    process.stdout.write(serialized);
  }
  if (wp.errors.length) console.warn('WP public REST snapshot unverified; no writes attempted.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(String(e.message || e)); process.exitCode = 1; });
}
