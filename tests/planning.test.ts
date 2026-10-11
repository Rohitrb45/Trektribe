import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createSeed, DEMO_USER, DomainError, Command } from '../packages/core/src/index';
import { commandSchema } from '../apps/api/src/validation';

test('profile edits update display names without granting identity or badge changes', () => {
  const state=createSeed();
  const command:Command={type:'profile',name:'Trail Walker',bio:'Weekend hikes',level:'Experienced',gear:['Boots','Boots','Map']};
  const updated=applyCommand(state,command,DEMO_USER);
  assert.equal(updated.profile.initials,'TW');assert.deepEqual(updated.profile.gear,['Boots','Map']);
  assert.equal(updated.profile.id,DEMO_USER);assert.deepEqual(updated.profile.badges,state.profile.badges);
  assert.throws(()=>applyCommand(state,command,'other'),(e:unknown)=>e instanceof DomainError&&e.status===403);
  assert.equal(commandSchema.safeParse({...command,id:'spoof',badges:['admin']}).success,false);
});

test('outing creation is idempotent; organizer cancellation prevents joins and approvals',()=>{
  const seed=createSeed(),now='2026-01-01T00:00:00Z';
  const command:Command={type:'create-trip',id:'00000000-0000-4000-8000-000000000999',trekId:seed.treks[0].id,title:'Sunrise walk',startsAt:'2026-02-01T08:00:00+05:30',timezone:'Asia/Kolkata',maxParticipants:2};
  let state=applyCommand(seed,command,DEMO_USER,now);
  assert.equal(applyCommand(state,command,DEMO_USER,now).trips.length,3);
  const trip=state.trips.find(t=>t.id===command.id)!;
  assert.equal(trip.startsAt,'2026-02-01T02:30:00.000Z');assert.deepEqual(trip.members,[{userId:DEMO_USER,status:'accepted'}]);
  assert.throws(()=>applyCommand(state,{...command,title:'Changed'},DEMO_USER,now));
  assert.throws(()=>applyCommand(state,{...command,timezone:'Unknown/Zone'},DEMO_USER,now));
  assert.throws(()=>applyCommand(state,{type:'cancel-trip',tripId:trip.id},'other',now));
  state=applyCommand(state,{type:'join',tripId:trip.id},'other',now);
  state=applyCommand(state,{type:'cancel-trip',tripId:trip.id},DEMO_USER,now);
  assert.throws(()=>applyCommand(state,{type:'join',tripId:trip.id},'third',now));
  assert.throws(()=>applyCommand(state,{type:'approve',tripId:trip.id,userId:'other'},DEMO_USER,now));
});
