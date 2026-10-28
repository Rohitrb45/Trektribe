import { createClient } from 'redis';
import { z } from 'zod';
import { presenceScript } from './presence';

/** Redis carries hints and expiring presence identifiers; message bodies stay in PostgreSQL. */
export async function redisFanout(url:string,channel:string,receive:(tripId:string)=>void){
 const publisher=createClient({url,disableOfflineQueue:true,commandsQueueMaxLength:100,socket:{connectTimeout:5000}});
 const subscriber=publisher.duplicate();
 publisher.on('error',()=>console.error('Chat Redis publisher unavailable.'));
 subscriber.on('error',()=>console.error('Chat Redis subscriber unavailable.'));
 const destroy=()=>{if(publisher.isOpen)publisher.destroy();if(subscriber.isOpen)subscriber.destroy();};
 const bounded=async<T>(operation:Promise<T>,ms:number):Promise<T>=>{
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Redis operation timed out.')),ms);})]);}
   finally{if(timer)clearTimeout(timer);}
 };
 try{
   await bounded(Promise.all([publisher.connect(),subscriber.connect()]),8000);
   await bounded(subscriber.subscribe(channel,message=>{const id=z.uuid().safeParse(message);if(id.success)receive(id.data);}),3000);
 }catch{destroy();throw new Error('Could not initialize chat Redis. Check REDIS_URL and connectivity.');}
 return {
   async heartbeat(tripId:string,session:string):Promise<string[]>{
     if(!publisher.isReady)throw new Error('Presence unavailable.');
     return await bounded(publisher.eval(presenceScript,{keys:[`${channel}:presence:${tripId}`],arguments:[session]}),3000) as string[];
   },
   async leave(tripId:string,session:string){
     if(!publisher.isReady)throw new Error('Presence unavailable.');
     await bounded(publisher.zRem(`${channel}:presence:${tripId}`,session),3000);
   },
   async publish(tripId:string){
     if(!publisher.isReady||!subscriber.isReady)throw new Error('Redis unavailable.');
     const count=await bounded(publisher.publish(channel,tripId),3000);
     if(!count)throw new Error('No chat subscribers.');
   },
   close:async()=>{destroy();}
 };
}
