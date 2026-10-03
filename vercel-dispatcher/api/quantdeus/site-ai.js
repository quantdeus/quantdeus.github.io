import { getVercelOidcToken } from '@vercel/oidc';

const VERIFY_URL = 'https://quantdeus.whf.bz/wp-json/quantdeus/v1/ai-fleet/verify-token';
const OPENCLAW_URL = 'https://quantdeus.vercel.app/api/quantdeus/openclaw';
const OIDC_AUDIENCE = 'quantdeus-internal-openclaw';

function clean(value, max = 6000) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function routeAgent(text) {
  const value = String(text || '').toLowerCase();
  const routes = [
    ['qa-repair', /\bqa\b|smoke|регресс|тест|ошибк|баг|сломал|repair/],
    ['guardian', /security|безопас|секрет|token|токен|oauth|permission|права/],
    ['tasksmith', /код|реализ|implement|fix|почин|refactor|commit|программ/],
    ['verifier', /провер|verify|acceptance|критери|требован/],
    ['analyst', /анализ|impact|dependency|зависим|risk|риск/],
    ['strategist', /стратег|архитектур|roadmap|план/],
    ['space', /warp|варп|космос|space|propulsion|двигател|марс|луна/],
    ['energy', /энерг|energy|fusion|термояд|battery|аккумулятор/],
    ['potential', /health|здоров|biohack|долголет|образован/],
    ['justice', /privacy|приват|governance|этик|справедлив/],
    ['sherlock', /research|исслед|наук|гипотез|evidence|доказатель|расслед/],
    ['tuvok', /логик|logic|противореч|assumption|предпосыл/],
    ['herald', /pr|пресс|media|медиа|релиз|outreach|публикац/],
    ['archivist', /seo|документац|docs|индексац/],
    ['unity', /маркетинг|marketing|community|сообществ|recruit|партн/],
    ['synthesis', /бренд|brand|дизайн|design|визуал|контент|creative/],
    ['emh', /конфликт|медиац|mediat|diplom|деэскал/],
    ['control-tower', /github|action|workflow|vercel|telegram|бот|api|deploy|сайт|wordpress|автоматизац/]
  ];
  for (const [id, pattern] of routes) if (pattern.test(value)) return id;
  return 'seven-of-nine';
}

async function verifyWordPressToken(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (!response.ok || data?.ok !== true) {
      const error = new Error('site_ai_wordpress_verification_failed');
      error.status = response.status || 401;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function askOpenClaw(profile, prompt, entitlement) {
  const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
  if (!oidc) throw new Error('site_ai_vercel_oidc_missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch(OPENCLAW_URL, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + oidc,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        profile,
        execution_mode: 'chat',
        metadata: {
          source: 'site-internal',
          entitlement: entitlement.plan,
          entitlement_source: entitlement.source || 'wordpress',
          user_ref: 'wp:' + String(entitlement.user_id || 'unknown')
        },
        messages: [
          {
            role: 'system',
            content:
              'You are serving an authenticated QuantDeus website user. ' +
              'Their entitlement is ' + String(entitlement.plan || 'free').toUpperCase() + '. ' +
              'Answer directly in the user language. This website lane is chat-only: do not claim external writes or privileged actions.'
          },
          { role: 'user', content: prompt }
        ]
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const output = clean(data?.text, 12000);
    if (!response.ok || !output) throw new Error('site_ai_openclaw_' + response.status);
    return { text: output, model: data?.model || null };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const token = clean(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), 200);
  const message = clean(req.body?.message, 6000);
  if (!token) return res.status(401).json({ ok: false, error: 'site_token_required' });
  if (message.length < 2) return res.status(400).json({ ok: false, error: 'message_required' });

  try {
    const entitlement = await verifyWordPressToken(token);
    const role = routeAgent(message);
    const answer = await askOpenClaw(role, message, entitlement);
    return res.status(200).json({
      ok: true,
      plan: entitlement.plan || 'free',
      source: entitlement.source || 'wordpress',
      role,
      text: answer.text,
      model: answer.model
    });
  } catch (error) {
    const status = Number(error?.status) || 503;
    console.error('[site-ai]', String(error?.message || error).slice(0, 500));
    return res.status(status >= 400 && status < 600 ? status : 503).json({
      ok: false,
      error: status === 401 ? 'site_auth_failed' : 'site_ai_unavailable'
    });
  }
}
