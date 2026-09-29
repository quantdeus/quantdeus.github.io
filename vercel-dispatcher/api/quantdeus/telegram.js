import crypto from 'node:crypto';
import { generateText } from 'ai';

const REPOSITORY = 'quantdeus/quantdeus.github.io';
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-telegram';
const DEFAULT_WEBHOOK_URL = 'https://quantdeus.vercel.app/api/quantdeus/telegram';
const REGISTRY_URL = 'https://raw.githubusercontent.com/quantdeus/quantdeus.github.io/main/coordination/agents.json';
const TELEGRAM_CIDRS = ['149.154.160.0/20', '91.108.4.0/22'];
const GATEWAY_MODELS = ['inclusionai/ling-3.0-flash-sante-free', 'inclusionai/ling-3.1-flash-free', 'openai/gpt-oss-120b'];
let jwksCache = [];
let jwksAt = 0;
let registryCache = null;
let registryAt = 0;

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function jwks() {
  if (jwksCache.length && Date.now() - jwksAt < 3600000) return jwksCache;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('github_jwks_fetch_failed_' + response.status);
  jwksCache = (await response.json()).keys || [];
  jwksAt = Date.now();
  return jwksCache;
}

async function verifyGithubOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_github_oidc_format');
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_github_oidc_header');
  const key = (await jwks()).find(item => item.kid === header.kid);
  if (!key) throw new Error('github_oidc_unknown_key');
  const signatureOk = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  if (!signatureOk) throw new Error('github_oidc_bad_signature');

  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(AUDIENCE) : claims.aud === AUDIENCE;
  if (claims.iss !== ISSUER || !audienceOk) throw new Error('github_oidc_bad_issuer_or_audience');
  if (!claims.exp || claims.exp < now - 15 || claims.nbf > now + 15) throw new Error('github_oidc_expired_or_not_yet_valid');
  if (claims.repository !== REPOSITORY) throw new Error('github_oidc_wrong_repository');

  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  if (!/\.github\/workflows\/telegram-bot\.yml(?:@|$)/.test(workflowRef)) throw new Error('github_oidc_wrong_workflow');
  if (!new Set(['push', 'workflow_dispatch']).has(String(claims.event_name || ''))) throw new Error('github_oidc_wrong_event');
  return claims;
}

