import { generatePCM, pcmToWav, normalizeConfig, ENGINE_VERSION } from './signal.mjs';
const $ = id => document.getElementById(id);
const buttons = ['generate','play','stop','wav','meta'];
let current = null;
let context = null;
let source = null;
let analyser = null;
let raf = null;
const canvas = $('spectrum'), g = canvas.getContext('2d');
function status(message) { $('status').textContent = message; }
function configFromForm() {
  return normalizeConfig({
    mode: $('mode').value,
    logicalChannels: $('logicalChannels').value,
    seed: $('seed').value,
    durationSec: $('durationSec').value,
    gain: $('gain').value
  });
}
function setControls(generating = false) {
  $('generate').disabled = generating;
  for (const id of ['play','wav','meta']) $(id).disabled = generating || !current;
  $('stop').disabled = !source;
}
function cleanPlayback() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (source) {
    const old = source;
    source = null;
    old.onended = null;
    try { old.stop(); } catch { /* already ended */ }
    old.disconnect();
  }
  if (analyser) { analyser.disconnect(); analyser = null; }
  setControls();
}
async function prepare() {
  cleanPlayback();
  current = null;
  setControls(true);
  status('Синтез идёт локально…');
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    const { pcm, config } = generatePCM(configFromForm());
    current = { pcm, config, createdAt: new Date().toISOString(),
      runId: 'itc-' + (crypto.randomUUID?.() ?? Date.now().toString(36)) };
    status('Готово: ' + config.durationSec + ' c, ' + config.mode +
      ', логических каналов ' + config.logicalChannels +
      ', одновременных голосов ' + config.activeVoices +
      '.\nSeed: ' + config.seed + '\nТип: synthetic / local-only');
  } catch (error) {
    status('Ошибка генерации: ' + (error?.message || String(error)));
  } finally { setControls(); }
}
function drawSpectrum() {
  if (!analyser || !g) return;
  const ratio = Math.min(2,window.devicePixelRatio || 1);
  const w = Math.max(10,Math.round(canvas.clientWidth * ratio));
  const h = Math.max(10,Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  g.clearRect(0,0,w,h);
  g.fillStyle='#03101e'; g.fillRect(0,0,w,h);
  const bars = 64, step = Math.max(1,Math.floor(bins.length / bars));
  for (let i = 0; i < bars; i++) {
    let sum=0;
    for(let j=0;j<step;j++) sum+=bins[i*step+j]||0;
    const amplitude=sum/step/255;
    const height=Math.max(2,amplitude*(h-10));
    g.fillStyle='hsl('+(185+i*1.3)+',90%,'+(54+amplitude*20)+'%)';
    g.fillRect(i*w/bars,h-height,w/bars-2,height);
  }
  raf=requestAnimationFrame(drawSpectrum);
}
async function play() {
  if (!current) return;
  cleanPlayback();
  try {
    if (!context || context.state === 'closed') context = new AudioContext();
    await context.resume();
    const audio=context.createBuffer(1,current.pcm.length,current.config.sampleRate);
    audio.copyToChannel(current.pcm,0);
    const node=context.createBufferSource();
    node.buffer=audio;
    analyser=context.createAnalyser();
    analyser.fftSize=1024;
    node.connect(analyser);
    analyser.connect(context.destination);
    source=node;
    node.onended=()=>{ if (source===node) { cleanPlayback(); status('Воспроизведение завершено. Экспорт доступен.'); } };
    node.start();
    status('▶ Воспроизведение: ' + current.runId + '\nУменьшите громкость при использовании наушников.');
    setControls();
    drawSpectrum();
  } catch (error) {
    cleanPlayback();
    status('Аудио не запустилось: ' + (error?.message||String(error)));
  }
}
function download(filename,blob) {
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url; a.download=filename; a.style.display='none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportWav() {
  if(!current)return;
  const wav=pcmToWav(current.pcm,current.config.sampleRate);
  download(current.runId+'.wav',new Blob([wav],{type:'audio/wav'}));
  status('WAV сохранён локально. Экспортируйте JSON рядом с ним для проверки происхождения.');
}
async function exportJson() {
  if(!current)return;
  if(!globalThis.crypto?.subtle) { status('Для SHA-256 нужен HTTPS или localhost.'); return; }
  const wav=pcmToWav(current.pcm,current.config.sampleRate);
  const digest=await crypto.subtle.digest('SHA-256',wav);
  const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const json={schemaVersion:'itc-metadata-v1',engineVersion:ENGINE_VERSION,
    runId:current.runId,createdAtUtc:current.createdAt,
    sourceType:'synthetic',contactVerified:false,
    config:current.config,pcmFrames:current.pcm.length,
    wavSha256:sha256,privacy:'local-first; user-initiated export only',
    note:'A synthetic signal is not evidence of external communication.'};
  download(current.runId+'.json',new Blob([JSON.stringify(json,null,2)],{type:'application/json'}));
  status('JSON сохранён. SHA-256 WAV: '+sha256+'\nСравните с экспортированным WAV.');
}
$('generate').addEventListener('click',prepare);
$('play').addEventListener('click',play);
$('stop').addEventListener('click',()=>{ cleanPlayback(); status('■ Воспроизведение остановлено.'); });
$('wav').addEventListener('click',exportWav);
$('meta').addEventListener('click',()=>exportJson().catch(e=>status('Ошибка экспорта: '+e.message)));
for(const id of ['mode','logicalChannels','seed','durationSec','gain']) {
  $(id).addEventListener('change',()=>{ if (current) status('Параметры изменены. Нажмите «Сгенерировать» для нового результата.'); });
}
setControls();
