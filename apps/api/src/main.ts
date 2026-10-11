import 'reflect-metadata';
import { Body, Controller, Get, Post as HttpPost, Param, Query, Module, Req, UnauthorizedException, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { DomainError, searchTreks } from '../../../packages/core/src/index';
import { DemoStore, PostgresStore, Store } from './store';
import { commandSchema, searchSchema, feedSchema } from './validation';
import { decodeCursor } from './feed';

if(process.env.NODE_ENV==='production' || process.env.DEMO_MODE!=='true')throw new Error('This milestone exposes demo identity only. Set DEMO_MODE=true for local development. Production startup is intentionally disabled until real authentication and resource policies are implemented.');
const store:Store=process.env.DATABASE_URL?new PostgresStore(process.env.DATABASE_URL):new DemoStore(resolve(process.env.DEMO_DATA_PATH||'data/demo.json'));
function auth(req:any){if(req.headers.authorization!=='Bearer trektribe-local-demo')throw new UnauthorizedException('Use the documented local demo token.');}

@Controller('v1')
class ApiController {
 @Get('health') health(){return {status:'ok',mode:'demo',storage:store instanceof PostgresStore?'postgres':'local-json'};}
 @Get('demo/state') async state(@Req() req:any){auth(req);return store.read();}
 @HttpPost('demo/commands') async command(@Req() req:any,@Body() body:unknown){auth(req);return store.execute(commandSchema.parse(body));}
 @Get('treks') async treks(@Query() query:unknown){
   const q=searchSchema.parse(query);const state=await store.read();
   const origin=q.lat!==undefined&&q.lng!==undefined?[q.lng,q.lat] as [number,number]:undefined;
   let items=searchTreks(state.treks,q.q,q.difficulty,store instanceof PostgresStore?undefined:origin,q.radiusM/1000);
   if(origin&&store instanceof PostgresStore){const nearby=await store.nearby(origin[0],origin[1],q.radiusM);const ranks=new Map(nearby.map((r,i)=>[r.id,i]));items=items.filter(t=>ranks.has(t.id)).sort((a,b)=>ranks.get(a.id)!-ranks.get(b.id)!);}
   return {items};
 }
 @Get('treks/:id') async trek(@Param('id') id:string){z.uuid().parse(id);const trek=(await store.read()).treks.find(t=>t.id===id);if(!trek)throw new DomainError('NOT_FOUND','Trail not found.',404);return trek;}
 @Get('feed') async feed(@Query() query:unknown){
   const q=feedSchema.parse(query);return store.feed(q.limit,decodeCursor(q.cursor));
 }
 @Get('group-treks') async trips(@Req() req:any){auth(req);return {items:(await store.read()).trips};}
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
