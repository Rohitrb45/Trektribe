import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, apiData, ApiError } from '../apps/mobile/src/api/client';
import { toTrek } from '../apps/mobile/src/api/treks';
import { createSeed } from '../packages/core/src';

test('trail boundary preserves longitude/latitude and rejects malformed coordinate pairs', () => {
  const trail = createSeed().treks[0];
  assert.deepEqual(toTrek(trail), trail);
  for (const coordinates of [[1], [1, 2, 3], [181, 0], [0, 91], [NaN, 0]]) {
    assert.throws(() => toTrek({ ...trail, coordinates }), /invalid trail coordinates/);
    assert.throws(() => toTrek({ ...trail, route: [coordinates] }), /invalid trail coordinates/);
  }
});

test('typed client serializes paths, queries and false bodies and resolves current credentials', async () => {
  const requests: Request[] = [];
  let token = 'first';
  const fetcher: typeof fetch = async input => {
    requests.push(input as Request);
    return Response.json({ items: [] });
  };
  const client = createApiClient('https://example.test/', () => token, fetcher);
  await apiData(client.GET('/feed', { params: { query: { limit: 1, cursor: 'a+b/c=' } } }));
  token = 'second';
  await apiData(client.POST('/me/saved-treks/{id}', { params: { path: { id: 'trail-id' } }, body: { saved: false } }));
  assert.equal(new URL(requests[0].url).searchParams.get('cursor'), 'a+b/c=');
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer first');
  assert.equal(requests[1].url, 'https://example.test/v1/me/saved-treks/trail-id');
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer second');
  assert.equal(requests[1].method, 'POST');
  assert.deepEqual(await requests[1].json(), { saved: false });
});

test('typed client surfaces API errors, handles non-JSON failures and sends nothing after token failure', async () => {
  for (const response of [Response.json({ error: { message: 'Access denied' } }, { status: 403 }), new Response('<html>Bad gateway</html>', { status: 502 })]) {
    const client = createApiClient('https://example.test', () => 'token', async () => response);
    await assert.rejects(apiData(client.GET('/me')), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, response.status);
      assert.equal(error.message, response.status === 403 ? 'Access denied' : 'The server could not complete this request.');
      return true;
    });
  }
  let sent = false;
  const client = createApiClient('https://example.test', () => { throw new Error('Session expired'); }, async () => { sent = true; return Response.json({}); });
  await assert.rejects(apiData(client.GET('/me')), /Session expired/);
  assert.equal(sent, false);
});
