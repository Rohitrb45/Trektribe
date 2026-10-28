import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/index';
import { interactionAllowed } from './blocks';

export const editThread=z.object({revision:z.number().int().positive(),title:z.string().trim().min(1).max(120),body:z.string().trim().min(1).max(5000)}).strict();
export const editReply=z.object({revision:z.number().int().positive(),body:z.string().trim().min(1).max(2000)}).strict();
export const removeInput=z.object({revision:z.number().int().positive()}).strict();
export const reportInput=z.object({reason:z.string().trim().min(1).max(1000)}).strict();
export const decisionInput=z.object({action:z.enum(['dismiss','remove']),reason:z.string().trim().min(1).max(1000)}).strict();
type Kind='threads'|'replies';
export class ForumManagement {
 constructor(private pool:Pool){}
 private async transaction<T>(fn:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async target(c:PoolClient,kind:Kind,id:string){
   const threadId=kind==='threads'?id:(await c.query('SELECT thread_id FROM forum_replies WHERE id=$1',[id])).rows[0]?.thread_id;
   if(!threadId)throw new DomainError('NOT_FOUND','Content not found.',404);
   const thread=(await c.query('SELECT * FROM forum_threads WHERE id=$1 FOR UPDATE',[threadId])).rows[0];
   const target=kind==='threads'?thread:(await c.query('SELECT * FROM forum_replies WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!thread||!target)throw new DomainError('NOT_FOUND','Content not found.',404);
   return {thread,target};
 }
 async change(kind:Kind,id:string,actor:string,input:unknown,remove=false){
   const data=remove?removeInput.parse(input):kind==='threads'?editThread.parse(input):editReply.parse(input);
   return this.transaction(async c=>{
     const {thread,target}=await this.target(c,kind,id);
     if(target.user_id!==actor)throw new DomainError('FORBIDDEN','Only the author can change this content.',403);
     if(remove&&target.deleted_at)return {id};
     if(target.deleted_at||(!remove&&thread.deleted_at))throw new DomainError('NOT_FOUND','Content removed.',404);
     if(target.revision!==data.revision)throw new DomainError('CONFLICT','This content changed. Refresh before trying again.',409);
     if(!remove&&kind==='replies'){
       await interactionAllowed(c,actor,thread.user_id);
       if(thread.closed)throw new DomainError('THREAD_CLOSED','This discussion is closed.',409);
     }
     // Table names come only from the route's fixed kind, never user input.
     if(remove)await c.query(`UPDATE forum_${kind} SET deleted_at=now(),revision=revision+1 WHERE id=$1`,[id]);
     else if('title' in data&&'body' in data)await c.query('UPDATE forum_threads SET title=$1,body=$2,revision=revision+1 WHERE id=$3',[data.title,data.body,id]);
     else if('body' in data)await c.query('UPDATE forum_replies SET body=$1,revision=revision+1 WHERE id=$2',[data.body,id]);
     return {id};
   });
 }
 async report(kind:Kind,id:string,actor:string,input:unknown){
   const {reason}=reportInput.parse(input);
   return this.transaction(async c=>{
     const {thread,target}=await this.target(c,kind,id);
     if(thread.deleted_at||target.deleted_at)throw new DomainError('NOT_FOUND','Content removed.',404);
     const pairs=[[actor,thread.user_id],[actor,target.user_id]].sort((a,b)=>[...a].sort().join(':').localeCompare([...b].sort().join(':')));
     for(const [a,b] of pairs)await interactionAllowed(c,a,b);
     await c.query('INSERT INTO forum_reports(reporter_id,thread_id,reply_id,reason,snapshot_title,snapshot_body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[actor,thread.id,kind==='replies'?id:null,reason,thread.title,target.body]);
     return {reported:true};
   });
 }
 async isModerator(actor:string){return !!(await this.pool.query('SELECT 1 FROM forum_moderators WHERE user_id=$1',[actor])).rowCount;}
 private async moderator(c:PoolClient,actor:string){if(!(await c.query('SELECT 1 FROM forum_moderators WHERE user_id=$1 FOR SHARE',[actor])).rowCount)throw new DomainError('FORBIDDEN','Moderator access required.',403);}
 async queue(actor:string,cursor=0){
   return this.transaction(async c=>{
     await this.moderator(c,actor);
     const rows=(await c.query(`SELECT r.id::float AS id,r.reason,r.thread_id AS "threadId",r.reply_id AS "replyId",t.title,r.snapshot_title AS "reportedTitle",r.snapshot_body AS "reportedBody",
       CASE WHEN r.reply_id IS NULL THEN t.body ELSE p.body END AS body,
       (t.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL) AS removed
       FROM forum_reports r JOIN forum_threads t ON t.id=r.thread_id LEFT JOIN forum_replies p ON p.id=r.reply_id
       WHERE r.resolved_at IS NULL AND r.id>$1 ORDER BY r.id LIMIT 21`,[cursor])).rows;
     const items=rows.slice(0,20);return {items,nextCursor:rows.length>20?items.at(-1).id:null};
   });
 }
 async decide(reportId:number,actor:string,input:unknown){
   const data=decisionInput.parse(input);
   return this.transaction(async c=>{
     await this.moderator(c,actor);
     const report=(await c.query('SELECT * FROM forum_reports WHERE id=$1',[reportId])).rows[0];
     if(!report)throw new DomainError('NOT_FOUND','Report not found.',404);
     const kind=report.reply_id?'replies':'threads',id=report.reply_id??report.thread_id;
     await this.target(c,kind,id);
     const locked=(await c.query('SELECT * FROM forum_reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
     if(locked.resolved_at){
       const previous=(await c.query('SELECT * FROM forum_moderation_actions WHERE report_id=$1',[reportId])).rows[0];
       if(previous.moderator_id!==actor||previous.action!==data.action||previous.reason!==data.reason)throw new DomainError('CONFLICT','Report already resolved.',409);
       return {resolved:true};
     }
     if(data.action==='remove')await c.query(`UPDATE forum_${kind} SET deleted_at=now(),revision=revision+1 WHERE id=$1 AND deleted_at IS NULL`,[id]);
     await c.query('INSERT INTO forum_moderation_actions(report_id,moderator_id,action,reason) VALUES($1,$2,$3,$4)',[reportId,actor,data.action,data.reason]);
     await c.query('UPDATE forum_reports SET resolved_at=now() WHERE id=$1',[reportId]);
     return {resolved:true};
   });
 }
}
