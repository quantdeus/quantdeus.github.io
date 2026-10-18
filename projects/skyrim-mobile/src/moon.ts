import {
 Engine, Scene, Color3, Color4, Vector3, MeshBuilder, PBRMaterial,
 StandardMaterial, HemisphericLight, DirectionalLight, UniversalCamera,
 VertexBuffer, VertexData, TransformNode
} from '@babylonjs/core';
import {
 createMoonState,deserializeMoon,serializeMoon,moonHeight,moveMoon,
 jumpMoon,stepMoon,toggleMoonFan,launchMoonFan,rescueMoonFan,type MoonState
} from './moon-state.mjs';
import './moon.css';

const el=(id:string)=>document.getElementById(id) as HTMLElement;
const canvas=el('moon-game') as HTMLCanvasElement;
const saveKey='quantdeus:moon-fan:v1';
const load=():MoonState=>{try{return deserializeMoon(localStorage.getItem(saveKey)||'');}catch{return createMoonState();}};
const state=load();
const save=()=>{try{localStorage.setItem(saveKey,serializeMoon(state));}catch{/* private mode */}};
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});

let engine:Engine;
try{
 engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false});
 if(engine.webGLVersion<2)throw new Error('WebGL 2 не поддерживается');
}catch(err){
 el('error').hidden=false;
 el('error').textContent='Графика недоступна: '+String(err);
 throw err;
}
engine.setHardwareScalingLevel(Math.max(1,Math.min(1.8,window.devicePixelRatio/1.4)));
const scene=new Scene(engine);scene.clearColor=new Color4(.005,.009,.025,1);
scene.ambientColor=new Color3(.15,.18,.24);
const camera=new UniversalCamera('камера героя',new Vector3(0,8,-22),scene);
camera.minZ=.08;camera.maxZ=600;camera.fov=.91;scene.activeCamera=camera;
const fill=new HemisphericLight('звёздная подсветка',new Vector3(0,1,0),scene);
fill.intensity=.65;fill.diffuse=new Color3(.72,.83,1);
const sun=new DirectionalLight('солнечный свет',new Vector3(-.7,-1,.3),scene);
sun.intensity=2.3;sun.diffuse=new Color3(1,.95,.84);sun.position.set(80,100,-50);

