/**
 * Генератор отслеживаемых ссылок на подтверждённые услуги QuantDeus.
 * Работает локально, без внешних API-запросов и без публикации.
 * Пример: node scripts/social-sales-links.mjs youtube automation q4-2026 short-01
 */
import {pathToFileURL} from 'node:url';

const SITE = 'https://quantdeus.ru';
const channels = Object.freeze({
  youtube: {source: 'youtube', medium: 'shorts'},
  vk: {source: 'vk', medium: 'clips'}
});
const offers = Object.freeze({
  automation: {
    pathname: '/services/',
    name: 'Автоматизация бизнеса',
    cta: 'Узнайте подробности и оставьте заявку на автоматизацию бизнеса'
  },
  concert: {
    pathname: '/ksenia-cherednikova/',
    name: 'Концерт Ксении Чередниковой',
    cta: 'Узнайте об организации выступления и отправьте заявку'
  }
});

function safeSlug(s, field) {
  if (typeof s !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,60}$/.test(s)) {
    throw new Error('Некорректное поле ' + field + ': используйте 3–61 символ, a-z, 0-9, - или _');
  }
  return s;
}
export function buildSalesLink({channel, offer, campaign, content}) {
  if (!Object.hasOwn(channels, channel)) throw new Error('Площадка: youtube или vk');
  if (!Object.hasOwn(offers, offer)) throw new Error('Услуга: automation или concert');
  const campaignId = safeSlug(campaign, 'кампания');
  const contentId = safeSlug(content, 'ролик/пост');
  const url = new URL(offers[offer].pathname, SITE);
  url.searchParams.set('utm_source', channels[channel].source);
  url.searchParams.set('utm_medium', channels[channel].medium);
  url.searchParams.set('utm_campaign', campaignId);
  url.searchParams.set('utm_content', contentId);
  return {
    offer: offers[offer].name,
    channel,
    campaign_id: campaignId,
    content_id: contentId,
    url: url.toString(),
    cta: offers[offer].cta + ': ' + url.toString(),
    measurement: 'Переходы и заявки требуют аналитики сайта. Продажа только после подтверждённой оплаты.'
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [channel, offer, campaign, content] = process.argv.slice(2);
  try {
    const record = buildSalesLink({channel, offer, campaign, content});
    console.log(['Услуга: ' + record.offer, 'Площадка: ' + channel, 'Кампания: ' + record.campaign_id,
      'Ссылка: ' + record.url, 'Подпись к ролику: ' + record.cta,
      'Важно: ' + record.measurement].join('\n'));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
