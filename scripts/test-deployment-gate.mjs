import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";

let status=200;
let rows=[];
const server=createServer((_req,res)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(rows));});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const run=(environment)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/check-deploy-schema.mjs'],{
    env:{...process.env,VERCEL_ENV:environment,SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:'test'},stdio:'pipe',
  });
  let output=''; child.stdout.on('data',(data)=>{output+=data;});child.stderr.on('data',(data)=>{output+=data;});
  child.on('error',reject);child.on('close',(code)=>resolve({code,output}));
});
try {
  assert.equal((await run('preview')).code,0);
  assert.notEqual((await run('production')).code,0);
  rows=readdirSync('supabase/migrations').filter((name)=>name.endsWith('.sql')).map((name)=>({name}));
  assert.equal((await run('production')).code,0);
  status=503;
  assert.notEqual((await run('production')).code,0);
  console.log('✓ Deployment gate blocks missing migrations and database outages; preview builds stay isolated');
} finally { await new Promise((resolve)=>server.close(resolve)); }
