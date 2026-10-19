import { Pool, PoolClient } from 'pg';
import { DomainError } from '../../../packages/core/src/index';

export async function interactionAllowed(c:PoolClient,actor:string,other:string){
  await lockPair(c,actor,other);
  if((await c.query('SELECT users_blocked($1,$2) AS blocked',[actor,other])).rows[0].blocked)
    throw new DomainError('INTERACTION_UNAVAILABLE','This interaction is unavailable.',403);
}
async function lockPair(c:PoolClient,a:string,b:string){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`interaction:${[a,b].sort().join(':')}`]);
}
export class BlockRepository {
  constructor(private pool:Pool){}
  async list(actor:string){
    return {items:(await this.pool.query('SELECT u.id,u.name FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at,b.blocked_id',[actor])).rows};
  }
  async set(actor:string,other:string,blocked:boolean){
    if(actor===other)throw new DomainError('INVALID_BLOCK','You cannot block yourself.');
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');await lockPair(c,actor,other);
      if(!(await c.query('SELECT 1 FROM users WHERE id=$1',[other])).rowCount)throw new DomainError('NOT_FOUND','User not found.',404);
      if(blocked)await c.query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,other]);
      else await c.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',[actor,other]);
      await c.query('COMMIT');return {blocked};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
