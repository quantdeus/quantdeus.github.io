'use strict';
const fs = require('fs');
const registry = require('../coordination/agents.json');
const { askCloud } = require('./cloud-llm-client');

const agents = registry.agents || [];
const requested = String(process.env.AGENT_ID || '').trim();
const all = String(process.env.ALL_AGENTS || '').toLowerCase() === 'true';
const ordinal = Math.floor(Date.now() / 86400000);
const selected = all ? agents :
  requested ? agents.filter(x => x.id === requested) :
  agents.length ? [agents[ordinal % agents.length]] : [];
if (!selected.length || (requested && !selected.some(x => x.id === requested))) {
  throw new Error('Неизвестный агент или пустой реестр');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const summary = ['## Облачные LLM QuantDeus — проверка на GitHub Actions',
  '', 'Режим: только бесплатная текстовая модель, без изменения репозитория и без привилегированных инструментов.',
  '', '| Агент | Результат | Модель |', '| --- | --- | --- |'];
const outcomes = [];
(async () => {
  for (const [index, agent] of selected.entries()) {
    if (index) await sleep(3200); // below OpenRouter free per-minute burst limit
    try {
      const result = await askCloud({
        profile:agent.id,
        messages:[{role:'user',content:'Для технической проверки верни строго один JSON-объект без Markdown: {"ok":true,"agent_id":"' + agent.id + '"}'}]
      });
      let parsed;
      try { parsed = JSON.parse(result.text); } catch {}
      if (parsed?.ok !== true || parsed.agent_id !== agent.id) {
        throw new Error('cloud_llm_invalid_probe_reply');
      }
      summary.push('| ' + agent.id + ' | ✅ подтверждён ответ модели | ' + result.model + ' |');
      outcomes.push({id:agent.id,ok:true,model:result.model});
    } catch(error) {
      const message = String(error.message || error).slice(0,100).replace(/[|\r\n]/g,' ');
      summary.push('| ' + agent.id + ' | ❌ ' + message + ' | — |');
      outcomes.push({id:agent.id,ok:false,reason:message});
      if (error.status === 429 || error.status === 402) {
        summary.push('', 'Лимит бесплатного сервиса достигнут — дальнейшие проверки в этом запуске остановлены.');
        break;
      }
    }
  }
  summary.push('', 'Проверено: ' + outcomes.length + ' из ' + selected.length +
    '; подтверждено: ' + outcomes.filter(x=>x.ok).length + '.');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n')+'\n');
  console.log(JSON.stringify({count:outcomes.length,expected:selected.length,results:outcomes},null,2));
  if (outcomes.length !== selected.length || outcomes.some(x=>!x.ok)) process.exitCode=1;
})().catch(e=>{ console.error(String(e.message||e)); process.exitCode=1; });
