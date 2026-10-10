import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { seedDatabase } from '../apps/api/src/store';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL first.');
 if(process.env.NODE_ENV==='production'||process.env.DEMO_MODE!=='true')throw new Error('This command seeds demo data. Use DEMO_MODE=true in a development database only.');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const c=await pool.connect();
 try{
  await c.query('SELECT pg_advisory_lock(7421001)');
  const exists=await c.query("SELECT to_regclass('public.schema_migrations') AS name");
  let applied=false;if(exists.rows[0].name)applied=(await c.query('SELECT version FROM schema_migrations WHERE version=1')).rowCount===1;
  if(!applied)await c.query(await readFile(resolve('packages/database/migrations/001_initial.sql'),'utf8'));
  await seedDatabase(pool);console.log('Migration 001 applied; sample data seeded without overwriting existing records.');
 }finally{await c.query('SELECT pg_advisory_unlock(7421001)');c.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
