// Bounded stage-2 world streaming control plane; deterministic grid selection.
export class CellStreamer {
 constructor({cellSize=32,radius=1,maxConcurrent=2,loader,disposer=()=>{}}){
  if(!(cellSize>0)||!Number.isInteger(radius)||radius<0||!(maxConcurrent>0)||typeof loader!=="function")
   throw new Error("Invalid streamer configuration");
  Object.assign(this,{cellSize,radius,maxConcurrent,loader,disposer});
  this.records=new Map();this.queue=[];this.running=0;this.closed=false;this.waiters=[];
 }
 setFocus(position){
  if(this.closed)throw new Error("Disposed streamer");
  if(!Number.isFinite(position.x)||!Number.isFinite(position.z))throw new Error("Invalid world position");
  const x=Math.floor(position.x/this.cellSize),z=Math.floor(position.z/this.cellSize);
  const cells=[];
  for(let i=x-this.radius;i<=x+this.radius;i++)for(let j=z-this.radius;j<=z+this.radius;j++)
   cells.push({id:i+","+j,x:i,z:j,priority:(x-i)**2+(z-j)**2});
  const wanted=new Set(cells.map(c=>c.id));
  for(const [id,record] of this.records){
   if(wanted.has(id))continue;
   record.controller.abort();
   if(record.state==="active")this.disposer(record.asset,id);
   this.records.delete(id);
  }
  this.queue=this.queue.filter(c=>wanted.has(c.id));
  for(const c of cells)if(!this.records.has(c.id)&&!this.queue.some(q=>q.id===c.id))this.queue.push(c);
  this.queue.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  this.pump();
 }
 pump(){
  while(!this.closed&&this.running<this.maxConcurrent&&this.queue.length){
   const job=this.queue.shift();
   if(this.records.has(job.id))continue;
   const controller=new AbortController(),record={state:"requested",controller,asset:null};
   this.records.set(job.id,record);this.running++;
   Promise.resolve().then(()=>this.loader(job,controller.signal))
    .then(asset=>{
     if(this.closed||controller.signal.aborted||this.records.get(job.id)!==record){
      if(asset!=null)this.disposer(asset,job.id);
      return;
     }
     record.asset=asset;record.state="active";
    })
    .catch(err=>{if(!controller.signal.aborted&&this.records.get(job.id)===record){record.state="error";record.error=String(err);}})
    .finally(()=>{this.running--;this.pump();this.flush();});
  }
  this.flush();
 }
 flush(){if(this.running===0&&this.queue.length===0)for(const cb of this.waiters.splice(0))cb();}
 waitIdle(){if(!this.running&&!this.queue.length)return Promise.resolve();return new Promise(resolve=>this.waiters.push(resolve));}
 snapshot(){return [...this.records].map(([id,r])=>({id,state:r.state})).sort((a,b)=>a.id.localeCompare(b.id));}
 dispose(){
  if(this.closed)return;this.closed=true;this.queue=[];
  for(const [id,r] of this.records){r.controller.abort();if(r.state==="active")this.disposer(r.asset,id);}
  this.records.clear();this.flush();
 }
}
