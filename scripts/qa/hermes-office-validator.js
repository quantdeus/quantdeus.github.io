#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { spawnSync } = require('node:child_process');
const agents = JSON.parse(fs.readFileSync('coordination/agents.json','utf8'));
const office = JSON.parse(fs.readFileSync('coordination/hermes-office.json','utf8'));
const evolution = JSON.parse(fs.readFileSync('coordination/hermes-evolution.json','utf8'));
if (office.runtime !== 'hermes-agent') throw new Error('Hermes office runtime drift');
if (office.registry_source !== 'coordination/agents.json') throw new Error('Hermes registry source drift');
if (office.office.dispatcher_profile !== 'seven-of-nine' || office.office.orchestrator_profile !== 'seven-of-nine') throw new Error('Seven must own Hermes dispatch/orchestration');
if (office.source_of_truth !== 'github') throw new Error('GitHub must remain source of truth');
if (String(office.model.default || '').trim()) throw new Error('Hermes repository must not pin a default model');
if ((office.model.minimum_context_tokens || 0) < 65536) throw new Error('Hermes requires >=64K context');
if (office.execution.hosting !== 'vercel-persistent-sandbox') throw new Error('Hermes hosting drift');
const ids=(agents.agents||[]).map(a=>a.id);
if (ids.length !== office.canonical_agent_count || new Set(ids).size !== ids.length) throw new Error('Hermes agent registry drift');
for(const required of ['seven-of-nine','coordinator','qa-syntax','qa-contract','qa-repair']) if(!ids.includes(required)) throw new Error('Missing required profile: '+required);
if (evolution.chat_bridge.primary_profile !== 'seven-of-nine') throw new Error('Hermes chat bridge must route through Seven');
if (evolution.capabilities.github.mode !== 'official-mcp') throw new Error('Official GitHub MCP contract missing');
if (!evolution.capabilities.browser.playwright_mcp) throw new Error('Playwright MCP must be enabled');
const guarded=['vercel-dispatcher/api/quantdeus/openclaw.js','vercel-dispatcher/api/quantdeus/telegram.js','vercel-dispatcher/api/quantdeus/hermes.js','vercel-dispatcher/api/quantdeus/llm.js','scripts/site-agent-reply.js','scripts/hermes-office-bootstrap.js'];
const forbidden=['mis'+'tral','gpt-'+'oss','inclu'+'sionai','AI_'+'GATEWAY','ai-'+'gateway.vercel.sh','vercel-'+'ai-gateway'];
for(const file of guarded){const src=fs.readFileSync(file,'utf8').toLowerCase();for(const token of forbidden)if(src.includes(token.toLowerCase()))throw new Error('Retired inference route remains in '+file);}
const openclaw=fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js','utf8');
if(!openclaw.includes('const orderedModels = [...healthyRefs]')) throw new Error('OpenClaw must route only probe-healthy models');
if(!openclaw.includes('const fallbackModels = healthyRefs.slice(1)')) throw new Error('OpenClaw fallbacks must be probe-healthy only');
if(!openclaw.includes("quantdeus-pollinations/openai") || !openclaw.includes("model: 'openai'")) throw new Error('Working Pollinations openai route must remain available behind health probe');
for (const retired of ['openai-fast','gemini-fast',"model: 'mistral'"]) if(openclaw.includes(retired)) throw new Error('Retired Pollinations model returned: '+retired);
if(!openclaw.includes('openclaw_no_healthy_model_route')) throw new Error('OpenClaw must fail closed without a healthy provider');
const telegram=fs.readFileSync('vercel-dispatcher/api/quantdeus/telegram.js','utf8');
if(telegram.includes('await chatCompletion(')) throw new Error('Telegram must not bypass probe-gated OpenClaw');
const bootstrap=fs.readFileSync('scripts/hermes-office-bootstrap.js','utf8');
if(!bootstrap.includes("provider: 'openrouter'")) throw new Error('Hermes explicit OpenRouter policy missing');
const root=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'hermes-office-policy-'));
try{
 const boot=spawnSync(process.execPath,['scripts/hermes-office-bootstrap.js'],{encoding:'utf8',env:{...process.env,HERMES_HOME:root,HERMES_MODEL:'test-model',HERMES_LOCAL_BASE_URL:'https://example.invalid/v1',HERMES_LOCAL_API_KEY:'test-only-never-persist',HERMES_OPENROUTER_MODEL:'openrouter/free',OPENROUTER_API_KEY:'test-only-openrouter'}});
 if(boot.status!==0) throw new Error('Hermes bootstrap failed: '+String(boot.stderr||'').slice(0,500));
 const profile=JSON.parse(fs.readFileSync(require('node:path').join(root,'profiles','seven-of-nine','config.yaml'),'utf8'));
 if(profile.fallback_providers.length!==1 || profile.fallback_providers[0]?.provider!=='openrouter') throw new Error('Hermes fallback policy drift');
 const txt=fs.readFileSync(require('node:path').join(root,'profiles','seven-of-nine','config.yaml'),'utf8');
 if(txt.includes('test-only-never-persist')||txt.includes('test-only-openrouter')) throw new Error('Provider credentials must not persist');
}finally{fs.rmSync(root,{recursive:true,force:true});}
const cron=spawnSync(process.execPath,['scripts/hermes-office-cron.js','--dry-run'],{encoding:'utf8'});
if(cron.status!==0) throw new Error('Hermes cron dry-run failed');
const summary=JSON.parse(cron.stdout);
if(!summary.ok||summary.profiles_checked!==ids.length||summary.profiles_failed!==0) throw new Error('Hermes cron dry-run coverage drift');
console.log('Hermes Office contract OK:',ids.length,'profiles; inference policy=explicit + probe-gated + fail-closed');
