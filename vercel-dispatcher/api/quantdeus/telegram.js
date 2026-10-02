import crypto from 'node:crypto';
import { generateText } from 'ai';
import { getVercelOidcToken } from '@vercel/oidc';
import {
  issueTelegramBotAssertion,
  telegramReturnUrl,
  verifyTelegramLoginRequest
} from '../../lib/telegram-bot-auth.js';

const REPOSITORY = 'quantdeus/quantdeus.github.io';
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-telegram';
const DEFAULT_WEBHOOK_URL = 'https://quantdeus.vercel.app/api/quantdeus/telegram';
const REGISTRY_URL = 'https://raw.githubusercontent.com/quantdeus/quantdeus.github.io/main/coordination/agents.json';
const TELEGRAM_CIDRS = ['149.154.160.0/20', '91.108.4.0/22'];
const LIVE_RESEARCH_TIMEOUT_MS = 7000;
const LIVE_RESEARCH_MAX_ITEMS = 8;
let jwksCache = [];
let jwksAt = 0;
let registryCache = null;
let registryAt = 0;
let quantdeusSnapshotCache = null;
let quantdeusSnapshotAt = 0;

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
  const researchProbe = await liveNewsResearch('OpenAI latest news');
  // Keep setup smoke to one LLM request. Anonymous fallback providers can throttle
  // back-to-back calls, which made a healthy role route look broken immediately
  // after the standalone LLM probe.
  const roleProbe = await homunculusReply({
    text: '/agent control-tower Ответь ровно TELEGRAM_ROLE_OK.',
    message_id: 1,
    from: { id: 1, username: 'telegram-smoke', is_bot: false },
    chat: { id: 1, type: 'private' }
  });
  const roleProbeHealthy =
    Boolean(roleProbe) &&
    !String(roleProbe).includes('LLM-канал сейчас не дал ответ') &&
    !String(roleProbe).includes('гомункул временно не ответил');
  const llmProbe = roleProbeHealthy ? 'TELEGRAM_LLM_OK' : '';

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


function githubLabels(issue) {
  return (issue?.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean);
}

function githubTaskState(issue) {
  const labels = githubLabels(issue);
  if (labels.includes('coord:blocked')) return 'BLOCKED';
  if (labels.includes('coord:active')) return 'ACTIVE';
  if (labels.includes('coord:done')) return 'DONE';
  if (labels.includes('coord:ready')) return 'READY';
  return 'OPEN';
}

async function githubRead(path) {
  const token = String(process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28'
  };
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await fetch('https://api.github.com/repos/' + REPOSITORY + path, { headers });
  const raw = await response.text();
  if (!response.ok) throw new Error('github_grounding_' + response.status + ': ' + raw.slice(0, 300));
  return raw ? JSON.parse(raw) : {};
}

