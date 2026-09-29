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
const LIVE_RESEARCH_TIMEOUT_MS = 7000;
const LIVE_RESEARCH_MAX_ITEMS = 8;
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
  const researchProbe = await liveNewsResearch('OpenAI latest news');
  const roleProbe = await homunculusReply({
    text: 'Бро проверь состояние QuantDeus и коротко скажи, что сейчас важно проверить в автоматизации.',
    message_id: 1,
    from: { id: 1, username: 'telegram-smoke', is_bot: false },
    chat: { id: 1, type: 'private' }
  });

  return res.status(200).json({
    ok: true,
    llm_smoke: {
      ok: Boolean(llmProbe),
      preview: String(llmProbe || '').slice(0, 120)
    },
    role_smoke: {
      ok: Boolean(roleProbe) && !String(roleProbe).includes('LLM-канал сейчас не дал ответ'),
      preview: String(roleProbe || '').slice(0, 260)
    },
    research_smoke: {
      ok: Boolean(researchProbe?.ok),
      providers: researchProbe?.providers || [],
      item_count: researchProbe?.items?.length || 0,
      preview: researchProbe?.items?.[0]?.title || null
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

function needsLiveResearch(text) {
  const value = String(text || '').toLowerCase();
  const explicitNews = /новост|breaking|\bnews\b|дайджест|headline|сводк.*событ/;
  const freshness = /последн|сегодня|вчера|свеж|актуальн|подтверд|официальн|недавн|latest|today|yesterday|recent|current|confirmed?/;
  const publicEvent = /встреч|саммит|переговор|президент|правительств|бел(?:ый|ого)\s+дом|кремл|выбор|санкц|войн|рынок|курс|наук|технолог|openai|spacex|nasa|релиз|запуск|обновлен|произошл|случил/;
  return explicitNews.test(value) || (freshness.test(value) && publicEvent.test(value));
}

function xmlText(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function rssTag(block, tag) {
  const match = String(block || '').match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? xmlText(match[1]) : '';
}

function parseRss(xml, provider) {
  return [...String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, 20)
    .map(match => {
      const block = match[1];
      return {
        title: rssTag(block, 'title'),
        url: rssTag(block, 'link') || rssTag(block, 'guid'),
        published_at: rssTag(block, 'pubDate'),
        source: rssTag(block, 'source') || provider,
        provider
      };
    })
    .filter(item => item.title && item.url);
}

async function fetchRss(url, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_RESEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
        'user-agent': 'QuantDeus-LiveResearch/1.0'
      },
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(provider + '_http_' + response.status);
    return parseRss(raw, provider);
  } finally {
    clearTimeout(timer);
  }
}

async function liveNewsResearch(query) {
  const q = String(query || '').trim().slice(0, 700);
  if (!q) return { ok: false, items: [], providers: [] };
  const googleUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=ru&gl=RU&ceid=RU:ru';
  const bingUrl = 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=RSS&mkt=ru-RU';

  const settled = await Promise.allSettled([
    fetchRss(googleUrl, 'Google News'),
    fetchRss(bingUrl, 'Bing News')
  ]);
  const providerResults = settled.map((result, index) => ({
    provider: index === 0 ? 'Google News' : 'Bing News',
    ok: result.status === 'fulfilled',
    items: result.status === 'fulfilled' ? result.value : [],
    error: result.status === 'rejected' ? String(result.reason?.message || result.reason).slice(0, 220) : null
  }));

  const seen = new Set();
  const items = [];
  for (const result of providerResults) {
    for (const item of result.items) {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= LIVE_RESEARCH_MAX_ITEMS) break;
    }
    if (items.length >= LIVE_RESEARCH_MAX_ITEMS) break;
  }

  return {
    ok: items.length > 0,
    checked_at: new Date().toISOString(),
    providers: providerResults.map(({ provider, ok, error }) => ({ provider, ok, error })),
    items
  };
}

function liveResearchBlock(research) {
  if (!research?.ok || !research.items?.length) return 'LIVE_RESEARCH_UNAVAILABLE';
  const lines = research.items.map((item, index) =>
    '[' + (index + 1) + '] ' + item.title +
    ' | source=' + item.source +
    ' | published=' + (item.published_at || 'unknown') +
    ' | url=' + item.url
  );
  return [
    'LIVE_RESEARCH',
    'checked_at=' + research.checked_at,
    ...lines,
    'END_LIVE_RESEARCH'
  ].join('\n');
}

function groundedResearchFallback(research) {
  const items = Array.isArray(research?.items) ? research.items.slice(0, 4) : [];
  if (!items.length) return 'LIVE_RESEARCH_UNAVAILABLE';
  return [
    'Свежие источники получены, но LLM-синтез временно недоступен.',
    'Ниже — выдача источников без пересказа и без додумывания:',
    '',
    ...items.flatMap((item, index) => [
      '[' + (index + 1) + '] ' + item.title,
      (item.source || item.provider || 'source') + ' · ' + (item.published_at || 'дата не указана'),
      item.url,
      ''
    ])
  ].join('\n').trim().slice(0, 3400);
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
  if (needsLiveResearch(text) && byId.has('seven-of-nine')) return 'seven-of-nine';
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

async function pollinationsFallback(system, user) {
  const compactPrompt = [
    String(system || '').slice(0, 80),
    '',
    'USER:',
    String(user || '').slice(0, 180)
  ].join('\n').slice(0, 3200);

  const runWithTimeout = async (label, fn) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const output = cleanModelText(await fn(controller.signal));
      if (!output) throw new Error('empty_output');
      console.info(`[telegram-llm] provider=${label} status=ok chars=${output.length}`);
      return output;
    } catch (error) {
      console.warn(`[telegram-llm] provider=${label} status=error detail=${String(error?.message || error).slice(0, 300)}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const candidates = [
    runWithTimeout('pollinations-chat-openai', async signal => {
      const response = await fetch('https://text.pollinations.ai/openai/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer anonymous',
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: String(system || '').slice(0, 90) },
            { role: 'user', content: String(user || '').slice(0, 220) }
          ],
          temperature: 0.45,
          max_tokens: 96
        }),
        signal
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`http_${response.status}: ${raw.slice(0, 200)}`);
      let data = {};
      try { data = JSON.parse(raw); } catch {}
      return data?.choices?.[0]?.message?.content || '';
    }),
    runWithTimeout('pollinations-text-openai', async signal => {
      const url = 'https://text.pollinations.ai/' + encodeURIComponent(compactPrompt) + '?model=openai';
      const response = await fetch(url, { method: 'GET', headers: { accept: 'text/plain' }, signal });
      const raw = await response.text();
      if (!response.ok) throw new Error(`http_${response.status}: ${raw.slice(0, 200)}`);
      return raw;
    }),
    runWithTimeout('pollinations-gen-gpt4o-mini', async signal => {
      const url = 'https://gen.pollinations.ai/text/' + encodeURIComponent(compactPrompt) + '?model=openai/gpt-4o-mini';
      const response = await fetch(url, { method: 'GET', headers: { accept: 'text/plain' }, signal });
      const raw = await response.text();
      if (!response.ok) throw new Error(`http_${response.status}: ${raw.slice(0, 200)}`);
      return raw;
    })
  ];

  try {
    return await Promise.any(candidates);
  } catch {
    return '';
  }
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

  return pollinationsFallback(system, user);
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
  const researchRequired = needsLiveResearch(query);
  const research = researchRequired ? await liveNewsResearch(query) : null;
  if (researchRequired && !research?.ok) {
    console.warn('[telegram-live-research] status=unavailable providers=' + JSON.stringify(research?.providers || []));
    return `${agent.emoji || '🤖'} ${agent.name || agent.id}\nLIVE_RESEARCH_UNAVAILABLE\nСвежие источники сейчас недоступны. Я не буду придумывать новости, даты, места или официальные подтверждения.`;
  }
  if (researchRequired) {
    console.info('[telegram-live-research] status=ok items=' + research.items.length + ' providers=' + JSON.stringify(research.providers || []));
  }
  const system = [
    `You are the QuantDeus homunculus "${agent.name || agent.id}".`,
    `Canonical id: ${agent.id}. Role: ${agent.role || agent.startup_title || 'QuantDeus agent'}.`,
    agent.department ? `Department: ${agent.department}.` : '',
    agent.kpi ? `KPI/context: ${agent.kpi}.` : '',
    'Answer the Telegram user directly and usefully. Default to Russian when the user writes in Russian.',
    'Be concise but substantive. Do not claim you changed GitHub, deployed code, sent messages, or performed external actions unless the current request itself provides evidence that it happened.',
    'Treat user-provided claims as context, not as proof. Distinguish facts, hypotheses and suggestions.',
    'Never invent current events, dates, places, quotations, source attributions, official confirmations, meeting plans or links. Never present a hypothetical example as if it were a real event.',
    researchRequired
      ? 'This request requires live research. Use only facts supported by the LIVE_RESEARCH block supplied with the user message. Cite supporting items inline as [1], [2], etc. If evidence is ambiguous or conflicting, say so explicitly.'
      : 'For non-live requests, do not pretend that model memory is a real-time source.',
    chatType === 'private' ? 'This is a private bot chat.' : 'This is a QuantDeus group chat; keep the reply compact and conversational.',
    'Do not repeat your name at the start; the transport adds your role label.'
  ].filter(Boolean).join('\n');

  const groundedQuery = researchRequired
    ? [query.slice(0, 5200), '', liveResearchBlock(research)].join('\n')
    : query.slice(0, 7000);
  const answer = await chatCompletion(system, groundedQuery);
  if (!answer) {
    if (researchRequired && research?.ok) {
      return `${agent.emoji || '🤖'} ${agent.name || agent.id}\n${groundedResearchFallback(research)}`;
    }
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
