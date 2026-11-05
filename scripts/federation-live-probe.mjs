/**
 * QuantDeus Federation Live Probe
 * Read-only live check of a staging Worker. No credentials or site writes.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const FEDERATION_ENDPOINT = 'https://quantdeus-federation-staging.quantdeus-galactic-swarm.workers.dev/api/federation/status';

export function summarizeStatus(payload) {
  if (!payload || payload.bridge !== 'quantdeus-federation-staging' || payload.mode !== 'read_only') {
    throw new Error('wrong_bridge_or_mode');
  }
  if (!payload.components || typeof payload.components !== 'object') throw new Error('missing_components');
  const safe = {};
  for (const name of ['seven','metaverse','wordpress']) {
    const p = payload.components[name];
    if (!p || typeof p.responding !== 'boolean' || typeof p.configured !== 'boolean') {
      throw new Error('invalid_component_' + name);
    }
    safe[name] = {
      configured: p.configured, responding: p.responding,
      http_status: Number.isInteger(p.http_status) ? p.http_status : null,
      ...(name === 'wordpress' ? { route: ['direct_wp_rest','jetpack_public_api','unverified'].includes(p.route) ? p.route : 'unverified' } : {})
    };
  }
  if (payload.qdrp?.production_write !== false) throw new Error('live_write_must_be_disabled');
  return {
    checked_at: new Date().toISOString(),
    source: FEDERATION_ENDPOINT,
    verified_transport: true,
    status: Object.values(safe).every(x => x.responding) ? 'healthy' : 'degraded',
    components: safe,
    production_write: false,
    cloudflare_to_github_dispatch: 'not_configured',
    wordpress_git_sync_direction: 'unverified'
  };
}
export async function probeFederation(fetcher = fetch) {
  const r = await fetcher(FEDERATION_ENDPOINT, {
    method: 'GET', headers: {accept: 'application/json'},
    redirect: 'error', signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error('worker_http_' + r.status);
  const type = r.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('unexpected_response_type');
  const report = summarizeStatus(await r.json());
  const cloudflareWordPressReached = report.components.wordpress.responding;
  report.wordpress_from_cloudflare = cloudflareWordPressReached;

  // Network routes differ: Cloudflare→WordPress can fail while a GitHub runner
  // can read the same site's public Jetpack API. These are independent checks.
  if (!cloudflareWordPressReached) {
    const fallback = 'https://public-api.wordpress.com/rest/v1.1/sites/quantdeus.ru/posts/?number=1&fields=ID,URL';
    try {
      const wp = await fetcher(fallback, {
        method:'GET', headers:{accept:'application/json'},
        redirect:'error', signal:AbortSignal.timeout(9500)
      });
      const ctype = wp.headers.get('content-type') || '';
      if (wp.ok && ctype.includes('json')) {
        const payload = await wp.json();
        if (Array.isArray(payload?.posts)) {
          report.components.wordpress = {
            configured:true, responding:true, http_status:wp.status,
            route:'github_jetpack_public_api'
          };
          report.wordpress_from_github = true;
        }
      }
    } catch {
      report.wordpress_from_github = false;
    }
  } else {
    report.wordpress_from_github = null;
  }
  if (!report.components.wordpress.responding && report.wordpress_from_github === undefined) {
    report.wordpress_from_github = false;
  }
  report.status = Object.values(report.components).every(x=>x.responding) ? 'healthy' : 'degraded';
  return report;
}
async function main() {
  const index = process.argv.indexOf('--out');
  const out = index >= 0 ? process.argv[index+1] : null;
  try {
    const result = await probeFederation();
    const data = JSON.stringify(result, null, 2) + '\n';
    if (out) writeFileSync(out, data);
    else process.stdout.write(data);
    if (result.status !== 'healthy') process.exitCode = 1;
  } catch (err) {
    const report={ checked_at: new Date().toISOString(), source: FEDERATION_ENDPOINT, verified_transport:false, status:'unverified', error:String(err?.message||err).slice(0,150), production_write:false };
    if (out) writeFileSync(out, JSON.stringify(report, null, 2)+'\n');
    else process.stdout.write(JSON.stringify(report, null, 2)+'\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
