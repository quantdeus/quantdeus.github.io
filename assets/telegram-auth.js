(()=>{
  const API=(location.hostname==="quantdeus.github.io"?"https://quantdeus.vercel.app":location.origin)+"/api/quantdeus/auth";
  const SESSION_KEY="qd_telegram_session_v1";
  const USER_KEY="qd_telegram_user_v1";
  const METHOD_KEY="qd_telegram_auth_method_v1";
  const tg=window.Telegram?.WebApp;
  let config=null;
  let sessionToken=sessionStorage.getItem(SESSION_KEY)||"";
  let user=null;
  let method="guest";

  try { user=JSON.parse(sessionStorage.getItem(USER_KEY)||"null"); } catch {}
  method=sessionStorage.getItem(METHOD_KEY)||"guest";

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const miniUser=()=>tg?.initDataUnsafe?.user||null;

  function normalizedMiniUser(raw){
    if(!raw?.id)return null;
    return {
      id:String(raw.id),
      first_name:String(raw.first_name||""),
      last_name:String(raw.last_name||""),
      username:String(raw.username||""),
      photo_url:String(raw.photo_url||"")
    };
  }

  function displayName(value=user){
    if(!value)return "";
    return [value.first_name,value.last_name].filter(Boolean).join(" ")||value.username||("Telegram #"+value.id);
  }

  function emit(){
    render();
    window.dispatchEvent(new CustomEvent("qd:auth-changed",{detail:{user,method,authenticated:Boolean(user)}}));
  }

  function save(nextUser,nextMethod,nextToken=""){
    user=nextUser||null;
    method=nextUser?nextMethod:"guest";
    sessionToken=nextToken||"";
    if(user){
      sessionStorage.setItem(USER_KEY,JSON.stringify(user));
      sessionStorage.setItem(METHOD_KEY,method);
      if(sessionToken)sessionStorage.setItem(SESSION_KEY,sessionToken);
      else sessionStorage.removeItem(SESSION_KEY);
    }else{
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(METHOD_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    }
    emit();
  }

  function render(){
    document.querySelectorAll("[data-qd-auth-user]").forEach(el=>{
      if(!user){el.hidden=true;el.textContent="";return}
      el.hidden=false;
      const prefix=user.username?"@"+user.username:displayName(user);
      el.textContent=prefix;
    });
    document.querySelectorAll("[data-qd-auth-button]").forEach(btn=>{
      btn.textContent=user?"Выйти":"✈ Войти через Telegram";
      btn.setAttribute("aria-pressed",user?"true":"false");
      btn.onclick=user?logout:login;
    });
    document.querySelectorAll("[data-qd-auth-state]").forEach(el=>{
      el.textContent=user?(method==="mini_app"?"Telegram Mini App":"Telegram ✓"):"Гость";
    });
  }

  async function loadSdk(){
    if(window.Telegram?.Login?.auth)return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://oauth.telegram.org/js/telegram-login.js?3";
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error("telegram_sdk_load_failed"));
      document.head.appendChild(script);
    });
    if(!window.Telegram?.Login?.auth)throw new Error("telegram_sdk_unavailable");
  }

  async function getConfig(){
    if(config)return config;
    const response=await fetch(API,{cache:"no-store"});
    if(!response.ok)throw new Error("telegram_login_config_unavailable");
    config=await response.json();
    return config;
  }

  async function validateSavedSession(){
    if(!sessionToken||!user)return false;
    try{
      const response=await fetch(API+"?me=1",{headers:{Authorization:"Bearer "+sessionToken},cache:"no-store"});
      if(!response.ok)throw new Error("session_invalid");
      const data=await response.json();
      save(data.user,"web_session",sessionToken);
      return true;
    }catch{
      save(null,"guest","");
      return false;
    }
  }

  async function login(){
    const mini=normalizedMiniUser(miniUser());
    if(mini){
      save(mini,"mini_app","");
      return mini;
    }
    const cfg=await getConfig();
    if(!cfg.configured||!cfg.client_id){
      window.dispatchEvent(new CustomEvent("qd:auth-error",{detail:{error:"telegram_login_not_configured"}}));
      return null;
    }
    await loadSdk();
    return new Promise(resolve=>{
      window.Telegram.Login.auth({client_id:Number(cfg.client_id),scope:["profile"],lang:"ru"},async result=>{
        if(!result||result.error||!result.id_token){
          window.dispatchEvent(new CustomEvent("qd:auth-error",{detail:{error:result?.error||"telegram_login_cancelled"}}));
          resolve(null);
          return;
        }
        try{
          const response=await fetch(API,{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({id_token:result.id_token})
          });
          const data=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(data.error||"telegram_login_failed");
          save(data.user,"web_session",data.session_token);
          resolve(data.user);
        }catch(error){
          window.dispatchEvent(new CustomEvent("qd:auth-error",{detail:{error:error.message}}));
          resolve(null);
        }
      });
    });
  }

  function logout(){
    if(method==="mini_app")return;
    save(null,"guest","");
  }

  function authHeaders(){
    const initData=String(tg?.initData||"").trim();
    if(initData)return {"x-telegram-init-data":initData};
    if(sessionToken)return {Authorization:"Bearer "+sessionToken};
    return {};
  }

  function getContactDefaults(){
    if(!user)return {name:"",contact:""};
    return {
      name:displayName(user),
      contact:user.username?"@"+user.username:""
    };
  }

  async function init(){
    try{
      if(tg){try{tg.ready();tg.expand()}catch{}}
      const mini=normalizedMiniUser(miniUser());
      if(mini){save(mini,"mini_app","");return}
      if(sessionToken&&user)await validateSavedSession();
      else render();
    }catch{render()}
  }

  window.QuantDeusTelegramAuth={
    init,login,logout,authHeaders,getUser:()=>user,getMethod:()=>method,
    isAuthenticated:()=>Boolean(user),getContactDefaults,displayName,esc
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