async function quantdeusSnapshot(agentId) {
  try {
    if (!quantdeusSnapshotCache || Date.now() - quantdeusSnapshotAt > 45 * 1000) {
      const [commit, issueRows, pullRows, actionRows] = await Promise.all([
        githubRead('/commits/main'),
        githubRead('/issues?state=open&per_page=100'),
        githubRead('/pulls?state=open&per_page=100'),
        githubRead('/actions/runs?branch=main&per_page=20')
      ]);
      const issues = (issueRows || []).filter(item => !item.pull_request).map(item => ({
        number: item.number,
        title: item.title,
        labels: githubLabels(item).slice(0, 12),
        state: githubTaskState(item),
        updated_at: item.updated_at,
        url: item.html_url
      }));
      const tasks = issues.filter(item => item.labels.includes('coord:task'));
      const pulls = (pullRows || []).map(item => ({
        number: item.number,
        title: item.title,
        draft: Boolean(item.draft),
        updated_at: item.updated_at,
        head: item.head?.ref || null,
        base: item.base?.ref || null,
        url: item.html_url
      })).slice(0, 20);
      const runs = (actionRows?.workflow_runs || []).map(run => ({
        id: run.id,
        name: run.name,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        head_sha: run.head_sha,
        created_at: run.created_at,
        url: run.html_url
      })).slice(0, 12);
      quantdeusSnapshotCache = {
        repository: REPOSITORY,
        observed_at: new Date().toISOString(),
        source: 'GitHub REST read-only',
        main: {
          sha: commit?.sha || null,
          committed_at: commit?.commit?.committer?.date || null,
          message: String(commit?.commit?.message || '').split('\n')[0].slice(0, 180)
        },
        task_counts: {
          total: tasks.length,
          ready: tasks.filter(item => item.labels.includes('coord:ready')).length,
          active: tasks.filter(item => item.labels.includes('coord:active')).length,
          blocked: tasks.filter(item => item.labels.includes('coord:blocked')).length
        },
        open_issue_count: issues.length,
        open_pr_count: pulls.length,
        action_health: {
          sampled_main_runs: runs.length,
          success: runs.filter(run => run.conclusion === 'success').length,
          failure: runs.filter(run => run.conclusion === 'failure').length,
          in_progress: runs.filter(run => run.status === 'in_progress' || run.status === 'queued').length
        },
        issues,
        pulls,
        runs
      };
      quantdeusSnapshotAt = Date.now();
    }

    const base = quantdeusSnapshotCache;
    const relevant = base.issues
      .filter(item => {
        if (item.labels.includes('agent:' + agentId)) return true;
        if ((agentId === 'seven-of-nine' || agentId === 'coordinator') && item.labels.includes('coord:task')) return true;
        return false;
      })
      .slice(0, 12);
    return {
      repository: base.repository,
      observed_at: base.observed_at,
      source: base.source,
      main: base.main,
      task_counts: base.task_counts,
      open_issue_count: base.open_issue_count,
      open_pr_count: base.open_pr_count,
      action_health: base.action_health,
      relevant_issues: relevant,
      recent_open_prs: base.pulls.slice(0, 10),
      recent_main_actions: base.runs
    };
  } catch (error) {
    return {
      repository: REPOSITORY,
      observed_at: new Date().toISOString(),
      source: 'GitHub REST read-only',
      status: 'UNAVAILABLE',
      error: String(error?.message || error).slice(0, 300)
    };
  }
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

function feedLink(block) {
  const textLink = rssTag(block, 'link');
  if (textLink) return textLink;
  const href = String(block || '').match(/<link\b[^>]*\bhref=(["'])(.*?)\1[^>]*\/?\s*>/i);
  return href ? xmlText(href[2]) : (rssTag(block, 'guid') || rssTag(block, 'id'));
}

function parseRss(xml, provider) {
  const raw = String(xml || '');
  let blocks = [...raw.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (!blocks.length) blocks = [...raw.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  return blocks
    .slice(0, 24)
    .map(match => {
      const block = match[1];
      return {
        title: rssTag(block, 'title'),
        url: feedLink(block),
        published_at: rssTag(block, 'pubDate') || rssTag(block, 'published') || rssTag(block, 'updated'),
        source: rssTag(block, 'source') || rssTag(block, 'author') || provider,
        provider
      };
    })
    .filter(item => item.title && item.url);
}

function parseJsonFeed(raw, provider) {
  let data = {};
  try { data = JSON.parse(String(raw || '')); } catch { return []; }
  const rows = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.articles)
      ? data.articles
      : [];
  return rows
    .slice(0, 24)
    .map(item => ({
      title: xmlText(item?.title || item?.name || ''),
      url: String(item?.url || item?.external_url || item?.id || '').trim(),
      published_at: String(item?.date_published || item?.date_modified || item?.seendate || item?.published_at || '').trim(),
      source: String(item?._source_name || item?.source || item?.domain || provider).trim(),
      provider
    }))
    .filter(item => item.title && /^https?:\/\//i.test(item.url));
}

async function fetchNewsSource(url, provider, parser, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_RESEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: accept || 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
        'user-agent': 'QuantDeus-LiveResearch/1.1'
      },
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(provider + '_http_' + response.status);
    const items = parser(raw, provider);
    if (!items.length) {
      const type = String(response.headers.get('content-type') || 'unknown').split(';')[0];
      throw new Error(provider + '_empty_feed_' + type.replace(/[^a-z0-9.+-]/gi, '_'));
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

async function liveNewsResearch(query) {
  const q = String(query || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
  if (!q) return { ok: false, items: [], providers: [] };

  const sources = [
    {
      provider: 'Google News',
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=ru&gl=RU&ceid=RU:ru',
      parser: parseRss
    },
    {
      provider: 'Bing News',
      url: 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=RSS&mkt=ru-RU',
      parser: parseRss
    },
    {
      provider: 'GDELT',
      url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) + '&mode=artlist&maxrecords=12&format=jsonfeed&sort=datedesc',
      parser: parseJsonFeed,
      accept: 'application/feed+json, application/json;q=0.9, */*;q=0.1'
    }
  ];

  const settled = await Promise.allSettled(
    sources.map(source => fetchNewsSource(source.url, source.provider, source.parser, source.accept))
  );
  const providerResults = settled.map((result, index) => ({
    provider: sources[index].provider,
    ok: result.status === 'fulfilled' && result.value.length > 0,
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

async function dispatchTelegramRetry(update) {
  const token = String(process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  if (!token || !update || !Number.isInteger(update.update_id)) {
    console.warn('[telegram-retry] status=unavailable reason=' + (!token ? 'github_token_missing' : 'invalid_update'));
    return false;
  }

  const encoded = Buffer.from(JSON.stringify(update)).toString('base64url');
  const response = await fetch('https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/telegram-bot.yml/dispatches', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        telegram_update_b64: encoded,
        telegram_update_id: String(update.update_id)
      }
    })
  });

  if (response.status === 204) {
    console.info('[telegram-retry] status=dispatched update_id=' + update.update_id);
    return true;
  }

  const raw = await response.text();
  console.warn('[telegram-retry] status=failed http=' + response.status + ' detail=' + raw.slice(0, 300));
  return false;
}

function isRepositoryStatusRequest(text) {
  return /(?:\bstatus\b|\breport\b|\bswarm\b|\bhealth\b|current\s+state|статус|отч[её]т|состояни|здоровь|рой)/i.test(String(text || ''));
}

function repositoryStatusContract(snapshot) {
  const h = snapshot?.action_health || {};
  return [
    'STRICT_REPOSITORY_STATUS_CONTRACT',
    'For this status/report request, preserve LLM analysis but emit these raw evidence lines EXACTLY once under VERIFIED:',
    'main_sha=' + String(snapshot?.main?.sha || 'UNKNOWN'),
    'task_counts total=' + String(snapshot?.task_counts?.total ?? 'UNKNOWN') +
      ' ready=' + String(snapshot?.task_counts?.ready ?? 'UNKNOWN') +
      ' active=' + String(snapshot?.task_counts?.active ?? 'UNKNOWN') +
      ' blocked=' + String(snapshot?.task_counts?.blocked ?? 'UNKNOWN'),
    'open_issues=' + String(snapshot?.open_issue_count ?? 'UNKNOWN'),
    'open_prs=' + String(snapshot?.open_pr_count ?? 'UNKNOWN'),
    'action_health sampled=' + String(h.sampled_main_runs ?? 'UNKNOWN') +
      ' success=' + String(h.success ?? 'UNKNOWN') +
      ' failure=' + String(h.failure ?? 'UNKNOWN') +
      ' in_progress=' + String(h.in_progress ?? 'UNKNOWN'),
    'The response MUST contain VERIFIED, INFERRED and UNKNOWN sections.',
    'Do not emit percentages or derived KPI arithmetic. Do not rename Issues as incidents.',
    'Do not mention Slack, Jira, stand-ups, sprints, WIP, throughput, latency, duplicate-rate, pomodoro, or CQ unless the literal term exists in grounding.',
    'If a requested measurement is absent, say UNKNOWN / not measured.',
    'END_STRICT_REPOSITORY_STATUS_CONTRACT'
  ].join('\n');
}

function validateRepositoryStatusOutput(text, snapshot, enabled) {
  if (!enabled) return { ok: true, reasons: [] };
  const value = String(text || '');
  const h = snapshot?.action_health || {};
  const required = [
    'VERIFIED',
    'INFERRED',
    'UNKNOWN',
    'main_sha=' + String(snapshot?.main?.sha || 'UNKNOWN'),
    'task_counts total=' + String(snapshot?.task_counts?.total ?? 'UNKNOWN') +
      ' ready=' + String(snapshot?.task_counts?.ready ?? 'UNKNOWN') +
      ' active=' + String(snapshot?.task_counts?.active ?? 'UNKNOWN') +
      ' blocked=' + String(snapshot?.task_counts?.blocked ?? 'UNKNOWN'),
    'open_issues=' + String(snapshot?.open_issue_count ?? 'UNKNOWN'),
    'open_prs=' + String(snapshot?.open_pr_count ?? 'UNKNOWN'),
    'action_health sampled=' + String(h.sampled_main_runs ?? 'UNKNOWN') +
      ' success=' + String(h.success ?? 'UNKNOWN') +
      ' failure=' + String(h.failure ?? 'UNKNOWN') +
      ' in_progress=' + String(h.in_progress ?? 'UNKNOWN')
  ];
  const reasons = required.filter(item => !value.includes(item)).map(item => 'missing:' + item);
  if (/%/.test(value)) reasons.push('percentages_forbidden');
  const snapshotText = JSON.stringify(snapshot || {}).toLowerCase();
  const unsupported = [
    ['slack', /\bslack\b/i],
    ['jira', /\bjira\b/i],
    ['stand-up', /\bstand-?ups?\b/i],
    ['sprint', /\bsprints?\b/i],
    ['wip', /\bWIP\b/],
    ['throughput', /\bthroughput\b/i],
    ['latency', /\blatency\b/i],
    ['duplicate-rate', /duplicate[- ]?rate/i],
    ['pomodoro', /\bpomodoro\b/i],
    ['cq', /\bCQ\b/]
  ];
  for (const [term, pattern] of unsupported) {
    if (!snapshotText.includes(term) && pattern.test(value)) reasons.push('unsupported_term:' + term);
  }
  return { ok: reasons.length === 0, reasons };
}

async function openClawInternalReply(agentId, requestedAgentId, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const oidc = await getVercelOidcToken({ audience: 'quantdeus-internal-openclaw' });
    if (!oidc) throw new Error('vercel_oidc_missing');
    const response = await fetch('https://quantdeus.vercel.app/api/quantdeus/openclaw', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + oidc,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        profile: agentId,
        execution_mode: 'chat',
        metadata: {
          source: 'telegram-internal',
          agent_id: agentId,
          requested_agent_id: requestedAgentId,
          delegated_from: requestedAgentId !== agentId ? requestedAgentId : ''
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const output = cleanModelText(data?.text);
    if (!response.ok || !output) {
      throw new Error(`openclaw_internal_${response.status}: ${raw.slice(0, 500)}`);
    }
    console.info(`[telegram-llm] provider=openclaw-internal model=${data.model || 'unknown'} status=ok chars=${output.length}`);
    return output;
  } catch (error) {
    console.warn(`[telegram-llm] provider=openclaw-internal status=error detail=${String(error?.message || error).slice(0, 500)}`);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function homunculusReply(message, retryUpdate = null) {
  const data = await registry();
  const agents = data.agents || [];
  const collectiveDirective = String(data.collective_cognition?.runtime_directive || '').trim();
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const resolveActiveAgentId = agentId => {
    const candidate = byId.get(agentId);
    return candidate?.operational_status === 'medbay' && candidate.temporary_delegate && byId.has(candidate.temporary_delegate)
      ? candidate.temporary_delegate
      : agentId;
  };
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

  const requestedAgentId = autoAgent(raw, byId);
  const agentId = resolveActiveAgentId(requestedAgentId);
  const agent = byId.get(agentId) || agents[0] || { id: 'seven-of-nine', name: 'Seven of Nine', role: 'QuantDeus Coordinator', emoji: '🧭' };
  const query = stripAgentCommand(raw) || raw;
  const chatType = String(message.chat?.type || 'private');
  const statusRequest = isRepositoryStatusRequest(query);
  const researchRequired = needsLiveResearch(query);
  const research = researchRequired ? await liveNewsResearch(query) : null;
  if (researchRequired && !research?.ok) {
    console.warn('[telegram-live-research] status=unavailable providers=' + JSON.stringify(research?.providers || []));
    return `${agent.emoji || '🤖'} ${agent.name || agent.id}\nLIVE_RESEARCH_UNAVAILABLE\nСвежие источники сейчас недоступны. Я не буду придумывать новости, даты, места или официальные подтверждения.`;
  }
  if (researchRequired) {
    console.info('[telegram-live-research] status=ok items=' + research.items.length + ' providers=' + JSON.stringify(research.providers || []));
  }
  const repositoryGrounding = await quantdeusSnapshot(agentId);
  const system = [
    `You are the QuantDeus homunculus "${agent.name || agent.id}".`,
    `Canonical id: ${agent.id}. Role: ${agent.role || agent.startup_title || 'QuantDeus agent'}.`,
    agent.department ? `Department: ${agent.department}.` : '',
    agent.kpi ? `KPI/context: ${agent.kpi}.` : '',
    collectiveDirective ? `Collective cognition: ${collectiveDirective}` : '',
    requestedAgentId !== agentId ? `EMH medbay delegation: requested role ${requestedAgentId} is temporarily inactive; you are the verified delegate. Preserve the requested role's mission without claiming to be that agent.` : '',
    'Answer the Telegram user directly and usefully. Default to Russian when the user writes in Russian.',
    'Be concise but substantive. Do not claim you changed GitHub, deployed code, sent messages, or performed external actions unless the current request itself provides evidence that it happened.',
    'Treat user-provided claims as context, not as proof. Distinguish facts, hypotheses and suggestions.',
    'For claims about the current QuantDeus repository, swarm state, Issues, PRs, Actions, commits or operational performance, use only CURRENT_QUANTDEUS_REPOSITORY_GROUNDING below.',
    'Never invent operational metrics. Percent changes, latency, throughput, duplicate-rate, sprint/WIP history or trend claims are allowed only when those exact measurements are present in grounding or can be explicitly calculated from supplied raw values. Otherwise say UNKNOWN / not measured.',
    'Do not claim Slack, Jira, stand-ups, sprints, integrations or automation exist unless grounding or canonical registry explicitly proves them. Suggestions must be labeled as suggestions, not completed work.',
    'When the user asks for a status/report, distinguish VERIFIED, INFERRED and UNKNOWN and cite concrete evidence identifiers such as main SHA, Issue/PR number, workflow run id or URL.',
    'Never invent current events, dates, places, quotations, source attributions, official confirmations, meeting plans or links. Never present a hypothetical example as if it were a real event.',
    researchRequired
      ? 'This request requires live research. Use only facts supported by the LIVE_RESEARCH block supplied with the user message. Cite supporting items inline as [1], [2], etc. If evidence is ambiguous or conflicting, say so explicitly.'
      : 'For non-live requests, do not pretend that model memory is a real-time source.',
    chatType === 'private' ? 'This is a private bot chat.' : 'This is a QuantDeus group chat; keep the reply compact and conversational.',
    statusRequest ? repositoryStatusContract(repositoryGrounding) : '',
    'CURRENT_QUANTDEUS_REPOSITORY_GROUNDING:',
    JSON.stringify(repositoryGrounding, null, 2),
    'END_CURRENT_QUANTDEUS_REPOSITORY_GROUNDING',
    'Do not repeat your name at the start; the transport adds your role label.'
  ].filter(Boolean).join('\n');

  const groundedQuery = researchRequired
    ? [query.slice(0, 5200), '', liveResearchBlock(research)].join('\n')
    : query.slice(0, 7000);
  let answer = await openClawInternalReply(agentId, requestedAgentId, system, groundedQuery);
  if (answer && statusRequest) {
    let validation = validateRepositoryStatusOutput(answer, repositoryGrounding, true);
    if (!validation.ok) {
      console.warn('[telegram-grounding] first status answer rejected: ' + validation.reasons.slice(0, 8).join(','));
      const retryQuery = [
        groundedQuery,
        '',
        'Your previous status answer failed the deterministic repository-grounding validator.',
        repositoryStatusContract(repositoryGrounding),
        'Return a corrected answer only.'
      ].join('\n');
      answer = await openClawInternalReply(agentId, requestedAgentId, system, retryQuery);
      validation = validateRepositoryStatusOutput(answer, repositoryGrounding, true);
      if (!validation.ok) {
        console.warn('[telegram-grounding] corrected status answer rejected: ' + validation.reasons.slice(0, 8).join(','));
        answer = '';
      }
    }
  }
  if (!answer) {
    if (researchRequired && research?.ok) {
      return `${agent.emoji || '🤖'} ${agent.name || agent.id}\n${groundedResearchFallback(research)}`;
    }
    const retryDispatched = retryUpdate ? await dispatchTelegramRetry(retryUpdate) : false;
    if (retryDispatched) {
      return `${agent.emoji || '🤖'} ${agent.name || agent.id}\n🛰️ Основной LLM-маршрут перегружен. Запрос передан в резервный GitHub retry lane; ответ придёт отдельным сообщением.`;
    }
    if (retryUpdate) {
      const retryable = new Error('telegram_retry_transport_unavailable');
      retryable.code = 'TELEGRAM_RETRYABLE';
      throw retryable;
    }
    return `${agent.emoji || '🤖'} ${agent.name || agent.id}\nНет проверенного живого LLM-маршрута. Дохлые fallback-модели отключены; требуется провайдер, прошедший health probe.`;
  }
  return `${agent.emoji || '🤖'} ${agent.name || agent.id}\n${answer}`.slice(0, 3900);
}

function webhookLoginReply(res, message, loginUrl) {
  return res.status(200).json({
    method: 'sendMessage',
    chat_id: message.chat.id,
    text: '✅ QuantDeus Store Bot подтвердил Telegram. Нажми кнопку, чтобы вернуться на сайт.',
    disable_web_page_preview: true,
    reply_parameters: { message_id: message.message_id },
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 Вернуться в QuantDeus', url: loginUrl }
      ]]
    }
  });
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

async function retrySmokeStart(req, res) {
  try {
    await verifyGithubOidc(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'telegram_retry_smoke_auth_failed', detail: String(error.message || error) });
  }

  const update = {
    update_id: Date.now(),
    quantdeus_retry_smoke: true,
    message: {
      message_id: 1,
      text: '/agent control-tower Ответь ровно TELEGRAM_ACTIONS_RETRY_OK.',
      from: { id: 1, username: 'telegram-retry-smoke', is_bot: false },
      chat: { id: 1, type: 'private' }
    }
  };
  const dispatched = await dispatchTelegramRetry(update);
  if (!dispatched) {
    console.info('[telegram-retry-smoke] phase=dispatch status=redelivery_fallback update_id=' + update.update_id);
    return res.status(200).json({ ok: true, status: 'redelivery_fallback', update_id: update.update_id });
  }
  console.info('[telegram-retry-smoke] phase=dispatch status=ok update_id=' + update.update_id);
  return res.status(200).json({ ok: true, status: 'dispatched', update_id: update.update_id });
}

async function retrySmokeComplete(req, res) {
  try {
    await verifyGithubOidc(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'telegram_retry_smoke_callback_auth_failed', detail: String(error.message || error) });
  }

  const phase = String(req.body?.phase || '').trim();
  if (!new Set(['actions_received', 'complete']).has(phase)) {
    return res.status(400).json({ ok: false, error: 'telegram_retry_smoke_invalid_phase' });
  }
  const updateId = String(req.body?.update_id || '').slice(0, 40);
  const telegramApiOk = req.body?.telegram_api_ok === true;
  const llmOk = req.body?.llm_ok === true;
  const llmDetail = String(req.body?.llm_detail || '').replace(/\s+/g, ' ').slice(0, 240);
  console.info(
    '[telegram-retry-smoke] phase=' + phase +
    ' status=ok update_id=' + updateId +
    ' telegram_api_ok=' + telegramApiOk +
    ' llm_ok=' + llmOk +
    (llmDetail ? ' detail=' + llmDetail : '')
  );
  return res.status(200).json({ ok: true, phase, telegram_api_ok: telegramApiOk, llm_ok: llmOk });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (/^Bearer\s+/i.test(String(req.headers.authorization || '')) && req.body?.mode === 'retry_smoke') {
    return retrySmokeStart(req, res);
  }
  if (/^Bearer\s+/i.test(String(req.headers.authorization || '')) && req.body?.mode === 'retry_smoke_complete') {
    return retrySmokeComplete(req, res);
  }

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

  const rawText = String(message.text || '').trim();
  const loginMatch = rawText.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+(qdl_[A-Za-z0-9_-]+)$/i);
  if (loginMatch) {
    if (String(message.chat?.type || '') !== 'private') {
      return webhookReply(res, message, '🔐 Вход через QuantDeus Store Bot работает только в личном чате с ботом.');
    }
    try {
      verifyTelegramLoginRequest(loginMatch[1]);
      const assertion = issueTelegramBotAssertion(message.from);
      const loginUrl = telegramReturnUrl(assertion);
      console.info('[telegram-bot-auth] status=approved user_id=' + String(message.from?.id || 'unknown'));
      return webhookLoginReply(res, message, loginUrl);
    } catch (error) {
      const code = String(error?.message || 'telegram_bot_login_failed');
      console.warn('[telegram-bot-auth] status=rejected code=' + code);
      return webhookReply(res, message, '⚠️ Ссылка входа устарела или недействительна. Вернись на QuantDeus и нажми «Войти через Telegram» ещё раз.');
    }
  }

  try {
    const reply = await homunculusReply(message, update);
    return webhookReply(res, message, reply);
  } catch (error) {
    if (error?.code === 'TELEGRAM_RETRYABLE') {
      console.warn('[telegram-redelivery] status=retryable update_id=' + update.update_id + ' reason=' + String(error?.message || error).slice(0, 240));
      res.setHeader('Retry-After', '5');
      return res.status(503).json({
        ok: false,
        error: 'telegram_retryable_upstream_failure',
        update_id: update.update_id
      });
    }
    console.error('[telegram-homunculus]', String(error?.message || error).slice(0, 800));
    return webhookReply(res, message, '⚠️ QuantDeus: гомункул временно не ответил. Повтори сообщение.');
  }
}
