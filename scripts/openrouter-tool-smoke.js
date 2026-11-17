'use strict';
// Tool calls are simulated locally. No external tool, repository mutation, or write occurs.
const key = String(process.env.OPENROUTER_API_KEY || '').trim();
const model = String(process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free').trim();
const probeSteps = Math.max(1, Math.min(2, Number(process.env.OPENROUTER_TOOL_PROBE_STEPS || 2)));
const tools = [
  {type:'function',function:{name:'quantdeus_probe_step_one',description:'Call first, once',parameters:{type:'object',properties:{},additionalProperties:false}}},
  {type:'function',function:{name:'quantdeus_probe_step_two',description:'Call after step one, once',parameters:{type:'object',properties:{},additionalProperties:false}}}
];
async function call(messages,choice,maxTokens=512) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),25000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify({model,messages,tools,tool_choice:choice,max_tokens:maxTokens,temperature:0}),
      signal:controller.signal
    });
    if(!response.ok) {
      const raw=await response.text();
      let payload=null;
      try { payload=JSON.parse(raw); } catch {}
      const error=payload?.error||{};
      const metadata=error?.metadata||{};
      const detail=[
        'OPENROUTER_TOOL_PROBE_HTTP_'+response.status,
        'limit_source='+(metadata.limit_source||metadata.error_type||'unknown'),
        'provider_code='+(metadata.provider_code||'none'),
        'x_limit_remaining='+(response.headers.get('x-ratelimit-remaining')||'unknown'),
        'x_limit_reset='+(response.headers.get('x-ratelimit-reset')||'unknown'),
        'retry_after='+(response.headers.get('retry-after')||'unknown'),
        'message='+String(error.message||raw).slice(0,220)
      ].join(' ');
      throw new Error(detail);
    }
    const data=await response.json();
    return data?.choices?.[0]?.message||{};
  } finally { clearTimeout(timer); }
}
function exactly(message,name) {
  const calls=message?.tool_calls;
  if(!Array.isArray(calls)||calls.length!==1||calls[0]?.function?.name!==name||typeof calls[0]?.id!=='string') {
    throw new Error('OPENROUTER_TOOL_PROBE_MISSING_'+name);
  }
  return calls[0];
}
(async()=>{
 if(!key) throw new Error('OPENROUTER_API_KEY_REQUIRED');
 const prompt={role:'user',content:'Call quantdeus_probe_step_one exactly once. After the tool result call quantdeus_probe_step_two exactly once. Then reply PROBE_DONE.'};
 const first=await call([prompt],'required');
 const c1=exactly(first,'quantdeus_probe_step_one');
 if (probeSteps === 1) {
   console.log(JSON.stringify({ok:true,model,first_tool:true,second_tool:null,final_marker:null,probe_steps:1,no_external_tools:true}));
   return;
 }
 const second=await call([prompt,{role:'assistant',content:first.content||null,tool_calls:[c1]},{role:'tool',tool_call_id:c1.id,content:'STEP_ONE_OK'}],'required');
 const c2=exactly(second,'quantdeus_probe_step_two');
 const third=await call([prompt,{role:'assistant',content:first.content||null,tool_calls:[c1]},{role:'tool',tool_call_id:c1.id,content:'STEP_ONE_OK'},{role:'assistant',content:second.content||null,tool_calls:[c2]},{role:'tool',tool_call_id:c2.id,content:'STEP_TWO_OK'},{role:'user',content:'Reply PROBE_DONE without tools.'}],'none',256);
 const text=String(third.content||'').trim();
 if(text!=='PROBE_DONE'||(third.tool_calls||[]).length) throw new Error('OPENROUTER_TOOL_PROBE_FINAL_MISMATCH');
 console.log(JSON.stringify({ok:true,model,first_tool:true,second_tool:true,final_marker:true,probe_steps:2,no_external_tools:true}));
})().catch(err=>{console.error(String(err.message||err));process.exitCode=1});
