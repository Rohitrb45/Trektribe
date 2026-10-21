import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { Pool } from 'pg';
import { z } from 'zod';
import { DomainError } from '../../../packages/core/src/index';
import { MessageRepository } from './messages';
import { redisFanout } from './chat-fanout';

export async function startRealtime(http:HttpServer,pool:Pool,authenticate:(authorization:string)=>Promise<string>,origins:string[],options:{redisUrl?:string;channel?:string}={}){
  // Shared locks permit Redis-backed instances; an exclusive lock protects local mode.
  const lease=await pool.connect();
  let leaseLost=false;
  const onLeaseError=()=>{leaseLost=true;console.error('Chat coordination connection lost; restart this API instance.');};
  lease.on('error',onLeaseError);
  let fanout:Awaited<ReturnType<typeof redisFanout>>|undefined;
  const notifications=new Set<string>();
  const enqueue=(tripId:string)=>{if(notifications.size<1000)notifications.add(tripId);};
  const lock=options.redisUrl?'pg_try_advisory_lock_shared':'pg_try_advisory_lock';
  try{
    if(!(await lease.query(`SELECT ${lock}(7421002) AS acquired`)).rows[0].acquired)throw new Error('Chat instances cannot mix local and Redis modes. Use Redis on all instances of a shared database.');
    if(options.redisUrl)fanout=await redisFanout(options.redisUrl,options.channel??'trektribe:chat:v1',enqueue);
  }catch(e){lease.removeListener('error',onLeaseError);lease.release(true);throw e;}
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
  // Competing instances claim different rows. Publish failures roll back for retry.
  let running:Promise<void>|null=null;
  const deliver=async()=>{
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const pending=await c.query('SELECT id,trip_id FROM trip_outbox WHERE delivered_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED');
      for(const item of pending.rows){
        if(fanout)await fanout.publish(item.trip_id);else enqueue(item.trip_id);
        await c.query('UPDATE trip_outbox SET delivered_at=now() WHERE id=$1',[item.id]);
      }
      await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');console.error('Outbox delivery failed; will retry.');}finally{c.release();}
  };
  let notifying:Promise<void>|null=null;
  const notify=async()=>{
    const batch=[...notifications].slice(0,50);for(const id of batch)notifications.delete(id);
    for(const tripId of batch)for(const socket of io.sockets.sockets.values()){
      let user:string;
      try{user=await actor(socket);}catch{socket.disconnect(true);continue;}
      const member=await pool.query("SELECT 1 FROM group_trek_members WHERE trip_id=$1 AND user_id=$2 AND status='accepted'",[tripId,user]);
      if(member.rowCount&&socket.connected)socket.emit('trip:changed',{tripId});
    }
  };
  const timer=setInterval(()=>{
    if(leaseLost){io.disconnectSockets(true);return;}
    if(!running)running=deliver().catch(()=>console.error('Outbox connection failed; will retry.')).finally(()=>{running=null;});
    if(!notifying)notifying=notify().catch(()=>console.error('Chat notification failed; clients will resync.')).finally(()=>{notifying=null;});
  },1000);
  timer.unref();
  return async()=>{
    clearInterval(timer);await fanout?.close();await Promise.all([running,notifying]);
    await new Promise<void>(resolve=>io.close(()=>resolve()));
    lease.removeListener('error',onLeaseError);lease.release(true);
  };
}
