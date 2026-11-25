// QuantDeus ITC Station V1: reproducible SYNTHETIC audio, not a validated communication channel.
export const ENGINE_VERSION = 'itc-signal-v1.0.0';
const MODES = ['white', 'brown', 'pulse', 'sweep'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function normalizeConfig(raw = {}) {
  const mode = MODES.includes(raw.mode) ? raw.mode : 'white';
  const logicalChannels = clamp(Math.floor(Number(raw.logicalChannels) || 1), 1, 1024);
  const durationSec = clamp(Math.floor(Number(raw.durationSec) || 10), 5, 30);
  const sampleRate = 44100;
  const gain = clamp(Number(raw.gain) || 0.20, 0.05, 0.50);
  const seed = String(raw.seed ?? 'QUANTDEUS-001').slice(0, 64) || 'QUANTDEUS-001';
  return { mode, logicalChannels, activeVoices: Math.min(logicalChannels, 8),
    durationSec, sampleRate, gain, seed };
}
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generatePCM(input = {}) {
  const cfg = normalizeConfig(input);
  const frames = cfg.sampleRate * cfg.durationSec;
  const out = new Float32Array(frames);
  const voices = Array.from({ length: cfg.activeVoices }, (_, i) => ({
    random: prng(hash32(cfg.seed + ':' + i)),
    brown: 0,
    frequency: 105 + i * 37 + hash32(cfg.seed + i) % 65
  }));
  const volume = cfg.gain / Math.sqrt(voices.length);
  const fadeSamples = cfg.sampleRate * 0.025;
  for (let s = 0; s < frames; s++) {
    const t = s / cfg.sampleRate;
    let value = 0;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      let y;
      if (cfg.mode === 'white') {
        y = (v.random() * 2 - 1);
      } else if (cfg.mode === 'brown') {
        v.brown = clamp(v.brown + (v.random() * 2 - 1) * 0.025, -1, 1);
        y = v.brown;
      } else if (cfg.mode === 'pulse') {
        const phase = t * (3 + i * 0.7) % 1;
        y = phase < 0.018 ? (1 - phase / 0.018) * (v.random() * 2 - 1) : 0;
      } else {
        const f0 = v.frequency;
        y = Math.sin(2 * Math.PI * (f0 * t + 180 * t * t / cfg.durationSec));
      }
      value += y;
    }
    const fade = Math.max(0, Math.min(1, s / fadeSamples, (frames - 1 - s) / fadeSamples));
    out[s] = clamp(value * volume * fade, -0.75, 0.75);
  }
  return { pcm: out, config: cfg };
}
export function pcmToWav(pcm, sampleRate = 44100) {
  if (!(pcm instanceof Float32Array) || !pcm.length) throw new TypeError('Nonempty Float32Array required');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Invalid sampleRate');
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const put = (pos, value) => { for (let i=0; i<value.length; i++) v.setUint8(pos+i, value.charCodeAt(i)); };
  put(0,'RIFF'); v.setUint32(4, buf.byteLength-8, true); put(8,'WAVE');
  put(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true);
  v.setUint16(22,1,true); v.setUint32(24,sampleRate,true);
  v.setUint32(28,sampleRate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  put(36,'data'); v.setUint32(40,pcm.length*2,true);
  for (let i=0; i<pcm.length; i++) {
    const x = clamp(Number.isFinite(pcm[i]) ? pcm[i] : 0, -1, 1);
    v.setInt16(44+i*2, x < 0 ? Math.round(x*32768) : Math.round(x*32767), true);
  }
  return buf;
}
