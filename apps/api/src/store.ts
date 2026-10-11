import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { applyCommand, Command, createSeed, DEMO_USER, DomainError, State } from '../../../packages/core/src/index';
import { FeedCursor, FeedPage, feedPage } from './feed';
import { Identity } from './auth';
export interface Store { read(actor?:string):Promise<State>; feed(limit:number,cursor?:FeedCursor):Promise<FeedPage>; execute(command:Command,actor?:string):Promise<State>; close():Promise<void> }

export class DemoStore implements Store {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private path:string){}
  async feed(limit:number,cursor?:FeedCursor):Promise<FeedPage>{
    let posts=(await this.read()).posts.map(p=>({...p,createdAt:new Date(p.createdAt).toISOString()}));
    posts.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    if(cursor){const date=new Date(cursor.createdAt).toISOString();posts=posts.filter(p=>p.createdAt<date||(p.createdAt===date&&p.id<cursor.id));}
    return feedPage(posts,limit);
  }
  async read():Promise<State>{
    try {const s=JSON.parse(await readFile(this.path,'utf8'));if(s.version!==1)throw new Error('Unsupported demo data version');return s;}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return createSeed();throw e;}
  }
  execute(command:Command):Promise<State>{
    const result=this.queue.then(async()=>{
      const state=applyCommand(await this.read(),command,DEMO_USER);
      await mkdir(dirname(this.path),{recursive:true});
      await writeFile(`${this.path}.tmp`,JSON.stringify(state),'utf8');
      await rename(`${this.path}.tmp`,this.path);return state;
    });
    this.queue=result.catch(()=>undefined);return result;
  }
  async close(){await this.queue;}
}

