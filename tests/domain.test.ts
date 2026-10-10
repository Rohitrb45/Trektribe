import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { applyCommand, createSeed, DEMO_USER, DomainError, searchTreks, distanceKm, Command } from '../packages/core/src/index';
import { DemoStore } from '../apps/api/src/store';
import { commandSchema, searchSchema } from '../apps/api/src/validation';
const now='2026-10-02T10:00:00.000Z';
test('proximity search uses lon/lat and combines search and difficulty filters',()=>{
 const s=createSeed();assert.equal(distanceKm(s.treks[0].coordinates,s.treks[0].coordinates),0);
 assert.deepEqual(searchTreks(s.treks,'','All',s.treks[0].coordinates,1).map(t=>t.id),[s.treks[0].id]);
 assert.equal(searchTreks(s.treks,'uttarakhand','Easy').length,1);
 assert.equal(searchTreks(s.treks,'triund','Hard').length,0);
});
test('likes and saves are idempotent and never mutate prior state',()=>{
 const original=createSeed();const command:Command={type:'like',postId:original.posts[0].id,liked:true};
 let s=applyCommand(original,command,DEMO_USER,now);s=applyCommand(s,command,DEMO_USER,now);
 assert.equal(s.posts[0].likedBy.length,1);assert.equal(original.posts[0].likedBy.length,0);
 s=applyCommand(s,{...command,liked:false},DEMO_USER,now);assert.equal(s.posts[0].likedBy.length,0);
 const save:Command={type:'save',trekId:s.treks[0].id,saved:true};s=applyCommand(s,save,DEMO_USER,now);s=applyCommand(s,save,DEMO_USER,now);assert.equal(s.saved[DEMO_USER].length,1);
});
test('join request stays pending, can be cancelled, and cannot duplicate',()=>{
 let s=createSeed();const tripId=s.trips[0].id;
 s=applyCommand(s,{type:'join',tripId},DEMO_USER,now);s=applyCommand(s,{type:'join',tripId},DEMO_USER,now);
 assert.equal(s.trips[0].members.filter(m=>m.userId===DEMO_USER).length,1);
 assert.equal(s.trips[0].members.find(m=>m.userId===DEMO_USER)?.status,'pending');
 s=applyCommand(s,{type:'leave',tripId},DEMO_USER,now);assert.equal(s.trips[0].members.some(m=>m.userId===DEMO_USER),false);
});
test('approval enforces organizer authorization and capacity including organizer',()=>{
 let s=createSeed();const trip=s.trips[1];trip.maxParticipants=2;
 const applicant=trip.members.find(m=>m.status==='pending')!.userId;
 assert.throws(()=>applyCommand(s,{type:'approve',tripId:trip.id,userId:applicant},'outsider',now),(e:unknown)=>e instanceof DomainError&&e.status===403);
 s=applyCommand(s,{type:'approve',tripId:trip.id,userId:applicant},DEMO_USER,now);
 assert.equal(s.trips[1].members.filter(m=>m.status==='accepted').length,2);
 s.trips[1].members.push({userId:'another',status:'pending'});
 assert.throws(()=>applyCommand(s,{type:'approve',tripId:trip.id,userId:'another'},DEMO_USER,now),(e:unknown)=>e instanceof DomainError&&e.code==='TRIP_FULL');
 assert.throws(()=>applyCommand(s,{type:'leave',tripId:trip.id},DEMO_USER,now));
});
test('reports validate dates, ratings, references, and idempotency payloads',()=>{
 const original=createSeed();const command:Command={type:'post',id:'00000000-0000-4000-8000-000000000999',trekId:original.treks[0].id,content:'Good walk',rating:5,condition:'Clear',observedAt:'2026-10-01'};
 const s=applyCommand(original,command,DEMO_USER,now);assert.equal(applyCommand(s,command,DEMO_USER,now).posts.length,3);
 for(const patch of [{rating:0},{observedAt:'2026-02-30'},{observedAt:'2026-12-01'},{content:' '},{trekId:'missing'}])assert.throws(()=>applyCommand(original,{...command,...patch},DEMO_USER,now));
 assert.throws(()=>applyCommand(s,{...command,content:'Changed'},DEMO_USER,now),(e:unknown)=>e instanceof DomainError&&e.code==='CONFLICT');
});
test('API validation rejects unknown fields and incomplete geographic inputs',()=>{
 assert.equal(commandSchema.safeParse({type:'join',tripId:'bad'}).success,false);
 assert.equal(searchSchema.safeParse({lat:30}).success,false);
 assert.equal(searchSchema.safeParse({lat:91,lng:10}).success,false);
 assert.equal(searchSchema.safeParse({radiusM:100001}).success,false);
 assert.equal(commandSchema.safeParse({type:'join',tripId:createSeed().trips[0].id,senderId:'spoof'}).success,false);
});
test('local API store persists changes and serializes competing writes',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'.test-data-'));
 try{
  const path=join(dir,'state.json'),store=new DemoStore(path),seed=createSeed();
  await Promise.all([
   store.execute({type:'save',trekId:seed.treks[0].id,saved:true}),
   store.execute({type:'save',trekId:seed.treks[1].id,saved:true}),
   store.execute({type:'like',postId:seed.posts[0].id,liked:true})
  ]);
  const reloaded=await new DemoStore(path).read();assert.equal(reloaded.saved[DEMO_USER].length,2);assert.equal(reloaded.posts[0].likedBy.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
