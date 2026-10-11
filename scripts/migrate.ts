import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { seedDatabase } from '../apps/api/src/store';
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL first.');
 if(process.env.NODE_ENV==='production')throw new Error('Production migration is not enabled yet.');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const c=await pool.connect();
 try{
  await c.query('SELECT pg_advisory_lock(7421001)');
  const exists=await c.query("SELECT to_regclass('public.schema_migrations') AS name");
  const versions=new Set<number>(exists.rows[0].name?(await c.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version):[]);
  const directory=resolve('packages/database/migrations');
  for(const file of (await readdir(directory)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort()){
    const version=Number(file.split('_')[0]);
    if(!versions.has(version))await c.query(await readFile(resolve(directory,file),'utf8'));
  }
  if(process.env.DEMO_MODE==='true')await seedDatabase(pool);
  console.log('Migrations applied. Demo seeding runs only with DEMO_MODE=true.');
 }finally{await c.query('SELECT pg_advisory_unlock(7421001)');c.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