function paint(name:string,rgb:[number,number,number],metal=0,rough=.9){
 const m=new PBRMaterial(name,scene);m.albedoColor=new Color3(...rgb);m.metallic=metal;m.roughness=rough;return m;
}
const dust=paint('лунный реголит',[.43,.43,.49]);
const rocks=paint('вулканический камень',[.32,.33,.39]);
const suit=paint('скафандр героя',[.83,.88,.94],.1,.55);
const blue=paint('синие вставки',[.14,.35,.55],.2,.5);
const tourist=paint('яркий скафандр фаната',[.87,.47,.15],.1,.62);
const visor=paint('тёмное стекло',[.07,.17,.26],.5,.22);
const gold=paint('золотистое стекло',[.94,.72,.22],.4,.28);
const steel=paint('титан лунного модуля',[.58,.61,.67],.68,.32);
const solar=paint('солнечная панель',[.07,.2,.45],.5,.3);
const glow=paint('маяк лунной базы',[.91,.56,.15],.1,.3);
glow.emissiveColor=new Color3(.3,.11,.03);
const terrain=MeshBuilder.CreateGround('лунный ландшафт',{width:190,height:190,subdivisions:90},scene);
const positions=terrain.getVerticesData(VertexBuffer.PositionKind),indices=terrain.getIndices();
if(positions&&indices){
 for(let i=0;i<positions.length;i+=3)positions[i+1]=moonHeight(positions[i],positions[i+2]);
 const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);
 terrain.setVerticesData(VertexBuffer.PositionKind,positions,true);
 terrain.setVerticesData(VertexBuffer.NormalKind,normals,true);
}
terrain.material=dust;
const surface=(x:number,z:number)=>moonHeight(x,z);
const rnd=(i:number)=>{const x=Math.sin(i*91.17+13.8)*43758.34;return x-Math.floor(x);};
for(let i=0;i<67;i++){
 const x=(rnd(i+30)-.5)*170,z=(rnd(i+300)-.5)*170;
 if(Math.hypot(x,z)<16)continue;
 const boulder=MeshBuilder.CreateSphere('лунный булыжник',{diameter:.6+rnd(i+850)*2.5,segments:5},scene);
 boulder.position.set(x,surface(x,z)+.3,z);boulder.scaling.y=.57;boulder.material=rocks;
}
for(const [x,z,diameter] of [[-28,25,26],[28,31,36],[-42,-24,30]] as const){
 const rim=MeshBuilder.CreateTorus('кратер',{diameter,thickness:.12,tessellation:65},scene);
 rim.position.set(x,surface(x+diameter/2,z)+.2,z);rim.rotation.x=Math.PI/2;rim.material=rocks;
}
// Stars are geometry instances; no external textures or Bethesda assets.
const starMaterial=new StandardMaterial('звёзды',scene);
starMaterial.emissiveColor=new Color3(.89,.93,1);starMaterial.disableLighting=true;
const star=MeshBuilder.CreateSphere('звезда',{diameter:.28,segments:4},scene);star.material=starMaterial;
star.position.set(86,161,216);
for(let i=1;i<115;i++){
 const az=rnd(i+100)*Math.PI*2,elv=.15+rnd(i+500)*1.33,rad=170+rnd(i+750)*105;
 const dot=star.createInstance('звезда-'+i);
 dot.position.set(Math.sin(az)*Math.cos(elv)*rad,Math.sin(elv)*rad,Math.cos(az)*Math.cos(elv)*rad);
 dot.scaling.setAll(.65+rnd(i+900)*1.6);
}
const earth=MeshBuilder.CreateSphere('Земля',{diameter:35,segments:24},scene);
earth.position.set(82,118,245);
const earthMat=paint('Земля',[.09,.41,.82],.15,.44);earthMat.emissiveColor=new Color3(.03,.11,.23);
earth.material=earthMat;
const clouds=MeshBuilder.CreateSphere('облачный слой',{diameter:35.5,segments:20},scene);
clouds.position.copyFrom(earth.position);
const cloudsMat=paint('облака',[.87,.94,1],.1,.86);cloudsMat.alpha=.25;clouds.material=cloudsMat;
// Original modular lunar lander.
const module=MeshBuilder.CreateCylinder('лунный модуль',{diameter:4.7,height:4,tessellation:8},scene);
module.position.set(-13,surface(-13,8)+3.1,8);module.material=steel;
const cap=MeshBuilder.CreateCylinder('верх модуля',{diameterTop:1.4,diameterBottom:4.2,height:2,tessellation:8},scene);
cap.position.set(-13,surface(-13,8)+5.6,8);cap.material=gold;
for(const dir of [-1,1]){
 const wing=MeshBuilder.CreateBox('солнечная панель',{width:5.4,height:.12,depth:2.4},scene);
 wing.position.set(-13+dir*5.5,surface(-13,8)+3.3,8);wing.material=solar;
 const leg=MeshBuilder.CreateCylinder('посадочная опора',{height:2.7,diameter:.2},scene);
 leg.position.set(-13+dir*1.9,surface(-13,8)+1.5,8+dir);leg.material=steel;
}
const landing=MeshBuilder.CreateCylinder('стартовая площадка',{diameter:7,height:.12,tessellation:28},scene);
landing.position.set(0,surface(0,-5)+.12,-5);landing.material=glow;
function astronaut(name:string,body:PBRMaterial,face:PBRMaterial,backpack:boolean){
 const root=new TransformNode(name,scene);
 const torso=MeshBuilder.CreateBox(name+' / корпус',{width:.85,height:1.08,depth:.55},scene);
 torso.parent=root;torso.position.y=1.18;torso.material=body;
 const head=MeshBuilder.CreateSphere(name+' / шлем',{diameter:.82,segments:12},scene);
 head.parent=root;head.position.y=2.03;head.material=suit;
 const shield=MeshBuilder.CreateSphere(name+' / визор',{diameter:.66,segments:12},scene);
 shield.parent=root;shield.position.set(0,2.02,.29);shield.scaling.set(.94,.78,.34);shield.material=face;
 for(const x of [-.31,.31]){
  const leg=MeshBuilder.CreateBox(name+' / нога',{width:.3,height:.85,depth:.31},scene);
  leg.parent=root;leg.position.set(x,.43,0);leg.material=body;
  const arm=MeshBuilder.CreateBox(name+' / рука',{width:.23,height:.93,depth:.29},scene);
  arm.parent=root;arm.position.set(x*2.02,1.22,0);arm.material=body;
 }
 const pack=MeshBuilder.CreateBox(name+' / значок',{width:backpack?.64:.33,height:backpack?.8:.32,depth:backpack?.3:.07},scene);
 pack.parent=root;pack.position.set(0,1.28,backpack?-.43:.3);pack.material=backpack?blue:glow;
 return root;
}
const hero=astronaut('игрок',suit,visor,true);
const fanMesh=astronaut('обожающий фанат',tourist,gold,false);
const shadowMat=new StandardMaterial('тени на грунте',scene);shadowMat.diffuseColor=new Color3(.07,.07,.09);shadowMat.alpha=.48;
const heroShadow=MeshBuilder.CreateDisc('тень героя',{radius:.7,tessellation:20},scene);
const fanShadow=MeshBuilder.CreateDisc('тень фаната',{radius:.7,tessellation:20},scene);
for(const sh of [heroShadow,fanShadow]){sh.rotation.x=Math.PI/2;sh.material=shadowMat;}

