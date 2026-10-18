// Independent lunar companion simulation for QuantDeus. No Bethesda assets.
export const MOON_G=1.62;
export const MOON_SAVE_VERSION=1;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const craters=[[-28,25,13,1.9],[28,31,18,2.4],[-42,-24,15,2.3],[46,-34,11,1.7],[2,50,9,1.5]];
export function moonHeight(x,z){
 let y=.26*Math.sin(x*.085)+.2*Math.cos(z*.12)+.17*Math.sin(x*.13+z*.11);
 for(const [cx,cz,r,depth] of craters){const d=Math.hypot(x-cx,z-cz)/r;y-=depth*Math.exp(-(d**4));y+=.55*Math.exp(-(((d-1)/.2)**2));}
 return y;
}
export function createMoonState(){
 return {version:MOON_SAVE_VERSION,player:{x:0,z:-11,h:0,vy:0,yaw:0},
  fan:{x:0.65,z:-5,h:0,vy:0,vx:0,vz:0,mode:'follow',flightTime:0,launches:0,flightTime:0},elapsed:0,shoutCooldown:0,earthArrivals:0,
  event:'Лунная миссия: фанат уже нашёл тебя даже здесь!',
  line:'Во имя Азуры!!! Вы великий чемпион!'};
}
export function moveMoon(s,forward,right,dt){
 const t=clamp(Number(dt)||0,0,.1),m=Math.hypot(forward,right);if(!Number.isFinite(m)||m<.05)return s;
 const f=forward/Math.max(1,m),r=right/Math.max(1,m),p=s.player;
 p.x=clamp(p.x+(Math.sin(p.yaw)*f+Math.cos(p.yaw)*r)*6*t,-86,86);
 p.z=clamp(p.z+(Math.cos(p.yaw)*f-Math.sin(p.yaw)*r)*6*t,-86,86);
 return s;
}
export function jumpMoon(s){
 if(s.player.h>0||s.player.vy>0)return false;
 s.player.vy=5.1;s.event='Лунный прыжок!';return true;
}
export function stepMoon(s,dt){
 const t=clamp(Number(dt)||0,0,.1),p=s.player,f=s.fan;s.elapsed+=t;s.shoutCooldown=Math.max(0,(s.shoutCooldown||0)-t);
 if(p.h>0||p.vy>0){p.vy-=MOON_G*t;p.h+=p.vy*t;if(p.h<0){p.h=0;p.vy=0;}}
 if(f.mode==='earthflight'){
  f.flightTime+=t;
  // Cinematic arcade trajectory toward the visible Earth, NOT a realistic transfer orbit.
  f.h=Math.min(190,0.01+5.8*f.flightTime+1.95*f.flightTime*f.flightTime);
  f.x=clamp(f.x+4.1*t,-86,86);f.z=clamp(f.z+7.2*t,-86,86);
  if(f.flightTime>=8){f.mode='earthbound';f.h=190;s.earthArrivals++;
   s.event='🌍 Фанат исчез в направлении Земли! Нажми «Вернуть», чтобы призвать его обратно.';
   s.line='Во имя Азуры!!! Вы великий чемпион!';}
 }else if(f.mode==='flight'){
  f.vy-=MOON_G*t;f.h+=f.vy*t;f.x=clamp(f.x+f.vx*t,-86,86);f.z=clamp(f.z+f.vz*t,-86,86);
  if(f.h<=0){f.h=0;f.vy=0;f.vx=0;f.vz=0;f.mode='follow';s.event='Фанат приземлился и готов к новому приключению!';}
 }else if(f.mode==='follow'){
  const d=distance(p,f);if(d>2.7){const step=Math.min(d-2.7,clamp((d-2.7)*1.8,1.5,5.5)*t);f.x+=(p.x-f.x)/d*step;f.z+=(p.z-f.z)/d*step;}
 }
 return s;
}
export function toggleMoonFan(s){
 const f=s.fan;
 if(f.mode==='flight'||f.mode==='earthflight'||f.mode==='earthbound'){s.event='Фанат пока далеко от Луны!';return false;}
 if(distance(s.player,f)>8){s.event='Сначала подойди к фанату.';return false;}
 f.mode=f.mode==='follow'?'wait':'follow';
 s.line=f.mode==='wait'?'Я буду охранять этот кратер!':'За вами хоть на край Галактики, капитан!';
 s.event=f.mode==='wait'?'Фанат ждёт приказов.':'Фанат снова следует за тобой.';
 return true;
}
export function launchMoonFan(s){
 const f=s.fan;
 if(f.mode==='flight'){s.event='Он уже летит!';return false;}
 if(distance(s.player,f)>11){s.event='Подойди ближе для запуска.';return false;}
 f.mode='flight';f.h=.01;f.vy=10.6;f.vx=Math.sin(s.player.yaw)*3.8;f.vz=Math.cos(s.player.yaw)*3.8;f.launches++;
 s.line='КАПИТАААН! Я ОБОЖАЮ ВАШУ КОСМИЧЕСКУЮ ПРОГРАММУ!';
 s.event='🚀 Фанат отправлен по лунной баллистической траектории!';
 return true;
}
export function shoutMoonFan(s){
 const f=s.fan;
 if(s.shoutCooldown>0){s.event='Крик восстанавливается: '+Math.ceil(s.shoutCooldown)+' с';return false;}
 if(f.mode==='earthflight'||f.mode==='earthbound'||f.mode==='flight'){
  s.event='Фанат уже летит! Верни его, чтобы повторить.';return false;
 }
 if(distance(s.player,f)>13){s.event='Фанат слишком далеко для FUS RO DAH. Подойди ближе!';return false;}
 f.mode='earthflight';f.h=.01;f.flightTime=0;f.launches++;
 f.vy=0;f.vx=0;f.vz=0;s.shoutCooldown=3.5;
 s.line='ВО ИМЯ АЗУРЫ!!! ВЫ ВЕЛИКИЙ ЧЕМПИОН!';
 s.event='💥 FUS RO DAH! Фанат отправился в сторону Земли!';return true;
}
export function rescueMoonFan(s){
 const f=s.fan,p=s.player;
 Object.assign(f,{x:clamp(p.x+Math.cos(p.yaw)*3,-86,86),z:clamp(p.z-Math.sin(p.yaw)*3,-86,86),h:0,vy:0,vx:0,vz:0,mode:'follow'});
 s.line='Капитан! Я сохранил все ваши автографы!';
 s.event='Фанат вернулся. Миссия спасения успешна.';return s;
}
export const serializeMoon=s=>JSON.stringify({...s,version:MOON_SAVE_VERSION});
export function deserializeMoon(raw){
 try{
  const v=JSON.parse(raw);if(v.version!==MOON_SAVE_VERSION)return createMoonState();
  const s=createMoonState();
  for(const name of ['player','fan']){
   for(const key of name==='player'?['x','z','h','vy','yaw']:['x','z','h','vy','vx','vz','launches','flightTime']){
    if(typeof v[name]?.[key]==='number'&&Number.isFinite(v[name][key]))s[name][key]=v[name][key];
   }
   s[name].x=clamp(s[name].x,-86,86);s[name].z=clamp(s[name].z,-86,86);
   s[name].h=clamp(s[name].h,0,150);s[name].vy=clamp(s[name].vy,-50,50);
  }
  s.player.yaw=clamp(s.player.yaw,-10000,10000);
  s.fan.vx=clamp(s.fan.vx,-10,10);s.fan.vz=clamp(s.fan.vz,-10,10);
  s.fan.launches=clamp(Math.floor(s.fan.launches),0,100000);
  if(['wait','follow','flight','earthflight','earthbound'].includes(v.fan?.mode))s.fan.mode=v.fan.mode;
  s.elapsed=clamp(Number(v.elapsed)||0,0,10000000);
  s.shoutCooldown=clamp(Number(v.shoutCooldown)||0,0,60);
  s.earthArrivals=clamp(Math.floor(Number(v.earthArrivals)||0),0,100000);
  return s;
 }catch{return createMoonState();}
}