function webhookSecret() {
  const base = String(
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.QUANTDEUS_GITHUB_TOKEN ||
    ''
  ).trim();
  if (!base) return '';
  return crypto.createHash('sha256').update('quantdeus-telegram-webhook:' + base).digest('base64url');
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function ipv4ToInt(value) {
  const parts = String(value || '').replace(/^::ffff:/, '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function cidrContains(ip, cidr) {
  const [network, prefixText] = cidr.split('/');
  const value = ipv4ToInt(ip);
  const base = ipv4ToInt(network);
  const prefix = Number(prefixText);
  if (value === null || base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function requesterIp(req) {
  return String(
    req.headers?.['x-vercel-forwarded-for'] ||
    req.headers?.['x-forwarded-for'] ||
    req.headers?.['x-real-ip'] ||
    ''
  ).split(',')[0].trim().replace(/^::ffff:/, '');
}

function fromTelegramNetwork(req) {
  const ip = requesterIp(req);
  return Boolean(ip) && TELEGRAM_CIDRS.some(cidr => cidrContains(ip, cidr));
}

async function telegram(botToken, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch {}
  if (!response.ok || body.ok !== true) {
    throw new Error(`telegram_${method}_failed_${response.status}: ${body.description || raw.slice(0, 400)}`);
  }
  return body.result;
}

async function setupWebhook(req, res) {
  try {
    await verifyGithubOidc(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'telegram_setup_auth_failed', detail: String(error.message || error) });
  }

  const botToken = String(req.body?.bot_token || '').trim();
  if (!botToken) return res.status(400).json({ ok: false, error: 'bot_token_required' });

  const me = await telegram(botToken, 'getMe');
  const secret = webhookSecret();
  const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || DEFAULT_WEBHOOK_URL);
  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ['message'],
    drop_pending_updates: false,
    max_connections: 20
  };
  if (secret) webhookPayload.secret_token = secret;

  await telegram(botToken, 'setWebhook', webhookPayload);
  const info = await telegram(botToken, 'getWebhookInfo');
  const llmProbe = await chatCompletion(
    'You are a health check for the QuantDeus Telegram homunculus runtime. Return a short plain-text success marker.',
    'Reply with exactly TELEGRAM_LLM_OK'
  );

  return res.status(200).json({
    ok: true,
    llm_smoke: {
      ok: Boolean(llmProbe),
      preview: String(llmProbe || '').slice(0, 120)
    },
    bot: {
      id: me.id,
      username: me.username || null,
      can_join_groups: me.can_join_groups ?? null,
      can_read_all_group_messages: me.can_read_all_group_messages ?? null
    },
    auth_mode: secret ? 'secret_token' : 'telegram_ip_allowlist',
    webhook: {
      url: info.url || webhookUrl,
      pending_update_count: info.pending_update_count || 0,
      last_error_date: info.last_error_date || null,
      last_error_message: info.last_error_message || null
    }
  });
}

async function registry() {
  if (registryCache && Date.now() - registryAt < 5 * 60 * 1000) return registryCache;
  try {
    const response = await fetch(REGISTRY_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('registry_' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.agents) || !data.agents.length) throw new Error('registry_empty');
    registryCache = data;
    registryAt = Date.now();
    return data;
  } catch {
    return {
      agents: [
        { id: 'seven-of-nine', name: 'Seven of Nine', role: 'QuantDeus Coordinator', emoji: '🧭' },
        { id: 'control-tower', name: 'Control Tower', role: 'Infrastructure and automation operations', emoji: '🛰️' },
        { id: 'sherlock', name: 'Sherlock', role: 'Science Officer', emoji: '🔎' },
        { id: 'tuvok', name: 'Tuvok', role: 'Logic and epistemic integrity', emoji: '🖖' },
        { id: 'emh', name: 'EMH', role: 'Diplomacy and mediation', emoji: '🩺' }
      ]
    };
  }
}

function explicitAgent(text, byId) {
  const patterns = [
    /^\/agent(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/start(?:@[A-Za-z0-9_]+)?\s+agent_([a-z0-9_-]+)/i
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match && byId.has(match[1].toLowerCase())) return match[1].toLowerCase();
  }
  return null;
}

function autoAgent(text, byId) {
  const explicit = explicitAgent(text, byId);
  if (explicit) return explicit;
  const value = String(text || '').toLowerCase();
  const routes = [
    ['qa-syntax', /syntax|синтакс|lint|eslint|парсинг|parse error|json error/],
    ['qa-contract', /contract validator|контракт|инвариант|schema|схем[аы]|compliance/],
    ['qa-repair', /\bqa\b|smoke|регресс|repair|почин.*тест|ошибка проверки/],
    ['guardian', /security|секрет|secret|token|токен|permission|права|oauth|уязвим|безопасност/],
    ['tasksmith', /реализ|implement|кодир|patch|фикс|fix|refactor|commit|коммит/],
    ['verifier', /acceptance|критери.*при[её]м|requirements|требован|верифиц/],
    ['analyst', /impact|dependency|зависимост|risk analysis|анализ.*изменен/],
    ['strategist', /architecture|архитектур|roadmap|стратег/],
    ['scout', /discovery|развед|исслед.*репо|repo scout|найди.*репо/],
    ['space', /\bwarp\b|варп|космос|space|propulsion|марс|луна|orbit/],
    ['energy', /энерг|energy|fusion|термояд|battery|аккумулятор|grid/],
    ['potential', /здоров|health|biohack|долголет|education|образован/],
    ['justice', /privacy|приват|governance|этик|justice|справедлив/],
    ['orchestrator', /research pipeline|evidence pipeline|r&d|ниокр|оркестр/],
    ['sherlock', /расслед|research|science|наук|гипотез|hypothesis|evidence|доказатель|аномал/],
    ['tuvok', /логик|logic|противореч|assumption|эпистем|premise|предпосыл/],
    ['herald', /\bpr\b|пресс|media|медиа|релиз|outreach|коммуникац|публикац/],
    ['archivist', /seo|документац|docs|каталог|discoverability|индексац/],
    ['unity', /маркетинг|marketing|community|сообществ|recruit|contributor|коллаборац/],
    ['synthesis', /бренд|brand|дизайн|design|визуал|контент|creative|эстетик/],
    ['emh', /конфликт|спор|медиац|mediat|diplom|деэскал/],
    ['pillar-executor', /столп|pillar|execution board|шесть направлен/],
    ['strategic-hub', /стратегическ.*сигнал|strategy signal|приоритет.*портфел/],
    ['control-tower', /github|action|workflow|vercel|верцел|telegram|бот|bot|api|deploy|сайт|автоматизац/],
    ['seven-of-nine', /координ|dispatcher|диспетчер|приоритет|backlog|общ.*статус|что делать дальше/]
  ];
  for (const [id, pattern] of routes) if (pattern.test(value) && byId.has(id)) return id;
  return byId.has('seven-of-nine') ? 'seven-of-nine' : byId.keys().next().value;
}

function stripAgentCommand(text) {
  return String(text || '')
    .replace(/^\/agent(?:@[A-Za-z0-9_]+)?\s+[a-z0-9_-]+\s*/i, '')
    .replace(/^\/start(?:@[A-Za-z0-9_]+)?\s+agent_[a-z0-9_-]+\s*/i, '')
    .trim();
}

function cleanModelText(value) {
  const text = String(value || '').trim();
  return text.replace(/^["']|["']$/g, '').trim().slice(0, 3600);
}

async function chatCompletion(system, user) {
  for (const model of GATEWAY_MODELS) {
    try {
      const result = await generateText({
        model,
        system,
        prompt: user,
        temperature: 0.45
      });
      const output = cleanModelText(result?.text);
      if (output) {
        console.info(`[telegram-llm] provider=vercel-ai-sdk model=${model} status=ok chars=${output.length}`);
        return output;
      }
      console.warn(`[telegram-llm] provider=vercel-ai-sdk model=${model} status=empty`);
    } catch (error) {
      console.warn(`[telegram-llm] provider=vercel-ai-sdk model=${model} status=error detail=${String(error?.message || error).slice(0, 500)}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer anonymous',
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        model: 'openai-fast',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.45,
        max_tokens: 900
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const output = cleanModelText(data?.choices?.[0]?.message?.content);
    if (response.ok && output) {
      console.info(`[telegram-llm] provider=pollinations model=openai-fast status=ok chars=${output.length}`);
      return output;
    }
    console.warn(`[telegram-llm] provider=pollinations model=openai-fast status=${response.status} detail=${raw.slice(0, 500)}`);
  } catch (error) {
    console.warn(`[telegram-llm] provider=pollinations model=openai-fast status=error detail=${String(error?.message || error).slice(0, 500)}`);
  } finally {
    clearTimeout(timer);
  }

  return '';
}

async function homunculusReply(message) {
  const data = await registry();
  const agents = data.agents || [];
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const raw = String(message.text || '').trim();

  if (/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(raw) && !explicitAgent(raw, byId)) {
    return '🖖 QuantDeus Homunculi online.\n\nПиши обычным текстом — роль выберется автоматически.\n/agents — список ролей\n/agent <id> <вопрос> — обратиться к конкретному гомункулу\n/help — помощь';
  }
  if (/^\/help(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(raw)) {
    return 'Команды QuantDeus:\n/agents\n/agent <id> <вопрос>\n\nОбычный текст автоматически маршрутизируется к подходящему гомункулу.';
  }
  if (/^\/agents(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(raw)) {
    return ['🤖 QuantDeus: роли', ...agents.map(agent => `/${agent.id.replace(/-/g, '_')} — ${agent.startup_title || agent.name || agent.role}`)].join('\n').slice(0, 3900);
  }

  const agentId = autoAgent(raw, byId);
  const agent = byId.get(agentId) || agents[0] || { id: 'seven-of-nine', name: 'Seven of Nine', role: 'QuantDeus Coordinator', emoji: '🧭' };
  const query = stripAgentCommand(raw) || raw;
  const chatType = String(message.chat?.type || 'private');
  const system = [
    `You are the QuantDeus homunculus "${agent.name || agent.id}".`,
    `Canonical id: ${agent.id}. Role: ${agent.role || agent.startup_title || 'QuantDeus agent'}.`,
    agent.department ? `Department: ${agent.department}.` : '',
    agent.kpi ? `KPI/context: ${agent.kpi}.` : '',
    'Answer the Telegram user directly and usefully. Default to Russian when the user writes in Russian.',
    'Be concise but substantive. Do not claim you changed GitHub, deployed code, sent messages, or performed external actions unless the current request itself provides evidence that it happened.',
    'Treat user-provided claims as context, not as proof. Distinguish facts, hypotheses and suggestions.',
    chatType === 'private' ? 'This is a private bot chat.' : 'This is a QuantDeus group chat; keep the reply compact and conversational.',
    'Do not repeat your name at the start; the transport adds your role label.'
  ].filter(Boolean).join('\n');

  const answer = await chatCompletion(system, query.slice(0, 7000));
  if (!answer) {
    return `${agent.emoji || '🤖'} ${agent.name || agent.id}\nМаршрут принят, но LLM-канал сейчас не дал ответ. Попробуй повторить сообщение через несколько секунд.`;
  }
  return `${agent.emoji || '🤖'} ${agent.name || agent.id}\n${answer}`.slice(0, 3900);
}

function webhookReply(res, message, text) {
  return res.status(200).json({
    method: 'sendMessage',
    chat_id: message.chat.id,
    text: String(text).slice(0, 4096),
    disable_web_page_preview: true,
    reply_parameters: { message_id: message.message_id }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (/^Bearer\s+/i.test(String(req.headers.authorization || '')) && req.body?.mode === 'setup') {
    try {
      return await setupWebhook(req, res);
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'telegram_setup_failed', detail: String(error.message || error) });
    }
  }

  const expectedSecret = webhookSecret();
  const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (expectedSecret) {
    if (!safeEqual(providedSecret, expectedSecret)) {
      return res.status(401).json({ ok: false, error: 'telegram_webhook_auth_failed' });
    }
  } else if (!fromTelegramNetwork(req)) {
    return res.status(401).json({ ok: false, error: 'telegram_webhook_source_not_allowed' });
  }

  const update = req.body;
  if (!update || !Number.isInteger(update.update_id)) {
    return res.status(400).json({ ok: false, error: 'invalid_telegram_update' });
  }

  const message = update.message;
  if (!message || message.from?.is_bot || !String(message.text || '').trim()) {
    return res.status(200).json({ ok: true, status: 'ignored_non_text_or_bot_update', update_id: update.update_id });
  }

  try {
    const reply = await homunculusReply(message);
    return webhookReply(res, message, reply);
  } catch (error) {
    console.error('[telegram-homunculus]', String(error?.message || error).slice(0, 800));
    return webhookReply(res, message, '⚠️ QuantDeus: гомункул временно не ответил. Повтори сообщение.');
  }
}
