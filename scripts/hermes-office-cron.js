#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'coordination', 'agents.json');
const hermesPath = path.join(os.homedir(), '.local', 'bin', 'hermes');
const dryRun = process.argv.includes('--dry-run');

function loadProfiles() {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const profiles = (registry.agents || []).map(agent => String(agent.id || ''));
  if (!profiles.length || profiles.some(id => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))) {
    throw new Error('invalid_canonical_agent_profiles');
  }
  if (new Set(profiles).size !== profiles.length) throw new Error('duplicate_canonical_agent_profiles');
  return profiles;
}

function main() {
  const profiles = loadProfiles();
  if (dryRun) {
    process.stdout.write(JSON.stringify({
      ok: true,
      dry_run: true,
      profiles_checked: profiles.length,
      profiles_succeeded: profiles.length,
      profiles_failed: 0
    }) + '\n');
    return;
  }

  if (!fs.existsSync(hermesPath)) throw new Error('hermes_cli_missing');
  let succeeded = 0;
  const failed = [];

  for (const profile of profiles) {
    const result = spawnSync(hermesPath, ['-p', profile, 'cron', 'tick'], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: 280000,
      maxBuffer: 1024 * 1024
    });

    if (result.error || result.status !== 0) {
      failed.push({
        profile,
        reason: result.error?.code === 'ETIMEDOUT'
          ? 'timeout'
          : (result.error ? 'process_error' : 'exit_' + result.status)
      });
    } else {
      succeeded += 1;
    }
  }

  const summary = {
    ok: failed.length === 0,
    profiles_checked: profiles.length,
    profiles_succeeded: succeeded,
    profiles_failed: failed.length,
    failed
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write('Hermes cron pulse failed: ' + String(error.message || error).replace(/[\\r\\n]/g, ' ').slice(0, 400) + '\n');
  process.exitCode = 1;
}
