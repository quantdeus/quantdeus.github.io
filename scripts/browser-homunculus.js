const fs = require('fs');
const { spawnSync } = require('child_process');

const ISSUE_FILE = process.env.BROWSER_ISSUE_FILE || 'browser-issue.json';
const RESULT_FILE = process.env.BROWSER_RESULT_FILE || 'browser-result.md';
const ARTIFACT_DIR = process.env.BROWSER_ARTIFACT_DIR || 'browser-artifacts';
const ALLOWED_SECRET_KEYS = new Set([
  'QD_BROWSER_EMAIL',
  'QD_BROWSER_USERNAME',
  'QD_BROWSER_PASSWORD',
  'QD_BROWSER_PHONE',
  'QD_BROWSER_RECOVERY_EMAIL'
]);

function writeResult(status, lines) {
  const body = [
    '## 🌐 Browser Homunculus',
    '',
    '**Status:** ' + status,
    '',
    ...lines,
    '',
    '_Runtime: GitHub Actions + vercel-labs/agent-browser. Secrets are never written to this report._'
  ].join('\n');
  fs.writeFileSync(RESULT_FILE, body + '\n');
}

function labelsOf(issue) {
  return (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
}

function parseManifest(issue) {
  const body = String(issue.body || '');
  const m = body.match(/<!-- qd-browser-task:start -->\s*~~~json\s*([\s\S]*?)\s*~~~\s*<!-- qd-browser-task:end -->/i);
  if (!m) throw new Error('browser_task_manifest_missing');
  return JSON.parse(m[1]);
}

function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\*\./, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  return !!(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

function validateManifest(issue, manifest) {
  const labels = labelsOf(issue);
  if (!labels.includes('governance:passed')) throw new Error('governance_approval_required');
  if (!labels.includes('agent:control-tower')) throw new Error('control_tower_routing_required');

  if (!manifest || manifest.version !== 1) throw new Error('unsupported_manifest_version');
  if (!['steps', 'chat'].includes(manifest.mode)) throw new Error('mode_must_be_steps_or_chat');

  const url = new URL(manifest.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http_https_only');
  if (isPrivateHost(url.hostname)) throw new Error('private_network_targets_blocked');

  const allowedDomains = Array.isArray(manifest.allowed_domains) && manifest.allowed_domains.length
    ? manifest.allowed_domains.map(String)
    : [url.hostname, url.hostname.startsWith('www.') ? url.hostname.slice(4) : 'www.' + url.hostname];

  if (allowedDomains.some(isPrivateHost)) throw new Error('private_allowed_domain_blocked');
  const root = url.hostname.toLowerCase();
  const allowed = allowedDomains.some(d => {
    const x = d.toLowerCase();
    return x === root || (x.startsWith('*.') && root.endsWith(x.slice(1)));
  });
  if (!allowed) throw new Error('target_not_in_allowed_domains');

  if (manifest.mode === 'steps') {
    if (!Array.isArray(manifest.actions) || !manifest.actions.length) throw new Error('steps_mode_requires_actions');
    if (manifest.actions.length > 30) throw new Error('too_many_browser_actions');
  }

  if (manifest.mode === 'chat') {
    if (!String(manifest.instruction || '').trim()) throw new Error('chat_mode_requires_instruction');
    if (String(manifest.instruction).length > 4000) throw new Error('instruction_too_long');
    if (/bypass.{0,30}(captcha|verification|anti-bot)|solve.{0,20}captcha|mass.{0,20}(signup|account)|bulk.{0,20}(signup|account)/i.test(manifest.instruction)) {
      throw new Error('unsafe_anti_bot_or_bulk_instruction');
    }
  }

  return { url: url.toString(), allowedDomains };
}

let usedSecrets = false;

function secretValue(key) {
  if (!ALLOWED_SECRET_KEYS.has(key)) throw new Error('secret_slot_not_allowed:' + key);
  const value = process.env[key];
  if (!value) throw new Error('secret_slot_missing:' + key);
  usedSecrets = true;
  return value;
}

function actionValue(action) {
  if (action.value_env) return secretValue(String(action.value_env));
  return String(action.value ?? '');
}

function runAB(args, env, allowFailure = false) {
  const out = spawnSync('agent-browser', args, {
    encoding: 'utf8',
    env,
    timeout: 120000
  });
  if (out.error) throw out.error;
  if (out.status !== 0 && !allowFailure) {
    const detail = String(out.stderr || out.stdout || '').slice(0, 1200);
    throw new Error('agent_browser_failed:' + args[0] + ':' + detail);
  }
  return String(out.stdout || '');
}

function gateDetected(snapshot) {
  return /(captcha|recaptcha|hcaptcha|turnstile|verify you are human|two[- ]factor|2fa|verification code|sms code|authenticator|passkey)/i.test(snapshot);
}

function performAction(action, env) {
  const op = String(action.op || '');
  switch (op) {
    case 'snapshot':
      return runAB(['snapshot', '-i', '--json'], env);
    case 'fill_label':
      runAB(['find', 'label', String(action.label), 'fill', actionValue(action)], env);
      return '';
    case 'type_label':
      runAB(['find', 'label', String(action.label), 'type', actionValue(action)], env);
      return '';
    case 'click_role':
      runAB(['find', 'role', String(action.role), 'click', '--name', String(action.name)], env);
      return '';
    case 'click_text':
      runAB(['find', 'text', String(action.text), 'click'], env);
      return '';
    case 'check_label':
      runAB(['find', 'label', String(action.label), 'check'], env);
      return '';
    case 'select_label':
      runAB(['find', 'label', String(action.label), 'select', actionValue(action)], env);
      return '';
    case 'fill_selector':
      runAB(['fill', String(action.selector), actionValue(action)], env);
      return '';
    case 'click_selector':
      runAB(['click', String(action.selector)], env);
      return '';
    case 'press':
      runAB(['press', String(action.key)], env);
      return '';
    case 'wait_load':
      runAB(['wait', '--load', String(action.state || 'networkidle')], env);
      return '';
    case 'wait_url':
      runAB(['wait', '--url', String(action.pattern)], env);
      return '';
    case 'screenshot':
      if (!usedSecrets) {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
        runAB(['screenshot', ARTIFACT_DIR + '/' + String(action.name || 'step.png')], env);
      }
      return '';
    default:
      throw new Error('unsupported_browser_action:' + op);
  }
}

function main() {
  let issue;
  let manifest;
  try {
    issue = JSON.parse(fs.readFileSync(ISSUE_FILE, 'utf8'));
    manifest = parseManifest(issue);
    const validated = validateManifest(issue, manifest);

    if (process.argv.includes('--validate')) {
      writeResult('validated', [
        '- Issue #' + issue.number + ' прошёл governance gate.',
        '- Target: ' + validated.url,
        '- Mode: ' + manifest.mode,
        '- Allowed domains: ' + validated.allowedDomains.join(', ')
      ]);
      console.log('Browser task validated');
      return;
    }

    const env = {
      ...process.env,
      AGENT_BROWSER_ALLOWED_DOMAINS: validated.allowedDomains.join(','),
      AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
      AGENT_BROWSER_IDLE_TIMEOUT_MS: '300000'
    };

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    runAB(['open', validated.url], env);
    runAB(['wait', '--load', 'domcontentloaded'], env, true);

    let snapshot = runAB(['snapshot', '-i', '--json'], env);
    if (gateDetected(snapshot)) {
      writeResult('human_handoff_required', [
        '- Страница сразу запросила CAPTCHA / 2FA / verification.',
        '- Автоматическое обходное действие не выполнялось.',
        '- Target: ' + validated.url
      ]);
      return;
    }

    if (manifest.mode === 'chat') {
      throw new Error('browser_chat_llm_disabled_until_verified_provider_adapter');
    } else {
      for (let i = 0; i < manifest.actions.length; i++) {
        performAction(manifest.actions[i], env);
        snapshot = runAB(['snapshot', '-i', '--json'], env, true);
        if (gateDetected(snapshot)) {
          writeResult('human_handoff_required', [
            '- Выполнено шагов: ' + (i + 1) + ' из ' + manifest.actions.length + '.',
            '- Обнаружен CAPTCHA / 2FA / verification gate; выполнение остановлено.',
            '- Обход проверки не выполнялся.'
          ]);
          return;
        }
      }
    }

    const currentUrl = runAB(['get', 'url'], env, true).trim();
    const title = runAB(['get', 'title'], env, true).trim();

    if (!usedSecrets && manifest.allow_artifacts === true) {
      runAB(['screenshot', ARTIFACT_DIR + '/final.png', '--full'], env, true);
    }

    writeResult('completed', [
      '- Mode: ' + manifest.mode,
      '- Final URL: ' + (currentUrl || 'unknown'),
      '- Page title: ' + (title || 'unknown'),
      usedSecrets
        ? '- Credentials использовались только из GitHub Secrets; скриншот после ввода секретов не сохранялся.'
        : '- Секретные credential slots не использовались.'
    ]);
  } catch (error) {
    writeResult('blocked', [
      '- Причина: ' + String(error && error.message ? error.message : error).replace(/\n/g, ' ').slice(0, 1200)
    ]);
    process.exitCode = 1;
  } finally {
    spawnSync('agent-browser', ['close'], { encoding: 'utf8', env: process.env, timeout: 30000 });
  }
}

main();
