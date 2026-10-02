import crypto from 'node:crypto';
import { generateText } from 'ai';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-mirror';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
const ALLOWED_EVENTS = new Set(['schedule', 'workflow_dispatch']);
const MODEL = process.env.QD_MIRROR_MODEL || 'openai/gpt-5.6-sol';
const MAX_FILES = 2;
const MAX_FILE_BYTES = 24000;

let jwksCache = [];
let jwksAt = 0;

function jsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function jwks() {
  if (jwksCache.length && Date.now() - jwksAt < 3600000) return jwksCache;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('github_jwks_fetch_failed_' + response.status);
  jwksCache = (await response.json()).keys || [];
  jwksAt = Date.now();
  return jwksCache;
}

async function verifyGithubOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_github_oidc_format');
  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_github_oidc_header');
  const key = (await jwks()).find(item => item.kid === header.kid);
  if (!key) throw new Error('github_oidc_unknown_key');
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  if (!ok) throw new Error('github_oidc_bad_signature');
  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(AUDIENCE) : claims.aud === AUDIENCE;
  if (claims.iss !== ISSUER || !audienceOk) throw new Error('github_oidc_bad_issuer_or_audience');
  if (!claims.exp || claims.exp < now - 15 || (claims.nbf && claims.nbf > now + 15)) {
    throw new Error('github_oidc_expired_or_not_yet_valid');
  }
  if (claims.repository !== REPOSITORY) throw new Error('github_oidc_wrong_repository');
  if (!ALLOWED_EVENTS.has(String(claims.event_name || ''))) throw new Error('github_oidc_wrong_event');
  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  if (!/\.github\/workflows\/mirror-swarm-repair\.yml(?:@|$)/.test(workflowRef)) {
    throw new Error('github_oidc_wrong_workflow');
  }
  return claims;
}

async function github(token, path, options = {}) {
  const response = await fetch('https://api.github.com/repos/' + REPOSITORY + path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const error = new Error('github_' + response.status + ': ' + raw.slice(0, 800));
    error.status = response.status;
    throw error;
  }
  return data;
}

function parseJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());
  throw new Error('mirror_agent_returned_non_json');
}

async function role(name, system, prompt) {
  const result = await generateText({
    model: MODEL,
    reasoning: 'medium',
    system: [
      'You are ' + name + ' in the QuantDeus independent Mirror Swarm repair plane.',
      'GitHub quantdeus/quantdeus.github.io main is the canonical source of truth.',
      'You diagnose software/runtime defects, not people.',
      'Never expose secrets or invent evidence.',
      'Never weaken authentication, RBAC, QA, branch protection, human approval, or protected policy to make a check green.',
      'Return only the requested strict JSON object.'
    ].join('\n'),
    prompt
  });
  return parseJson(result.text);
}

function boundedText(value, max = 18000) {
  return String(value || '').slice(-max);
}

function safeRepairPath(path) {
  const p = String(path || '').trim();
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  const denied = [
    /^AGENTS\.md$/,
    /^coordination\/(agents|homunculi|civilization-doctrine|manifesto-living|agent-cron-map)\.(json|md)$/,
    /^scripts\/github-oidc\.js$/,
    /^scripts\/qa\//,
    /^vercel-dispatcher\/api\/quantdeus\/(mirror|openclaw|github-auth|telegram)\.js$/,
    /^\.github\/workflows\/(mirror-swarm-repair|qa-self-heal)\.yml$/,
    /secret/i,
    /credential/i,
    /billing/i
  ];
  if (denied.some(re => re.test(p))) return false;
  return (
    /^scripts\/[A-Za-z0-9_./-]+\.js$/.test(p) ||
    /^vercel-dispatcher\/(?:api|lib)\/[A-Za-z0-9_./-]+\.js$/.test(p) ||
    /^\.github\/workflows\/[A-Za-z0-9_.-]+\.yml$/.test(p)
  );
}

async function readMainFile(token, path) {
  if (!safeRepairPath(path)) throw new Error('mirror_path_not_allowed:' + path);
  const data = await github(token, '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=main');
  if (data?.type !== 'file' || !data?.content || !data?.sha) throw new Error('mirror_file_unreadable:' + path);
  const content = Buffer.from(String(data.content).replace(/\n/g, ''), 'base64').toString('utf8');
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new Error('mirror_file_too_large:' + path);
  return { path, sha: data.sha, content };
}

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 12);
}

async function existingArtifact(token, fp) {
  const query = encodeURIComponent('repo:' + REPOSITORY + ' is:open "' + 'mirror-fingerprint:' + fp + '"');
  const response = await fetch('https://api.github.com/search/issues?q=' + query + '&per_page=10', {
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28'
    }
  });
  if (!response.ok) return null;
  const data = await response.json();
  const item = Array.isArray(data.items) ? data.items[0] : null;
  return item ? { number: item.number, url: item.html_url, is_pr: Boolean(item.pull_request) } : null;
}

