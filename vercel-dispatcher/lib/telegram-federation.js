const DEFAULTS = Object.freeze({
  windowMs: 60_000,
  privateMax: 18,
  groupMax: 36,
  duplicateMs: 10_000,
  maxEntries: 2_000,
  pendingWarn: 25,
  pendingRequest: 100
});

const chatWindows = new Map();
const recentUpdates = new Map();

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function enabled() {
  const value = String(process.env.QUANTDEUS_TELEGRAM_FEDERATION_ENABLED || 'true').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled'].includes(value);
}

function limits() {
  return {
    windowMs: positiveInt(process.env.QUANTDEUS_TELEGRAM_RATE_WINDOW_MS, DEFAULTS.windowMs),
    privateMax: positiveInt(process.env.QUANTDEUS_TELEGRAM_PRIVATE_RATE_MAX, DEFAULTS.privateMax),
    groupMax: positiveInt(process.env.QUANTDEUS_TELEGRAM_GROUP_RATE_MAX, DEFAULTS.groupMax),
    duplicateMs: positiveInt(process.env.QUANTDEUS_TELEGRAM_DUPLICATE_MS, DEFAULTS.duplicateMs),
    maxEntries: positiveInt(process.env.QUANTDEUS_TELEGRAM_TRACKING_MAX, DEFAULTS.maxEntries)
  };
}

function trimMap(map, now, ttl, maxEntries) {
  for (const [key, value] of map) {
    const at = typeof value === 'number' ? value : value?.at;
    if (!at || now - at > ttl) map.delete(key);
  }
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function telegramFederationPolicy() {
  const current = limits();
  return {
    version: '2026-10-05-mvp1',
    issue: 430,
    enabled: enabled(),
    mode: 'bounded-opt-in',
    transport: 'webhook-only',
    node_registration: 'owner-admin-approved',
    outreach: 'opt-in-only',
    autonomous_replication: false,
    autonomous_server_provisioning: false,
    autonomous_spend: false,
    rate_limits: {
      window_ms: current.windowMs,
      private_max: current.privateMax,
      group_max: current.groupMax
    },
    loop_protection: {
      bot_authored_updates: 'drop',
      immediate_duplicate_updates: 'drop',
      duplicate_window_ms: current.duplicateMs
    },
    scale_request: 'owner-review-only'
  };
}

export function guardTelegramIngress(update, now = Date.now()) {
  if (!enabled()) return { ok: true, status: 'federation_guard_disabled' };

  const message = update?.message;
  if (!message) return { ok: true, status: 'non_message_update' };
  if (message?.from?.is_bot) {
    return { ok: false, status: 'blocked_bot_authored_update', reason: 'loop_protection' };
  }

  const current = limits();
  trimMap(recentUpdates, now, current.duplicateMs, current.maxEntries);

  const updateId = Number.isInteger(update?.update_id) ? String(update.update_id) : '';
  if (updateId) {
    const previous = recentUpdates.get(updateId);
    if (previous && now - previous < current.duplicateMs) {
      return { ok: false, status: 'blocked_duplicate_update', reason: 'loop_protection' };
    }
    recentUpdates.set(updateId, now);
  }

  const chatId = String(message?.chat?.id ?? 'unknown');
  const chatType = String(message?.chat?.type || 'private');
  const max = chatType === 'private' ? current.privateMax : current.groupMax;
  const key = chatType + ':' + chatId;
  const previousWindow = chatWindows.get(key);
  const window = !previousWindow || now - previousWindow.startedAt >= current.windowMs
    ? { startedAt: now, count: 0, at: now }
    : previousWindow;

  window.count += 1;
  window.at = now;
  chatWindows.set(key, window);
  trimMap(chatWindows, now, current.windowMs * 2, current.maxEntries);

  if (window.count > max) {
    return {
      ok: false,
      status: 'rate_limited',
      reason: 'bounded_queue_protection',
      retry_after_ms: Math.max(1, current.windowMs - (now - window.startedAt))
    };
  }

  return {
    ok: true,
    status: 'accepted',
    remaining: Math.max(0, max - window.count),
    window_ms: current.windowMs
  };
}

export function telegramFederationHealth(webhookInfo = {}) {
  const pending = Math.max(0, Number(webhookInfo?.pending_update_count) || 0);
  const errorMessage = String(webhookInfo?.last_error_message || '').trim().slice(0, 240);
  const pendingWarn = positiveInt(process.env.QUANTDEUS_TELEGRAM_PENDING_WARN, DEFAULTS.pendingWarn);
  const pendingRequest = positiveInt(process.env.QUANTDEUS_TELEGRAM_PENDING_SCALE_REQUEST, DEFAULTS.pendingRequest);

  const scaleRequested = pending >= pendingRequest;
  const degraded = Boolean(errorMessage) || pending >= pendingWarn;

  return {
    policy: telegramFederationPolicy(),
    health: degraded ? 'degraded' : 'ok',
    pending_update_count: pending,
    last_error_message: errorMessage || null,
    scale_request: scaleRequested
      ? {
          requested: true,
          action: 'owner-review',
          reason: 'pending_update_threshold',
          measured_pending_updates: pending,
          autonomous_provisioning: false,
          autonomous_spend: false
        }
      : {
          requested: false,
          action: 'none',
          measured_pending_updates: pending
        }
  };
}
