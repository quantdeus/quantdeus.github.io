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
      http_status: Number.isInteger(p.http_status) ? p.http_status : null
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
  return summarizeStatus(await r.json());
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