async function createEscalationIssue(token, diagnosis, critique, fp) {
  const duplicate = await existingArtifact(token, fp);
  if (duplicate) return { action: 'existing', ...duplicate };
  const title = '[MIRROR][REPAIR] ' + boundedText(diagnosis.summary || diagnosis.root_cause || 'Swarm repair finding', 90);
  const body = [
    'Independent Mirror Swarm detected a repair-worthy condition.',
    '',
    '### Diagnosis',
    boundedText(diagnosis.root_cause || diagnosis.summary || 'No concise root cause returned.', 5000),
    '',
    '### Tuvok challenge',
    boundedText(critique.challenge || critique.summary || 'No additional challenge.', 3500),
    '',
    '### Evidence',
    boundedText(JSON.stringify(diagnosis.evidence || [], null, 2), 5000),
    '',
    '### Guardrail',
    'The mirror could not safely produce a bounded draft PR. Human/primary-swarm review is required. No production mutation or secret change was performed.',
    '',
    '<!-- mirror-fingerprint:' + fp + ' -->'
  ].join('\n');
  const issue = await github(token, '/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body })
  });
  return { action: 'issue', number: issue.number, url: issue.html_url };
}

async function createDraftRepairPr(token, files, diagnosis, critique, qa, fp) {
  const duplicate = await existingArtifact(token, fp);
  if (duplicate) return { action: 'existing', ...duplicate };

  const ref = await github(token, '/git/ref/heads/main');
  const baseSha = ref?.object?.sha;
  if (!baseSha) throw new Error('mirror_main_sha_unavailable');

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const branch = 'mirror/repair/' + stamp + '-' + fp.slice(0, 6);
  await github(token, '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: baseSha })
  });

  for (const file of files) {
    await github(token, '/contents/' + file.path.split('/').map(encodeURIComponent).join('/'), {
      method: 'PUT',
      body: JSON.stringify({
        message: 'fix(mirror): bounded swarm repair for ' + fp,
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        sha: file.sha,
        branch
      })
    });
  }

  const body = [
    'Independent Vercel Mirror Swarm repair.',
    '',
    '### Root cause',
    boundedText(diagnosis.root_cause || diagnosis.summary || '', 4000),
    '',
    '### Tuvok falsification',
    boundedText(critique.challenge || critique.summary || '', 2500),
    '',
    '### Mirror QA',
    boundedText(qa.reason || '', 2500),
    '',
    '### Scope',
    files.map(file => '- `' + file.path + '`').join('\n'),
    '',
    '### Safety',
    '- draft PR only; never direct-to-main',
    '- no auto-merge',
    '- no secrets, billing, auth/RBAC, doctrine/registry, QA-validator, or mirror self-modification',
    '- fresh primary QA/Static Smoke must decide mergeability',
    '',
    '<!-- mirror-fingerprint:' + fp + ' -->'
  ].join('\n');

  const pr = await github(token, '/pulls', {
    method: 'POST',
    body: JSON.stringify({
      title: 'fix(mirror): repair swarm runtime ' + fp,
      head: branch,
      base: 'main',
      body,
      draft: true
    })
  });

  return { action: 'draft_pr', number: pr.number, url: pr.html_url, branch };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const auth = String(req.headers.authorization || '');
    const oidc = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    await verifyGithubOidc(oidc);

    const githubToken = String(req.headers['x-quantdeus-github-token'] || '');
    if (!githubToken) return res.status(503).json({ error: 'github_token_unavailable' });

    const mode = req.body?.mode === 'repair' ? 'repair' : 'shadow';
    const evidence = {
      trigger: boundedText(req.body?.evidence?.trigger, 2000),
      validator_state: req.body?.evidence?.validator_state || {},
      validator_logs: boundedText(req.body?.evidence?.validator_logs, 24000),
      recent_failures: Array.isArray(req.body?.evidence?.recent_failures)
        ? req.body.evidence.recent_failures.slice(0, 12)
        : []
    };

    const diagnosis = await role(
      'Mirror Sherlock',
      'Find the smallest evidence-backed root cause and name at most two existing repairable files. If evidence is insufficient or the likely fix touches protected surfaces, escalate instead of guessing.',
      [
        'Evidence:',
        JSON.stringify(evidence, null, 2),
        '',
        'Return exactly:',
        '{"status":"healthy|repair|escalate","summary":"...","root_cause":"...","confidence":0.0,"suspect_files":["path"],"evidence":["fact"]}'
      ].join('\n')
    );

    if (diagnosis.status === 'healthy') {
      return res.status(200).json({ ok: true, mode, action: 'none', diagnosis, model: MODEL });
    }

    const critique = await role(
      'Mirror Tuvok',
      'Challenge the diagnosis. Look for transient provider failures, cancelled jobs, stale evidence, correlation-vs-causation mistakes, and unsafe scope. Preserve uncertainty.',
      [
        'Diagnosis:',
        JSON.stringify(diagnosis, null, 2),
        '',
        'Evidence:',
        JSON.stringify(evidence, null, 2),
        '',
        'Return exactly:',
        '{"supported":true,"challenge":"...","safe_to_patch":true,"preferred_files":["path"],"missing_evidence":["..."]}'
      ].join('\n')
    );

    const requested = Array.from(new Set(
      (Array.isArray(critique.preferred_files) && critique.preferred_files.length
        ? critique.preferred_files
        : diagnosis.suspect_files || [])
        .map(String)
        .filter(safeRepairPath)
    )).slice(0, MAX_FILES);

    const fp = fingerprint(JSON.stringify({
      root: diagnosis.root_cause || diagnosis.summary,
      files: requested,
      failures: evidence.recent_failures.map(item => item?.id || item?.name || item)
    }));

    if (
      mode !== 'repair' ||
      diagnosis.status === 'escalate' ||
      critique.supported !== true ||
      critique.safe_to_patch !== true ||
      requested.length === 0
    ) {
      if (mode === 'repair') {
        const artifact = await createEscalationIssue(githubToken, diagnosis, critique, fp);
        return res.status(200).json({ ok: true, mode, action: artifact.action, artifact, diagnosis, critique, model: MODEL });
      }
      return res.status(200).json({ ok: true, mode, action: 'shadow_finding', diagnosis, critique, fingerprint: fp, model: MODEL });
    }

    const originals = [];
    for (const path of requested) originals.push(await readMainFile(githubToken, path));

    const implementation = await role(
      'Mirror Tasksmith',
      'Produce the smallest full-file replacements that fix only the diagnosed defect. Preserve unrelated behavior and comments. Do not add dependencies. Do not change protected behavior.',
      [
        'Diagnosis:',
        JSON.stringify(diagnosis, null, 2),
        '',
        'Tuvok review:',
        JSON.stringify(critique, null, 2),
        '',
        'Original files:',
        ...originals.map(file => '--- ' + file.path + ' ---\n' + file.content),
        '',
        'Return exactly:',
        '{"summary":"...","files":[{"path":"same/existing/path","content":"complete replacement UTF-8 file"}],"tests":["command or check"]}'
      ].join('\n')
    );

    const replacements = Array.isArray(implementation.files) ? implementation.files : [];
    const byPath = new Map(originals.map(file => [file.path, file]));
    const proposed = [];
    for (const item of replacements) {
      const path = String(item?.path || '');
      const original = byPath.get(path);
      const content = String(item?.content || '');
      if (!original || !safeRepairPath(path)) continue;
      if (!content || Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) continue;
      if (content === original.content) continue;
      proposed.push({ path, sha: original.sha, content, original: original.content });
    }

    if (!proposed.length || proposed.length > MAX_FILES) {
      const artifact = await createEscalationIssue(githubToken, diagnosis, critique, fp);
      return res.status(200).json({ ok: true, mode, action: artifact.action, artifact, diagnosis, critique, implementation, model: MODEL });
    }

    const qa = await role(
      'Mirror QA',
      'Independently verify that the replacement is minimal, syntactically plausible, tied to evidence, and does not weaken safeguards. Reject speculative or broad rewrites.',
      [
        'Diagnosis:',
        JSON.stringify(diagnosis, null, 2),
        '',
        'Tuvok review:',
        JSON.stringify(critique, null, 2),
        '',
        'Implementation summary:',
        JSON.stringify({ summary: implementation.summary, tests: implementation.tests }, null, 2),
        '',
        ...proposed.map(file => [
          '=== ' + file.path + ' ORIGINAL ===',
          file.original,
          '=== ' + file.path + ' PROPOSED ===',
          file.content
        ].join('\n')),
        '',
        'Return exactly:',
        '{"approved":true,"reason":"...","risk":"low|medium|high","required_checks":["..."]}'
      ].join('\n')
    );

    if (qa.approved !== true || qa.risk === 'high') {
      const artifact = await createEscalationIssue(githubToken, diagnosis, critique, fp);
      return res.status(200).json({ ok: true, mode, action: artifact.action, artifact, diagnosis, critique, qa, model: MODEL });
    }

    const artifact = await createDraftRepairPr(
      githubToken,
      proposed.map(({ path, sha, content }) => ({ path, sha, content })),
      diagnosis,
      critique,
      qa,
      fp
    );

    return res.status(200).json({
      ok: true,
      mode,
      action: artifact.action,
      artifact,
      diagnosis,
      critique,
      qa,
      fingerprint: fp,
      model: MODEL
    });
  } catch (error) {
    console.error('[mirror-swarm]', error?.stack || error);
    return res.status(500).json({
      error: 'mirror_swarm_failed',
      detail: String(error?.message || error).slice(0, 800)
    });
  }
}
