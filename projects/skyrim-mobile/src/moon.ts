import {
 Engine, Scene, Color3, Color4, Vector3, MeshBuilder, PBRMaterial,
 StandardMaterial, HemisphericLight, DirectionalLight, UniversalCamera,
 VertexBuffer, VertexData, TransformNode, DynamicTexture
} from '@babylonjs/core';
import {
 createMoonState,deserializeMoon,serializeMoon,moonHeight,moveMoon,
 jumpMoon,stepMoon,toggleMoonFan,shoutMoonFan,rescueMoonFan,type MoonState
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
const dust=paint('лунный реголит',[.93,.93,.93]);
const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7+43.4)*43758.5;return n-Math.floor(n);};
function noise(x:number,y:number){
 const X=Math.floor(x),Y=Math.floor(y),a=x-X,b=y-Y,u=a*a*(3-2*a),v=b*b*(3-2*b);
 return (hash(X,Y)*(1-u)+hash(X+1,Y)*u)*(1-v)+(hash(X,Y+1)*(1-u)+hash(X+1,Y+1)*u)*v;
}
function fbm(x:number,y:number){
 let n=0,w=.55;for(let i=0;i<5;i++){n+=noise(x,y)*w;x*=2.06;y*=2.04;w*=.52;}return n;
}
function makeTexture(name:string,w:number,h:number,pixel:(x:number,y:number)=>number[]){
 const t=new DynamicTexture(name,{width:w,height:h},scene,false);
 const c=t.getContext() as unknown as CanvasRenderingContext2D;
 const im=c.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=pixel(x,y),i=(y*w+x)*4;
  im.data[i]=p[0];im.data[i+1]=p[1];im.data[i+2]=p[2];im.data[i+3]=p[3];
 }
 c.putImageData(im,0,0);t.update(false);return t;
}
const regolith=makeTexture('процедурный лунный реголит',512,512,(x,y)=>{
 const v=Math.min(186,Math.max(65,109+78*(fbm(x/48,y/48)-.48)+27*(hash(x,y)-.5)));
 return [v,v,v*1.05,255];
});
regolith.uScale=14;regolith.vScale=14;dust.albedoTexture=regolith;
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
const earthMap=makeTexture('текстура Земли',512,256,(x,y)=>{
 const u=x/512,v=y/256,lat=Math.abs(v-.5)*2;
 const n=fbm(u*8.8+2,v*6.9+7)+.18*(noise(u*24,v*19)-.5);
 let rgb=n>.52?(noise(u*18,v*12)>.48?[102,135,79]:[153,128,95]):[20,63+noise(u*13,v*8)*25,132];
 if(lat>.8){const ice=Math.min(1,(lat-.8)*5);rgb=rgb.map(c=>c*(1-ice)+225*ice);}
 return [...rgb,255];
});
const cloudMap=makeTexture('облака Земли',512,256,(x,y)=>{
 const n=fbm(x/32+16,y/28+5);return [255,255,255,Math.min(200,Math.max(0,(n-.49)*820))];
});
const earth=MeshBuilder.CreateSphere('Земля',{diameter:72,segments:48},scene);
earth.position.set(56,75,185);
const earthMat=paint('Земля',[1,1,1],.1,.8);earthMat.albedoTexture=earthMap;earthMat.emissiveColor=new Color3(.02,.065,.13);earth.material=earthMat;
const clouds=MeshBuilder.CreateSphere('облачный слой',{diameter:72.65,segments:36},scene);
clouds.position.copyFrom(earth.position);
const cloudsMat=new StandardMaterial('атмосферные облака',scene);
cloudsMat.diffuseTexture=cloudMap;cloudsMat.useAlphaFromDiffuseTexture=true;cloudsMat.backFaceCulling=false;
clouds.material=cloudsMat;
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

const skin=paint('лицо эльфа',[.91,.69,.50],0,.92);
const ivory=paint('белки глаз и зубы',[.93,.92,.85]);
const pupil=paint('зрачки',[.038,.025,.028],.05,.5);
const goldenHair=paint('золотые волосы',[.87,.63,.11],.05,.8);
const robe=paint('бордовые одежды фаната',[.39,.075,.17],0,.92);
const embroidery=paint('золотая вышивка',[.86,.58,.16],.43,.45);
const fur=paint('мех и ворот',[.58,.49,.38]);
const leather=paint('кожа и ремни',[.29,.16,.105]);
const iron=paint('железо норда',[.39,.45,.49],.67,.38);
const black=paint('тёмная ткань',[.14,.13,.15]);


