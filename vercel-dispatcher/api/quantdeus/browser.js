const REPO = 'quantdeus/quantdeus.github.io';

function authorized(req) {
  const secret = process.env.BROWSER_DISPATCH_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers?.authorization || '') === 'Bearer ' + secret;
}

function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\*\./, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  return !!(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

function validateTask(task) {
  if (!task || task.version !== 1) throw new Error('unsupported_manifest_version');
  if (!['steps', 'chat'].includes(task.mode)) throw new Error('mode_must_be_steps_or_chat');

  const url = new URL(task.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http_https_only');
  if (isPrivateHost(url.hostname)) throw new Error('private_network_targets_blocked');

  const allowed = Array.isArray(task.allowed_domains) && task.allowed_domains.length
    ? task.allowed_domains.map(String)
    : [url.hostname, url.hostname.startsWith('www.') ? url.hostname.slice(4) : 'www.' + url.hostname];

  if (allowed.some(isPrivateHost)) throw new Error('private_allowed_domain_blocked');
  if (task.mode === 'steps' && (!Array.isArray(task.actions) || !task.actions.length || task.actions.length > 30)) {
    throw new Error('steps_mode_requires_1_to_30_actions');
  }
  if (task.mode === 'chat' && !String(task.instruction || '').trim()) throw new Error('chat_mode_requires_instruction');

  const serialized = JSON.stringify(task);
  if (/"(?:password|token|secret|api[_-]?key|private[_-]?key)"\s*:/i.test(serialized)) {
    throw new Error('secrets_must_not_be_sent_in_request_use_value_env_slots');
  }

  return { ...task, allowed_domains: allowed };
}

async function github(path, options = {}) {
  const token = process.env.QUANTDEUS_GITHUB_TOKEN;
  if (!token) throw new Error('QUANTDEUS_GITHUB_TOKEN_missing');
  const response = await fetch('https://api.github.com/repos/' + REPO + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer ' + token,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error('GitHub ' + response.status + ': ' + (typeof body === 'string' ? body : JSON.stringify(body)));
  return body;
}

function shortTitle(value) {
  return String(value || 'Browser task').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'browser_dispatch_auth_failed' });

  try {
    const task = validateTask(req.body?.task || req.body);
    const title = shortTitle(req.body?.title || task.instruction || task.url);
    const issueBody = [
      '## 🌐 Browser Homunculus task',
      '',
      'Created by the protected Vercel dispatcher. GitHub remains the source of truth.',
      '',
      '<!-- qd-browser-task:start -->',
      '~~~json',
      JSON.stringify(task, null, 2),
      '~~~',
      '<!-- qd-browser-task:end -->',
      '',
      '### Runtime rules',
      '- Use only the declared allowed domains.',
      '- Credentials must come from GitHub Actions Secrets via value_env slots.',
      '- Stop for CAPTCHA, 2FA, passkeys, SMS/email verification, payments or other human gates.',
      '- Never claim success unless the workflow posts a completed result.'
    ].join('\n');

    const issue = await github('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: '[BROWSER] ' + title,
        body: issueBody,
        labels: ['governance:passed', 'coord:task', 'coord:ready', 'agent:control-tower']
      })
    });

    return res.status(201).json({
      ok: true,
      status: 'browser_task_queued',
      issue: {
        number: issue.number,
        html_url: issue.html_url
      }
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: 'browser_task_rejected',
      detail: String(error?.message || error)
    });
  }
}
