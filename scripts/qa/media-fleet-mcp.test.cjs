'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMediaTools,createHandler,TOOL_DEFINITIONS}=require('../media-fleet-mcp.cjs');
const env={QD_VK_GROUP_ID:'123456',QD_VK_ACCESS_TOKEN:'super_private_vk',QD_YOUTUBE_CHANNEL_ID:'UC'+'a'.repeat(22),QD_YOUTUBE_API_KEY:'super_private_yt'};

test('exposes read-only tools only',()=>{
  assert.deepEqual(TOOL_DEFINITIONS.map(t=>t.name),['vk_recent_posts','vk_products','youtube_channel','youtube_recent_videos']);
  assert.ok(TOOL_DEFINITIONS.every(t=>!/post_|upload|send|delete|edit/.test(t.name)));
});

test('missing credentials fail closed and reveal no secrets',async()=>{
  const h=createHandler(createMediaTools({QD_VK_GROUP_ID:'1234'},()=>{throw Error('should not fetch');}));
  const r=await h({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'vk_recent_posts',arguments:{}}});
  assert.equal(r.result.isError,true);
  assert.match(r.result.content[0].text,/unconfigured_qd_vk_access_token/);
});

test('VK requests only configured community and sanitizes bounded post text',async()=>{
  let url,body,options;
  const fetchFn=async(u,o)=>{url=u;options=o;body=String(o.body);return {ok:true,json:async()=>({response:{items:[{id:8,owner_id:-123456,text:'X'.repeat(2000)}]}})};};
  const result=await createMediaTools(env,fetchFn).call('vk_recent_posts',{count:1});
  assert.equal(url,'https://api.vk.com/method/wall.get');
  assert.equal(options.method,'POST');
  assert.match(body,/owner_id=-123456/);
  assert.ok(result.items[0].text.length<=1200);
  assert.equal(result.items[0].id,8);
});

test('YouTube tools discover channel and uploaded videos',async()=>{
  const urls=[];
  const fetchFn=async(u)=>{urls.push(u);return {ok:true,json:async()=>u.includes('/channels?')?({items:[{id:env.QD_YOUTUBE_CHANNEL_ID,snippet:{title:'Channel'},contentDetails:{relatedPlaylists:{uploads:'UUxyz'}}}]}):({items:[{contentDetails:{videoId:'abc'},snippet:{title:'Test'}}]})};};
  const r=await createMediaTools(env,fetchFn).call('youtube_recent_videos',{count:1});
  assert.equal(r.items[0].id,'abc');
  assert.equal(urls.length,2);
  assert.ok(urls.every(u=>u.startsWith('https://www.googleapis.com/youtube/v3/')));
});

test('MCP initialize, list, rejected tools work',async()=>{
  const handle=createHandler(createMediaTools({},()=>{throw Error('network must not run')}));
  const init=await handle({id:1,method:'initialize'});
  assert.equal(init.result.serverInfo.name,'quantdeus-media-fleet-readonly');
  const list=await handle({id:2,method:'tools/list'});
  assert.equal(list.result.tools.length,4);
  const denied=await handle({id:3,method:'tools/call',params:{name:'vk_publish',arguments:{}}});
  assert.equal(denied.result.isError,true);
  assert.match(denied.result.content[0].text,/tool_not_allowlisted/);
});

test('network errors cannot echo provider bodies or credentials',async()=>{
  const fetchFn=async()=>({ok:false,status:401,json:async()=>({message:env.QD_VK_ACCESS_TOKEN})});
  const h=createHandler(createMediaTools(env,fetchFn));
  const r=await h({id:1,method:'tools/call',params:{name:'vk_products'}});
  const s=JSON.stringify(r);
  assert.ok(!s.includes(env.QD_VK_ACCESS_TOKEN));
  assert.match(s,/vk_http_401/);
});
