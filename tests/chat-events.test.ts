import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chatPresenceInput, chatSendInput, chatSyncInput } from '../packages/core/src/chat-events';

test('shared chat validators preserve retry IDs and reject forged identity and invalid cursors', () => {
  const tripId = randomUUID(), id = randomUUID();
  assert.deepEqual(chatSendInput.parse({ tripId, id, body: ' Hello ' }), { tripId, id, body: 'Hello' });
  assert.equal(chatSendInput.safeParse({ tripId, id, body: ' ' }).success, false);
  assert.equal(chatSendInput.safeParse({ tripId, id, body: 'a'.repeat(2001) }).success, false);
  assert.equal(chatSendInput.safeParse({ tripId, id, body: 'Hello', userId: randomUUID() }).success, false);
  assert.equal(chatPresenceInput.safeParse({ tripId, userId: randomUUID() }).success, false);
  assert.equal(chatPresenceInput.safeParse({ tripId: 'invalid' }).success, false);
  for (const after of [-1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(chatSyncInput.safeParse({ tripId, after }).success, false);
  }
  assert.deepEqual(chatSyncInput.parse({ tripId, after: 0 }), { tripId, after: 0 });
});
