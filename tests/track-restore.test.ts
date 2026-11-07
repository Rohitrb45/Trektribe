import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SnapshotDatabase } from '../apps/mobile/src/trail-snapshots';
import { TrackStorage, canonicalTrackPoints } from '../apps/mobile/src/track-storage';
import { restorePrivateTrack, type RestoreConnection } from '../apps/mobile/src/track-restore';
function adapter(sqlite: DatabaseSync): SnapshotDatabase {
  const db: SnapshotDatabase = {
    execAsync: async sql => { sqlite.exec(sql); },
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...args),
    getAllAsync: async <T>(sql: string, ...args: string[]) => sqlite.prepare(sql).all(...args) as T[],
    withExclusiveTransactionAsync: async task => {
      sqlite.exec('BEGIN');
      try { await task(db); sqlite.exec('COMMIT'); }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  return db;
}
const hash=async(text:string)=>createHash('sha256').update(text).digest('hex');
const point=(timestamp:number)=>({longitude:77,latitude:30,timestamp,accuracy:5,altitude:null});
function remote(id:string):RestoreConnection {
  return {scope:'account-a',assertActive:()=>{},
    get:async()=>({id,title:'Server walk',chunkCount:2,expectedPoints:2,nextChunk:2,pointCount:2,completed:true}),
    read:async(_id,n)=>({points:[point(n+1)],checksum:await hash(canonicalTrackPoints([point(n+1)]))}),
  };
}
test('restored recordings survive reopening; repeated/concurrent restores reuse the same copy',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'trek-restore-'));let sql=new DatabaseSync(join(dir,'tracks.db'));
  try{
    let store=new TrackStorage(adapter(sql),hash);await store.initialize();const id=randomUUID(),connection=remote(id);
    const [a,b]=await Promise.all([restorePrivateTrack(connection,id,store,hash),restorePrivateTrack(connection,id,store,hash)]);
    assert.equal(a.id,b.id);assert.equal((await store.list()).length,1);assert.equal(a.state,'finished');
    sql.close();sql=new DatabaseSync(join(dir,'tracks.db'));store=new TrackStorage(adapter(sql),hash);await store.initialize();
    assert.deepEqual(await store.readChunk(a.id,1),[point(2)]);
    await restorePrivateTrack({...connection,scope:'account-b'},id,store,hash);
    assert.equal((await store.list()).length,2);
  }finally{sql.close();rmSync(dir,{recursive:true});}
});
test('corrupt, incomplete or interrupted downloads never create local recordings',async()=>{
  const sql=new DatabaseSync(':memory:'),store=new TrackStorage(adapter(sql),hash);await store.initialize();
  try{
    const id=randomUUID(),base=remote(id);
    await assert.rejects(restorePrivateTrack({...base,get:async()=>({...await base.get(id),completed:false})},id,store,hash),/complete/);
    await assert.rejects(restorePrivateTrack({...base,read:async()=>({points:[point(1)],checksum:'0'.repeat(64)})},id,store,hash),/integrity/);
    await assert.rejects(restorePrivateTrack({...base,read:async(_id,n)=>{if(n===1)throw new Error('network lost');return base.read(_id,n);}},id,store,hash),/network lost/);
    let active=true;
    await assert.rejects(restorePrivateTrack({...base,assertActive:()=>{if(!active)throw new Error('account changed');},read:async(_id,n)=>{const chunk=await base.read(_id,n);active=false;return chunk;}},id,store,hash),/account changed/);
    assert.deepEqual(await store.list(),[]);
  }finally{sql.close();}
});
test('restore commit rolls back after storage failure and preserves existing recordings',async()=>{
  const sql=new DatabaseSync(':memory:');let checks=0;
  const store=new TrackStorage(adapter(sql),hash,()=>{if(++checks===4)throw new Error('storage full');});await store.initialize();
  try{
    const id=randomUUID();await assert.rejects(restorePrivateTrack(remote(id),id,store,hash),/storage full/);
    assert.deepEqual(await store.list(),[]);assert.equal(sql.prepare('SELECT count(*) AS n FROM track_chunks_v1').get()?.n,0);
    let activityChecks=0;
    await assert.rejects(store.restoreFinished('cancelled','Walk',[[point(1)],[point(2)]],()=>{if(++activityChecks===6)throw new Error('account changed during commit');}),/account changed during commit/);
    assert.deepEqual(await store.list(),[]);assert.equal(sql.prepare('SELECT count(*) AS n FROM track_chunks_v1').get()?.n,0);
    const saved=await restorePrivateTrack(remote(id),id,store,hash);
    await assert.rejects(store.restoreFinished(saved.id,'Different title',[[point(1)],[point(2)]]),/different local/);
    assert.equal((await store.list())[0].title,'Server walk');
    await assert.rejects(store.restoreFinished('invalid-order','Walk',[[point(2)],[point(1)]]),/timestamps/);
    assert.equal((await store.list()).length,1);
  }finally{sql.close();}
});
test('restore respects the local session cap without overwriting another recording',async()=>{
  const sql=new DatabaseSync(':memory:'),store=new TrackStorage(adapter(sql),hash);await store.initialize();
  try{
    for(let n=0;n<20;n++)await store.restoreFinished(`saved-${n}`,'Walk',[[point(1)]]);
    const id=randomUUID();await assert.rejects(restorePrivateTrack(remote(id),id,store,hash),/20 maximum/);
    await store.remove('saved-0');await restorePrivateTrack(remote(id),id,store,hash);assert.equal((await store.list()).length,20);
  }finally{sql.close();}
});
