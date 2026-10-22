import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRoute } from '../apps/mobile/src/navigation';

test('deep links select the correct screen or trail without accepting nested or malformed IDs', () => {
  assert.deepEqual(resolveRoute('/community/'), { tab: 'Community' });
  assert.deepEqual(resolveRoute('/trips'), { tab: 'Trips' });
  assert.deepEqual(resolveRoute('/profile'), { tab: 'Profile' });
  assert.deepEqual(resolveRoute('/'), { tab: 'Explore' });
  assert.deepEqual(resolveRoute('/auth'), { tab: 'Explore' });
  assert.deepEqual(resolveRoute('/trails/trail-1'), { tab: 'Explore', trailId: 'trail-1' });
  for (const path of ['/missing', '/trails', '/trails/a/b', '/trails/%2F', '/trails/%', '/trails/%2e%2e', '/trails/' + 'a'.repeat(129)]) {
    assert.equal(resolveRoute(path).notFound, true, path);
  }
});
