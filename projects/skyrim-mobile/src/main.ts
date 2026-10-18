import {
  Engine, Scene, Color3, Color4, Vector3, MeshBuilder, StandardMaterial,
  PBRMaterial, HemisphericLight, DirectionalLight, UniversalCamera,
  ShadowGenerator, VertexBuffer, VertexData, type AbstractMesh, type Mesh
} from "@babylonjs/core";
import { createState, deserialize, serialize, move, tick, attack, interact, usePotion,
 LANDMARKS, QUEST_HINTS, terrainHeight, type GameState } from "./state.mjs";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const fallback = document.querySelector<HTMLDivElement>("#fallback")!;
const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const showError = (message: string) => {
  fallback.hidden = false;
  fallback.textContent = "Графический режим недоступен: " + message +
    ". Требуется Android Chrome/браузер с аппаратным WebGL 2.";
};
const SAVE_KEY = "quantdeus:northwind:save:v1";
const load = (): GameState => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? deserialize(raw) : createState(); }
  catch { return createState(); }
};
let state = load();
const save = () => { try { localStorage.setItem(SAVE_KEY, serialize(state)); } catch { /* storage disabled */ } };
window.addEventListener("pagehide", save);
window.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
let engine: Engine;
try {
  engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
  if (engine.webGLVersion < 2) throw new Error("WebGL 2 не поддерживается");
} catch (err) {
  showError(String(err));
  throw err;
}
const scene = new Scene(engine);
scene.clearColor = new Color4(0.61, 0.77, 0.86, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.62, 0.75, 0.81);
scene.fogDensity = 0.008;
scene.ambientColor = new Color3(0.19, 0.2, 0.22);
const camera = new UniversalCamera("follow-camera", new Vector3(0, 5, -9), scene);
camera.minZ = 0.15;
camera.maxZ = 280;
camera.fov = 0.93;
scene.activeCamera = camera;

