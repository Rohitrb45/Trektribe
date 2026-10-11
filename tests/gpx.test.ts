import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx } from '../apps/api/src/gpx';

const route='<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="30" lon="79"><ele>100</ele></trkpt><trkpt lat="30.01" lon="79.01"><ele>150</ele></trkpt></trkseg></trk></gpx>';
test('GPX preserves longitude/latitude and derives route metrics',()=>{
  const result=parseGpx(route);
  assert.deepEqual(result.coordinates,[[79,30],[79.01,30.01]]);
  assert.ok(result.distanceKm>1&&result.distanceKm<2);assert.equal(result.elevationM,50);assert.equal(result.altitudeM,150);assert.equal(result.hasElevation,true);
  assert.equal(parseGpx(route.replaceAll(/<ele>.*?<\/ele>/g,'')).hasElevation,false);
});
test('GPX rejects entities, malformed XML, invalid coordinates, excess points, and disconnected segments',()=>{
  for(const input of ['<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+route,route.replace('lat="30"','lat="91"'),route.replace('lat="30"','lat=""'),'<gpx><trk>',route.replace('</trk>','<trkseg/></trk>'),'x'.repeat(1_000_001),'<gpx><rte>'+ '<rtept lat="30" lon="79"/>'.repeat(10001)+'</rte></gpx>'])assert.throws(()=>parseGpx(input));
});
