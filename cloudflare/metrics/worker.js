const SITE_IDS = new Set(["quantdeus-main", "quantdeus-pages"]);
const EVENT_TYPES = new Set(["page_view","outbound_click","cta_click","site_search","content_view","form_submit_success"]);
const MAX_BODY = 8192;
function reply(data,status=200,headers={}) {
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
}
function origins(env) { return new Set(String(env.ALLOWED_ORIGINS||"https://quantdeus.ru,https://www.quantdeus.ru,https://quantdeus.github.io").split(",").map(x=>x.trim()).filter(Boolean)); }
function cors(req,env) {
 const origin=req.headers.get("Origin")||"";
 if(!origins(env).has(origin)) return {};
 return {"access-control-allow-origin":origin,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"content-type, authorization","access-control-max-age":"86400","vary":"Origin"};
}
function pathOnly(s) { if(typeof s!=="string")return "/"; const p=s.split("?")[0].split("#")[0].slice(0,300); return p.startsWith("/")?p:"/"; }
function hostOf(s) { try{return new URL(s).hostname.toLowerCase().slice(0,160);}catch{return null;} }
function sourceOf(host,url) {
 const tagged=(url.searchParams.get("utm_source")||"").trim().toLowerCase();
 if(tagged)return tagged.slice(0,60);
 if(!host)return "direct";
 if(host.includes("google."))return "google";
 if(host.includes("bing.com"))return "bing";
 if(host.includes("yandex."))return "yandex";
 if(host==="github.com"||host.endsWith(".github.com"))return "github";
 if(["quantdeus.ru","www.quantdeus.ru","quantdeus.github.io"].includes(host))return "internal";
 return "referral";
}
function validId(v){return typeof v==="string"&&/^[a-zA-Z0-9_-]{12,80}$/.test(v);}
async function collect(req,env,ch) {
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405,ch);
 const origin=req.headers.get("Origin")||"";
 if(!origins(env).has(origin))return reply({error:"origin_not_allowed"},403);
 if(Number(req.headers.get("content-length")||0)>MAX_BODY)return reply({error:"payload_too_large"},413,ch);
 const raw=await req.text();
 if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return reply({error:"payload_too_large"},413,ch);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:"invalid_json"},400,ch);}
 const items=Array.isArray(body.events)?body.events:[body];
 if(!items.length||items.length>10)return reply({error:"invalid_batch_size"},400,ch);
 const statements=[],now=new Date();let accepted=0;
 for(const item of items){
  if(!item||!SITE_IDS.has(item.site_id)||!EVENT_TYPES.has(item.event_type)||!validId(item.visitor_id)||!validId(item.session_id))continue;
  const occurred=new Date(item.timestamp||now.toISOString());
  if(!Number.isFinite(occurred.getTime())||Math.abs(now.getTime()-occurred.getTime())>7*86400000)continue;
  const day=occurred.toISOString().slice(0,10),url=new URL(req.url),ref=hostOf(typeof item.referrer==="string"?item.referrer:"");
  const campaign=typeof item.utm_campaign==="string"?item.utm_campaign.slice(0,100):null;
  const eventId=validId(item.event_id)?item.event_id:crypto.randomUUID();
  statements.push(env.METRICS_DB.prepare("INSERT OR IGNORE INTO analytics_events (event_id,occurred_at,day_utc,site_id,event_type,path,referrer_host,source,campaign,visitor_id,session_id,user_agent_class) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId,occurred.toISOString(),day,item.site_id,item.event_type,pathOnly(item.path),ref,sourceOf(ref,url),campaign,item.visitor_id,item.session_id,"browser"));
  statements.push(env.METRICS_DB.prepare("INSERT OR IGNORE INTO analytics_visitors_daily (day_utc,site_id,visitor_id,first_seen_at) VALUES (?,?,?,?)").bind(day,item.site_id,item.visitor_id,occurred.toISOString()));
  if(item.event_type==="page_view")statements.push(env.METRICS_DB.prepare("INSERT OR IGNORE INTO analytics_sessions (session_id,site_id,visitor_id,started_at,day_utc) VALUES (?,?,?,?,?)").bind(item.session_id,item.site_id,item.visitor_id,occurred.toISOString(),day));
  accepted++;
 }
 if(statements.length)await env.METRICS_DB.batch(statements);
 return reply({accepted},202,ch);
}
async function report(req,env,ch) {
 if(req.method!=="GET")return reply({error:"method_not_allowed"},405,ch);
 const expected=env.METRICS_ADMIN_TOKEN,supplied=(req.headers.get("Authorization")||"").replace(/^Bearer\\s+/i,"");
 if(!expected||!supplied||supplied!==expected)return reply({error:"unauthorized"},401,ch);
 const url=new URL(req.url),days=Math.max(1,Math.min(90,parseInt(url.searchParams.get("days")||"7",10)||7));
 const wanted=url.searchParams.get("site"),site=SITE_IDS.has(wanted)?wanted:null;
 const since=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
 const extra=site?" AND site_id = ?":"",params=site?[since,site]:[since];
 const [daily,pages,sources,totals,visitors]=await Promise.all([
  env.METRICS_DB.prepare("SELECT day_utc,site_id,COUNT(*) page_views,COUNT(DISTINCT session_id) sessions FROM analytics_events WHERE day_utc>=? AND event_type='page_view'"+extra+" GROUP BY day_utc,site_id ORDER BY day_utc").bind(...params).all(),
  env.METRICS_DB.prepare("SELECT site_id,path,COUNT(*) views FROM analytics_events WHERE day_utc>=? AND event_type='page_view'"+extra+" GROUP BY site_id,path ORDER BY views DESC LIMIT 20").bind(...params).all(),
  env.METRICS_DB.prepare("SELECT site_id,source,COUNT(*) events FROM analytics_events WHERE day_utc>=? AND event_type='page_view'"+extra+" GROUP BY site_id,source ORDER BY events DESC LIMIT 30").bind(...params).all(),
  env.METRICS_DB.prepare("SELECT COUNT(*) page_views,COUNT(DISTINCT session_id) sessions,COUNT(DISTINCT site_id || ':' || visitor_id) unique_browsers FROM analytics_events WHERE day_utc>=? AND event_type='page_view'"+extra).bind(...params).first(),
  env.METRICS_DB.prepare("SELECT day_utc,site_id,COUNT(*) unique_browsers FROM analytics_visitors_daily WHERE day_utc>=?"+extra+" GROUP BY day_utc,site_id ORDER BY day_utc").bind(...params).all()
 ]);
 return reply({generated_at:new Date().toISOString(),period_days:days,site:site||"all",
 definitions:{unique_browsers:"Distinct pseudonymous browser IDs, not verified unique people.",daily_unique_browsers:"Distinct pseudonymous browser IDs per UTC day and site.",source:"Approximation from UTM source or referrer; some traffic may appear as direct."},
 totals:totals||{page_views:0,sessions:0,unique_browsers:0},daily:daily.results||[],daily_unique_browsers:visitors.results||[],top_pages:pages.results||[],sources:sources.results||[]});
}
export default {async fetch(request,env){
 const url=new URL(request.url),ch=cors(request,env);
 if(request.method==="OPTIONS")return ch["access-control-allow-origin"]?new Response(null,{status:204,headers:ch}):new Response(null,{status:403});
 try{
  if(url.pathname==="/health")return reply({service:"quantdeus-metrics",status:"ok",version:"1.0.0"});
  if(url.pathname==="/api/collect")return await collect(request,env,ch);
  if(url.pathname==="/api/report")return await report(request,env,ch);
  return reply({error:"not_found"},404,ch);
 }catch{return reply({error:"internal_error"},500,ch);}
}};
