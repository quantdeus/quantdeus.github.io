const DAY = 86400000;

/**
 * Pure planning only. Zero network, storage, SMTP, provider SDKs or email payloads.
 * Input MUST eventually come from an authenticated, private opt-in store,
 * not public GitHub issues or Actions artifacts.
 */
export function planDueMessages(subscribers, config, now = new Date()) {
  if (config?.delivery?.external_send_enabled !== false ||
      config?.delivery?.real_subscriber_fetch_enabled !== false) {
    throw new Error("Fail closed: newsletter engine is dry-run only");
  }
  const when = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(when)) throw new Error("Invalid evaluation time");
  const minGap = config.delivery.minimum_days_between_marketing_emails * DAY;
  if (!Number.isFinite(minGap) || minGap < 7 * DAY) {
    throw new Error("Marketing frequency guard disabled");
  }
  if (!Array.isArray(subscribers)) throw new Error("Expected array");
  const planned = [];
  const unique = new Set();

  for (const sub of subscribers) {
    if (!sub || typeof sub.id !== "string" || !sub.id) continue;
    if (unique.has(sub.id)) continue;
    unique.add(sub.id);
    if (sub.source === "github_issue" || sub.state !== "confirmed") continue;
    const consent = sub.consent;
    if (consent?.checked !== true || consent?.source !== "newsletter_form" ||
        !consent.version || !Number.isFinite(Date.parse(consent.timestamp))) continue;
    const confirmedAt = Date.parse(sub.confirmed_at);
    const consentAt = Date.parse(consent.timestamp);
    if (!Number.isFinite(confirmedAt) || confirmedAt < consentAt ||
        confirmedAt > when || consentAt > when) continue;
    if (!Array.isArray(sub.topics) || !sub.topics.length) continue;

    if (sub.last_marketing_at != null) {
      const last = Date.parse(sub.last_marketing_at);
      if (!Number.isFinite(last) || last > when || when - last < minGap) continue;
    }

    const sent = new Set(Array.isArray(sub.sent_message_ids) ? sub.sent_message_ids : []);
    const due = [];
    for (const topic of sub.topics) {
      const segment = config.segments?.[topic];
      if (!segment || !Array.isArray(segment.messages)) continue;
      for (const message of segment.messages) {
        if (!message.id || !Number.isFinite(message.after_days) || message.after_days < 0) {
          throw new Error("Invalid newsletter configuration");
        }
        if (confirmedAt + message.after_days * DAY <= when && !sent.has(message.id)) {
          due.push({ message_id: message.id, topic, after_days: message.after_days });
        }
      }
    }
    due.sort((a, b) => a.after_days - b.after_days || a.message_id.localeCompare(b.message_id));
    if (due.length) {
      // At most one message per subscriber; real transport must add atomic lease
      // and idempotency keyed on subscriber_id + message_id.
      planned.push({ subscriber_id: sub.id, message_id: due[0].message_id, topic: due[0].topic });
    }
  }
  return planned;
}
