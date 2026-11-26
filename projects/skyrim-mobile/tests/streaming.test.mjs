import test from "node:test";
import assert from "node:assert/strict";
import {CellStreamer} from "../src/streaming.mjs";
test("loads only nearest 3x3 cells and respects concurrency",async()=>{
 let running=0,peak=0;
 const s=new CellStreamer({radius:1,maxConcurrent:2,loader:async job=>{
  peak=Math.max(peak,++running);await Promise.resolve();running--;return job.id;
 }});
 s.setFocus({x:0,z:0});await s.waitIdle();
 assert.equal(s.snapshot().length,9);
 assert.ok(s.snapshot().every(r=>r.state==="active"));
 assert.ok(peak<=2);s.dispose();
});
test("moving far away releases old cells",async()=>{
 const disposed=[];
 const s=new CellStreamer({radius:1,loader:async j=>j.id,disposer:a=>disposed.push(a)});
 s.setFocus({x:0,z:0});await s.waitIdle();
 s.setFocus({x:100,z:100});await s.waitIdle();
 assert.equal(s.snapshot().length,9);
 assert.ok(disposed.length>=9);s.dispose();
});
test("coordinates are validated and disposed instance rejects updates",()=>{
 const s=new CellStreamer({radius:0,loader:async()=>null});
 assert.throws(()=>s.setFocus({x:NaN,z:0}),/Invalid world position/);
 s.dispose();assert.throws(()=>s.setFocus({x:0,z:0}),/Disposed/);
});
