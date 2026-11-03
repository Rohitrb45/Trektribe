export const offlineStyle = 'mapbox://styles/mapbox/outdoors-v11';

/** Bound downloads to a modest trail area; reject dateline-spanning boxes. */
export function offlineRegion(points: [number, number][]) {
  if (points.length < 2 || points.length > 10000 || points.some(([x, y]) =>
    !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 85)) {
    throw new Error('This route cannot be downloaded as a map area.');
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const west = Math.max(-180, Math.min(...xs) - 0.01);
  const east = Math.min(180, Math.max(...xs) + 0.01);
  const south = Math.max(-85, Math.min(...ys) - 0.01);
  const north = Math.min(85, Math.max(...ys) + 0.01);
  if (east - west > 0.5 || north - south > 0.5) {
    throw new Error('This route covers too large an area for a map download.');
  }
  return { styleURL: offlineStyle, minZoom: 10, maxZoom: 14,
    bounds: [[east, north], [west, south]] as [[number, number], [number, number]] };
}

export function downloadProgress(status: { state: unknown; percentage: number | null }) {
  const percentage = Number.isFinite(status.percentage)
    ? Math.max(0, Math.min(100, status.percentage!)) : 0;
  return { percentage, complete: status.state === 'complete' && percentage === 100,
    active: status.state === 'active' };
}
