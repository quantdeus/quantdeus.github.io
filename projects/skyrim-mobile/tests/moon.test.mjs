import test from 'node:test';
import assert from 'node:assert/strict';
import {MOON_G,createMoonState,moveMoon,jumpMoon,stepMoon,toggleMoonFan,launchMoonFan,shoutMoonFan,rescueMoonFan,serializeMoon,deserializeMoon,moonHeight} from '../src/moon-state.mjs';
test('Moon gravity: astronaut returns to surface',()=>{
 assert.equal(MOON_G,1.62);const s=createMoonState();assert.equal(jumpMoon(s),true);assert.equal(jumpMoon(s),false);
 for(let i=0;i<130;i++)stepMoon(s,.1);assert.equal(s.player.h,0);assert.equal(s.player.vy,0);
});
test('Fan follows, waits, follows again',()=>{
 const s=createMoonState(),d0=Math.hypot(s.fan.x-s.player.x,s.fan.z-s.player.z);
 stepMoon(s,.1);assert.ok(Math.hypot(s.fan.x-s.player.x,s.fan.z-s.player.z)<d0);
 assert.equal(toggleMoonFan(s),true);assert.equal(s.fan.mode,'wait');const x=s.fan.x;
 for(let i=0;i<20;i++)stepMoon(s,.1);assert.equal(s.fan.x,x);
 assert.equal(toggleMoonFan(s),true);assert.equal(s.fan.mode,'follow');
});
test('Ballistic launch, landing, rescue',()=>{
 const s=createMoonState();assert.equal(launchMoonFan(s),true);
 assert.equal(launchMoonFan(s),false);let apex=0;
 for(let i=0;i<150;i++){stepMoon(s,.1);apex=Math.max(apex,s.fan.h);}
 assert.ok(apex>30);assert.equal(s.fan.mode,'follow');
 rescueMoonFan(s);assert.equal(s.fan.h,0);assert.equal(s.fan.mode,'follow');
});
test('bounded movement and sanitized saves',()=>{
 const s=createMoonState();moveMoon(s,100,100,1000);
 assert.ok(Math.abs(s.player.z+11)<1);
 assert.equal(deserializeMoon(serializeMoon(s)).player.z,s.player.z);
 s.player.x=Infinity;s.fan.h=-300;s.fan.mode='hacked';
 const restored=deserializeMoon(serializeMoon(s));
 assert.ok(Number.isFinite(restored.player.x));assert.equal(restored.fan.h,0);assert.equal(restored.fan.mode,'follow');
 assert.deepEqual(deserializeMoon('{broken'),createMoonState());
 assert.ok(Number.isFinite(moonHeight(30,-20)));
});

test('FUS RO DAH sends the adoring fan toward Earth, then allows rescue',()=>{
 const s=createMoonState();
 assert.equal(shoutMoonFan(s),true);assert.equal(s.fan.mode,'earthflight');
 assert.match(s.line,/АЗУРЫ/);
 assert.equal(shoutMoonFan(s),false);assert.ok(s.shoutCooldown>0);
 const h0=s.fan.h;
 for(let i=0;i<30;i++)stepMoon(s,.1);
 assert.ok(s.fan.h>h0);assert.ok(s.fan.z>0);
 const saved=deserializeMoon(serializeMoon(s));
 assert.equal(saved.fan.mode,'earthflight');
 for(let i=0;i<60;i++)stepMoon(saved,.1);
 assert.equal(saved.fan.mode,'earthbound');
 assert.equal(saved.earthArrivals,1);
 assert.equal(shoutMoonFan(saved),false);
 rescueMoonFan(saved);assert.equal(saved.fan.mode,'follow');
 assert.equal(shoutMoonFan(saved),true);
});
test('FUS RO DAH cannot fire when target is far away or cooling down',()=>{
 const s=createMoonState();s.fan.x=70;s.fan.z=70;
 assert.equal(shoutMoonFan(s),false);
 rescueMoonFan(s);s.shoutCooldown=1.8;assert.equal(shoutMoonFan(s),false);
 stepMoon(s,.1);assert.ok(s.shoutCooldown<1.8);
});
