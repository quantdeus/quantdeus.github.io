/**
 * QuantDeus VK manifesto: manual, scoped, one-time announcement.
 * Uses GitHub Actions secret VK_TOKEN_GROUP without logging it.
 * Run check first, then publish; no autonomous posting or editing.
 */
import { appendFile } from 'node:fs/promises';

const screenName = 'andromeda_2077';
const mode = process.env.VK_MANIFESTO_MODE || 'check';
const token = process.env.VK_TOKEN_GROUP || '';
const signature = 'Единство Бога в многообразии';
const postMessage = `🌌 QuantDeus — «Единство Бога в многообразии»

Это главный философский девиз нашего проекта.

Разные культуры, традиции, духовные и светские взгляды, технологии, творчество и наука могут сосуществовать, дополняя друг друга. Единство не означает одинаковость: каждый человек свободно выбирает собственный путь, сохраняя индивидуальность и право не соглашаться.

QuantDeus развивает принцип Cosmic LEGO — открытого конструктора идей, практик и проектов. Наше общее дело — уважение, диалог, созидание и реальные проверяемые результаты.

✨ Главное: свобода мировоззрения, достоинство человека, добровольность, право выхода и сотрудничество без унификации.

🖖 Единство в цели. Свобода в путях. Доказательства в результатах.

🌐 https://quantdeus.ru/manifesto/
#QuantDeus #ЕдинствоВМногообразии #НеоновыйГоризонт`;

async function api(method, parameters) {
  const body = new URLSearchParams({ ...parameters, access_token: token, v: '5.199' });
  const response = await fetch('https://api.vk.com/method/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('VK ' + method + ' HTTP ' + response.status);
  const data = await response.json();
  if (data?.error) throw new Error('VK ' + method + ' error_code ' + Number(data.error.error_code));
  if (!data?.response) throw new Error('VK ' + method + ': response missing');
  return data.response;
}

let summary = ['## QuantDeus VK manifesto publication', '', 'Target: https://vk.ru/' + screenName, 'Mode: ' + mode];
try {
  if (!token) throw new Error('Required secret VK_TOKEN_GROUP is missing');
  if (!['check', 'publish'].includes(mode)) throw new Error('Unknown mode');
  const info = await api('groups.getById', { group_id: screenName });
  const group = Array.isArray(info) ? info[0] : Array.isArray(info.groups) ? info.groups[0] : info;
  const id = Number(group?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || group?.screen_name !== screenName) {
    throw new Error('Target VK group identity could not be verified');
  }
  summary.push('Verified group: ' + String(group.name || screenName), 'Numeric group id validated.');
  if (mode === 'check') {
    summary.push('✅ Read-only check completed; no post published.');
  } else {
    const ownerId = -id;
    let feed = { items: [] };
    try {
      feed = await api('wall.get', { owner_id: String(ownerId), count: '30' });
    } catch (error) {
      if (!String(error?.message || '').includes('VK wall.get error_code 27')) throw error;
      summary.push('VK wall.get is unavailable for this community token (code 27); using stable wall.post guid for deduplication.');
    }
    const items = Array.isArray(feed?.items) ? feed.items : [];
    const existing = items.find(item => typeof item?.text === 'string' && item.text.includes(signature) && item.text.includes('Cosmic LEGO'));
    if (existing?.id) {
      summary.push('✅ Already published earlier; no duplicate created.', 'Post: https://vk.com/wall' + ownerId + '_' + existing.id);
    } else {
      const result = await api('wall.post', {
        owner_id: String(ownerId),
        from_group: '1',
        message: postMessage,
        guid: 'quantdeus-unity-in-diversity-20261024'
      });
      const postId = Number(result?.post_id);
      if (!Number.isSafeInteger(postId) || postId <= 0) throw new Error('wall.post returned no valid post_id; verify manually before retry');
      summary.push('✅ Official VK post published.', 'Post: https://vk.com/wall' + ownerId + '_' + postId);
    }
  }
} catch (error) {
  process.exitCode = 1;
  summary.push('❌ ' + String(error.message || 'Unknown safe error').replace(/access_token|token=[^ ]+/ig, '[redacted]'));
}
const report = summary.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);
