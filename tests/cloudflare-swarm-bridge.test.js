'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {normalize,readSwarmStatus} = require('../scripts/cloudflare-swarm-bridge');

const payload = {
  schema_version:1,role:'seven-of-nine',source_of_truth:'github',writes_enabled:false,
  swarms:[
    {id:'github-office',status:'configured'},
    {id:'galactic-metaverse',connected:true,responding:true},
    {id:'warp-research',connected:true,responding:true},
    {id:'warp-scheduler',connected:true,responding:true,http_status:404}
  ],
  warp:{tasks:{queued:15,needs_human_review:1,qa_rejected:1},ai_daily_calls:1,latest_scheduler_outcome:'manual_test_needs_review'}
};

test('принимает ограниченные статусы всех связанных роев',()=>{
  const x=normalize(payload);
  assert.equal(x.state,'connected');
  assert.equal(x.services['warp-scheduler'].connected,true);
  assert.equal(x.warp_tasks.queued,15);
  assert.equal(x.daily_ai_calls,1);
});
test('игнорирует непроверенные статусы и лишние имена',()=>{
  const x=normalize({...payload,swarms:[...payload.swarms,{id:'untrusted-swarm',connected:true}],warp:{tasks:{queued:-8,root_access:999},ai_daily_calls:Infinity}});
  assert.equal(x.services['untrusted-swarm'],undefined);
  assert.equal(x.warp_tasks.queued,0);
  assert.equal(x.warp_tasks.root_access,undefined);
  assert.equal(x.daily_ai_calls,0);
});
test('отвергает чужой источник полномочий',()=>{
  assert.throws(()=>normalize({...payload,writes_enabled:true}),/INVALID_BRIDGE_CONTRACT/);
  assert.throws(()=>normalize({...payload,source_of_truth:'cloudflare'}),/INVALID_BRIDGE_CONTRACT/);
});
test('недоступный Cloudflare не ломает цикл Seven',async()=>{
  const x=await readSwarmStatus(async()=>({ok:false,status:503}));
  assert.deepEqual(x,{state:'unreachable',reason:'HTTP_503'});
});
test('ошибка сети обрабатывается безопасно',async()=>{
  const x=await readSwarmStatus(async()=>{throw Error('network error')});
  assert.deepEqual(x,{state:'unreachable',reason:'BRIDGE_UNAVAILABLE'});
});
test('непригодный JSON не становится командой',async()=>{
  const x=await readSwarmStatus(async()=>({ok:true,json:async()=>({role:'intruder'})}));
  assert.equal(x.state,'unreachable');
});
