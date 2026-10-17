#!/usr/bin/env node
// Ежедневный обход главных разделов без входа в административную панель.
const origin = 'https://quantdeus.ru';
const routes = ['/', '/about/', '/community/', '/ai-fleet/', '/research/', '/projects/', '/coordination/', '/forum/', '/services/', '/news/'];
const forbidden = /^(?:Community|Forum|Research|Projects|Services|Coordination|Knowledge|Federation|Horizons|News|Media|About QuantDeus|AI Fleet|Welcome)$/i;
let failures = [];
for (const route of routes) {
  try {
    const r = await fetch(origin + route, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'QuantDeus-Russian-Audit/1.0' } });
    if (!r.ok) { failures.push(route + ': сайт вернул ' + r.status); continue; }
    const html = await r.text();
    if (!/<html[^>]*\blang=["']ru(?:[-_]RU)?["']/i.test(html)) failures.push(route + ': язык страницы не русский');
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1].replace(/<[^>]*>/g, '').trim();
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
    const wrong = [title, ...headings].filter(x => forbidden.test(x));
    if (wrong.length) failures.push(route + ': английские заголовки: ' + wrong.join(', '));
    console.log(route + ' — ' + (wrong.length ? 'найден английский текст' : 'проверено'));
  } catch(e) { failures.push(route + ': недоступна для проверки (' + e.message + ')'); }
}
if (failures.length) { console.error('Нужна проверка сайта:\n' + failures.join('\n')); process.exit(1); }
console.log('Все проверенные разделы используют русский язык.');
