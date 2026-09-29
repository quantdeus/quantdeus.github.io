'use strict';

const fs = require('node:fs');
const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js', 'utf8');
const client = fs.readFileSync('scripts/openclaw-office-client.js', 'utf8');
const site = fs.readFileSync('scripts/site-agent-reply.js', 'utf8');
const telegram = fs.readFileSync('scripts/telegram-bot.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel-dispatcher/vercel.json', 'utf8'));
const smokeWorkflow = fs.readFileSync('.github/workflows/openclaw-smoke.yml', 'utf8');

for (const [ok, message] of [
  [route.includes("const AUDIENCE = 'quantdeus-vercel-openclaw'"), 'dedicated GitHub OIDC audience'],
  [route.includes('Sandbox.getOrCreate') && route.includes("runtime: 'openclaw-office'"), 'persistent Vercel Sandbox runtime'],
  [route.includes("openclaw@2026.9.6"), 'pinned OpenClaw install'],
  [route.includes("tools: { deny: ['*'] }"), 'deny all OpenClaw tools in chat route'],
  [route.includes("id: localKeyEnv") && route.includes('runtimeKeyEnv'), 'model key stays env-backed and out of persisted config'],
  [route.includes("'openai/gpt-oss-120b:free'") && route.includes('process.env.HERMES_LOCAL_API_KEY') && route.includes('process.env.MISTRAL_API_KEY'), 'existing Vercel OpenRouter and Mistral model credentials are supported'],
  [route.includes("cmd: 'rm'") && route.includes('finally'), 'ephemeral credential/prompt cleanup'],
  [client.includes('quantdeus-vercel-openclaw') && client.includes('/api/quantdeus/openclaw'), 'client wired to OpenClaw endpoint'],
  [site.includes("require('./openclaw-office-client')") && site.includes('openclaw-office'), 'GitHub site agent wired to OpenClaw'],
  [telegram.includes("require('./openclaw-office-client')") && telegram.includes('createAdminTask(agentId, task, username)'), 'Telegram chat migrated and admin task path retained'],
  [smokeWorkflow.includes('workflow_dispatch') && smokeWorkflow.includes('OPENCLAW_SMOKE_OK') && smokeWorkflow.includes('id-token: write'), 'manual live smoke calls deployed OpenClaw with GitHub OIDC'],
  [vercel.functions['api/quantdeus/openclaw.js']?.maxDuration === 300, 'OpenClaw function has adequate timeout']
]) {
  if (!ok) throw new Error(`OpenClaw Office contract failed: ${message}`);
}

console.log('OpenClaw Office contract OK: pinned runtime, OIDC, OpenRouter GPT-OSS, no tools, ephemeral cleanup, site and Telegram clients.');