const sky = new HemisphericLight("skyfill", new Vector3(0, 1, 0), scene);
sky.intensity = 0.72;
sky.diffuse = new Color3(0.76, 0.86, 0.98);
const sunlight = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.26), scene);
sunlight.intensity = 2;
sunlight.diffuse = new Color3(1, 0.93, 0.8);
sunlight.position = new Vector3(20, 70, 25);
const shadows = new ShadowGenerator(1024, sunlight);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 16;
function material(name: string, color: [number, number, number], roughness = 0.87): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = new Color3(...color);
  mat.metallic = 0;
  mat.roughness = roughness;
  return mat;
}
const soil = material("earth / PBR", [0.32, 0.4, 0.33]);
const bark = material("weathered timber / PBR", [0.27, 0.19, 0.13]);
const roof = material("cold slate / PBR", [0.22, 0.27, 0.3]);
const needles = material("pine foliage / PBR", [0.09, 0.28, 0.19]);
const needles2 = material("pine foliage light / PBR", [0.14, 0.34, 0.25]);
const stone = material("granite / PBR", [0.43, 0.46, 0.47]);
const relicMat = material("gold relic", [0.82, 0.58, 0.2], 0.26);
relicMat.metallic = 0.7;
const heroMat = material("hero / leather", [0.29, 0.25, 0.23], 0.8);
const blue = material("hero cloak", [0.17, 0.34, 0.49], 0.89);
const foeMat = material("raider cloth", [0.55, 0.17, 0.14]);
const floor = MeshBuilder.CreateGround("Valley mesh", { width: 200, height: 200, subdivisions: 96 }, scene);
const verts = floor.getVerticesData(VertexBuffer.PositionKind);
const indices = floor.getIndices();
if (verts && indices) {
  for (let i = 0; i < verts.length; i += 3) verts[i+1] = terrainHeight(verts[i], verts[i+2]);
  const normals: number[] = [];
  VertexData.ComputeNormals(verts, indices, normals);
  floor.setVerticesData(VertexBuffer.PositionKind, verts, true);
  floor.setVerticesData(VertexBuffer.NormalKind, normals, true);
}
floor.material = soil;
floor.receiveShadows = true;
const Y = (x: number, z: number) => terrainHeight(x, z);
const seeded = (n: number) => {
  const v = Math.sin(n * 104.923 + 93.2) * 43829.127;
  return v - Math.floor(v);
};
function makeBox(name: string, x: number, z: number, width: number, height: number,
 depth: number, mat: PBRMaterial, offset = 0): Mesh {
  const box = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  box.position.set(x, Y(x,z) + height / 2 + offset, z);
  box.material = mat;
  box.receiveShadows = true;
  return box;
}
function cabin(x: number, z: number, scale = 1) {
  makeBox("wood cabin", x, z, 7 * scale, 3.4 * scale, 6 * scale, bark);
  const r = makeBox("stone tile roof", x, z, 8.2 * scale, 0.6 * scale, 7.2 * scale, roof, 3.5 * scale);
  r.rotation.z = 0.12;
  makeBox("oak door", x, z + 3.05*scale, 1.2*scale, 2.2*scale, 0.16, roof, -0.55*scale);
  const c = MeshBuilder.CreateCylinder("chimney", { diameter: 0.8*scale, height:2.8*scale }, scene);
  c.position.set(x+2.1*scale,Y(x,z)+4.6*scale,z-1.2*scale);c.material=stone;
}
for (const [x,z,s] of [[1,23,1],[24,13,1.1],[6,35,0.9],[35,9,0.82]] as const) cabin(x,z,s);
function tree(x: number,z: number,s: number) {
  const trunk=MeshBuilder.CreateCylinder("pine bark",{height:4.8*s,diameterTop:.37*s,diameterBottom:.68*s,tessellation:7},scene);
  trunk.position.set(x,Y(x,z)+2.4*s,z);trunk.material=bark;
  for(let level=0;level<3;level++) {
    const crown=MeshBuilder.CreateCylinder("pine needles",{height:4.7*s,diameterTop:0,diameterBottom:(3.8-level*.6)*s,tessellation:8},scene);
    crown.position.set(x,Y(x,z)+(4.4+level*1.35)*s,z);
    crown.material=level===1?needles2:needles;
  }
}
for(let n=0;n<83;n++){
  const x=(seeded(n+5)-.5)*178,z=(seeded(n+91)-.5)*178;
  const nearRoad = x > 2 && x < 58 && Math.abs(z - x) < 11;
  const inVillage = x > -7 && x < 39 && z > 4 && z < 40;
  if (!nearRoad && !inVillage && Math.hypot(x,z)>14) tree(x,z,.7+seeded(n+22)*.8);
}
for(let n=0;n<57;n++){
  const x=(seeded(n+491)-.5)*180,z=(seeded(n+789)-.5)*180;
  if(x>-5 && x<60 && z>1 && z<60) continue;
  const rock=MeshBuilder.CreateSphere("granite boulder",{diameter:1.2+seeded(n+51)*2,segments:6},scene);
  rock.position.set(x,Y(x,z)+.45,z);
  rock.scaling.y=.58;rock.material=stone;
}
function shrine(name:string,x:number,z:number,color:PBRMaterial): Mesh {
  const marker=MeshBuilder.CreateCylinder(name,{height:1.6,diameter:.9,tessellation:8},scene);
  marker.position.set(x,Y(x,z)+.8,z);marker.material=color;
  return marker;
}
shrine("vanished caravan tracks",LANDMARKS.caravan.x,LANDMARKS.caravan.z,roof);
shrine("ruin gate",LANDMARKS.gate.x,LANDMARKS.gate.z,stone);
for(let j=0;j<5;j++){
 const x=47+j*2.6,z=49+Math.sin(j)*1.8;
 makeBox("ruin pillar",x,z,1.15,3.5 + j*.22,1.15,stone);
}
const relic=MeshBuilder.CreateSphere("ancient artifact",{diameter:1.1,segments:16},scene);
relic.position.set(LANDMARKS.relic.x,Y(LANDMARKS.relic.x,LANDMARKS.relic.z)+1.15,LANDMARKS.relic.z);
relic.material=relicMat;
const chest=makeBox("loot chest",LANDMARKS.chest.x,LANDMARKS.chest.z,1.6,1,.9,bark);
const elder=MeshBuilder.CreateCapsule("village elder",{radius:.38,height:1.8,tessellation:10},scene);
elder.position.set(LANDMARKS.elder.x,Y(LANDMARKS.elder.x,LANDMARKS.elder.z)+.9,LANDMARKS.elder.z);
elder.material=blue;
const raider=MeshBuilder.CreateCapsule("raider",{radius:.42,height:1.83,tessellation:10},scene);
raider.position.set(LANDMARKS.enemy.x,Y(LANDMARKS.enemy.x,LANDMARKS.enemy.z)+.91,LANDMARKS.enemy.z);
raider.material=foeMat;
const hero=MeshBuilder.CreateCapsule("hero",{radius:.38,height:1.8,tessellation:12},scene);
hero.material=heroMat;
const scarf=MeshBuilder.CreateBox("hero cloak",{width:.75,height:1.05,depth:.18},scene);
scarf.material=blue;scarf.parent=hero;scarf.position.set(0,.1,-.37);
const sword=MeshBuilder.CreateBox("iron sword",{width:.08,height:1.35,depth:.15},scene);
sword.material=roof;sword.parent=hero;sword.position.set(.55,.28,.14);sword.rotation.z=-.18;

