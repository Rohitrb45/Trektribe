import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineRegion, downloadProgress } from '../apps/mobile/src/offline-region';

test('offline map bounds preserve longitude/latitude, cover the route and share identical regions', () => {
  const route: [number, number][] = [[79.1, 30.4], [79.15, 30.45]];
  const region = offlineRegion(route);
  assert.deepEqual(region, offlineRegion([...route].reverse()));
  assert.ok(region.bounds[0][0] > 79.15 && region.bounds[0][1] > 30.45);
  assert.ok(region.bounds[1][0] < 79.1 && region.bounds[1][1] < 30.4);
  assert.equal(region.maxZoom, 14);
  assert.notDeepEqual(region, offlineRegion([[79.1, 30.4], [79.2, 30.45]]));
});

test('offline downloads reject malformed, polar, oversized and dateline-spanning regions', () => {
  for (const points of [[], [[1, 2]], [[NaN, 0], [0, 0]], [[181, 0], [0, 0]],
    [[0, 86], [0, 85]], [[0, 0], [1, 1]], [[179.9, 0], [-179.9, 0]],
    Array.from({ length: 10001 }, () => [1, 2])] as [number, number][][]) {
    assert.throws(() => offlineRegion(points));
  }
});

test('unknown or partial progress never reports a completed download', () => {
  assert.equal(downloadProgress({ state: 'active', percentage: 100 }).complete, false);
  assert.equal(downloadProgress({ state: 'complete', percentage: null }).complete, false);
  assert.equal(downloadProgress({ state: 'complete', percentage: NaN }).complete, false);
  assert.equal(downloadProgress({ state: 'complete', percentage: 100 }).complete, true);
  assert.equal(downloadProgress({ state: 'inactive', percentage: -5 }).percentage, 0);
});
