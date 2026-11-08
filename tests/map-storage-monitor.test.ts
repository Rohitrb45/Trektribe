import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorMapStorage } from '../apps/mobile/src/map-storage-monitor';
import type { StoredMapPack } from '../apps/mobile/src/offline-library';
const name = 'trektribe-map-v1-' + 'a'.repeat(64);
const low = () => { throw Error('low storage'); };
function pack(overrides: Partial<StoredMapPack> = {}): StoredMapPack {
  return { name, status: async () => ({ state: 'active', percentage: 20 }), pause: async () => {}, ...overrides };
}
test('healthy storage avoids SDK enumeration', async () => {
  assert.equal(await monitorMapStorage({ getPacks: async () => { throw Error('must not read'); } }, () => {}), '');
});
test('low space pauses active owned packs, preserving complete, inactive and unrelated packs', async () => {
  const paused: string[] = [];
  const make = (id: string, state: string, percentage = 20) => pack({ name: id, status: async () => ({state, percentage}), pause: async () => { paused.push(id); } });
  const result = await monitorMapStorage({ getPacks: async () => [make(name, 'active'), make('trektribe-map-v1-' + 'b'.repeat(64), 'inactive'), make('trektribe-map-v1-' + 'c'.repeat(64), 'complete', 100), make('other-app', 'active')] }, low);
  assert.deepEqual(paused, [name]);
  assert.match(result, /resume downloads manually/);
});
test('unreadable status is paused; one failure does not prevent other packs being paused', async () => {
  let second = false;
  const result = await monitorMapStorage({ getPacks: async () => [pack({ pause: async () => { throw Error('SDK'); } }), pack({ status: async () => { throw Error('unreadable'); }, pause: async () => { second = true; } })] }, low);
  assert.equal(second, true);
  assert.match(result, /could not be paused/);
});
test('lifecycle cancellation after an awaited status stops future mutations', async () => {
  let active = true;
  let paused = false;
  const result = await monitorMapStorage({ getPacks: async () => [pack({ status: async () => { active = false; return {state: 'active', percentage: 1}; }, pause: async () => { paused = true; } })] }, low, () => active);
  assert.equal(result, '');
  assert.equal(paused, false);
});
test('inventory failure is observable rather than reported as successful protection', async () => {
  await assert.rejects(monitorMapStorage({getPacks: async () => { throw Error('inventory'); }}, low), /inventory/);
});
