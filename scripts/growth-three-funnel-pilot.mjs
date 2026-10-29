import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('coordination/growth/three-funnel-pipeline.json', 'utf8'));
const discovery = JSON.parse(fs.readFileSync('coordination/growth/discovery-shortlist.json', 'utf8'));
const required = ['community', 'automation', 'concert'];

for (const id of required) {
  if (!config.funnels[id]?.destination?.startsWith('https://')) throw Error('Некорректная ссылка воронки: ' + id);
}
const rules = config.rules;
if (rules.dry_run !== true || rules.external_send_enabled !== false || rules.human_approval_required !== true) {
  throw Error('Пилот должен оставаться без отправки и с обязательным согласованием человеком');
}
for (const [key, max] of [['max_messages_per_day', 100], ['max_vk_messages_per_day', 10]]) {
  if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > max) {
    throw Error('Некорректный лимит: ' + key);
  }
}
if (rules.do_not_publish_private_contract !== true || rules.do_not_sign_contracts !== true || rules.do_not_confirm_concert_date_without_human !== true) {
  throw Error('Отключена защита договоров или концертных обязательств');
}
if (discovery.mode !== 'read-only' || discovery.external_contact_enabled !== false || !Array.isArray(discovery.sources)) {
  throw Error('Discovery должен оставаться только для чтения');
}
const seen = new Set();
for (const source of discovery.sources) {
  if (!['community', 'b2b', 'events'].includes(source.funnel)) throw Error('Неизвестная воронка discovery');
  if (!source.source_url?.startsWith('https://') || !source.topic || !source.audience_need || !source.channel || !source.offer || !source.cta || !source.owner) {
    throw Error('Неполная карточка публичного источника');
  }
  if (seen.has(source.source_url)) throw Error('Повтор публичного источника');
  seen.add(source.source_url);
  if (source.contact_state !== 'not_contactable' || source.permission_basis !== null) {
    throw Error('Discovery не может выдавать разрешение на контакт');
  }
  if (source.verified !== true && source.verified !== false) throw Error('Статус проверки источника должен быть логическим');
  if (source.verified && (!source.rules_url?.startsWith('https://') || !source.verified_scope || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source.last_checked || ''))) {
    throw Error('Для проверенного источника нужны правила, границы проверки и дата');
  }
}

const report = {
  mode: 'dry-run',
  date: new Date().toISOString(),
  funnels: required.map(id => ({
    id,
    owner: config.funnels[id].owner,
    cta: config.funnels[id].cta,
    destination: config.funnels[id].destination,
    status: 'configured-not-sent',
    status_ru: 'Настроено, без отправки'
  })),
  checked_public_sources: discovery.sources.length,
  outbound_messages: 0,
  leads_collected: 0,
  conversions_verified: 0,
  warning: 'Проверены только локальные конфигурация и карточки публичных источников. Внешний поиск, отправка сообщений, записи в CRM, вызовы внешних API и бронирования не выполнялись. Проверенный источник не означает проверенного лида или разрешения на контакт.'
};
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '## QuantDeus: три воронки (без отправки)\n\n' +
    required.map(id => '- ' + id + ': настроено, без отправки').join('\n') +
    '\n\nПубличных источников в реестре: ' + discovery.sources.length + '. Все контакты заблокированы до отдельного согласования.\n' +
    'Отправок, записей в CRM и бронирований не было.\n');
}
