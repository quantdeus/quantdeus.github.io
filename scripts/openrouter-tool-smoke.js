'use strict';
// Tool calls are simulated locally. No external tool, repository mutation, or write occurs.
const key = String(process.env.OPENROUTER_API_KEY || '').trim();
const model = String(process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free').trim();
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
    if(!response.ok) throw new Error('OPENROUTER_TOOL_PROBE_HTTP_'+response.status);
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
 const second=await call([prompt,{role:'assistant',content:first.content||null,tool_calls:[c1]},{role:'tool',tool_call_id:c1.id,content:'STEP_ONE_OK'}],'required');
 const c2=exactly(second,'quantdeus_probe_step_two');
 const third=await call([prompt,{role:'assistant',content:first.content||null,tool_calls:[c1]},{role:'tool',tool_call_id:c1.id,content:'STEP_ONE_OK'},{role:'assistant',content:second.content||null,tool_calls:[c2]},{role:'tool',tool_call_id:c2.id,content:'STEP_TWO_OK'},{role:'user',content:'Reply PROBE_DONE without tools.'}],'none',256);
 const text=String(third.content||'').trim();
 if(text!=='PROBE_DONE'||(third.tool_calls||[]).length) throw new Error('OPENROUTER_TOOL_PROBE_FINAL_MISMATCH');
 console.log(JSON.stringify({ok:true,model,first_tool:true,second_tool:true,final_marker:true,no_external_tools:true}));
})().catch(err=>{console.error(String(err.message||err));process.exitCode=1});
