import { Pool, PoolClient } from 'pg';
import { DomainError } from '../../../packages/core/src/index';

export class MessageRepository {
  constructor(private pool:Pool){}
  private async member(c:PoolClient,tripId:string,actor:string){
    const trip=(await c.query('SELECT id,status FROM group_treks WHERE id=$1 FOR UPDATE',[tripId])).rows[0];
    const membership=(await c.query("SELECT 1 FROM group_trek_members WHERE trip_id=$1 AND user_id=$2 AND status='accepted'",[tripId,actor])).rowCount;
    if(!trip||!membership)throw new DomainError('NOT_FOUND','Outing conversation not found.',404);
    return trip;
  }
  async list(tripId:string,actor:string,after=0,limit=50){
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');await this.member(c,tripId,actor);
      const rows=await c.query(`SELECT m.id,m.sequence::float AS sequence,m.user_id AS "userId",u.name AS author,m.body,m.created_at AS "createdAt"
        FROM trip_messages m JOIN users u ON u.id=m.user_id WHERE m.trip_id=$1 AND m.sequence>$2 ORDER BY m.sequence LIMIT $3`,[tripId,after,limit+1]);
      await c.query('COMMIT');const items=rows.rows.slice(0,limit);return {items,hasMore:rows.rows.length>limit,nextSequence:items.at(-1)?.sequence??after};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  async send(tripId:string,actor:string,id:string,body:string){
    body=body.trim();if(!body||body.length>2000)throw new DomainError('INVALID_MESSAGE','Use between 1 and 2,000 characters.');
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');const trip=await this.member(c,tripId,actor);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
      const existing=(await c.query('SELECT *,sequence::float AS sequence FROM trip_messages WHERE id=$1',[id])).rows[0];
      if(existing){
        if(existing.trip_id!==tripId||existing.user_id!==actor||existing.body!==body)throw new DomainError('CONFLICT','Message ID already used.',409);
        await c.query('COMMIT');return {id,sequence:existing.sequence};
      }
      if(trip.status!=='open')throw new DomainError('TRIP_CLOSED','This outing is closed.',409);
      const row=(await c.query('INSERT INTO trip_messages(id,trip_id,sequence,user_id,body) SELECT $1,$2,COALESCE(MAX(sequence),0)+1,$3,$4 FROM trip_messages WHERE trip_id=$2 RETURNING sequence::float AS sequence',[id,tripId,actor,body])).rows[0];
      await c.query('INSERT INTO trip_outbox(trip_id,message_id) VALUES($1,$2)',[tripId,id]);
      await c.query('COMMIT');return {id,sequence:row.sequence};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
