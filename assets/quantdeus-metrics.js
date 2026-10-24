/* QuantDeus Metrics v1: consent-first first-party analytics. Never sends form/search text. */
(()=>{
"use strict";
const script=document.currentScript;if(!script)return;
const endpoint=script.dataset.endpoint,siteId=script.dataset.siteId;
if(!endpoint||!["quantdeus-main","quantdeus-pages"].includes(siteId))return;
const CONSENT="qd_metrics_consent_v1",VISITOR="qd_metrics_visitor_v1",SESSION="qd_metrics_session_v1";
const allowed=new Set(["page_view","outbound_click","cta_click","site_search","content_view","form_submit_success"]);
const randomId=()=>crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
const getId=(storage,key)=>{let id=storage.getItem(key);if(!id||!/^[a-zA-Z0-9_-]{12,80}$/.test(id)){id=randomId();storage.setItem(key,id);}return id;};
let started=false,visitorId,sessionId;
const consent=()=>{try{return localStorage.getItem(CONSENT);}catch{return null;}};
function banner(){
 if(document.getElementById("qd-metrics-consent"))return;
 const box=document.createElement("aside");box.id="qd-metrics-consent";box.setAttribute("role","dialog");box.setAttribute("aria-label","Настройки аналитики");
 box.style.cssText="position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;max-width:680px;margin:auto;padding:16px;border:1px solid #8dd9e6;border-radius:16px;background:#092632;color:#f4fdff;font:14px/1.45 system-ui,sans-serif;box-shadow:0 12px 42px #0018";
 const p=document.createElement("p");p.textContent="QuantDeus может собирать обезличенную статистику посещений для улучшения сайта. Идентификатор браузера хранится локально; содержимое форм и поисковые запросы не отправляются.";p.style.margin="0 0 12px";
 const row=document.createElement("div");row.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
 const make=(label,value)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.style.cssText="border:1px solid #78cddd;border-radius:10px;padding:9px 12px;background:#103e4a;color:white;font:inherit;cursor:pointer";b.onclick=()=>setConsent(value);return b;};
 row.append(make("Разрешить аналитику","granted"),make("Не сейчас","denied"));box.append(p,row);document.body.appendChild(box);
}
function setConsent(value){try{localStorage.setItem(CONSENT,value);}catch{}document.getElementById("qd-metrics-consent")?.remove();if(value==="granted")start();}
function send(type,extra={}){
 if(!started||!allowed.has(type))return;
 const url=new URL(location.href),payload={event_id:randomId(),site_id:siteId,event_type:type,timestamp:new Date().toISOString(),path:location.pathname.slice(0,300)||"/",referrer:document.referrer||"",visitor_id:visitorId,session_id:sessionId,utm_source:(url.searchParams.get("utm_source")||"").slice(0,60),utm_campaign:(url.searchParams.get("utm_campaign")||"").slice(0,100),...extra};
 const body=JSON.stringify(payload);
 try{if(navigator.sendBeacon&&navigator.sendBeacon(endpoint,new Blob([body],{type:"application/json"})))return;fetch(endpoint,{method:"POST",mode:"cors",headers:{"content-type":"application/json"},body,keepalive:true,credentials:"omit"}).catch(()=>{});}catch{}
}
function start(){
 if(started)return;
 try{visitorId=getId(localStorage,VISITOR);sessionId=getId(sessionStorage,SESSION);}catch{return;}
 started=true;send("page_view");
 document.addEventListener("click",e=>{const a=e.target.closest?.("a[href]");if(!a)return;let u;try{u=new URL(a.href,location.href);}catch{return;}if(u.origin!==location.origin)send("outbound_click",{target_host:u.hostname.slice(0,100)});else if(a.matches("[data-qd-cta]"))send("cta_click",{cta_id:String(a.dataset.qdCta||"unnamed").slice(0,100)});},{passive:true});
}
if(consent()==="granted")start();else if(consent()!=="denied"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",banner,{once:true});else banner();}
window.QuantDeusMetrics=Object.freeze({track:(type,attrs={})=>{if(!allowed.has(type))return;const safe={};for(const k of ["cta_id","content_id","target_host"])if(typeof attrs[k]==="string")safe[k]=attrs[k].slice(0,100);send(type,safe);},consent:setConsent});
})();
