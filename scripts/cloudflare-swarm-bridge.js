'use strict';

// Мост наблюдения за Cloudflare. Без права выполнять команды.
const BRIDGE_URL = 'https://quantdeus-seven-bridge.quantdeus-galactic-swarm.workers.dev/api/status';
const ALLOWED_SWARMS = new Set(['github-office','galactic-metaverse','warp-research','warp-scheduler']);
const ALLOWED_STATES = new Set(['queued','researching','needs_human_review','qa_retry_pending','qa_rejected','worker_error']);
const boundedCount = value => Number.isSafeInteger(value) && value >= 0 && value < 1000000 ? value : 0;

function normalize(payload) {
  if (!payload || payload.schema_version !== 1 || payload.role !== 'seven-of-nine' ||
      payload.source_of_truth !== 'github' || payload.writes_enabled !== false ||
      !Array.isArray(payload.swarms)) throw new Error('INVALID_BRIDGE_CONTRACT');
  const services = {};
  for (const item of payload.swarms) {
    if (!item || !ALLOWED_SWARMS.has(item.id)) continue;
    services[item.id] = {
      connected: item.id === 'github-office'
        ? item.status === 'configured'
        : item.connected === true && item.responding === true
    };
  }
  const tasks = {};
  for (const [name,value] of Object.entries(payload.warp?.tasks || {})) {
    if (ALLOWED_STATES.has(name)) tasks[name] = boundedCount(value);
  }
  return {
    state: 'connected',
    control_mode: 'read_only_status',
    github_authority: true,
    services,
    warp_tasks: tasks,
    daily_ai_calls: boundedCount(payload.warp?.ai_daily_calls),
    latest_scheduler_outcome: typeof payload.warp?.latest_scheduler_outcome === 'string'
      ? payload.warp.latest_scheduler_outcome.slice(0,64) : 'unknown',
    scientific_review_required: true
  };
}

async function readSwarmStatus(fetcher = globalThis.fetch) {
  try {
    const response = await fetcher(BRIDGE_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return {state:'unreachable',reason:'HTTP_'+response.status};
    return normalize(await response.json());
  } catch (error) {
    return {state:'unreachable',reason:'BRIDGE_UNAVAILABLE'};
  }
}
module.exports = {readSwarmStatus,normalize,BRIDGE_URL};
