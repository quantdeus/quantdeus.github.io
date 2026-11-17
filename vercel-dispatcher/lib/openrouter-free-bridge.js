// Model credential transport for GitHub Actions -> Vercel Office.
// This never confers a tool permission. GitHub OIDC and existing Office RBAC remain authoritative.
const WHITELIST = /\.github\/workflows\/(?:quantdeus-hourly-openclaw|agent-role-cron|qa-self-heal|seven-priority-cycle|news-manifest-cycle|growth-site-cycle|telegram-bot|site-agent-replies|openclaw-admin-smoke|emh-marketing-qa-stress|daily-swarm-learning|octet-squad)\.yml(?:@|$)/;

export function freeOnlyBridge(req, claims, {vercelInternal = false} = {}) {
  const requested = String(req?.headers?.['x-quantdeus-openrouter-only'] || '').trim() === 'true';
  const suppliedKey = String(req?.headers?.['x-quantdeus-openrouter-key'] || '').trim();
  if (!requested) {
    if (suppliedKey) throw Object.assign(new Error('openrouter_unexpected_credential'), {status: 403});
    return {enabled:false,key:''};
  }
  const workflowRef = String(claims?.workflow_ref || claims?.job_workflow_ref || '');
  if (
    vercelInternal ||
    claims?.repository !== 'quantdeus/quantdeus.github.io' ||
    claims?.ref !== 'refs/heads/main' ||
    !WHITELIST.test(workflowRef)
  ) {
    throw Object.assign(new Error('openrouter_free_lane_requires_main_workflow_oidc'), {status:403});
  }
  if (!/^[A-Za-z0-9._-]{20,256}$/.test(suppliedKey)) {
    throw Object.assign(new Error('openrouter_free_key_missing_or_invalid'), {status:503});
  }
  return {enabled:true,key:suppliedKey,model:'google/gemma-4-26b-a4b-it:free'};
}
