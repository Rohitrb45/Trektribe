import { SaxesParser } from 'saxes';
import { distanceKm, DomainError } from '../../../packages/core/src/index';

export type ImportedRoute = { coordinates: [number,number][]; distanceKm: number; elevationM: number; altitudeM: number; hasElevation: boolean };
export function parseGpx(xml: string): ImportedRoute {
  const invalid = (message: string): never => { throw new DomainError('INVALID_GPX', message); };
  if (Buffer.byteLength(xml, 'utf8') > 1_000_000) invalid('GPX files must be at most 1 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid('GPX files cannot contain DTD or entity declarations.');
  const parser = new SaxesParser({ xmlns: true });
  const path: string[] = [], points: { coordinates: [number,number]; elevation?: number }[] = [];
  let segments = 0, elevation = '', readingElevation = false;
  const number = (value: string | undefined, min: number, max: number) => {
    if (!value?.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return invalid('Invalid GPX coordinate or elevation.');
    const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) return invalid('GPX coordinate or elevation is out of range.'); return n;
  };
  parser.on('doctype', () => invalid('DTD declarations are not allowed.'));
  parser.on('opentag', tag => {
    path.push(tag.local);
    if (path.length > 32) invalid('GPX nesting is too deep.');
    if (path.length === 1 && tag.local !== 'gpx') invalid('Expected a GPX document.');
    const location = path.join('/');
    if (location === 'gpx/trk/trkseg' || location === 'gpx/rte') { if (++segments > 1) invalid('Import one continuous track segment or route at a time.'); }
    if (location === 'gpx/trk/trkseg/trkpt' || location === 'gpx/rte/rtept') {
      if (points.length >= 10000) invalid('GPX routes must contain at most 10,000 points.');
      const lat = tag.attributes.lat?.value, lon = tag.attributes.lon?.value;
      points.push({ coordinates: [number(lon,-180,180),number(lat,-90,90)] });
    }
    if (location === 'gpx/trk/trkseg/trkpt/ele' || location === 'gpx/rte/rtept/ele') { readingElevation=true; elevation=''; }
  });
  parser.on('text', value => { if (readingElevation) { elevation+=value; if(elevation.length>64)invalid('Invalid elevation.'); } });
  parser.on('closetag', tag => {
    if(tag.local==='ele'&&readingElevation){points.at(-1)!.elevation=number(elevation,-500,9000);readingElevation=false;}
    path.pop();
  });
  try { parser.write(xml).close(); } catch (e) { if(e instanceof DomainError)throw e; invalid('The GPX file is malformed.'); }
  if(points.length<2)invalid('A route needs at least two points.');
  const hasElevation=points.every(p=>p.elevation!==undefined);
  let distance=0,ascent=0;
  for(let i=1;i<points.length;i++){distance+=distanceKm(points[i-1].coordinates,points[i].coordinates);if(hasElevation)ascent+=Math.max(0,points[i].elevation!-points[i-1].elevation!);}
  if(distance<=0)invalid('A route must cover a non-zero distance.');
  return {coordinates:points.map(p=>p.coordinates),distanceKm:distance,elevationM:Math.round(ascent),altitudeM:hasElevation?Math.round(Math.max(...points.map(p=>p.elevation!))):0,hasElevation};
}
