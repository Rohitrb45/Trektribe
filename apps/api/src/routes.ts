import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DomainError } from '../../../packages/core/src/index';
import { parseGpx } from './gpx';

export class RouteRepository {
  constructor(private pool:Pool){}
  async publish(actor:string, gpx:string, metadata:{title:string;region:string;description:string;difficulty:string}, trekId?:string){
    const route=parseGpx(gpx),geometry=JSON.stringify({type:'LineString',coordinates:route.coordinates});
    const c=await this.pool.connect(),id=trekId||randomUUID(),version=randomUUID();
    try{
      await c.query('BEGIN');
      if(trekId){
        const row=(await c.query('SELECT owner_id FROM treks WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row||row.owner_id!==actor)throw new DomainError('NOT_FOUND','Editable trail not found.',404);
      }else{
        await c.query(`INSERT INTO treks(id,owner_id,title,region,description,difficulty,distance_km,elevation_m,duration,altitude_m,rating,report_count,color,highlights,trailhead_location,route_geometry)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Not estimated',$9,0,0,'#75958a','[]',ST_SetSRID(ST_MakePoint($10,$11),4326)::geography,ST_SetSRID(ST_GeomFromGeoJSON($12),4326))`,
          [id,actor,metadata.title,metadata.region,metadata.description,metadata.difficulty,route.distanceKm,route.elevationM,route.altitudeM,...route.coordinates[0],geometry]);
      }
      await c.query('INSERT INTO route_versions(id,trek_id,geometry,distance_km,elevation_m,altitude_m,has_elevation,created_by) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6,$7,$8)',[version,id,geometry,route.distanceKm,route.elevationM,route.altitudeM,route.hasElevation,actor]);
      await c.query(`UPDATE treks SET current_route_version_id=$1,route_geometry=ST_SetSRID(ST_GeomFromGeoJSON($2),4326),distance_km=$3,elevation_m=$4,altitude_m=$5,
        trailhead_location=ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,title=$8,region=$9,description=$10,difficulty=$11 WHERE id=$12`,
        [version,geometry,route.distanceKm,route.elevationM,route.altitudeM,...route.coordinates[0],metadata.title,metadata.region,metadata.description,metadata.difficulty,id]);
      await c.query('COMMIT');return {trekId:id,routeVersionId:version,hasElevation:route.hasElevation};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async forTrip(tripId:string,actor:string){
    const rows=await this.pool.query(`SELECT r.id,ST_AsGeoJSON(r.geometry)::json->'coordinates' AS coordinates,r.distance_km AS "distanceKm",r.elevation_m AS "elevationM",r.has_elevation AS "hasElevation"
      FROM group_treks g JOIN route_versions r ON r.id=g.route_version_id WHERE g.id=$1 AND
      ((g.visibility='public' AND NOT users_blocked($2,g.organizer_id)) OR g.organizer_id=$2 OR EXISTS(SELECT 1 FROM group_trek_members m WHERE m.trip_id=g.id AND m.user_id=$2))`,[tripId,actor]);
    if(!rows.rows[0])throw new DomainError('NOT_FOUND','Outing not found.',404);return rows.rows[0];
  }
}
