'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const session = import('../../vercel-dispatcher/lib/office-session.js');
test('Office request never stops shared VM and cleans own paths', async()=>{const {cleanupOfficeRequest}=await session;const c=[];await cleanupOfficeRequest({runCommand:async x=>c.push(x)},['/a'],['/b']);assert.equal(c.length,2);});
test('busy Office queue is retryable', async()=>{const {runOfficeAgent}=await session;await assert.rejects(runOfficeAgent({runCommand:async()=>({exitCode:75})},{lock:'/l',args:[],env:{}}),e=>e.status===503);});
test('resumed Office reserves request window', async()=>{const {ensureOfficeWindow}=await session;let x=0;await ensureOfficeWindow({expiresAt:new Date(60000),extendTimeout:async()=>x++},0);assert.equal(x,1);});