type DB=Pool|PoolClient;
export class PostgresStore implements Store {
  pool:Pool;
  constructor(url:string){this.pool=new Pool({connectionString:url,max:10});}
  async identify(identity:Identity):Promise<string>{
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([identity.issuer,identity.subject])]);
      const existing=await c.query('SELECT user_id FROM user_identities WHERE issuer=$1 AND subject=$2',[identity.issuer,identity.subject]);
      let id=existing.rows[0]?.user_id;
      if(!id){
        id=randomUUID();
        const profile={id,username:`hiker_${id.replaceAll('-','')}`,name:'New hiker',initials:'NH',bio:'',level:'Beginner',completed:0,distanceKm:0,gear:[],badges:[]};
        await c.query('INSERT INTO users(id,username,name,profile) VALUES($1,$2,$3,$4)',[id,profile.username,profile.name,JSON.stringify(profile)]);
        await c.query('INSERT INTO user_identities(issuer,subject,user_id) VALUES($1,$2,$3)',[identity.issuer,identity.subject,id]);
      }
      await c.query('COMMIT');return id;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async invite(tripId:string,actor:string):Promise<{token:string;expiresAt:string}>{
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      const trip=(await c.query('SELECT * FROM group_treks WHERE id=$1 FOR UPDATE',[tripId])).rows[0];
      if(!trip||trip.organizer_id!==actor)throw new DomainError('NOT_FOUND','Outing not found.',404);
      if(trip.status!=='open'||new Date(trip.starts_at).getTime()<=Date.now())throw new DomainError('TRIP_CLOSED','This outing is closed.',409);
      const count=(await c.query('SELECT count(*)::int AS n FROM trip_invitations WHERE trip_id=$1 AND redeemed_by IS NULL AND expires_at>now()',[tripId])).rows[0].n;
      if(count>=50)throw new DomainError('INVITATION_LIMIT','There are already 50 active invitations.',409);
      const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Math.min(Date.now()+7*86400000,new Date(trip.starts_at).getTime())).toISOString();
      await c.query('INSERT INTO trip_invitations(token_hash,trip_id,created_by,expires_at) VALUES($1,$2,$3,$4)',[createHash('sha256').update(token).digest('hex'),tripId,actor,expiresAt]);
      await c.query('COMMIT');return {token,expiresAt};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async acceptInvite(token:string,actor:string){
    const hash=createHash('sha256').update(token).digest('hex'),c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      const invite=(await c.query('SELECT trip_id FROM trip_invitations WHERE token_hash=$1',[hash])).rows[0];
      if(!invite)throw new DomainError('INVALID_INVITATION','Invitation is invalid or expired.',404);
      // Same parent-row lock as approval/leave prevents roster races.
      const trip=(await c.query('SELECT * FROM group_treks WHERE id=$1 FOR UPDATE',[invite.trip_id])).rows[0];
      const row=(await c.query('SELECT * FROM trip_invitations WHERE token_hash=$1 FOR UPDATE',[hash])).rows[0];
      if(row.redeemed_by===actor){await c.query('COMMIT');return {tripId:trip.id};}
      if(row.redeemed_by||new Date(row.expires_at).getTime()<=Date.now())throw new DomainError('INVALID_INVITATION','Invitation is invalid or expired.',404);
      if(trip.status!=='open'||new Date(trip.starts_at).getTime()<=Date.now())throw new DomainError('TRIP_CLOSED','This outing is closed.',409);
      const accepted=(await c.query("SELECT count(*)::int AS n FROM group_trek_members WHERE trip_id=$1 AND status='accepted'",[trip.id])).rows[0].n;
      if(accepted>=trip.max_participants)throw new DomainError('TRIP_FULL','This outing is full.',409);
      await c.query("INSERT INTO group_trek_members(trip_id,user_id,status) VALUES($1,$2,'pending') ON CONFLICT DO NOTHING",[trip.id,actor]);
      await c.query('UPDATE trip_invitations SET redeemed_by=$1,redeemed_at=now() WHERE token_hash=$2',[actor,hash]);
      await c.query('COMMIT');return {tripId:trip.id};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async feed(limit:number,cursor?:FeedCursor):Promise<FeedPage>{
    // Preserve PostgreSQL microseconds in cursors; JS Date truncates them.
    const rows=await this.pool.query(`SELECT p.id,p.user_id AS "userId",u.name AS author,
      u.profile->>'initials' AS initials,p.trek_id AS "trekId",p.content,p.rating,p.condition,
      to_char(p.observed_at,'YYYY-MM-DD') AS "observedAt",
      to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
      COALESCE((SELECT json_agg(l.user_id ORDER BY l.user_id) FROM post_likes l WHERE l.post_id=p.id),'[]') AS "likedBy"
      FROM posts p JOIN users u ON u.id=p.user_id
      WHERE ($1::timestamptz IS NULL OR (p.created_at,p.id)<($1::timestamptz,$2::uuid))
      ORDER BY p.created_at DESC,p.id DESC LIMIT $3`,[cursor?.createdAt??null,cursor?.id??null,limit+1]);
    return feedPage(rows.rows,limit);
  }
  async read(actor=DEMO_USER):Promise<State>{
    const client=await this.pool.connect();
    try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=await this.snapshot(client,actor);await client.query('COMMIT');return state;}
    catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  private async snapshot(db:DB,actor=DEMO_USER):Promise<State>{
    const treks=await db.query(`SELECT id,current_route_version_id AS "routeVersionId",owner_id AS "ownerId",(SELECT has_elevation FROM route_versions WHERE id=treks.current_route_version_id) AS "hasElevation",title,region,description,difficulty,distance_km::float AS "distanceKm", elevation_m AS "elevationM", duration,altitude_m AS "altitudeM",rating::float,report_count AS reports,color,highlights,ST_AsGeoJSON(trailhead_location::geometry)::json->'coordinates' AS coordinates,ST_AsGeoJSON(route_geometry)::json->'coordinates' AS route FROM treks ORDER BY id`);
    const posts=await db.query(`SELECT p.id,p.user_id AS "userId",u.name AS author,u.profile->>'initials' AS initials,p.trek_id AS "trekId",p.content,p.rating,p.condition,to_char(p.observed_at,'YYYY-MM-DD') AS "observedAt",p.created_at AS "createdAt",COALESCE((SELECT json_agg(l.user_id) FROM post_likes l WHERE l.post_id=p.id),'[]') AS "likedBy" FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC,p.id DESC`);
    const comments=await db.query(`SELECT c.id,c.post_id AS "postId",c.user_id AS "userId",u.name AS author,c.body,c.created_at AS "createdAt" FROM comments c JOIN users u ON u.id=c.user_id ORDER BY c.created_at,c.id`);
    const trips=await db.query(`SELECT g.id,g.route_version_id AS "routeVersionId",g.trek_id AS "trekId",g.title,g.organizer_id AS "organizerId",u.name AS organizer,g.starts_at AS "startsAt",g.max_participants AS "maxParticipants",g.status,g.timezone,g.visibility,COALESCE((SELECT json_agg(json_build_object('userId',m.user_id,'status',m.status)) FROM group_trek_members m WHERE m.trip_id=g.id),'[]') AS members FROM group_treks g JOIN users u ON u.id=g.organizer_id WHERE g.visibility='public' OR g.organizer_id=$1 OR EXISTS(SELECT 1 FROM group_trek_members access WHERE access.trip_id=g.id AND access.user_id=$1) ORDER BY g.starts_at,g.id`,[actor]);
    const savedRows=await db.query('SELECT user_id,trek_id FROM saved_treks WHERE user_id=$1',[actor]);
    const profile=await db.query('SELECT profile FROM users WHERE id=$1',[actor]);
    if(!profile.rows[0])throw new Error('Database has not been seeded. Run npm run db:migrate.');
    const saved:Record<string,string[]>={};for(const row of savedRows.rows)(saved[row.user_id]??=[]).push(row.trek_id);
    return JSON.parse(JSON.stringify({version:1,treks:treks.rows,posts:posts.rows,comments:comments.rows,trips:trips.rows,saved,profile:profile.rows[0].profile}));
  }
  async execute(command:Command,actor=DEMO_USER):Promise<State>{
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      // All roster mutations lock the same parent row, including approval and leave.
      if('tripId' in command)await c.query('SELECT id FROM group_treks WHERE id=$1 FOR UPDATE',[command.tripId]);
      // Serialize repeated client-generated creation IDs before validating idempotency.
      if(command.type==='post'||command.type==='comment'||command.type==='create-trip')await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[command.id]);
      const before=await this.snapshot(c,actor);const next=applyCommand(before,command,actor);
      if(command.type==='profile'){
        await c.query('UPDATE users SET name=$1,profile=$2 WHERE id=$3',[next.profile.name,JSON.stringify(next.profile),actor]);
      }else if(command.type==='create-trip'){
        const t=next.trips.find(t=>t.id===command.id)!;
        await c.query('INSERT INTO group_treks(id,trek_id,title,organizer_id,starts_at,timezone,max_participants,status,visibility,route_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING',[t.id,t.trekId,t.title,actor,t.startsAt,t.timezone,t.maxParticipants,t.status,t.visibility||'public',t.routeVersionId]);
        await c.query("INSERT INTO group_trek_members(trip_id,user_id,status) VALUES($1,$2,'accepted') ON CONFLICT DO NOTHING",[t.id,actor]);
      }else if(command.type==='cancel-trip'){
        await c.query("UPDATE group_treks SET status='closed' WHERE id=$1",[command.tripId]);
      }else if(command.type==='save'){
        if(command.saved)await c.query('INSERT INTO saved_treks(user_id,trek_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,command.trekId]);
        else await c.query('DELETE FROM saved_treks WHERE user_id=$1 AND trek_id=$2',[actor,command.trekId]);
      }else if(command.type==='like'){
        if(command.liked)await c.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[command.postId,actor]);
        else await c.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2',[command.postId,actor]);
      }else if(command.type==='post'){
        const p=next.posts.find(p=>p.id===command.id)!;
        await c.query('INSERT INTO posts(id,user_id,trek_id,content,rating,condition,observed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING',[p.id,p.userId,p.trekId,p.content,p.rating,p.condition,p.observedAt,p.createdAt]);
      }else if(command.type==='comment'){
        const p=next.comments.find(p=>p.id===command.id)!;
        await c.query('INSERT INTO comments(id,post_id,user_id,body,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[p.id,p.postId,p.userId,p.body,p.createdAt]);
      }else if(command.type==='join'){
        await c.query("INSERT INTO group_trek_members(trip_id,user_id,status) VALUES($1,$2,'pending') ON CONFLICT DO NOTHING",[command.tripId,actor]);
      }else if(command.type==='leave'){
        await c.query('DELETE FROM group_trek_members WHERE trip_id=$1 AND user_id=$2',[command.tripId,actor]);
      }else{
        await c.query("UPDATE group_trek_members SET status='accepted' WHERE trip_id=$1 AND user_id=$2",[command.tripId,command.userId]);
      }
      const result=await this.snapshot(c,actor);await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async nearby(lng:number,lat:number,radiusM:number){
    const rows=await this.pool.query(`SELECT id,ST_Distance(trailhead_location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m FROM treks WHERE ST_DWithin(trailhead_location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3) ORDER BY distance_m,id`,[lng,lat,radiusM]);return rows.rows;
  }
  async close(){await this.pool.end();}
}

export async function seedDatabase(pool:Pool){
  const c=await pool.connect();
  try{
    await c.query('BEGIN'); const seed=createSeed();
    for(const user of [{...seed.profile}, {id:'00000000-0000-4000-8000-000000000002',username:'meera.trails',name:'Meera Kapoor',initials:'MK'}, {id:'00000000-0000-4000-8000-000000000003',username:'kabir.outside',name:'Kabir Rao',initials:'KR'}])await c.query('INSERT INTO users(id,username,name,profile) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[user.id,user.username,user.name,JSON.stringify(user)]);
    for(const t of seed.treks)await c.query(`INSERT INTO treks(id,title,region,description,difficulty,distance_km,elevation_m,duration,altitude_m,rating,report_count,color,highlights,trailhead_location,route_geometry) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,ST_SetSRID(ST_MakePoint($14,$15),4326)::geography,ST_SetSRID(ST_GeomFromGeoJSON($16),4326)) ON CONFLICT DO NOTHING`,[t.id,t.title,t.region,t.description,t.difficulty,t.distanceKm,t.elevationM,t.duration,t.altitudeM,t.rating,t.reports,t.color,JSON.stringify(t.highlights),...t.coordinates,JSON.stringify({type:'LineString',coordinates:t.route})]);
    await c.query(`INSERT INTO route_versions(id,trek_id,geometry,distance_km,elevation_m,altitude_m)
      SELECT gen_random_uuid(),id,route_geometry,distance_km,elevation_m,altitude_m FROM treks WHERE current_route_version_id IS NULL`);
    await c.query('UPDATE treks t SET current_route_version_id=r.id FROM route_versions r WHERE r.trek_id=t.id AND t.current_route_version_id IS NULL');
    for(const p of seed.posts)await c.query('INSERT INTO posts(id,user_id,trek_id,content,rating,condition,observed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[p.id,p.userId,p.trekId,p.content,p.rating,p.condition,p.observedAt,p.createdAt]);
    for(const t of seed.trips){await c.query('INSERT INTO group_treks(id,trek_id,title,organizer_id,starts_at,max_participants,status,route_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT current_route_version_id FROM treks WHERE id=$2)) ON CONFLICT DO NOTHING',[t.id,t.trekId,t.title,t.organizerId,t.startsAt,t.maxParticipants,t.status]);for(const m of t.members)await c.query('INSERT INTO group_trek_members(trip_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[t.id,m.userId,m.status]);}
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
