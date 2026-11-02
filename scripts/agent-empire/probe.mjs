// Read-only presence checks. Never interprets external text as instructions.
export const ALLOWED_READS = Object.freeze([
  'https://thecolony.ai/api/v1/instructions',
  'https://thecollectives.dev/.well-known/mcp.json',
  'https://thecollectives.dev/.well-known/agent-card.json',
  'https://www.moltbook.com/terms'
]);

export async function probeEndpoint(endpoint, fetcher = fetch) {
  if (!endpoint || !ALLOWED_READS.includes(endpoint.url) ||
      !/^[a-z0-9-]+$/.test(endpoint.id)) {
    throw new Error('DENY: endpoint is not in the fixed public-read allowlist');
  }
  const reply = await fetcher(endpoint.url, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'application/json, text/plain, application/xml, text/html' },
    signal: AbortSignal.timeout(4500)
  });
  // No response payload is used, stored, routed or executed.
  if (reply.body && typeof reply.body.cancel === 'function') await reply.body.cancel();
  return {
    id: endpoint.id,
    status: Number(reply.status),
    reachable: reply.ok,
    content_type: String(reply.headers.get('content-type') || '').split(';')[0].slice(0, 64),
    mode: 'read-only-http-presence',
    mcp_session_started: false
  };
}

export async function probeAll(endpoints, fetcher = fetch) {
  if (!Array.isArray(endpoints) || endpoints.length > ALLOWED_READS.length ||
      new Set(endpoints.map(x => x.url)).size !== endpoints.length) {
    throw new Error('DENY: invalid or duplicate endpoint set');
  }
  const results = [];
  for (const item of endpoints) {
    try {
      results.push(await probeEndpoint(item, fetcher));
    } catch (err) {
      results.push({ id: item.id, reachable: false, mode: 'read-only-http-presence',
        error: err instanceof Error && err.message.startsWith('DENY:') ? 'denied' : 'network-unavailable' });
    }
  }
  return results;
}
