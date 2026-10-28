import type { Trek } from '@trektribe/core';

// The fetch client's readable-array type widens OpenAPI tuples. Restore them
// at the boundary with validation rather than asserting the response type.
export function toTrek(value: Omit<Trek, 'coordinates' | 'route'> & { coordinates: number[]; route: number[][] }): Trek {
  return { ...value, coordinates: coordinate(value.coordinates), route: value.route.map(coordinate) };
}

export function coordinate(point: number[]): [number, number] {
  if (point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
    throw new Error('The server returned invalid trail coordinates.');
  }
  return [point[0], point[1]];
}
