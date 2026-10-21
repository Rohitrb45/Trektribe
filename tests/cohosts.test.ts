import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createSeed, DEMO_USER } from '../packages/core/src/index';

test('only organizers assign accepted cohosts; delegation is limited and ends on leave',()=>{
  let state=createSeed();const trip=state.trips.find(t=>t.organizerId===DEMO_USER)!;
  trip.startsAt='2099-01-01T00:00:00Z';trip.maxParticipants=5;
  trip.members=[{userId:DEMO_USER,status:'accepted'},{userId:'helper',status:'accepted'},{userId:'guest',status:'pending'}];
  const role={type:'cohost' as const,tripId:trip.id,userId:'helper',enabled:true};
  assert.throws(()=>applyCommand(state,role,'helper'));
  assert.throws(()=>applyCommand(state,{...role,userId:'guest'},DEMO_USER));
  assert.throws(()=>applyCommand(state,{...role,userId:DEMO_USER},DEMO_USER));
  state=applyCommand(state,role,DEMO_USER);
  state=applyCommand(state,role,DEMO_USER);
  assert.throws(()=>applyCommand(state,{type:'cancel-trip',tripId:trip.id},'helper'));
  assert.throws(()=>applyCommand(state,{...role,userId:'guest'},'helper'));
  const approved=applyCommand(state,{type:'approve',tripId:trip.id,userId:'guest'},'helper');
  assert.equal(approved.trips.find(t=>t.id===trip.id)!.members.find(m=>m.userId==='guest')!.status,'accepted');
  const revoked=applyCommand(state,{...role,enabled:false},DEMO_USER);
  assert.throws(()=>applyCommand(revoked,{type:'approve',tripId:trip.id,userId:'guest'},'helper'));
  state=applyCommand(state,{type:'leave',tripId:trip.id},'helper');
  state=applyCommand(state,{type:'join',tripId:trip.id},'helper');
  assert.equal(state.trips.find(t=>t.id===trip.id)!.members.find(m=>m.userId==='helper')!.role,undefined);
});
