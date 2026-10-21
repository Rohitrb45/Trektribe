import { Pool } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/index';
import { interactionAllowed } from './blocks';

export const threadInput=z.object({id:z.uuid(),title:z.string().trim().min(1).max(120),body:z.string().trim().min(1).max(5000)}).strict();
export const replyInput=z.object({id:z.uuid(),body:z.string().trim().min(1).max(2000)}).strict();
export const forumPage=z.object({cursor:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
const columns='t.id,t.sequence::float AS sequence,t.user_id AS "userId",u.name AS author,t.title,t.body,t.closed,t.created_at AS "createdAt"';

export class ForumRepository {
 constructor(private pool:Pool){}
 async list(actor:string,cursor=0,limit=20){
   const rows=(await this.pool.query(`SELECT ${columns} FROM forum_threads t JOIN users u ON u.id=t.user_id
     WHERE NOT users_blocked($1,t.user_id) AND ($2::bigint=0 OR t.sequence<$2) ORDER BY t.sequence DESC LIMIT $3`,[actor,cursor,limit+1])).rows;
   const items=rows.slice(0,limit);return {items,nextCursor:rows.length>limit?items.at(-1).sequence:null};
 }
 async read(id:string,actor:string,cursor=0,limit=20){
   const c=await this.pool.connect();
   try{
     await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
     const thread=(await c.query(`SELECT ${columns} FROM forum_threads t JOIN users u ON u.id=t.user_id WHERE t.id=$1 AND NOT users_blocked($2,t.user_id)`,[id,actor])).rows[0];
     if(!thread)throw new DomainError('NOT_FOUND','Discussion not found.',404);
     const rows=(await c.query(`SELECT r.id,r.sequence::float AS sequence,r.user_id AS "userId",u.name AS author,r.body,r.created_at AS "createdAt"
       FROM forum_replies r JOIN users u ON u.id=r.user_id WHERE r.thread_id=$1 AND r.sequence>$2 AND NOT users_blocked($3,r.user_id) ORDER BY r.sequence LIMIT $4`,[id,cursor,actor,limit+1])).rows;
     await c.query('COMMIT');const items=rows.slice(0,limit);return {thread,items,nextCursor:rows.length>limit?items.at(-1).sequence:null};
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async create(actor:string,input:unknown){
   const data=threadInput.parse(input),c=await this.pool.connect();
   try{
     await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`forum:${data.id}`]);
     const existing=(await c.query('SELECT * FROM forum_threads WHERE id=$1',[data.id])).rows[0];
     if(existing){if(existing.user_id!==actor||existing.title!==data.title||existing.body!==data.body)throw new DomainError('CONFLICT','Discussion ID already used.',409);}
     else await c.query('INSERT INTO forum_threads(id,user_id,title,body) VALUES($1,$2,$3,$4)',[data.id,actor,data.title,data.body]);
     await c.query('COMMIT');return {id:data.id};
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async reply(threadId:string,actor:string,input:unknown){
   const data=replyInput.parse(input),c=await this.pool.connect();
   try{
     await c.query('BEGIN');
     const thread=(await c.query('SELECT * FROM forum_threads WHERE id=$1 FOR UPDATE',[threadId])).rows[0];
     if(!thread)throw new DomainError('NOT_FOUND','Discussion not found.',404);
     await interactionAllowed(c,actor,thread.user_id);
     await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`forum-reply:${data.id}`]);
     const existing=(await c.query('SELECT * FROM forum_replies WHERE id=$1',[data.id])).rows[0];
     if(existing){if(existing.user_id!==actor||existing.thread_id!==threadId||existing.body!==data.body)throw new DomainError('CONFLICT','Reply ID already used.',409);}
     else {
       if(thread.closed)throw new DomainError('THREAD_CLOSED','This discussion is closed.',409);
       await c.query('INSERT INTO forum_replies(id,thread_id,user_id,body) VALUES($1,$2,$3,$4)',[data.id,threadId,actor,data.body]);
     }
     await c.query('COMMIT');return {id:data.id};
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async close(id:string,actor:string,closed:boolean){
   const result=await this.pool.query('UPDATE forum_threads SET closed=$1 WHERE id=$2 AND user_id=$3 RETURNING id,closed',[closed,id,actor]);
   if(!result.rowCount)throw new DomainError('NOT_FOUND','Discussion not found.',404);
   return result.rows[0];
 }
}
