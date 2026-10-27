import React from 'react';
import { Text, View } from 'react-native';
import { RouteArt } from './Art';
export type RouteMapProps = { points: [number, number][] };
export default function RouteMap({ points }: RouteMapProps) {
  if (points.length < 2) return <Text>Route geometry is unavailable.</Text>;
  return <View style={{ flex: 1 }}><RouteArt points={points}/><Text>Illustrative route preview — no live basemap.</Text></View>;
}
