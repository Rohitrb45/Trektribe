import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError } from '../apps/mobile/src/api/client';
import { listMessages, sendMessage } from '../apps/mobile/src/api/chat';

test('chat HTTP preserves retry IDs, pagination and current credentials', async () => {
  const requests: Request[] = [];
  let token = 'first';
  const client = createApiClient('https://example.test', () => token, async input => {
    requests.push(input as Request);
    return Response.json({ id: 'message', sequence: 1 });
  });
  const body = { id: 'message', body: 'Hello' };
  await sendMessage(client, 'trip', body);
  token = 'renewed';
  await sendMessage(client, 'trip', body);
  await listMessages(client, 'trip', 42, 10);
  assert.deepEqual(await requests[0].json(), body);
  assert.deepEqual(await requests[1].json(), body);
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer renewed');
  assert.equal(requests[2].url, 'https://example.test/v1/group-treks/trip/messages?after=42&limit=10');
});

test('chat HTTP surfaces membership failure without retrying', async () => {
  let calls = 0;
  const client = createApiClient('https://example.test', () => 'token', async () => {
    calls++;
    return Response.json({ message: 'Conversation not found' }, { status: 404 });
  });
  await assert.rejects(listMessages(client, 'trip'), (e: unknown) => e instanceof ApiError && e.status === 404);
  assert.equal(calls, 1);
});
