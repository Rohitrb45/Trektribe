import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { RouteMapProps } from './RouteMap';
import { RouteArt } from './Art';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
// Avoid loading native bindings in Expo Go or when maps have not been configured.
let maps: typeof import('@rnmapbox/maps').default | undefined;
if (token?.startsWith('pk.') && Constants.executionEnvironment !== 'storeClient') {
  try { maps = require('@rnmapbox/maps').default; maps!.setAccessToken(token); } catch { maps = undefined; }
}

export default function RouteMap({ points }: RouteMapProps) {
  const [failed, setFailed] = useState(false);
  if (points.length < 2 || points.some(([x,y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x)>180 || Math.abs(y)>90)) {
    return <Text>Route geometry is unavailable.</Text>;
  }
  if (!maps || failed || points.some(([,y])=>Math.abs(y)>85)) return <View style={{ flex: 1 }}><RouteArt points={points}/><Text>Illustrative route preview — live map unavailable.</Text></View>;
  const { MapView, Camera, ShapeSource, LineLayer } = maps;
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const ne=[Math.min(180,Math.max(...xs)+0.001), Math.min(85,Math.max(...ys)+0.001)];
  const sw=[Math.max(-180,Math.min(...xs)-0.001), Math.max(-85,Math.min(...ys)-0.001)];
  return <MapView style={{ flex: 1 }} styleURL={maps.StyleURL.Outdoors} onMapLoadingError={()=>setFailed(true)}>
    <Camera bounds={{ ne, sw, paddingTop:30, paddingBottom:30, paddingLeft:30, paddingRight:30 }} animationDuration={0}/>
    <ShapeSource id="trail-route" shape={{ type:'Feature', properties:{}, geometry:{type:'LineString',coordinates:points} }}>
      <LineLayer id="trail-route-line" style={{ lineColor:'#26694e',lineWidth:4 }}/>
    </ShapeSource>
  </MapView>;
}
