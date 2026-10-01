(()=>{
  const API_BASE=location.hostname==="quantdeus.github.io"?"https://quantdeus.vercel.app":location.origin;
  const TOKEN_KEY="qd_telegram_oidc_token";
  let current=null,role="guest",initPromise=null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||""}catch{return ""}}
  function setToken(value){try{value?sessionStorage.setItem(TOKEN_KEY,value):sessionStorage.removeItem(TOKEN_KEY)}catch{}}
  function miniAppInitData(){return window.Telegram?.WebApp?.initData||""}
  function headers(extra={}){
    const result={...extra},initData=miniAppInitData();
    if(initData)result["x-telegram-init-data"]=initData;
    else if(token())result.Authorization="Bearer "+token();
    return result;
  }
  function emit(){window.dispatchEvent(new CustomEvent("qd-auth-change",{detail:{user:current,role,authenticated:Boolean(current)}}))}
  function render(){
    document.querySelectorAll("[data-qd-auth]").forEach(host=>{
      if(current){
        const avatar=current.picture?'<img class="qd-auth-avatar" src="'+esc(current.picture)+'" alt="">':"✈️";
        host.innerHTML='<button class="qd-auth-control authenticated" type="button" data-qd-auth-action="logout">'+avatar+'<span>'+esc(current.name||current.username||"Telegram")+'</span></button>';
      }else host.innerHTML='<button class="qd-auth-control" type="button" data-qd-auth-action="login">✈️ <span>Войти через Telegram</span></button>';
    });
    document.querySelectorAll('[data-qd-auth-action="login"]').forEach(btn=>btn.onclick=login);
    document.querySelectorAll('[data-qd-auth-action="logout"]').forEach(btn=>btn.onclick=logout);
  }
  async function me(){
    const authHeaders=headers();
    if(!authHeaders.Authorization&&!authHeaders["x-telegram-init-data"])return null;
    const response=await fetch(API_BASE+"/api/quantdeus/auth",{headers:authHeaders,cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"telegram_auth_failed");
    current=data.user||null;role=data.role||"member";render();emit();return data;
  }
  async function config(){
    try{
      const response=await fetch("/telegram-public.json",{cache:"no-store"});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.configured&&data.client_id)return data;
    }catch{}
    return {configured:true,client_id:8122160274,username:"QuantDeus_bot",name:"QuantDeus_bot_agent"};
  }
  async function loadSdk(){
    if(window.Telegram?.Login?.auth)return;
    await new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-qd-telegram-login-sdk]');
      if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return}
      const s=document.createElement("script");
      s.src="https://oauth.telegram.org/js/telegram-login.js?3";s.async=true;s.dataset.qdTelegramLoginSdk="1";s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
    });
    if(!window.Telegram?.Login?.auth)throw new Error("telegram_login_sdk_unavailable");
  }
  async function login(){
    try{
      const cfg=await config();await loadSdk();
      const data=await new Promise((resolve,reject)=>{
        window.Telegram.Login.auth({client_id:Number(cfg.client_id),scope:["profile"],lang:"ru"},result=>{
          if(!result||result.error)return reject(new Error(result?.error||"telegram_login_cancelled"));resolve(result);
        });
      });
      if(!data.id_token)throw new Error("telegram_id_token_missing");
      setToken(data.id_token);await me();
    }catch(error){
      setToken("");current=null;role="guest";render();emit();
      const map={telegram_oidc_unconfigured:"Telegram Login ещё не привязан к домену QuantDeus.",telegram_oidc_unavailable:"Сервер временно не получил ключи Telegram. Попробуй ещё раз.",telegram_auth_unavailable:"Telegram-проверка на сервере ещё не настроена.",telegram_auth_invalid:"Telegram-сессия не прошла проверку. Повтори вход."};alert(map[error.message]||("Не удалось войти через Telegram: "+String(error.message||"неизвестная ошибка")));
    }
  }
  function logout(){setToken("");current=null;role="guest";render();emit()}
  async function init(){
    if(initPromise)return initPromise;
    initPromise=(async()=>{
      try{const tg=window.Telegram?.WebApp;if(tg){try{tg.ready();tg.expand()}catch{}}await me()}
      catch{if(!miniAppInitData())setToken("");current=null;role="guest"}
      render();emit();return{user:current,role};
    })();
    return initPromise;
  }
  window.QDAuth={init,login,logout,headers,user:()=>current,role:()=>role,authenticated:()=>Boolean(current),apiBase:API_BASE};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();