import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPresence,PRESENCE_TTL_MS } from '../apps/api/src/presence';

test('presence expires stale sessions, isolates outings and removes only the departing device',async()=>{
 let now=0;const presence=new LocalPresence(()=>now);
 await presence.heartbeat('outing-a','user:phone');
 await presence.heartbeat('outing-a','user:web');
 assert.deepEqual(await presence.heartbeat('outing-b','other:phone'),['other:phone']);
 await presence.leave('outing-a','user:phone');
 assert.deepEqual(await presence.heartbeat('outing-a','other:phone'),['user:web','other:phone']);
 now=PRESENCE_TTL_MS;
 assert.deepEqual(await presence.heartbeat('outing-a','fresh:phone'),['fresh:phone']);
 await presence.leave('outing-a','fresh:phone');
 await presence.leave('outing-a','fresh:phone');
 assert.deepEqual(await presence.heartbeat('outing-a','next:phone'),['next:phone']);
});
