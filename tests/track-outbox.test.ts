import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SnapshotDatabase } from '../apps/mobile/src/trail-snapshots';
import { TrackStorage } from '../apps/mobile/src/track-storage';
import { TrackOutbox, uploadCredentialGuard, type UploadConnection, type UploadStatus } from '../apps/mobile/src/track-outbox';
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
const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const point = (timestamp: number) => ({longitude:77,latitude:30,timestamp,accuracy:5,altitude:null});
test('frozen credential guard rejects replacement tokens, expiry and a cancelled run', () => {
  let token='first', active=true;
  const check=uploadCredentialGuard('first',()=>token,()=>active);
  check(); token='another-account'; assert.throws(check,/Upload paused/);
  token='first'; active=false; assert.throws(check,/Upload paused/);
  assert.throws(uploadCredentialGuard('first',()=>{throw new Error('expired');},()=>true),/expired/);
});
async function source() {
  const sql = new DatabaseSync(':memory:'); const store = new TrackStorage(adapter(sql),hash);
  await store.initialize(); await store.create('local','Walk',1);
  await store.append('local',0,[point(2)]); await store.appendFix('local',1,point(3));
  await store.transition('local','finished'); return {sql,store};
}
function server() {
  let currentScope = 'account-a'; let status: UploadStatus | undefined;
  let fail: 'create' | 'chunk' | 'complete' | 'remove' | undefined;
  let deleted = false; const received: number[] = [];
  let switchAfterChunk = false;
  const lose = (where: typeof fail) => { if (fail === where) { fail = undefined; throw new Error('Lost acknowledgment'); } };
  const connection: UploadConnection = {
    scope:'account-a', assertActive: () => { if (currentScope !== 'account-a') throw new Error('Account changed'); },
    create: async job => {
      if (deleted) throw new Error('Tombstoned');
      status ??= {id:job.id,title:job.title,chunkCount:job.chunkCount,expectedPoints:job.pointCount,nextChunk:0,pointCount:0,completed:false};
      lose('create'); return {...status};
    },
    chunk: async (id,n,body) => {
      assert.equal(id,status!.id); assert.equal(n,status!.nextChunk);
      assert.equal(body.checksum,await hash(JSON.stringify(body.points)));
      received.push(n); status = {...status!,nextChunk:n+1,pointCount:status!.pointCount+body.points.length};
      if(switchAfterChunk) currentScope='account-b';
      lose('chunk'); return {...status};
    },
    complete: async () => { status={...status!,completed:true}; lose('complete'); return {...status}; },
    remove: async () => { deleted=true; lose('remove'); return {deleted:true}; },
  };
  return {connection,received,loseNext:(where:typeof fail)=>{fail=where;},switch:()=>{switchAfterChunk=true;},restore:()=>{currentScope='account-a';switchAfterChunk=false;},get deleted(){return deleted;}};
}
test('frozen tail and queue survive reopening and local deletion; lost chunk acknowledgment reconciles', async () => {
  const dir=mkdtempSync(join(tmpdir(),'trek-outbox-')); const src=await source();
  let sql=new DatabaseSync(join(dir,'uploads.db'));
  try {
    let outbox=new TrackOutbox(adapter(sql),hash); await outbox.initialize();
    const job=await outbox.prepare('account-a',randomUUID(),'local',src.store);
    assert.equal(job.chunkCount,2); assert.equal(job.pointCount,2);
    assert.equal((await outbox.prepare('account-a',randomUUID(),'local',src.store)).id,job.id);
    await src.store.remove('local');
    const remote=server(); remote.loseNext('chunk');
    await assert.rejects(outbox.run(remote.connection,job.id),/Lost acknowledgment/);
    sql.close(); sql=new DatabaseSync(join(dir,'uploads.db')); outbox=new TrackOutbox(adapter(sql),hash); await outbox.initialize();
    await outbox.run(remote.connection,job.id);
    assert.deepEqual(remote.received,[0,1]); assert.equal((await outbox.list('account-a'))[0].state,'uploaded');
    assert.equal(sql.prepare('SELECT count(*) AS n FROM track_upload_chunks_v1').get()?.n,0);
  } finally {sql.close();src.sql.close();rmSync(dir,{recursive:true});}
});
test('scope changes stop subsequent requests and cannot run another account queue', async () => {
  const src=await source(),sql=new DatabaseSync(':memory:');
  try {
    const outbox=new TrackOutbox(adapter(sql),hash); await outbox.initialize();
    const job=await outbox.prepare('account-a',randomUUID(),'local',src.store),remote=server();
    remote.switch(); await assert.rejects(outbox.run(remote.connection,job.id),/Account changed/);
    assert.deepEqual(remote.received,[0]); assert.deepEqual(await outbox.list('account-b'),[]);
    await assert.rejects(outbox.run({...remote.connection,scope:'account-b'},job.id),/different account/);
    remote.restore(); await outbox.run(remote.connection,job.id); assert.deepEqual(remote.received,[0,1]);
  } finally {src.sql.close();sql.close();}
});
test('lost create/completion acknowledgments retry without duplicating data', async () => {
  for(const fail of ['create','complete'] as const) {
    const src=await source(),sql=new DatabaseSync(':memory:');
    try {
      const outbox=new TrackOutbox(adapter(sql),hash); await outbox.initialize();
      const job=await outbox.prepare('account-a',randomUUID(),'local',src.store),remote=server();remote.loseNext(fail);
      await assert.rejects(outbox.run(remote.connection,job.id),/Lost acknowledgment/);
      await outbox.run(remote.connection,job.id); assert.deepEqual(remote.received,[0,1]);
      assert.equal((await outbox.list('account-a'))[0].state,'uploaded');
    } finally {src.sql.close();sql.close();}
  }
});
test('durable deletion intent prevents uploads and survives a lost deletion acknowledgment', async () => {
  const src=await source(),sql=new DatabaseSync(':memory:');
  try {
    const outbox=new TrackOutbox(adapter(sql),hash);await outbox.initialize();
    const job=await outbox.prepare('account-a',randomUUID(),'local',src.store),remote=server();
    await outbox.requestRemoval('account-a',job.id);remote.loseNext('remove');
    await assert.rejects(outbox.run(remote.connection,job.id),/Lost acknowledgment/);
    assert.equal((await outbox.list('account-a'))[0].state,'delete-pending');
    await outbox.run(remote.connection,job.id);assert.deepEqual(await outbox.list('account-a'),[]);
    assert.equal(remote.deleted,true);assert.deepEqual(remote.received,[]);
    assert.equal((await src.store.list()).length,1);
  } finally {src.sql.close();sql.close();}
});
test('atomic preparation rolls back on storage failure and corrupt queued points are never sent', async () => {
  const src=await source(),sql=new DatabaseSync(':memory:');
  try {
    let checks=0;
    const outbox=new TrackOutbox(adapter(sql),hash,()=>{if(++checks===4)throw new Error('disk full');});await outbox.initialize();
    await assert.rejects(outbox.prepare('account-a',randomUUID(),'local',src.store),/disk full/);
    assert.deepEqual(await outbox.list('account-a'),[]);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM track_upload_chunks_v1').get()?.n,0);
    const job=await outbox.prepare('account-a',randomUUID(),'local',src.store),remote=server();
    sql.exec("UPDATE track_upload_chunks_v1 SET payload='[]' WHERE sequence=0");
    await assert.rejects(outbox.run(remote.connection,job.id),/integrity/); assert.deepEqual(remote.received,[]);
  } finally {src.sql.close();sql.close();}
});
test('unfinished recordings cannot be queued and the device-wide quota frees a slot after deletion', async () => {
  const src=await source(),sql=new DatabaseSync(':memory:');
  try {
    const outbox=new TrackOutbox(adapter(sql),hash);await outbox.initialize();
    await src.store.create('unfinished','Still walking',1);
    await assert.rejects(outbox.prepare('account-a',randomUUID(),'unfinished',src.store),/Finish a nonempty/);
    const first=await outbox.prepare('account-a',randomUUID(),'local',src.store);
    for(let n=1;n<20;n++) await outbox.prepare(`account-${n}`,randomUUID(),'local',src.store);
    await assert.rejects(outbox.prepare('account-new',randomUUID(),'local',src.store),/20 per device/);
    await outbox.requestRemoval('account-a',first.id);
    await assert.rejects(outbox.prepare('account-a',randomUUID(),'local',src.store),/pending server deletion/);
    await outbox.run(server().connection,first.id);
    await outbox.prepare('account-new',randomUUID(),'local',src.store);
    assert.equal((await outbox.list('account-new')).length,1);
  } finally {src.sql.close();sql.close();}
});
