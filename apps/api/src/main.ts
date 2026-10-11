import 'reflect-metadata';
import { Body, Controller, Get, Post as HttpPost, Param, Query, Module, Req, UnauthorizedException, HttpException, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { DEMO_USER, DomainError, searchTreks } from '../../../packages/core/src/index';
import { DemoStore, PostgresStore, Store } from './store';
import { commandSchema, searchSchema, feedSchema } from './validation';
import { decodeCursor } from './feed';
import { configuredVerifier } from './auth';

if(process.env.NODE_ENV==='production')throw new Error('Production startup remains disabled until all resource policies and external integrations are verified.');
const oidc=process.env.AUTH_MODE==='oidc';
if(!oidc&&process.env.DEMO_MODE!=='true')throw new Error('Use AUTH_MODE=oidc or explicitly enable DEMO_MODE=true.');
if(oidc&&!process.env.DATABASE_URL)throw new Error('OIDC mode requires PostgreSQL.');
if(oidc&&process.env.DEMO_MODE==='true')throw new Error('OIDC mode and demo identity cannot be enabled together.');
const verify=oidc?configuredVerifier():undefined;
const store:Store=process.env.DATABASE_URL?new PostgresStore(process.env.DATABASE_URL):new DemoStore(resolve(process.env.DEMO_DATA_PATH||'data/demo.json'));
async function actor(req:any):Promise<string>{
 if(verify&&store instanceof PostgresStore)return store.identify(await verify(req.headers.authorization));
 if(req.headers.authorization!=='Bearer trektribe-local-demo')throw new UnauthorizedException('Use the documented local demo token.');
 return DEMO_USER;
}
function demoOnly(){if(oidc)throw new NotFoundException();}

@Controller('v1')
class ApiController {
 @Get('health') health(){return {status:'ok',mode:oidc?'oidc':'demo',storage:store instanceof PostgresStore?'postgres':'local-json'};}
 @Get('demo/state') async state(@Req() req:any){demoOnly();await actor(req);return store.read();}
 @HttpPost('demo/commands') async command(@Req() req:any,@Body() body:unknown){demoOnly();await actor(req);return store.execute(commandSchema.parse(body));}
 @Get('me') async me(@Req() req:any){return (await store.read(await actor(req))).profile;}
 @HttpPost('me') async updateProfile(@Req() req:any,@Body() body:unknown){
   const user=await actor(req);const data=commandSchema.options[7].omit({type:true}).parse(body);
   return (await store.execute({type:'profile',...data},user)).profile;
 }
 @HttpPost('group-treks') async createTrip(@Req() req:any,@Body() body:unknown){
   const user=await actor(req);const data=commandSchema.options[8].omit({type:true}).parse(body);
   return (await store.execute({type:'create-trip',...data},user)).trips.find(t=>t.id===data.id);
 }
 @HttpPost('group-treks/:id/cancel') async cancelTrip(@Req() req:any,@Param('id') id:string){
   const user=await actor(req);return (await store.execute({type:'cancel-trip',tripId:z.uuid().parse(id)},user)).trips.find(t=>t.id===id);
 }
 @Get('me/saved-treks') async saved(@Req() req:any){const id=await actor(req);return {items:(await store.read(id)).saved[id]||[]};}
 @HttpPost('me/saved-treks/:id') async save(@Req() req:any,@Param('id') id:string,@Body() body:unknown){
   const user=await actor(req);const value=z.object({saved:z.boolean()}).strict().parse(body);
   const state=await store.execute({type:'save',trekId:z.uuid().parse(id),saved:value.saved},user);return {items:state.saved[user]||[]};
 }
 @HttpPost('posts') async post(@Req() req:any,@Body() body:unknown){
   const user=await actor(req);const data=commandSchema.options[2].omit({type:true}).parse(body);
   const state=await store.execute({type:'post',...data},user);return state.posts.find(p=>p.id===data.id);
 }
 @HttpPost('posts/:id/like') async like(@Req() req:any,@Param('id') id:string,@Body() body:unknown){
   const user=await actor(req);const data=z.object({liked:z.boolean()}).strict().parse(body);
   const state=await store.execute({type:'like',postId:z.uuid().parse(id),...data},user);return state.posts.find(p=>p.id===id);
 }
 @Get('posts/:id/comments') async comments(@Req() req:any,@Param('id') id:string){const user=await actor(req);z.uuid().parse(id);return {items:(await store.read(user)).comments.filter(c=>c.postId===id)};}
 @HttpPost('posts/:id/comments') async comment(@Req() req:any,@Param('id') id:string,@Body() body:unknown){
   const user=await actor(req);const data=z.object({id:z.uuid(),body:z.string().trim().min(1).max(1000)}).strict().parse(body);
   const state=await store.execute({type:'comment',postId:z.uuid().parse(id),...data},user);return state.comments.find(c=>c.id===data.id);
 }
 @HttpPost('group-treks/:id/join') async join(@Req() req:any,@Param('id') id:string){const user=await actor(req);return (await store.execute({type:'join',tripId:z.uuid().parse(id)},user)).trips.find(t=>t.id===id);}
 @HttpPost('group-treks/:id/leave') async leave(@Req() req:any,@Param('id') id:string){const user=await actor(req);return (await store.execute({type:'leave',tripId:z.uuid().parse(id)},user)).trips.find(t=>t.id===id);}
 @HttpPost('group-treks/:id/approve') async approve(@Req() req:any,@Param('id') id:string,@Body() body:unknown){
   const user=await actor(req);const data=z.object({userId:z.uuid()}).strict().parse(body);
   return (await store.execute({type:'approve',tripId:z.uuid().parse(id),...data},user)).trips.find(t=>t.id===id);
 }
 @Get('treks') async treks(@Req() req:any,@Query() query:unknown){
   const q=searchSchema.parse(query);const state=await store.read(oidc?await actor(req):DEMO_USER);
   const origin=q.lat!==undefined&&q.lng!==undefined?[q.lng,q.lat] as [number,number]:undefined;
   let items=searchTreks(state.treks,q.q,q.difficulty,store instanceof PostgresStore?undefined:origin,q.radiusM/1000);
   if(origin&&store instanceof PostgresStore){const nearby=await store.nearby(origin[0],origin[1],q.radiusM);const ranks=new Map(nearby.map((r,i)=>[r.id,i]));items=items.filter(t=>ranks.has(t.id)).sort((a,b)=>ranks.get(a.id)!-ranks.get(b.id)!);}
   return {items};
 }
 @Get('treks/:id') async trek(@Req() req:any,@Param('id') id:string){z.uuid().parse(id);const trek=(await store.read(oidc?await actor(req):DEMO_USER)).treks.find(t=>t.id===id);if(!trek)throw new DomainError('NOT_FOUND','Trail not found.',404);return trek;}
 @Get('feed') async feed(@Query() query:unknown){
   const q=feedSchema.parse(query);return store.feed(q.limit,decodeCursor(q.cursor));
 }
 @Get('group-treks') async trips(@Req() req:any){return {items:(await store.read(await actor(req))).trips};}
}
@Module({controllers:[ApiController]}) class AppModule{}
async function bootstrap(){
 const app=await NestFactory.create(AppModule,{bodyParser:true});
 app.enableCors({origin:(process.env.CORS_ORIGINS||'http://localhost:8081,http://127.0.0.1:8081').split(','),methods:['GET','POST'],allowedHeaders:['Content-Type','Authorization']});
 app.useGlobalFilters({catch(exception:unknown,host:any){
   const response=host.switchToHttp().getResponse();const requestId=randomUUID();
   const status=exception instanceof DomainError?exception.status:exception instanceof ZodError?400:exception instanceof HttpException?exception.getStatus():500;
   const message=exception instanceof DomainError||exception instanceof HttpException?exception.message:exception instanceof ZodError?exception.issues.map(i=>i.message).join('; '):'An internal error occurred.';
   if(status===500)console.error({requestId,error:exception});
   response.status(status).json({error:{code:exception instanceof DomainError?exception.code:status===400?'VALIDATION_ERROR':status===401?'UNAUTHORIZED':'REQUEST_FAILED',message,requestId}});
 }});
 app.enableShutdownHooks();
 await app.listen(Number(process.env.PORT||3001),process.env.HOST||'127.0.0.1');
 console.log(`TrekTribe demo API: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3001}/v1/health`);
 const stop=async()=>{await app.close();await store.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
bootstrap().catch(error=>{console.error(error);process.exit(1);});
