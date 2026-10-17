/**
 * QuantDeus — экономная проверка соцсетей.
 * За один запуск: до 1 чтения списка Composio, до 1 обращения к YouTube
 * и до 1 обращения к VK. Без повторов после 429 и без публикаций.
 * Доступ к публичной статистике не означает право загружать ролики.
 */
const COMPOSIO_URL = 'https://backend.composio.dev/api/v3.1';
const YOUTUBE_CHANNEL_ID = 'UClJUCP1tX2R6fglNKqnKIyQ';
const VK_GROUP = 'andromeda_2077';
const composioKey = process.env.COMPOSIO_API || '';
const vkToken = process.env.VK_TOKEN_GROUP || '';

const summary = ['# QuantDeus — экономная статистика соцсетей', '', 'Только чтение. Публикаций, комментариев и повторных попыток нет.', ''];
let failures = 0;
let apiCalls = {composio: 0, youtube: 0, vk: 0};
const MAX_CALLS = Object.freeze({composio: 1, youtube: 1, vk: 1});

const n = v => v === undefined || v === null || v === '' || !Number.isFinite(Number(v))
  ? 'неизвестно' : Number(v).toLocaleString('ru-RU');

async function request(url, options, source) {
  if (!Object.hasOwn(MAX_CALLS, source) || apiCalls[source] >= MAX_CALLS[source]) {
    throw new Error('Лимит запросов за запуск исчерпан');
  }
  apiCalls[source]++;
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    // Записываем только статус, без данных о токенах и содержимого ответа.
    const err = new Error('HTTP ' + response.status);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

function errorStatus(platform, e) {
  failures++;
  const status = e?.status === 429
    ? 'Квота 429: остановлено без повтора, следующая плановая попытка завтра.'
    : 'Ошибка чтения: ' + (Number.isInteger(e?.status) ? 'HTTP ' + e.status : 'сетевой сбой');
  summary.push('⚠️ ' + platform + ': ' + status);
}

async function checkYouTube() {
  summary.push('## YouTube — @energotron');
  if (!composioKey) { failures++; summary.push('⚠️ В GitHub отсутствует секрет COMPOSIO_API.'); return; }
  try {
    const listing = await request(COMPOSIO_URL + '/connected_accounts?limit=100', {
      headers: {'x-api-key': composioKey, Accept: 'application/json'}
    }, 'composio');
    const active = (Array.isArray(listing.items) ? listing.items : []).find(a =>
      a?.status === 'ACTIVE' && !a?.is_disabled &&
      (a?.toolkit?.slug === 'youtube' || a?.toolkit_slug === 'youtube')
    );
    if (!active) { failures++; summary.push('⚠️ Нет активного YouTube-подключения в этом проекте.'); return; }

    // Важно: один публичный запрос по точному ID. Не опрашивать "mine" на
    // каждом аккаунте, если ключ относится к другому аккаунту Composio.
    const result = await request(COMPOSIO_URL + '/tools/execute/YOUTUBE_GET_CHANNEL_STATISTICS', {
      method: 'POST',
      headers: {'x-api-key': composioKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        connected_account_id: active.id,
        ...(active.user_id ? {user_id: active.user_id} : {}),
        version: 'latest',
        arguments: {id: YOUTUBE_CHANNEL_ID, part: 'snippet,statistics'}
      })
    }, 'youtube');
    if (result.successful === false) {
      failures++; summary.push('⚠️ YouTube не ответил успешными данными. Без повторных запросов.'); return;
    }
    const p = result.data || result;
    const channels = p.channels || p.items || p.data?.channels || p.data?.items || [];
    const channel = Array.isArray(channels) ? channels.find(c => c.id === YOUTUBE_CHANNEL_ID) : null;
    if (!channel) {
      failures++; summary.push('⚠️ Ответ не содержит нужного канала. Без перебора подключений.'); return;
    }
    const st = channel.statistics || {};
    summary.push('✅ Публичная статистика доступна.',
      '| Подписчики | Просмотры | Видео |',
      '|---:|---:|---:|',
      '| ' + n(st.subscriberCount) + ' | ' + n(st.viewCount) + ' | ' + n(st.videoCount) + ' |',
      '',
      'Канал: https://www.youtube.com/channel/' + YOUTUBE_CHANNEL_ID,
      '',
      '> Это ПУБЛИЧНЫЕ показатели. Личная аналитика, публикация и комментарии этим запросом не проверяются.');
  } catch (e) { errorStatus('YouTube/Composio', e); }
}

async function checkVK() {
  summary.push('', '## ВКонтакте — ' + VK_GROUP);
  if (!vkToken) { failures++; summary.push('⚠️ В GitHub отсутствует секрет VK_TOKEN_GROUP.'); return; }
  try {
    const body = new URLSearchParams({
      access_token: vkToken,
      group_id: VK_GROUP,
      fields: 'members_count',
      v: '5.199'
    });
    const j = await request('https://api.vk.com/method/groups.getById', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body
    }, 'vk');
    if (!j.response) { failures++; summary.push('⚠️ VK не предоставил статистику. Без повторов.'); return; }
    const g = Array.isArray(j.response) ? j.response[0] :
      Array.isArray(j.response.groups) ? j.response.groups[0] : j.response;
    summary.push('✅ Группа доступна. Участников: ' + n(g?.members_count) + '.',
      'Группа: https://vk.ru/' + VK_GROUP);
  } catch (e) { errorStatus('ВКонтакте', e); }
}

await checkYouTube();
await checkVK();
summary.push('', '## Бюджет запросов за этот запуск',
  'Composio (список): ' + apiCalls.composio +
  '; YouTube (статистика): ' + apiCalls.youtube +
  '; VK (участники): ' + apiCalls.vk + '.',
  '',
  'Неизвестные продажи и заявки не приравниваются к нулю. Для оценки продаж нужны подтверждённые данные сайта/кассы.',
  'Для контента используйте ссылки с UTM: `node scripts/social-sales-links.mjs youtube automation osen-2026 short-01`.');
const report = summary.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) {
  const {appendFile} = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
}
console.log(report);
if (failures) process.exitCode = 1;
