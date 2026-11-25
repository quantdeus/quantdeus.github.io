#!/usr/bin/env node
'use strict';
// Scientific MCP fleet admission: policy checks only; never connects or executes.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const CONFIG='coordination/science-mcp-fleet.json';
const AGENTS='coordination/agents.json';
const KINDS=new Set(['remote_mcp','composio','chatgpt_plugin','public_api',
  'local_library','research_software','existing_control_plane']);
const STATES=new Set(['not_connected_to_fleet','chat_session_only',
  'fallback_subject_to_rate_limits','dependency_install_required',
  'requires_matlab_license_or_compatible_setup','available_via_existing_authorized_workflows']);
const ENDPOINTS={openalex:'https://mcp.openalex.org/mcp',crossref:'https://api.crossref.org/works'};
const CAPABILITIES=new Set(['literature_search','citation_graph','citation_audit',
  'citation_context','doi_metadata','symbolic_computation','numerical_verification',
  'metric_analysis','versioned_evidence']);
const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));

function validate(config,agentRegistry){
  const faults=[];
  const check=(ok,reason)=>{if(!ok)faults.push(reason);};
  check(config.schema_version===1,'schema_version must be 1');
  check(config.status==='staged_not_live','New MCP fleet cannot be silently activated');
  check(config.source_of_truth===AGENTS,'canonical source must remain unchanged');
  check(config.coordinator==='seven-of-nine','Seven must remain coordinator');
  const canonical=(agentRegistry.agents||[]).map(a=>a.id);
  check(canonical.length===29,'canonical roster must be 29 agents');
  check(config.canonical_agent_count===canonical.length,'agent count mismatch');
  const unique=arr=>new Set(arr).size===arr.length;
  check(unique(canonical),'duplicated canonical IDs');
  const owners=new Set(canonical),policy=config.policy||{};
  const expectations={
    default_permissions:'read_only',
    external_mcp_default:'disabled_until_owner_connected_and_verified',
    no_implicit_account_sharing:true,
    chatgpt_connections_not_inherited_by_github_actions:true,
    no_auto_hiring:true,
    no_auto_merge:true,
    no_production_site_writes:true,
    no_api_key_in_git:true,
    no_shell_from_untrusted_papers:true,
    no_execution_of_paper_code_without_review:true,
    results_require_original_sources:true,
    no_ftl_proof_by_software:true,
  };
  for(const [key,value] of Object.entries(expectations)){
    check(policy[key]===value,'unsafe policy: '+key);
  }
  check(policy.max_paid_usd_per_run===0 && policy.max_paid_usd_per_day===0,
    'nonzero paid API budget');
  check(Number.isInteger(policy.max_remote_calls_per_run) &&
    policy.max_remote_calls_per_run<=12 && policy.max_remote_calls_per_run>0,
    'invalid remote calls cap');
  check(Number.isInteger(policy.max_citations_per_pass) &&
    policy.max_citations_per_pass<=25 && policy.max_citations_per_pass>0,
    'invalid citations cap');
  check(JSON.stringify(policy.scientific_verdicts)===
    JSON.stringify(['PASS','FAIL','UNKNOWN']),'unrecognized QA verdicts');
  const providers=config.providers||[];
  const providerIds=providers.map(p=>p.id);
  check(providers.length>=8 && unique(providerIds),'missing or duplicate providers');
  for(const p of providers){
    check(typeof p.id==='string' && /^[a-z][a-z0-9_]{1,40}$/.test(p.id),
      'invalid provider id');
    check(KINDS.has(p.kind),'invalid kind: '+p.id);
    check(STATES.has(p.state),'invalid connection state: '+p.id);
    check(p.enabled===false,'MCP must remain opt-in: '+p.id);
    check(p.permission==='read','MCP write capability forbidden: '+p.id);
    check(Array.isArray(p.capabilities) && p.capabilities.length>0 &&
      p.capabilities.every(x=>CAPABILITIES.has(x)),
      'unauthorized capability: '+p.id);
    if(p.endpoint)check(ENDPOINTS[p.id]===p.endpoint,'unexpected endpoint: '+p.id);
    if(p.kind==='remote_mcp')
      check(p.endpoint===ENDPOINTS[p.id],'unapproved MCP endpoint: '+p.id);
    if(p.kind==='composio')
      check(typeof p.toolkit==='string' && p.toolkit.length>0,'missing toolkit: '+p.id);
  }
  const specialists=config.specialists||[],ids=specialists.map(s=>s.id);
  check(specialists.length===8 && unique(ids),'expected 8 unique specialists');
  for(const s of specialists){
    check(typeof s.id==='string' && /^[a-z][a-z0-9-]{2,64}$/.test(s.id),
      'bad specialist id');
    check(owners.has(s.owner_agent),'unknown canonical owner: '+s.id);
    check(typeof s.mission==='string' && s.mission.length>15,'unclear mission: '+s.id);
    check(typeof s.deliverable==='string' && s.deliverable.length>15,'missing output: '+s.id);
    check(Array.isArray(s.providers) && s.providers.length>0 &&
      s.providers.every(x=>providerIds.includes(x)), 'unknown provider in '+s.id);
  }
  return {ok:faults.length===0,faults,providers:providers.length,
    specialists:specialists.length,registered_agents:canonical.length,
    activation:'NOT_ENABLED'};
}
function plan(config,id){
  const s=config.specialists.find(x=>x.id===id);
  if(!s)throw new Error('Unknown specialist: '+id);
  const providers=new Map(config.providers.map(p=>[p.id,p]));
  return {specialist:s.id,owner_agent:s.owner_agent,mission:s.mission,
    deliverable:s.deliverable,execution:'BLOCKED_UNTIL_SEPARATE_CONNECTION_AND_REVIEW',
    required_capabilities:s.providers.map(id=>({
      id,state:providers.get(id).state,enabled:providers.get(id).enabled,
      connection_required:['remote_mcp','composio','chatgpt_plugin'].includes(providers.get(id).kind)
    })),paid_budget_usd:0};
}
function main(args){
  const cfg=json(CONFIG),reg=json(AGENTS),v=validate(cfg,reg);
  if(!v.ok){console.error(JSON.stringify(v,null,2));process.exitCode=1;return;}
  const i=args.indexOf('--plan');
  if(i>=0){
    if(!args[i+1])throw new Error('Usage: node scripts/science-mcp-fleet.js --plan specialist-id');
    console.log(JSON.stringify(plan(cfg,args[i+1]),null,2));
  }else console.log(JSON.stringify(v,null,2));
}
if(require.main===module){
  try{main(process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=2;}
}
module.exports={validate,plan};
