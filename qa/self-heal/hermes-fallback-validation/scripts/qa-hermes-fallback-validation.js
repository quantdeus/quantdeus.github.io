const { runOfficeAgent, Sandbox } = require('../../../lib/office-session.js');
const { publicReadMcpSource } = require('../../../lib/public-read-mcp-source.js');
const crypto = require('crypto');
const fs = require('fs');

const SANDBOX = 'quantdeus-openclaw-office';
const OPENCLAW_RUNTIME_VERSION = '2026.9.6';

async function validateHermesFallback() {
  const sandbox = await Sandbox.getOrCreate({
    name: SANDBOX,
    image: 'vercel/sandbox/universal',
    resources: { vcpus: 2 },
    timeout: 15 * 60 * 1000,
    persistent: true,
    snapshotExpiration: 30 * 24 * 60 * 60 * 1000,
    resume: true,
    tags: { app: 'quantdeus', runtime: 'openclaw-office' }
  });
  
  // Clone the repository to ensure the latest state
  const home = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'printf %s $HOME'] });
  const workdir = `${home}/quantdeus`;
  const requestId = crypto.randomUUID();
  const repoDir = `${workdir}/repo-${requestId}`;
  
  // Clone the repository
  await sandbox.runCommand({
    cmd: 'git',
    args: ['clone', '--depth', '1', '--branch', 'main', 'https://github.com/quantdeus/quantdeus.github.io.git', repoDir],
    cwd: workdir
  });
  
  // Ensure the workspace is ready
  const agentCwd = repoDir;
  const statePath = `${home}/.openclaw/quantdeus-state-trusted-tools`;
  
  // Write the configuration and prompt for Hermes fallback validation
  const config = {
    models: {
      mode: 'replace',
      providers: {
        'quantdeus-hermes': {
          baseUrl: process.env.HERMES_LOCAL_BASE_URL,
          api: 'openai-completions',
          apiKey: process.env.HERMES_LOCAL_API_KEY,
          models: [{ id: process.env.HERMES_MODEL || 'ministral-3b-latest', name: process.env.HERMES_MODEL || 'ministral-3b-latest', input: ['text'], contextWindow: 131072, maxTokens: 8192 }]
        },
        'quantdeus-hermes-lite': {
          baseUrl: process.env.HERMES_LOCAL_BASE_URL,
          api: 'openai-completions',
          apiKey: process.env.HERMES_LOCAL_API_KEY,
          models: [{ id: process.env.HERMES_FALLBACK_MODEL || 'ministral-3b-latest', name: process.env.HERMES_FALLBACK_MODEL || 'ministral-3b-latest', input: ['text'], contextWindow: 131072, maxTokens: 8192 }]
        }
      }
    },
    tools: {
      profile: 'full',
      codeMode: false,
      allow: [],
      deny: ['group:runtime', 'group:automation', 'group:nodes']
    },
    agents: {
      defaults: {
        workspace: agentCwd,
        timeoutSeconds: 240,
        models: {
          'quantdeus-hermes': { codeMode: false },
          'quantdeus-hermes-lite': { codeMode: false }
        },
        model: {
          primary: 'quantdeus-hermes',
          fallbacks: ['quantdeus-hermes-lite']
        }
      }
    }
  };
  
  const prompt = `QUANTDEUS HERMES FALLBACK VALIDATION:
  This script validates whether the Hermes fallback model is allowed to be used as a production route.
  Ensure that the Hermes fallback model adheres to the mission alignment and guardrails.
  If the model is allowed, proceed with the validation.
  `;
  
  // Write the configuration and prompt
  const configPath = `${home}/.openclaw/requests/quantdeus-config-${requestId}.json`;
  const promptPath = `${home}/.openclaw/requests/quantdeus-prompt-${requestId}.txt`;
  
  await sandbox.writeFiles([
    { path: configPath, content: Buffer.from(JSON.stringify(config)) },
    { path: promptPath, content: Buffer.from(prompt) }
  ]);
  
  // Run the OpenClaw agent to validate the Hermes fallback model
  const run = await runOfficeAgent(sandbox, {
    lock: `${statePath}/.quantdeus-agent.lock`,
    args: ['agent', 'exec', '--config', configPath, '--cwd', agentCwd, '--timeout', '120', '--json', '--message-file', promptPath],
    cwd: agentCwd,
    env: {
      HERMES_LOCAL_BASE_URL: process.env.HERMES_LOCAL_BASE_URL,
      HERMES_LOCAL_API_KEY: process.env.HERMES_LOCAL_API_KEY,
      HERMES_MODEL: process.env.HERMES_MODEL,
      HERMES_FALLBACK_MODEL: process.env.HERMES_FALLBACK_MODEL
    }
  });
  
  const raw = await sandbox.runCommand({ cmd: 'cat', args: [promptPath] });
  const result = await sandbox.runCommand({ cmd: 'openclaw', args: ['agent', 'exec', '--config', configPath, '--cwd', agentDir, '--timeout', '120', '--json'], cwd: agentCwd });
  
  const output = await sandbox.text(run);
  const parsedOutput = JSON.parse(output);
  
  if (parsedOutput.ok) {
    console.log('Hermes fallback validation successful.');
    return { success: true, message: 'Hermes fallback model is allowed.' };
  } else {
    console.error('Hermes fallback validation failed.');
    return { success: false, message: 'Hermes fallback model does not adhere to mission alignment and guardrails.' };
  }
}

module.exports = { validateHermesFallback };