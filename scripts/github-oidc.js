'use strict';

const TRANSIENT_OIDC_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getGithubOidcToken(audience, options = {}) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('GITHUB_OIDC_UNAVAILABLE');
  if (!audience) throw new Error('GITHUB_OIDC_AUDIENCE_REQUIRED');

  const attempts = Math.max(1, Math.min(4, Number(options.attempts || 3)));
  const baseDelayMs = Math.max(100, Math.min(3000, Number(options.baseDelayMs || 750)));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = requestUrl.includes('?') ? '&' : '?';
      const response = await fetch(requestUrl + separator + 'audience=' + encodeURIComponent(audience), {
        headers: { authorization: 'Bearer ' + requestToken, accept: 'application/json' }
      });
      const raw = await response.text();

      if (response.ok) {
        let data;
        try { data = JSON.parse(raw); }
        catch { throw new Error('GitHub OIDC returned non-JSON'); }
        if (!data?.value) throw new Error('GitHub OIDC returned no token');
        if (attempt > 1) {
          console.warn('[github-oidc] recovered after transient failure', { attempt, audience });
        }
        return data.value;
      }

      const error = new Error('GitHub OIDC ' + response.status + ': ' + raw.slice(0, 500));
      error.status = response.status;
      lastError = error;
      if (!TRANSIENT_OIDC_STATUS.has(response.status) || attempt >= attempts) throw error;
      console.warn('[github-oidc] transient HTTP failure; retrying', {
        attempt,
        status: response.status,
        audience
      });
    } catch (error) {
      lastError = error;
      const transientNetwork = error?.status == null;
      if ((!transientNetwork && !TRANSIENT_OIDC_STATUS.has(error.status)) || attempt >= attempts) throw error;
      console.warn('[github-oidc] transient network failure; retrying', {
        attempt,
        message: String(error?.message || error).slice(0, 300),
        audience
      });
    }

    await sleep(baseDelayMs * attempt);
  }

  throw lastError || new Error('GITHUB_OIDC_FAILED');
}

module.exports = { getGithubOidcToken };
