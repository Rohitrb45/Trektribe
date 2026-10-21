import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { Pool } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/index';
import { MessageRepository } from './messages';

export function startRealtime(http:HttpServer,pool:Pool,authenticate:(authorization:string)=>Promise<string>,origins:string[]){
  const io=new Server(http,{cors:{origin:origins},maxHttpBufferSize:16384});
  const repository=new MessageRepository(pool);
  const actor=async(socket:Socket)=>{
    const token=z.string().min(1).max(16384).parse(socket.handshake.auth?.token);
    return authenticate(`Bearer ${token}`);
  };
  io.use((socket,next)=>{actor(socket).then(id=>{socket.data.userId=id;next();}).catch(()=>next(new Error('Authentication required.')));});
  io.on('connection',socket=>{
    socket.on('trip:send',async(input,ack)=>{
      if(typeof ack!=='function')return;
      try{
        const user=await actor(socket);
        const data=z.object({tripId:z.uuid(),id:z.uuid(),body:z.string().trim().min(1).max(2000)}).strict().parse(input);
        const result=await repository.send(data.tripId,user,data.id,data.body);
        ack({ok:true,...result}); // Repository returns only after COMMIT.
      }catch(e){ack({ok:false,error:e instanceof DomainError?e.message:'Message rejected. Please reconnect and try again.'});}
    });
    socket.on('trip:sync',async(input,ack)=>{
      if(typeof ack!=='function')return;
      try{
        const user=await actor(socket);
        const data=z.object({tripId:z.uuid(),after:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)}).strict().parse(input);
        ack({ok:true,...await repository.list(data.tripId,user,data.after)});
      }catch{ack({ok:false,error:'Conversation unavailable. Check your session and membership.'});}
    });
  });
  // Single-process dispatcher. Reconnect sync is authoritative even if a notification is missed.
  let running:Promise<void>|null=null;
  const deliver=async()=>{
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const pending=await c.query('SELECT id,trip_id FROM trip_outbox WHERE delivered_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED');
      for(const item of pending.rows){
        for(const socket of io.sockets.sockets.values()){
          let user:string;
          try{user=await actor(socket);}catch{socket.disconnect(true);continue;}
          const member=await c.query("SELECT 1 FROM group_trek_members WHERE trip_id=$1 AND user_id=$2 AND status='accepted'",[item.trip_id,user]);
          if(member.rowCount)socket.emit('trip:changed',{tripId:item.trip_id});
        }
        await c.query('UPDATE trip_outbox SET delivered_at=now() WHERE id=$1',[item.id]);
      }
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');console.error('Outbox delivery failed; will retry.');}finally{c.release();}
  };
  const timer=setInterval(()=>{if(!running)running=deliver().catch(()=>console.error('Outbox connection failed; will retry.')).finally(()=>{running=null;});},1000);
  timer.unref();
  return async()=>{clearInterval(timer);await running;await new Promise<void>(resolve=>io.close(()=>resolve()));};
}
