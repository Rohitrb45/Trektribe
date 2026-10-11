import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DemoStore } from '../apps/api/src/store';
import { decodeCursor } from '../apps/api/src/feed';
import { createSeed, DomainError } from '../packages/core/src/index';

test('feed cursors reject malformed values and preserve database timestamp precision', () => {
  for (const value of ['', 'garbage', Buffer.from('{}').toString('base64url')]) {
    assert.throws(() => decodeCursor(value), (e: unknown) => e instanceof DomainError && e.code === 'INVALID_CURSOR');
  }
  const cursor = { createdAt: '2020-01-01T00:00:00.123456Z', id: createSeed().posts[0].id };
  assert.deepEqual(decodeCursor(Buffer.from(JSON.stringify(cursor)).toString('base64url')), cursor);
});

test('local feed normalizes timestamps and paginates equal-time posts without duplicates', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.test-data-'));
  try {
    const state = createSeed();
    state.posts[0].createdAt = '2020-01-01T00:00:00Z';
    state.posts[1].createdAt = '2020-01-01T00:00:00.000Z';
    const path = join(dir, 'state.json');
    await writeFile(path, JSON.stringify(state));
    const store = new DemoStore(path);
    const first = await store.feed(1);
    const second = await store.feed(1, decodeCursor(first.nextCursor!));
    assert.deepEqual([...first.items, ...second.items].map(p => p.id), state.posts.map(p => p.id).sort().reverse());
    assert.equal(second.nextCursor, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
