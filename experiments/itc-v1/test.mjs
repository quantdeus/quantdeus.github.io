import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePCM, normalizeConfig, pcmToWav, ENGINE_VERSION } from './signal.mjs';

test('same seed and settings produce exactly equal PCM', () => {
  const input = {seed:'T1',mode:'white',logicalChannels:1024,durationSec:5,gain:.2};
  const a = generatePCM(input), b = generatePCM(input);
  assert.equal(a.config.activeVoices,8);
  assert.equal(a.config.logicalChannels,1024);
  assert.deepEqual(a.pcm,b.pcm);
  assert.ok(ENGINE_VERSION.startsWith('itc-'));
});
test('different seeds yield different output', () => {
  const a=generatePCM({seed:'ONE',durationSec:5});
  const b=generatePCM({seed:'TWO',durationSec:5});
  assert.notEqual(a.pcm[200],b.pcm[200]);
});
test('all synthesizers are bounded and produce valid WAV headers', () => {
  for (const mode of ['white','brown','pulse','sweep']) {
    const {pcm,config}=generatePCM({mode,durationSec:5,logicalChannels:8,gain:.5});
    assert.equal(pcm.length,config.durationSec*config.sampleRate);
    let peak=0;
    for (const x of pcm) {
      assert.ok(Number.isFinite(x));
      peak=Math.max(peak,Math.abs(x));
    }
    assert.ok(peak<=.750001);
    const wav=new DataView(pcmToWav(pcm,config.sampleRate));
    const ascii=(offset,len)=>Array.from({length:len},(_,i)=>String.fromCharCode(wav.getUint8(offset+i))).join('');
    assert.equal(ascii(0,4),'RIFF');
    assert.equal(ascii(8,4),'WAVE');
    assert.equal(ascii(36,4),'data');
    assert.equal(wav.getUint32(40,true),pcm.length*2);
  }
});
test('configuration limits stay within mobile device safe bounds', () => {
  const c=normalizeConfig({logicalChannels:99999,durationSec:999,gain:4,mode:'bad'});
  assert.equal(c.logicalChannels,1024);
  assert.equal(c.activeVoices,8);
  assert.equal(c.durationSec,30);
  assert.equal(c.gain,.5);
  assert.equal(c.mode,'white');
});
