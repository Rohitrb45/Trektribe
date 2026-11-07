export type TrackPoint = { longitude: number; latitude: number; timestamp: number; accuracy: number; altitude: number | null };
export const TRACK_LIMITS = { sessions: 20, chunks: 500, pointsPerChunk: 200 } as const;
export function canonicalTrackPoints(input: unknown): string {
  if (!Array.isArray(input) || !input.length || input.length > TRACK_LIMITS.pointsPerChunk) throw new Error('A track chunk must contain 1–200 points.');
  let previous = -1;
  return JSON.stringify(input.map(p => {
    if (!p || !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180 ||
        !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 ||
        !Number.isSafeInteger(p.timestamp) || p.timestamp < 0 || p.timestamp <= previous ||
        !Number.isFinite(p.accuracy) || p.accuracy < 0 ||
        (p.altitude !== null && !Number.isFinite(p.altitude))) throw new Error('Invalid or out-of-order track point.');
    previous = p.timestamp;
    return { longitude: p.longitude, latitude: p.latitude, timestamp: p.timestamp, accuracy: p.accuracy, altitude: p.altitude };
  }));
}
