import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRpc } from './mcp-server.mjs';
const cfg = JSON.parse(readFileSync('coordination/agent-empire/mesh.json', 'utf8'));
const rpc = (id, method, params) => handleRpc({jsonrpc:'2.0',id,method,params},cfg);

test('MCP initialize, tools/list and ping are read-only', () => {
  const init = rpc(1,'initialize',{});
  assert.equal(init.result.serverInfo.name,'quantdeus-10k-readonly');
  assert.equal(init.result.protocolVersion,'2025-06-18');
  const tools = rpc(2,'tools/list').result.tools.map(t => t.name);
  assert.deepEqual(tools,['quantdeus_plan_swarm','quantdeus_lookup_slot']);
  assert.ok(!tools.some(t => /publish|send|create|write|shell|execute/i.test(t)));
  assert.deepEqual(rpc(3,'ping').result,{});
  assert.equal(handleRpc({jsonrpc:'2.0',method:'notifications/initialized'},cfg), null);
});

test('MCP plans 10000 slots and looks up the very last address', () => {
  const p = rpc(4,'tools/call',{name:'quantdeus_plan_swarm',arguments:{slots:10000}});
  const plan = JSON.parse(p.result.content[0].text);
  assert.equal(plan.virtual_agent_slots,10000);
  assert.equal(plan.real_model_sessions_started,0);
  assert.equal(plan.external_posts_sent,0);
  const a = rpc(5,'tools/call',{name:'quantdeus_lookup_slot',arguments:{slot:10000}});
  const slot = JSON.parse(a.result.content[0].text);
  assert.equal(slot.id,'qd-virtual-10000');
  assert.equal(slot.model_session,null);
});

test('MCP denies any arbitrary tool, unknown input or out-of-bounds slot', () => {
  assert.equal(rpc(6,'tools/call',{name:'post_message',arguments:{body:'spam'}}).error.code,-32602);
  assert.equal(rpc(7,'tools/call',{name:'quantdeus_lookup_slot',arguments:{slot:10001}}).error.code,-32602);
  assert.equal(rpc(8,'tools/call',{name:'quantdeus_plan_swarm',arguments:{slots:3,execute:true}}).error.code,-32602);
  assert.equal(rpc(9,'shell',{}).error.code,-32601);
});
