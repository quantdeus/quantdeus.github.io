'use strict';

const fs = require('fs');
const { getGithubOidcToken } = require('./github-oidc');

const AUDIENCE = 'quantdeus-vercel-mirror';
const DEFAULT_URL = 'https://quantdeus.vercel.app/api/quantdeus/mirror';

function readEvidence(path) {
  if (!path) return {};
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) throw new Error('GITHUB_TOKEN is required');

  const oidc = await getGithubOidcToken(AUDIENCE);
  const url = process.env.MIRROR_VERCEL_URL || DEFAULT_URL;
  const mode = process.env.QD_MIRROR_MODE === 'shadow' ? 'shadow' : 'repair';
  const evidence = readEvidence(process.env.QD_MIRROR_EVIDENCE || '/tmp/qd-mirror-evidence.json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + oidc,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-quantdeus-github-token': githubToken
      },
      body: JSON.stringify({ mode, evidence }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error('Mirror Swarm ' + response.status + ': ' + raw.slice(0, 1200));
    }

    const data = JSON.parse(raw);
    console.log(JSON.stringify(data, null, 2));

    if (process.env.GITHUB_STEP_SUMMARY) {
      const artifact = data.artifact || {};
      const lines = [
        '## QuantDeus Mirror Swarm',
        '',
        '- mode: `' + mode + '`',
        '- action: `' + String(data.action || 'none') + '`',
        '- model: `' + String(data.model || 'unknown') + '`',
        artifact.url ? '- artifact: ' + artifact.url : '',
        data.diagnosis?.root_cause ? '- root cause: ' + String(data.diagnosis.root_cause).slice(0, 500) : ''
      ].filter(Boolean);
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }
  } finally {
    clearTimeout(timer);
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});
