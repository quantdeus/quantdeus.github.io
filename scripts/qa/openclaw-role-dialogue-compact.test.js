'use strict';
const assert=require('assert');
const {parseJson}=require('../openclaw-role-dialogue');
assert.deepStrictEqual(parseJson('SUMMARY: ok FINDING: one NEXT_STEP: verify'),{summary:'ok',findings:['one'],next_step:'verify'});
assert.deepStrictEqual(parseJson('SUMMARY: ok\nFINDING 1: one\nFINDING 2: two\nNEXT STEP: verify'),{summary:'ok',findings:['one','two'],next_step:'verify'});
console.log('compact role dialogue parser: ok');