function fantasyCharacter(name:string,fan:boolean){
 const root=new TransformNode(name,scene);
 const body=fan?robe:leather,leg=fan?robe:black;
 const attach=(mesh:any,parent:TransformNode,x:number,y:number,z:number,material:PBRMaterial)=>{
  mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=material;return mesh;
 };
 const torso=attach(MeshBuilder.CreateCylinder(name+' / туловище',{height:1.14,diameterTop:.96,diameterBottom:.73,tessellation:10},scene),root,0,1.3,0,body);
 attach(MeshBuilder.CreateBox(name+' / пояс',{width:.96,height:.18,depth:.74},scene),root,0,.85,0,leather);
 attach(MeshBuilder.CreateBox(name+' / плащ',{width:1.05,height:1.25,depth:.10},scene),root,0,1.1,-.43,fan?robe:fur);
 for(const sign of [-1,1]){
  attach(MeshBuilder.CreateCylinder(name+' / сапог',{height:.89,diameterTop:.32,diameterBottom:.41,tessellation:8},scene),root,sign*.25,.45,0,leg);
  attach(MeshBuilder.CreateBox(name+' / башмак',{width:.36,height:.24,depth:.61},scene),root,sign*.25,.14,.16,leather);
 }
 const armLeft=new TransformNode(name+' / левое плечо',scene);
 const armRight=new TransformNode(name+' / правое плечо',scene);
 for(const [sign,pivot] of [[-1,armLeft],[1,armRight]] as const){
  pivot.parent=root;pivot.position.set(sign*.52,1.72,0);pivot.rotation.z=sign*(fan?1.05:.23);
  attach(MeshBuilder.CreateCylinder(name+' / рукав',{height:.83,diameterTop:.33,diameterBottom:.23,tessellation:8},scene),pivot,0,-.40,0,body);
  attach(MeshBuilder.CreateSphere(name+' / ладонь',{diameter:.3,segments:9},scene),pivot,0,-.85,0,fan?skin:leather);
  attach(MeshBuilder.CreateCylinder(name+' / наруч',{height:.23,diameter:.30,tessellation:9},scene),pivot,0,-.65,0,fan?embroidery:iron);
 }
 const neck=attach(MeshBuilder.CreateCylinder(name+' / шея',{height:.32,diameter:.27},scene),root,0,1.95,0,skin);
 const headRoot=new TransformNode(name+' / поворот головы',scene);
 headRoot.parent=root;headRoot.position.y=2.13;
 const face=attach(MeshBuilder.CreateSphere(name+' / лицо',{diameter:.78,segments:18},scene),headRoot,0,.06,0,fan?skin:iron);
 face.scaling.set(.92,1.13,.83);
 if(fan){
  // Detailed readable elf face with grin, brows, pointed ears and absurd golden quiff.
  for(const sign of [-1,1]){
   const ear=attach(MeshBuilder.CreateSphere(name+' / эльфийское ухо',{diameter:.26,segments:10},scene),headRoot,sign*.42,.08,.03,skin);
   ear.scaling.set(.65,.43,1.8);ear.rotation.z=sign*.45;
   const eye=attach(MeshBuilder.CreateSphere(name+' / глаз',{diameter:.19,segments:9},scene),headRoot,sign*.17,.14,.315,ivory);
   eye.scaling.z=.58;
   const iris=attach(MeshBuilder.CreateSphere(name+' / зрачок',{diameter:.09,segments:7},scene),headRoot,sign*.17,.145,.405,pupil);
   iris.scaling.z=.55;
   const brow=attach(MeshBuilder.CreateBox(name+' / бровь',{width:.2,height:.045,depth:.055},scene),headRoot,sign*.18,.28,.342,goldenHair);
   brow.rotation.z=sign*.26;
  }
  const mouth=attach(MeshBuilder.CreateSphere(name+' / радостный крик',{diameter:.37,segments:12},scene),headRoot,0,-.185,.317,pupil);
  mouth.scaling.set(1,.72,.19);
  attach(MeshBuilder.CreateBox(name+' / улыбка',{width:.3,height:.065,depth:.045},scene),headRoot,0,-.12,.4,ivory);
  for(let i=0;i<8;i++){
   const az=i*2.399,r=.16+.23*Math.sqrt(i/8);
   const tuft=attach(MeshBuilder.CreateCylinder(name+' / прядь волос',{height:.30+(i%3)*.16,diameterTop:0,diameterBottom:.18,tessellation:6},scene),headRoot,Math.sin(az)*r,.48+((i%3)*.04),Math.cos(az)*r,goldenHair);
   tuft.rotation.z=Math.sin(az)*.26;tuft.rotation.x=Math.cos(az)*.24;
  }
  const crest=attach(MeshBuilder.CreateCylinder(name+' / вихор',{height:.7,diameterTop:0,diameterBottom:.32,tessellation:9},scene),headRoot,0,.68,0,goldenHair);
  crest.rotation.z=.18;
  attach(MeshBuilder.CreateTorus(name+' / королевский медальон',{diameter:.39,thickness:.09,tessellation:20},scene),root,0,1.42,.49,embroidery);
  attach(MeshBuilder.CreateSphere(name+' / медальон',{diameter:.18,segments:10},scene),root,0,1.42,.52,ivory);
  for(const sign of [-1,1]){
   attach(MeshBuilder.CreateBox(name+' / вышивка',{width:.11,height:.74,depth:.04},scene),root,sign*.35,1.39,.42,embroidery);
  }
  attach(MeshBuilder.CreateTorus(name+' / меховой ворот',{diameter:1.02,thickness:.22,tessellation:15},scene),root,0,1.83,0,fur);
 }else{
  // Nord-inspired adventurer: no spacesuit; distinct original sculpt.
  const helm=attach(MeshBuilder.CreateCylinder(name+' / рогатый шлем',{height:.37,diameterTop:.51,diameterBottom:.76,tessellation:9},scene),headRoot,0,.3,0,iron);
  for(const sign of [-1,1]){
   const horn=attach(MeshBuilder.CreateCylinder(name+' / рог',{height:.58,diameterTop:0,diameterBottom:.2,tessellation:8},scene),headRoot,sign*.39,.54,0,fur);
   horn.rotation.z=-sign*.50;
  }
  const shield=attach(MeshBuilder.CreateCylinder(name+' / щит',{height:.17,diameter:.94,tessellation:14},scene),root,0,1.33,-.43,iron);
  shield.rotation.x=Math.PI/2;
  const boss=attach(MeshBuilder.CreateSphere(name+' / умбон',{diameter:.27,segments:8},scene),root,0,1.33,-.54,embroidery);
  attach(MeshBuilder.CreateBox(name+' / ножны меча',{width:.16,height:1.65,depth:.15},scene),root,.50,1.22,-.35,iron).rotation.z=.27;
 }
 return {root,armLeft,armRight,head:headRoot};
}
const heroActor=fantasyCharacter('воин',false),fanActor=fantasyCharacter('обожающий фанат',true);
const hero=heroActor.root,fanMesh=fanActor.root;
let firstPerson=true,blastTime=0;
const blastMat=paint('FUS RO DAH сияние',[.42,.78,1],.1,.17);
blastMat.emissiveColor=new Color3(.12,.51,1);blastMat.alpha=.74;
const blast=MeshBuilder.CreateTorus('волна безжалостной силы',{diameter:2,thickness:.095,tessellation:40},scene);
blast.rotation.x=Math.PI/2;blast.material=blastMat;blast.setEnabled(false);
const gloveMaterial=paint('рукавицы героя',[.28,.26,.26],.55,.45);
const leftGlove=MeshBuilder.CreateBox('левая рука от первого лица',{width:.30,height:.65,depth:.32},scene);
const rightGlove=MeshBuilder.CreateBox('правая рука от первого лица',{width:.30,height:.65,depth:.32},scene);
for(const [sign,glove] of [[-1,leftGlove],[1,rightGlove]] as const){
 glove.parent=camera;glove.position.set(sign*.60,-.60,1.4);glove.rotation.x=-.45;glove.rotation.z=sign*.16;glove.material=gloveMaterial;
}
function switchView(){firstPerson=!firstPerson;hero.setEnabled(!firstPerson);}
hero.setEnabled(false);
function voiceLine(){
 const message='Во имя Азуры!!! Вы великий чемпион!';
 el('dialogue').textContent='Фанат: '+message;
 el('dialogue').classList.add('visible');
 if('speechSynthesis' in window){
  try{
   window.speechSynthesis.cancel();
   const voice=new SpeechSynthesisUtterance(message);voice.lang='ru-RU';voice.rate=1.12;voice.pitch=1.24;
   window.speechSynthesis.speak(voice);
  }catch{/* No speech engine: subtitles stay readable */}
 }
}
function castShout(){
 if(!shoutMoonFan(state))return;
 voiceLine();blastTime=1.15;
 blast.position.set(state.player.x+Math.sin(state.player.yaw)*3.2,
   surface(state.player.x,state.player.z)+2,
   state.player.z+Math.cos(state.player.yaw)*3.2);
 blast.rotation.y=state.player.yaw;blast.setEnabled(true);
}
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
 if(e.code==='KeyF')castShout();
 if(e.code==='KeyV')switchView();
 if(e.code==='KeyR')rescueMoonFan(state);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
