// Shared persistent Office lifecycle helpers. Requests never stop the named VM.
export async function ensureOfficeWindow(sandbox, now = Date.now()) {
  const remaining = sandbox.expiresAt?.getTime() - now;
  const needed = 6 * 60 * 1000;
  if (!Number.isFinite(remaining) || remaining >= needed) return;
  try { await sandbox.extendTimeout(needed - Math.max(0, remaining)); }
  catch { throw Object.assign(new Error('openclaw_office_busy: session cannot cover a full request'), { status: 503 }); }
}
export async function cleanupOfficeRequest(sandbox, files, directories) {
  if (!sandbox) return;
  for (const [flag, paths] of [['-f', files], ['-rf', directories]]) {
    if (!paths.length) continue;
    try { await sandbox.runCommand({ cmd: 'rm', args: [flag, ...paths] }); }
    catch { console.error('[openclaw-cleanup] request cleanup failed'); }
  }
}
export async function runOfficeAgent(sandbox, { lock, args, cwd, env, queueWaitSeconds = 45 }) {
  const wait = Math.max(1, Math.min(120, Math.floor(Number(queueWaitSeconds) || 45)));
  let run;
  try {
    run = await sandbox.runCommand({ cmd: 'flock', args: ['-w', String(wait), '-E', '75', lock, 'openclaw', ...args], cwd, env });
  } catch (error) {
    const message = String(error?.message || error);
    if (/chdir .*no such file or directory/i.test(message)) {
      throw Object.assign(new Error('openclaw_workspace_missing_before_exec: ' + message.slice(0, 700)), {
        status: 503,
        retrySafe: true,
        code: 'OPENCLAW_WORKSPACE_MISSING'
      });
    }
    throw error;
  }
  if (run.exitCode === 75) {
    throw Object.assign(new Error('openclaw_office_busy: agent queue wait exceeded ' + wait + 's'), {
      status: 503,
      retrySafe: true,
      code: 'OPENCLAW_OFFICE_BUSY'
    });
  }
  return run;
}
