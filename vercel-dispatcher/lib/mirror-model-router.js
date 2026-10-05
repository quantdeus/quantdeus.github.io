const DEFAULT_TIMEOUT_MS = 8000;

function candidate(id, keyEnv, key, model, endpoint, priority) {
  const apiKey = String(key || '').trim();
  const modelId = String(model || '').trim();
  const url = String(endpoint || '').trim();
  if (!apiKey || !modelId || !url) return null;
  return { id, keyEnv, key: apiKey, model: modelId, endpoint: url, priority, ref: id + '/' + modelId };
}

export function buildMirrorCandidates(env = process.env) {
  const rows = [];
  const push = value => { if (value) rows.push(value); };

  push(candidate('quantdeus-cerebras','CEREBRAS_API_KEY',env.CEREBRAS_API_KEY,env.CEREBRAS_MODEL || 'gpt-oss-120b','https://api.cerebras.ai/v1/chat/completions',10));
  push(candidate('quantdeus-groq','GROQ_API_KEY',env.GROQ_API_KEY,env.GROQ_MODEL || 'openai/gpt-oss-120b','https://api.groq.com/openai/v1/chat/completions',20));
  push(candidate('quantdeus-fireworks','FIREWORKS_API_KEY',env.FIREWORKS_API_KEY,env.FIREWORKS_MODEL || 'accounts/fireworks/models/glm-5p3-flash','https://api.fireworks.ai/inference/v1/chat/completions',30));
  push(candidate('quantdeus-deepinfra','DEEPINFRA_API_KEY',env.DEEPINFRA_API_KEY || env.DEEPINFRA_TOKEN,env.DEEPINFRA_MODEL || 'XiaomiMiMo/MiMo-V2.6-Flash','https://api.deepinfra.com/v1/openai/chat/completions',40));
  push(candidate('quantdeus-together','TOGETHER_API_KEY',env.TOGETHER_API_KEY,env.TOGETHER_MODEL || 'MiniMaxAI/MiniMax-M3','https://api.together.ai/v1/chat/completions',50));
  push(candidate('quantdeus-gemini','GEMINI_API_KEY',env.GEMINI_API_KEY,env.GEMINI_MODEL || 'gemini-3.8-flash','https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',60));
  push(candidate('quantdeus-nvidia','NVIDIA_API_KEY',env.NVIDIA_API_KEY,env.NVIDIA_MODEL || 'openai/gpt-oss-120b','https://integrate.api.nvidia.com/v1/chat/completions',70));
  push(candidate('quantdeus-xai','XAI_API_KEY',env.XAI_API_KEY,env.XAI_MODEL || 'grok-4.7','https://api.x.ai/v1/chat/completions',80));

  const cfAccount = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (cfAccount) {
    push(candidate('quantdeus-cloudflare','CLOUDFLARE_API_KEY',env.CLOUDFLARE_API_KEY,env.CLOUDFLARE_MODEL || '@cf/zai-org/glm-4.7-flash','https://api.cloudflare.com/client/v4/accounts/' + cfAccount + '/ai/v1/chat/completions',90));
  }

  push(candidate('quantdeus-openrouter','OPENROUTER_API_KEY',env.OPENROUTER_API_KEY,env.OPENROUTER_MODEL || env.QD_LLM_MODEL || 'openrouter/free','https://openrouter.ai/api/v1/chat/completions',100));

  const hermesBase = String(env.HERMES_LOCAL_BASE_URL || '').trim().replace(/\/+$/, '');
  const hermesKey = String(env.HERMES_LOCAL_API_KEY || '').trim();
  const hermesModel = String(env.HERMES_CLOUD_MODEL || env.HERMES_MODEL || '').trim();
  if (hermesBase && hermesKey && hermesModel) {
    push(candidate('quantdeus-hermes','HERMES_LOCAL_API_KEY',hermesKey,hermesModel,hermesBase + '/chat/completions',25));
  }

  push(candidate(
    'quantdeus-pollinations',
    'POLLINATIONS_API_KEY',
    env.POLLINATIONS_API_KEY || 'anonymous',
    env.POLLINATIONS_MODEL || 'openai',
    'https://text.pollinations.ai/openai',
    1000
  ));

  return rows.sort((a,b) => a.priority - b.priority);
}

async function postJson(route, body, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(route.endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + route.key,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    return { ok: response.ok, status: response.status, raw, data };
  } catch (error) {
    return { ok: false, status: 0, raw: String(error?.message || error), data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeMirrorProviders(candidates, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const rows = await Promise.all((candidates || []).map(async route => {
    const result = await postJson(route, {
      model: route.model,
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      temperature: 0,
      max_tokens: 8
    }, fetchImpl, timeoutMs);
    const text = typeof result.data?.choices?.[0]?.message?.content === 'string'
      ? result.data.choices[0].message.content.trim()
      : '';
    return {
      ref: route.ref,
      route,
      ok: result.ok && text === 'OK',
      status: result.status,
      detail: result.ok ? (text === 'OK' ? 'exact_ok' : 'unexpected_response') : result.raw.slice(0, 240)
    };
  }));
  return rows;
}

export async function callMirrorJsonRole({
  routes,
  name,
  system,
  prompt,
  fetchImpl = fetch,
  timeoutMs = 14000
}) {
  const failures = [];
  for (const route of routes || []) {
    const result = await postJson(route, {
      model: route.model,
      messages: [
        {
          role: 'system',
          content: [
            'You are ' + name + ' in the QuantDeus independent Mirror Swarm repair plane.',
            'GitHub quantdeus/quantdeus.github.io main is the canonical source of truth.',
            'You diagnose software/runtime defects, not people.',
            String(system || '').trim(),
            'Never expose secrets or invent evidence.',
            'Never weaken authentication, RBAC, QA, branch protection, human approval, or protected policy to make a check green.',
            'Return only the requested strict JSON object.'
          ].join('\n')
        },
        { role: 'user', content: String(prompt || '') }
      ],
      temperature: 0,
      max_tokens: 2200
    }, fetchImpl, timeoutMs);

    const text = typeof result.data?.choices?.[0]?.message?.content === 'string'
      ? result.data.choices[0].message.content.trim()
      : '';
    if (result.ok && text) return { text, route };
    failures.push({ ref: route.ref, status: result.status, detail: result.raw.slice(0, 240) });
  }

  const error = new Error('mirror_no_healthy_provider');
  error.failures = failures;
  throw error;
}
