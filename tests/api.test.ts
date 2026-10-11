import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
test('HTTP API enforces demo auth, validates requests, pages feed, and persists commands',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'.api-test-'));const port=3199;
 const child=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',DEMO_MODE:'true',NODE_ENV:'test',PORT:String(port),DATABASE_URL:'',DEMO_DATA_PATH:join(dir,'state.json')},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 const base=`http://127.0.0.1:${port}/v1`;
 try{
  const deadline=Date.now()+30_000;
  let ready=false;while(Date.now()<deadline){
   if(child.exitCode!==null)break;
   try{if((await fetch(`${base}/health`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}
   await setTimeout(100);
  }
  assert.ok(ready,`API did not become ready within 30 seconds (exit code: ${child.exitCode}).\n${logs}`);
  assert.equal((await fetch(`${base}/demo/state`)).status,401);
  assert.equal((await fetch(`${base}/treks?lat=95&lng=0`)).status,400);
  assert.equal((await fetch(`${base}/feed?cursor=garbage`)).status,400);
  const page=await (await fetch(`${base}/feed?limit=1`)).json();assert.equal(page.items.length,1);assert.ok(page.nextCursor);
  const next=await(await fetch(`${base}/feed?limit=1&cursor=${page.nextCursor}`)).json();assert.equal(next.items.length,1);assert.notEqual(page.items[0].id,next.items[0].id);
  const headers={Authorization:'Bearer trektribe-local-demo','Content-Type':'application/json'};
  const before=await(await fetch(`${base}/demo/state`,{headers})).json();
  assert.equal((await fetch(`${base}/me`)).status,401);
  assert.equal((await(await fetch(`${base}/me`,{headers})).json()).id,before.profile.id);
  const report={id:'00000000-0000-4000-8000-000000000997',trekId:before.treks[0].id,content:'Resource report',rating:4,condition:'Clear',observedAt:'2020-01-01'};
  assert.equal((await fetch(`${base}/posts`,{method:'POST',headers,body:JSON.stringify({...report,userId:'spoof'})})).status,400);
  const resource=await fetch(`${base}/posts`,{method:'POST',headers,body:JSON.stringify(report)});
  assert.equal(resource.status,201);assert.equal((await resource.json()).userId,before.profile.id);
  const updated=await fetch(`${base}/demo/commands`,{method:'POST',headers,body:JSON.stringify({type:'save',trekId:before.treks[0].id,saved:true})});assert.equal(updated.status,201);
  const after=await(await fetch(`${base}/demo/state`,{headers})).json();assert.equal(after.saved[after.profile.id].length,1);
  assert.equal((await fetch(`${base}/demo/commands`,{method:'POST',headers,body:JSON.stringify({type:'join',tripId:'invalid'})})).status,400);
 }finally{child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});await rm(dir,{recursive:true,force:true});}
});
