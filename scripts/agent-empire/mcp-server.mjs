// Minimal read-only QuantDeus MCP stdio service. No external network, keys or paid inference.
// Exposes 10,000 logical agent addresses as MCP read-only planning tools.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { enumerateVirtualAgents, planSwarm, requestedSlots, validateConfig } from './core.mjs';

const TOOLS = [
  {
    name: 'quantdeus_plan_swarm',
    title: 'Plan bounded logical agent swarm',
    description: 'Read-only 10,000-slot offline plan; starts zero LLMs, sends zero posts.',
    inputSchema: { type: 'object', properties: {
      slots: { type: 'integer', minimum: 1, maximum: 10000, default: 10000 }
    }, additionalProperties: false }
  },
  {
    name: 'quantdeus_lookup_slot',
    title: 'Look up a virtual agent address',
    description: 'Read one deterministic planning slot, not a live model.',
    inputSchema: { type: 'object', properties: {
      slot: { type: 'integer', minimum: 1, maximum: 10000 }
    }, required: ['slot'], additionalProperties: false }
  }
];

export function handleRpc(message, config) {
  validateConfig(config);
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }
  if (!Object.hasOwn(message, 'id')) return null; // notifications cannot trigger side effects
  const id = message.id;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, msg) => ({ jsonrpc: '2.0', id, error: { code, message: msg } });
  if (message.jsonrpc !== '2.0') return err(-32600, 'Invalid Request');
  if (message.method === 'initialize') return ok({
    protocolVersion: '2025-06-18',
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'quantdeus-10k-readonly', version: '0.1.0' },
    instructions: 'Read-only planning. Virtual slots are not model sessions. No social writes, secrets, tool execution or paid inference.'
  });
  if (message.method === 'ping') return ok({});
  if (message.method === 'tools/list') return ok({ tools: TOOLS });
  if (message.method !== 'tools/call') return err(-32601, 'Method not found');
  const name = message.params?.name;
  const args = message.params?.arguments || {};
  if (typeof args !== 'object' || Array.isArray(args) || !TOOLS.some(t => t.name === name)) {
    return err(-32602, 'Invalid parameters or unknown tool');
  }
  if (name === 'quantdeus_plan_swarm') {
    if (Object.keys(args).some(k => k !== 'slots')) return err(-32602, 'Unexpected parameter');
    try {
      const result = planSwarm(config, args.slots ?? config.max_virtual_agents);
      return ok({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
    } catch { return err(-32602, 'Invalid slot count'); }
  }
  if (Object.keys(args).some(k => k !== 'slot')) return err(-32602, 'Unexpected parameter');
  try {
    const slot = requestedSlots(args.slot, config);
    let agent;
    for (const candidate of enumerateVirtualAgents(config, slot)) agent = candidate;
    return ok({ content: [{ type: 'text', text: JSON.stringify(agent) }], isError: false });
  } catch { return err(-32602, 'Invalid slot number'); }
}

function start() {
  const config = validateConfig(JSON.parse(readFileSync('coordination/agent-empire/mesh.json', 'utf8')));
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    if (line.length > 16384) {
      process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:null, error:{code:-32600,message:'Request too large'}}) + '\n');
      return;
    }
    let response;
    try { response = handleRpc(JSON.parse(line), config); }
    catch { response = {jsonrpc:'2.0', id:null, error:{code:-32700,message:'Parse error'}}; }
    if (response !== null) process.stdout.write(JSON.stringify(response) + '\n');
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) start();
