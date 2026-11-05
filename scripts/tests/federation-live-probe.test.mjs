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

test('GitHub independently confirms Jetpack public posts when Cloudflare has no WordPress egress',async()=>{
  const responses=[];
  const fn=async (url,opt)=>{
    responses.push(url);
    if(url===FEDERATION_ENDPOINT){
      const body=sample();
      body.components.wordpress={configured:true,responding:false,http_status:null,route:'unverified'};
      return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
    }
    assert.match(url,/public-api\.wordpress\.com\/rest\/v1\.1\/sites\/quantdeus\.ru/);
    assert.equal(opt.method,'GET');
    return new Response(JSON.stringify({posts:[{ID:209,URL:'https://quantdeus.ru/posts'}],private:'NO_ECHO'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const report=await probeFederation(fn);
  assert.equal(report.status,'healthy');
  assert.equal(report.wordpress_from_cloudflare,false);
  assert.equal(report.wordpress_from_github,true);
  assert.equal(report.components.wordpress.route,'github_jetpack_public_api');
  assert.equal(responses.length,2);
  assert.equal(JSON.stringify(report).includes('NO_ECHO'),false);
});
test('unreachable Jetpack fallback leaves WordPress status degraded',async()=>{
  const fn=async url=>{
    if(url!==FEDERATION_ENDPOINT)throw Error('offline');
    const body=sample();body.components.wordpress.responding=false;
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  const report=await probeFederation(fn);
  assert.equal(report.status,'degraded');
  assert.equal(report.wordpress_from_github,false);
});
