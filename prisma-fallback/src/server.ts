import service from './service.ts';
import registry from './agents.snapshot.json' with { type: 'json' };

type Agent = {
  id: string;
  name?: string;
  emoji?: string;
  role?: string;
  group?: string;
  department?: string;
  operational_status?: string;
};

const agents = Array.isArray((registry as any).agents)
  ? ((registry as any).agents as Agent[])
  : [];

const byId = new Map(agents.map((agent) => [String(agent.id), agent]));

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-quantdeus-runtime': 'prisma-compute-fallback',
    },
  });
}

function publicAgent(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name ?? agent.id,
    emoji: agent.emoji ?? null,
    role: agent.role ?? null,
    group: agent.group ?? null,
    department: agent.department ?? null,
    operational_status: agent.operational_status ?? 'active',
  };
}

function page() {
  const expected = Number((registry as any)?.organization?.employees ?? 27);
  return new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuantDeus Prisma Fallback</title></head>
<body>
  <main>
    <h1>QuantDeus — Prisma fallback</h1>
    <p>Standby control plane is online.</p>
    <p>Canonical agents loaded: <strong>${agents.length}/${expected}</strong>.</p>
    <p>Execution remains gated until an independent model/provider credential is configured and failover is explicitly activated.</p>
    <nav><a href="/health">health</a> · <a href="/agents">agents</a></nav>
  </main>
</body>
</html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-quantdeus-runtime': 'prisma-compute-fallback',
      },
    },
  );
}

Bun.serve({
  port: service.port(),
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/') return page();

    if (req.method === 'GET' && url.pathname === '/health') {
      const expected = Number((registry as any)?.organization?.employees ?? 27);
      return json({
        ok: agents.length === expected,
        status: 'standby',
        runtime: 'prisma-compute-fallback',
        scheduler: 'disabled',
        active_active: false,
        agents_loaded: agents.length,
        agents_expected: expected,
        canonical_registry: 'coordination/agents.json',
      }, agents.length === expected ? 200 : 503);
    }

    if (req.method === 'GET' && url.pathname === '/agents') {
      return json({
        count: agents.length,
        agents: agents.map(publicAgent),
      });
    }

    const match = req.method === 'GET' ? url.pathname.match(/^\/agents\/([^/]+)$/) : null;
    if (match) {
      const agent = byId.get(decodeURIComponent(match[1]));
      return agent
        ? json(publicAgent(agent))
        : json({ error: 'AGENT_NOT_FOUND' }, 404);
    }

    if (req.method === 'POST' && url.pathname === '/dispatch') {
      return json({
        accepted: false,
        code: 'PRISMA_FALLBACK_STANDBY',
        message: 'Execution is intentionally gated to prevent duplicate swarm actions.',
        activation_requires: [
          'independent model/provider credential',
          'explicit failover gate',
          'QA smoke before enabling mutations',
        ],
      }, 503);
    }

    return json({ error: 'NOT_FOUND' }, 404);
  },
});
