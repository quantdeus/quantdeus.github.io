'use strict';
const assert=require('assert');
const {parseJson}=require('../openclaw-role-dialogue');
assert.deepStrictEqual(parseJson('{"summary":"ok","findings":["one"],"next_step":"verify"}'),{summary:'ok',findings:['one'],next_step:'verify'});
assert.deepStrictEqual(parseJson('SUMMARY: ok\nFINDING: one\nNEXT_STEP: verify'),{summary:'ok',findings:['one'],next_step:'verify'});
assert.deepStrictEqual(parseJson('SUMMARY: ok\nFINDING 1: one\nFINDING 2: two\nNEXT STEP: verify'),{summary:'ok',findings:['one','two'],next_step:'verify'});
assert.throws(()=>parseJson('not structured output'),e=>e&&e.code==='ROLE_DIALOGUE_MALFORMED_OUTPUT');
console.log('openclaw role dialogue parser regression: ok');