for(const [name,fn] of [
 ['talk',()=>{toggleMoonFan(state);voiceLine();}],['jump',()=>jumpMoon(state)],
 ['shout',castShout],['rescue',()=>rescueMoonFan(state)],['view',switchView]
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
 fanMesh.rotation.z=(f.mode==='flight'||f.mode==='earthflight')?Math.sin(state.elapsed*2.4)*.65:0;
 fanMesh.scaling.setAll(f.mode==='earthflight'?Math.max(.10,1-f.flightTime/10):1);
 fanMesh.setEnabled(f.mode!=='earthbound');
 fanActor.armLeft.rotation.z=-1.05+(f.mode==='earthflight'?Math.sin(state.elapsed*13)*.47:0);
 fanActor.armRight.rotation.z=1.05+(f.mode==='earthflight'?Math.cos(state.elapsed*13)*.47:0);
 heroShadow.position.set(p.x,surface(p.x,p.z)+.05,p.z);
 fanShadow.position.set(f.x,surface(f.x,f.z)+.05,f.z);
 fanShadow.scaling.setAll(Math.max(.25,1-f.h/120));
 const y=surface(p.x,p.z)+p.h;
 if(firstPerson){
  const at=new Vector3(p.x,y+1.98,p.z);
  camera.position=Vector3.Lerp(camera.position,at,Math.min(1,dt*10));
  camera.setTarget(at.add(new Vector3(Math.sin(p.yaw)*11,-.12,Math.cos(p.yaw)*11)));
 }else{
  const dist=10;
  const cam=new Vector3(p.x-Math.sin(p.yaw)*dist,y+5.6,p.z-Math.cos(p.yaw)*dist);
  camera.position=Vector3.Lerp(camera.position,cam,Math.min(1,dt*5));
  camera.setTarget(new Vector3(p.x,y+1.5,p.z));
 }
 leftGlove.setEnabled(firstPerson);rightGlove.setEnabled(firstPerson);
 if(blastTime>0){
  blastTime=Math.max(0,blastTime-dt);
  const progress=1-blastTime/1.15;
  blast.scaling.setAll(1+progress*9);
  blastMat.alpha=.72*(1-progress);
  leftGlove.position.z=1.4+Math.sin(progress*Math.PI)*.4;
  rightGlove.position.z=1.4+Math.sin(progress*Math.PI)*.4;
  if(blastTime===0)blast.setEnabled(false);
 }else{leftGlove.position.z=1.4;rightGlove.position.z=1.4;}
 clouds.rotation.y+=dt*.012;earth.rotation.y+=dt*.006;
 scene.render();
}
function updateHud(fps:number){
 el('fps').textContent=Math.round(fps)+' FPS';
 el('height').textContent='Высота фаната: '+Math.round(state.fan.h)+' м';
 el('launches').textContent='Полёты: '+state.fan.launches;
 el('event').textContent=state.event;el('speech').textContent=state.line;
 el('cooldown').textContent=state.shoutCooldown>0?'Крик: '+state.shoutCooldown.toFixed(1)+' с':'Крик готов';
 (el('shout') as HTMLButtonElement).disabled=state.shoutCooldown>0;
 el('compass').textContent=['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'][((Math.round((state.player.yaw%(2*Math.PI))*4/Math.PI)+8)%8)];
 el('objective').textContent=state.fan.mode==='flight'?'Фанат испытывает лунную баллистику!':
  state.fan.mode==='earthbound'?'🌍 Фанат достиг орбиты Земли!':state.fan.mode==='wait'?'Фанат ждёт тебя':'Отправь фаната к Земле криком!';
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