const keys=new Set<string>();
window.addEventListener('keydown',e=>{
 if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;
 if(e.code==='Space')jumpMoon(state);
 if(e.code==='KeyE')toggleMoonFan(state);
 if(e.code==='KeyF')launchMoonFan(state);
 if(e.code==='KeyR')rescueMoonFan(state);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
for(const [name,fn] of [
 ['talk',()=>toggleMoonFan(state)],['jump',()=>jumpMoon(state)],
 ['launch',()=>launchMoonFan(state)],['rescue',()=>rescueMoonFan(state)]
] as const)el(name).addEventListener('click',fn);

const pad=el('move-pad'),thumb=el('move-thumb');
let padPointer:number|null=null,forward=0,right=0;
function updatePad(e:PointerEvent){
 const rect=pad.getBoundingClientRect(),r=Math.max(1,rect.width*.31);
 const x=Math.max(-r,Math.min(r,e.clientX-rect.left-rect.width/2));
 const y=Math.max(-r,Math.min(r,e.clientY-rect.top-rect.height/2));
 forward=-y/r;right=x/r;
 thumb.style.transform='translate(calc(-50% + '+x+'px),calc(-50% + '+y+'px))';
}
pad.addEventListener('pointerdown',e=>{
 if(padPointer!==null)return;
 padPointer=e.pointerId;pad.setPointerCapture(e.pointerId);updatePad(e);e.preventDefault();
});
pad.addEventListener('pointermove',e=>{if(padPointer===e.pointerId)updatePad(e);});
const endPad=(e:PointerEvent)=>{
 if(e.pointerId!==padPointer)return;
 padPointer=null;forward=0;right=0;thumb.style.transform='translate(-50%,-50%)';
};
pad.addEventListener('pointerup',endPad);pad.addEventListener('pointercancel',endPad);
let looking:number|null=null,lastX=0;
canvas.addEventListener('pointerdown',e=>{
 if(looking!==null)return;looking=e.pointerId;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(looking!==e.pointerId)return;state.player.yaw+=(e.clientX-lastX)*.008;lastX=e.clientX;
});
const endLook=(e:PointerEvent)=>{if(looking===e.pointerId)looking=null;};
canvas.addEventListener('pointerup',endLook);canvas.addEventListener('pointercancel',endLook);

let previous=performance.now(),acc=0,hudElapsed=0,fpsElapsed=0,frames=0,saveElapsed=0;
function draw(dt:number){
 const p=state.player,f=state.fan;
 hero.position.set(p.x,surface(p.x,p.z)+p.h,p.z);hero.rotation.y=p.yaw;
 fanMesh.position.set(f.x,surface(f.x,f.z)+f.h,f.z);
 fanMesh.rotation.y=Math.atan2(p.x-f.x,p.z-f.z);
 fanMesh.rotation.z=f.mode==='flight'?Math.sin(state.elapsed*2.4)*.45:0;
 heroShadow.position.set(p.x,surface(p.x,p.z)+.05,p.z);
 fanShadow.position.set(f.x,surface(f.x,f.z)+.05,f.z);
 fanShadow.scaling.setAll(Math.max(.25,1-f.h/120));
 const boost=f.mode==='flight'?Math.min(f.h*.38,18):0,dist=14+boost;
 const cam=new Vector3(p.x-Math.sin(p.yaw)*dist,surface(p.x,p.z)+8+boost,p.z-Math.cos(p.yaw)*dist);
 camera.position=Vector3.Lerp(camera.position,cam,Math.min(1,dt*5));
 camera.setTarget(new Vector3(p.x,surface(p.x,p.z)+3+boost*.42,p.z));
 clouds.rotation.y+=dt*.009;
 scene.render();
}
function updateHud(fps:number){
 el('fps').textContent=Math.round(fps)+' FPS';
 el('height').textContent='Высота: '+Math.round(state.fan.h)+' м';
 el('launches').textContent='Полёты: '+state.fan.launches;
 el('event').textContent=state.event;el('speech').textContent=state.line;
 el('objective').textContent=state.fan.mode==='flight'?'Фанат испытывает лунную баллистику!':
  state.fan.mode==='wait'?'Фанат ждёт тебя':'Запусти фаната на Луне';
}
engine.runRenderLoop(()=>{
 const now=performance.now(),dt=Math.min((now-previous)/1000,.12);previous=now;
 if(!document.hidden){
  acc+=dt;let iterations=0;
  while(acc>=1/60&&iterations<6){
   const f=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
   const r=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
   moveMoon(state,Math.max(-1,Math.min(1,forward+f)),Math.max(-1,Math.min(1,right+r)),1/60);
   stepMoon(state,1/60);acc-=1/60;iterations++;
  }
  if(iterations===6)acc=0;
 }
 draw(dt);frames++;fpsElapsed+=dt;hudElapsed+=dt;saveElapsed+=dt;
 if(hudElapsed>.34){updateHud(frames/Math.max(.001,fpsElapsed));frames=0;hudElapsed=0;fpsElapsed=0;}
 if(saveElapsed>10){save();saveElapsed=0;}
});
window.addEventListener('resize',()=>engine.resize());
scene.onDisposeObservable.add(()=>save());
