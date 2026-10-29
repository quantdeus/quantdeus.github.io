import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/growth-three-funnel-pilot.mjs');
const baseConfig = JSON.parse(fs.readFileSync(path.join(root, 'coordination/growth/three-funnel-pipeline.json'), 'utf8'));
const baseDiscovery = JSON.parse(fs.readFileSync(path.join(root, 'coordination/growth/discovery-shortlist.json'), 'utf8'));

function dryRun(config, discovery) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-growth-'));
  try {
    fs.mkdirSync(path.join(dir, 'coordination/growth'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'coordination/growth/three-funnel-pipeline.json'), JSON.stringify(config));
    fs.writeFileSync(path.join(dir, 'coordination/growth/discovery-shortlist.json'), JSON.stringify(discovery));
    return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('dry-run валидирует источник без отправок и не превращает его в лид', () => {
  const result = dryRun(structuredClone(baseConfig), structuredClone(baseDiscovery));
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.checked_public_sources, 1);
  assert.equal(report.outbound_messages, 0);
  assert.equal(report.leads_collected, 0);
  assert.match(report.warning, /не означает проверенного лида/);
  assert.equal(baseConfig.metrics.verified_leads, null);
});

test('отклоняется включение исходящей отправки', () => {
  const config = structuredClone(baseConfig);
  config.rules.external_send_enabled = true;
  assert.notEqual(dryRun(config, structuredClone(baseDiscovery)).status, 0);
});

test('отклоняется отключение human approval', () => {
  const config = structuredClone(baseConfig);
  config.rules.human_approval_required = false;
  assert.notEqual(dryRun(config, structuredClone(baseDiscovery)).status, 0);
});

test('проверенный источник требует URL правил', () => {
  const discovery = structuredClone(baseDiscovery);
  discovery.sources[0].rules_url = null;
  assert.notEqual(dryRun(structuredClone(baseConfig), discovery).status, 0);
});

test('публичные правила сами по себе не разрешают исходящий контакт', () => {
  const discovery = structuredClone(baseDiscovery);
  discovery.sources[0].contact_state = 'approved';
  assert.notEqual(dryRun(structuredClone(baseConfig), discovery).status, 0);
});

test('лимиты и запреты на концертные обязательства нельзя ослабить', () => {
  const config = structuredClone(baseConfig);
  config.rules.max_vk_messages_per_day = 11;
  assert.notEqual(dryRun(config, structuredClone(baseDiscovery)).status, 0);
  config.rules.max_vk_messages_per_day = 10;
  config.rules.do_not_sign_contracts = false;
  assert.notEqual(dryRun(config, structuredClone(baseDiscovery)).status, 0);
});