const keys = new Set<string>();
window.addEventListener("keydown", e=>{
 if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();
 keys.add(e.code);
 if(e.repeat)return;
 if(e.code==="KeyE") interact(state);
 if(e.code==="KeyF") attack(state);
 if(e.code==="KeyH") usePotion(state);
});
window.addEventListener("keyup",e=>keys.delete(e.code));
window.addEventListener("blur",()=>keys.clear());
function pointerPad(element:HTMLElement,onMove:(x:number,y:number)=>void,onEnd:()=>void) {
 let pointer:number|null=null,lastX=0,lastY=0;
 element.addEventListener("pointerdown",e=>{
   if(pointer!==null)return;
   pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;
   element.setPointerCapture(e.pointerId);e.preventDefault();
 });
 element.addEventListener("pointermove",e=>{
   if(e.pointerId!==pointer)return;
   onMove(e.clientX-lastX,e.clientY-lastY);
   lastX=e.clientX;lastY=e.clientY;
 });
 const stop=(e:PointerEvent)=>{if(e.pointerId===pointer){pointer=null;onEnd();}};
 element.addEventListener("pointerup",stop);
 element.addEventListener("pointercancel",stop);
}
let forward=0,right=0,pitch=.33;
const stick=byId<HTMLElement>("move-thumb");
const movePad=byId<HTMLElement>("move-pad");
let touchStartX=0,touchStartY=0;
movePad.addEventListener("pointerdown",e=>{touchStartX=e.clientX;touchStartY=e.clientY});
pointerPad(movePad,(_,__)=>{},()=>{forward=0;right=0;stick.style.transform="translate(-50%,-50%)"});
movePad.addEventListener("pointermove",e=>{
 if(!movePad.hasPointerCapture(e.pointerId))return;
 const x=Math.max(-44,Math.min(44,e.clientX-touchStartX));
 const y=Math.max(-44,Math.min(44,e.clientY-touchStartY));
 right=x/44;forward=-y/44;
 stick.style.transform="translate(calc(-50% + "+x+"px),calc(-50% + "+y+"px))";
});
pointerPad(byId("look-pad"),(dx,dy)=>{
 state.player.yaw+=dx*.007;
 pitch=Math.max(.14,Math.min(.8,pitch+dy*.004));
},()=>{});
canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")canvas.setPointerCapture(e.pointerId);});
let mouseX:number|null=null,mouseY:number|null=null;
canvas.addEventListener("pointermove",e=>{
 if(e.buttons!==1||e.pointerType!=="mouse")return;
 if(mouseX!==null){state.player.yaw+=(e.clientX-mouseX)*.006;pitch=Math.max(.14,Math.min(.8,pitch+(e.clientY-(mouseY||0))*.004));}
 mouseX=e.clientX;mouseY=e.clientY;
});
canvas.addEventListener("pointerup",()=>{mouseX=null;mouseY=null});
byId("attack").addEventListener("click",()=>attack(state));
byId("interact").addEventListener("click",()=>interact(state));
byId("potion").addEventListener("click",()=>usePotion(state));
const panel=byId<HTMLDivElement>("settings-panel");
byId("settings").addEventListener("click",()=>panel.hidden=false);
byId("close").addEventListener("click",()=>panel.hidden=true);
byId("save").addEventListener("click",()=>{save();state.event="Прогресс сохранён.";panel.hidden=true;});
const quality=byId<HTMLSelectElement>("quality");
function applyQuality(profile:string){
 const settings: Record<string,[number,number,number]>={low:[1.7,0.6,30],medium:[1.25,1,45],high:[1,1.2,60]};
 const [scale,shadowScale]=settings[profile]||settings.medium;
 engine.setHardwareScalingLevel(scale);
 sunlight.intensity=1.7*shadowScale;
 // The profile sets a target cap; GPU thermal measurement is still required.
}
quality.addEventListener("change",()=>applyQuality(quality.value));
applyQuality("medium");
let last=performance.now(),accumulator=0,elapsedSave=0,elapsedHud=0,frameSample=0,frames=0;
function refreshHud(fps:number){
 byId("quest").textContent=QUEST_HINTS[state.quest]||state.quest;
 byId("event").textContent=state.event;
 byId("hp").textContent=String(Math.ceil(state.player.hp));
 byId("stamina").textContent=String(Math.ceil(state.player.stamina));
 (byId<HTMLMeterElement>("hp-bar")).value=state.player.hp;
 (byId<HTMLMeterElement>("stamina-bar")).value=state.player.stamina;
 byId("gold").textContent=String(state.player.gold);
 byId("inventory").textContent="Зелья ×"+(state.inventory.potion||0);
 byId("fps").textContent=Math.round(fps)+" FPS";
}
const redraw=()=>{
 const now=performance.now(),dt=Math.min((now-last)/1000,.1);
 last=now;
 if(!document.hidden && panel.hidden){
  accumulator+=dt;
  let count=0;
  while(accumulator>=1/60&&count<5){
   const keysForward=Number(keys.has("KeyW")||keys.has("ArrowUp"))-Number(keys.has("KeyS")||keys.has("ArrowDown"));
   const keysRight=Number(keys.has("KeyD")||keys.has("ArrowRight"))-Number(keys.has("KeyA")||keys.has("ArrowLeft"));
   move(state,Math.max(-1,Math.min(1,forward+keysForward)),Math.max(-1,Math.min(1,right+keysRight)),1/60);
   tick(state,1/60);
   accumulator-=1/60;count++;
  }
  if(count===5)accumulator=0;
 }
 const p=state.player;
 hero.position.set(p.x,Y(p.x,p.z)+.92,p.z);
 hero.rotation.y=p.yaw;
 raider.isVisible=!state.flags.enemyDefeated;
 relic.isVisible=!state.flags.relicTaken;
 chest.scaling.y=state.flags.chestOpened?.4:1;
 const target=new Vector3(p.x,Y(p.x,p.z)+1.35,p.z);
 const follow=8, yOffset=3.5+pitch*4;
 camera.position.set(p.x-Math.sin(p.yaw)*follow,target.y+yOffset,p.z-Math.cos(p.yaw)*follow);
 camera.setTarget(target.add(new Vector3(Math.sin(p.yaw)*2,0,Math.cos(p.yaw)*2)));
 const sunAngle=state.dayTime*Math.PI*2;
 sunlight.direction=new Vector3(-.4,-Math.max(.17,Math.sin(sunAngle)),.24);
 scene.render();
 elapsedHud+=dt;elapsedSave+=dt;frameSample+=dt;frames++;
 if(elapsedHud>.35){refreshHud(frames/Math.max(frameSample,.0001));frameSample=0;frames=0;elapsedHud=0;}
 if(elapsedSave>10){save();elapsedSave=0;}
};
engine.runRenderLoop(redraw);
window.addEventListener("resize",()=>engine.resize());
scene.onDisposeObservable.add(()=>save());
