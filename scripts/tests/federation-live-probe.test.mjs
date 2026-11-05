import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFederation, summarizeStatus, FEDERATION_ENDPOINT } from '../federation-live-probe.mjs';
function sample() {
  return { bridge: 'quantdeus-federation-staging', mode: 'read_only',
    qdrp:{production_write:false},
    components:{
      seven:{configured:true,responding:true,http_status:200},
      metaverse:{configured:true,responding:true,http_status:200},
      wordpress:{configured:true,responding:true,http_status:200}
    }
  };
}
test('reconciles live read-only Cloudflare and WordPress endpoints',async()=>{
 const fn=async (url,opt)=> {
   assert.equal(url,FEDERATION_ENDPOINT);
   assert.equal(opt.method,'GET');
   return new Response(JSON.stringify(sample()),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await probeFederation(fn);
 assert.equal(result.status,'healthy');
 assert.equal(result.production_write,false);
 assert.equal(result.verified_transport,true);
});
test('degraded remote service remains degraded',()=>{
 const payload=sample();payload.components.metaverse.responding=false;
 assert.equal(summarizeStatus(payload).status,'degraded');
});
test('rejects forged response with production write or wrong identity',()=>{
 const x=sample();x.qdrp.production_write=true;
 assert.throws(()=>summarizeStatus(x),/live_write_must_be_disabled/);
 x.qdrp.production_write=false;x.bridge='other-worker';
 assert.throws(()=>summarizeStatus(x),/wrong_bridge_or_mode/);
});
test('rejects malformed worker responses, never treats missing status as online',()=>{
 const x=sample();delete x.components.wordpress;
 assert.throws(()=>summarizeStatus(x),/invalid_component_wordpress/);
});
