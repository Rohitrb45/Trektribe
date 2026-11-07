import React from 'react';
import { Text } from 'react-native';
import { s } from './ui';
export type OfflineMapProps = { points: [number, number][]; title?: string };
export default function OfflineMap(_props: OfflineMapProps) {
  return <Text style={s.bodySmall}>Map downloads are available in the native app. GPS recording is not connected.</Text>;
}
