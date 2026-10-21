/** A session counts as active for 30 seconds after its latest foreground heartbeat. */
export const PRESENCE_TTL_MS=30000;
export const presenceScript=`
local t=redis.call('TIME')
local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
redis.call('ZADD',KEYS[1],now+30000,ARGV[1])
redis.call('PEXPIRE',KEYS[1],60000)
return redis.call('ZRANGE',KEYS[1],0,999)
`;
export class LocalPresence {
 private rooms=new Map<string,Map<string,number>>();
 constructor(private now=()=>Date.now()){}
 async heartbeat(tripId:string,session:string){
   const now=this.now();
   for(const [id,room] of this.rooms){for(const [key,expires] of room)if(expires<=now)room.delete(key);if(!room.size)this.rooms.delete(id);}
   const room=this.rooms.get(tripId)??new Map<string,number>();
   room.set(session,now+PRESENCE_TTL_MS);this.rooms.set(tripId,room);return [...room.keys()];
 }
 async leave(tripId:string,session:string){const room=this.rooms.get(tripId);room?.delete(session);if(!room?.size)this.rooms.delete(tripId);}
}
