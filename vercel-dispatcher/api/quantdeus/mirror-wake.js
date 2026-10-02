const REPOSITORY = 'quantdeus/quantdeus.github.io';
const WORKFLOW = 'mirror-swarm-repair.yml';
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '');
  const auth = String(req.headers?.authorization || '');
  return Boolean(secret) && auth === 'Bearer ' + secret;
}

async function github(path, options = {}) {
  const token = String(process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  if (!token) {
    const error = new Error('mirror_wake_github_token_missing');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://api.github.com/repos/' + REPOSITORY + path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}

  if (!response.ok) {
    const error = new Error('github_' + response.status + ': ' + raw.slice(0, 600));
    error.status = response.status;
    throw error;
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: 'mirror_wake_auth_failed' });
  }

  try {
    const runs = await github('/actions/workflows/' + WORKFLOW + '/runs?branch=main&per_page=10');
    const active = (runs?.workflow_runs || []).find(run => ACTIVE.has(String(run.status || '')));
    if (active) {
      return res.status(200).json({
        ok: true,
        action: 'skip_active',
        workflow: WORKFLOW,
        active_run_id: active.id,
        active_status: active.status
      });
    }

    const requestedMode = req.method === 'POST' && req.body?.mode === 'shadow' ? 'shadow' : 'repair';
    const wakeSource = req.method === 'POST' && req.body?.wake_source
      ? String(req.body.wake_source).slice(0, 80)
      : 'vercel-cron';

    await github('/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          mode: requestedMode,
          wake_source: wakeSource
        }
      })
    });

    return res.status(202).json({
      ok: true,
      action: 'workflow_dispatch',
      workflow: WORKFLOW,
      ref: 'main',
      mode: requestedMode,
      wake_source: wakeSource,
      schedule: String(req.headers?.['x-vercel-cron-schedule'] || '')
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      error: 'mirror_wake_failed',
      detail: String(error?.message || error).slice(0, 800)
    });
  }
}
