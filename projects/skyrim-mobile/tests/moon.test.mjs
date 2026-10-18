import test from 'node:test';
import assert from 'node:assert/strict';
import {MOON_G,createMoonState,moveMoon,jumpMoon,stepMoon,toggleMoonFan,launchMoonFan,rescueMoonFan,serializeMoon,deserializeMoon,moonHeight} from '../src/moon-state.mjs';
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
