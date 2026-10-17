// QuantDeus 10,000-slot logical swarm planner. Pure, offline and zero-inference.
export const MAX_AGENTS = 10000;

export function validateConfig(config) {
  if (!config || config.schema_version !== 1 ||
      config.max_virtual_agents !== MAX_AGENTS ||
      !Number.isInteger(config.batch_size) || config.batch_size < 1 ||
      config.batch_size > 256 ||
      !Array.isArray(config.lanes) || config.lanes.length < 2 ||
      new Set(config.lanes.map(l => l.id)).size !== config.lanes.length ||
      config.max_real_llm_workers !== 0 ||
      config.new_spend_rub_limit !== 0 ||
      config.external_publication !== 'disabled' ||
      config.paid_model_calls !== 'disabled') {
    throw new Error('Agent Empire configuration violates zero-spend or safety invariants');
  }
  return config;
}

export function requestedSlots(value, config) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > config.max_virtual_agents) {
    throw new Error('Requested virtual slots must be integers in the range 1..10000');
  }
  return n;
}

export function* enumerateVirtualAgents(config, count = config.max_virtual_agents) {
  validateConfig(config);
  count = requestedSlots(count, config);
  for (let i = 0; i < count; i += 1) {
    const lane = config.lanes[i % config.lanes.length];
    yield Object.freeze({
      id: 'qd-virtual-' + String(i + 1).padStart(5, '0'),
      lane: lane.id,
      coordinator: lane.lead,
      mode: 'planned-only',
      permitted_capabilities: ['offline-plan', 'draft'],
      model_session: null,
      social_account: null
    });
  }
}

export function planSwarm(config, count = MAX_AGENTS) {
  validateConfig(config);
  count = requestedSlots(count, config);
  const lanes = Object.fromEntries(config.lanes.map(l => [l.id, 0]));
  const batches = [];
  const samples = [];
  let previousId = '';
  for (const agent of enumerateVirtualAgents(config, count)) {
    if (agent.id <= previousId) throw new Error('Non-monotonic virtual agent id');
    previousId = agent.id;
    lanes[agent.lane] += 1;
    const index = Number(agent.id.slice(-5));
    if ((index - 1) % config.batch_size === 0) {
      batches.push({
        batch: batches.length + 1,
        first: index,
        last: Math.min(count, index + config.batch_size - 1),
        state: 'planned-not-executed'
      });
    }
    if (index <= 3 || index > count - 3) samples.push(agent);
  }
  return {
    program: config.name,
    status: 'offline-plan-only',
    virtual_agent_slots: count,
    batch_count: batches.length,
    batch_size: config.batch_size,
    counts_by_lane: lanes,
    batch_samples: batches.length <= 4 ? batches : [batches[0], batches[1], batches[batches.length - 2], batches[batches.length - 1]],
    virtual_agent_samples: samples,
    real_model_sessions_started: 0,
    external_posts_sent: 0,
    actual_impressions: null,
    acquired_clients: null,
    verified_revenue_rub: null,
    incremental_model_spend_rub: 0,
    warning: '10,000 logical slots are deterministic planning records, not 10,000 running AI models.'
  };
}

export function forbidSideEffects(action) {
  throw new Error('DENY: external side effect ' + String(action).slice(0, 64) + ' requires a separate explicitly approved implementation');
}
