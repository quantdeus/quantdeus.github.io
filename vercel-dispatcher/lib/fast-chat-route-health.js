// Bounded, in-memory provider cooldowns for the read-only internal chat lane.
// A serverless instance may be recycled; cooldowns are an optimization, not durable state.
const blockedUntil = new Map();

function retryAfterMs(value, now) {
  const text = String(value || '').trim();
  const seconds = Number(text);
  if (text && Number.isFinite(seconds) && seconds > 0) {
    return Math.min(120000, Math.max(1000, Math.ceil(seconds * 1000)));
  }
  const date = text ? Date.parse(text) : NaN;
  if (Number.isFinite(date) && date > now) {
    return Math.min(120000, Math.max(1000, date - now));
  }
  return 60000;
}

export function selectReadyFastRoutes(healthyRefs, candidates, { now = Date.now(), maxRoutes = 4 } = {}) {
  const byRef = new Map((candidates || []).map(candidate => [candidate.ref, candidate]));
  return [...new Set(healthyRefs || [])]
    .filter(ref => (blockedUntil.get(ref) || 0) <= now)
    .map(ref => byRef.get(ref))
    .filter(Boolean)
    .slice(0, maxRoutes);
}

// Call only after a failed or empty turn. Never penalize an HTTP 200 with usable text.
export function markFastRouteFailure(ref, status, retryAfter, { now = Date.now() } = {}) {
  if (!ref) return 0;
  const waitMs = status === 429 ? retryAfterMs(retryAfter, now)
    : (status === 200 || status === 401 || status === 403 || status >= 500 ? 12000 : 0);
  if (waitMs > 0) blockedUntil.set(ref, now + waitMs);
  return Math.ceil(waitMs / 1000);
}

export function nextFastRouteRetrySeconds(healthyRefs, { now = Date.now() } = {}) {
  const pending = (healthyRefs || [])
    .map(ref => (blockedUntil.get(ref) || 0) - now)
    .filter(ms => ms > 0);
  return pending.length ? Math.max(1, Math.ceil(Math.min(...pending) / 1000)) : 1;
}
