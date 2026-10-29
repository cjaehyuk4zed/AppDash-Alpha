import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('audit regressions with isolated workspace',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'AppDash audit '));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const base=`http://127.0.0.1:${port}`;let output='',session;
 const server=spawn(process.execPath,['server/main.mjs'],{env:{...process.env,APPDASH_DATA_DIR:dir,APPDASH_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
 t.after(async()=>{if(server.exitCode===null){await request('shutdown','POST',{}).catch(()=>{});if(server.exitCode===null)await new Promise(r=>server.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});});
 async function request(route,method='GET',data){const r=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-AppDash-Session':session||''},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
 async function good(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;}
 for(let i=0;i<100;i++){try{session=(await good('state')).session;break;}catch{await delay(100);}}assert.ok(session,output);
 const config=()=>({name:'감사 테스트',type:'automation',gateway:{adapter:'process',workingDirectory:dir,start:{executable:process.execPath,args:['-e','console.log("done")']},timeoutSeconds:5},tokenIds:[],connectionIds:[]});
 await t.test('split UTF-8 request preserves Korean configuration',async()=>{
  const payload=Buffer.from(JSON.stringify(config())),cut=payload.indexOf(Buffer.from('감'))+1;
  const result=await new Promise((resolve,reject)=>{const q=http.request(base+'/api/import',{method:'POST',headers:{'Content-Type':'application/json','X-AppDash-Session':session}},r=>{let data='';r.setEncoding('utf8');r.on('data',s=>data+=s);r.on('end',()=>resolve({status:r.statusCode,body:JSON.parse(data)}));});q.on('error',reject);q.write(payload.subarray(0,cut));setTimeout(()=>q.end(payload.subarray(cut)),60);});
  assert.equal(result.status,200);assert.equal(result.body.name,config().name);
 });
 await t.test('malformed configuration and NUL process parameters return validation errors',async()=>{
  const invalid=config();delete invalid.gateway.workingDirectory;
  for(const [route,value] of [['import',invalid],['connections',null],['tokens',null],['settings',null],['import',{...config(),gateway:{...config().gateway,start:{executable:process.execPath,args:['bad\0argument']}}}]])assert.equal((await request(route,route==='settings'?'PUT':'POST',value)).status,400,route);
 });
 await t.test('failed output directory creation ends the run and releases app lock',async()=>{
  const app=await good('apps','POST',config()),root=path.join(dir,'results');fs.writeFileSync(root,'blocked directory');
  try{assert.equal((await request(`apps/${app.id}/run`,'POST',{})).status,500);const run=(await good('state')).lastRuns[app.id];assert.equal(run.status,'failed');assert.ok(run.endedAt);}finally{fs.unlinkSync(root);}
  const run=await good(`apps/${app.id}/run`,'POST',{});for(let i=0;i<50;i++){if((await good('runs/'+run.id)).status==='succeeded')return;await delay(50);}assert.fail('app lock was not released');
 });
 await t.test('connection grants changed during token decryption block launch',async()=>{
  if(process.platform!=='win32')return;
  const tokens=[];for(let i=0;i<3;i++)tokens.push(await good('tokens','POST',{name:'scope '+i,envName:'AUDIT_SCOPE_'+i,value:'audit-scope-secret-'+i}));
  const connection=await good('connections','POST',{name:'scope connection',type:'api',url:'https://example.invalid',tokenId:tokens[0].id});
  const app=await good('apps','POST',{...config(),tokenIds:tokens.slice(1).map(t=>t.id),connectionIds:[connection.id]});
  const pending=request('apps/'+app.id+'/run','POST',{});await delay(50);await good('connections/'+connection.id,'PUT',{...connection,tokenId:''});
  const result=await pending;assert.equal(result.status,400);assert.match(result.body.error,/변경/);assert.equal((await good('state')).lastRuns[app.id].status,'blocked');
 });
 await t.test('multiline token values are masked in real process logs',async()=>{
  if(process.platform!=='win32')return;
  const secret='audit-line-one\naudit-line-two';const token=await good('tokens','POST',{name:'multiline',envName:'AUDIT_MULTILINE',value:secret});
  const app=await good('apps','POST',{...config(),tokenIds:[token.id],gateway:{...config().gateway,start:{executable:process.execPath,args:['-e','console.log(process.env.AUDIT_MULTILINE)']}}});
  const run=await good('apps/'+app.id+'/run','POST',{});for(let i=0;i<50;i++){const detail=await good('runs/'+run.id);if(detail.endedAt){assert.equal(detail.status,'succeeded');assert.match(detail.log,/REDACTED/);assert.ok(!detail.log.includes('audit-line'));return;}await delay(50);}assert.fail('run did not finish');
 });
 await t.test('concurrent token writes enforce uniqueness and cannot resurrect deleted tokens',async()=>{
  if(process.platform!=='win32')return;
  const value={name:'race',envName:'AUDIT_RACE_TOKEN',value:'audit-secret'};
  const results=await Promise.all([request('tokens','POST',value),request('tokens','POST',value)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400].sort());
  const token=results.find(r=>r.status<300).body;
  const pending=request('tokens/'+token.id,'PUT',{...value,value:'changed'});await delay(80);await good('tokens/'+token.id,'DELETE');assert.equal((await pending).status,400);assert.ok(!(await good('state')).tokens.some(t=>t.id===token.id));
 });
 await t.test('result root links cannot redirect new process output',async()=>{
  const app=await good('apps','POST',config()),root=path.join(dir,'results'),backup=path.join(dir,'results-backup'),outside=path.join(dir,'outside-results');
  fs.renameSync(root,backup);fs.mkdirSync(outside);fs.symlinkSync(outside,root,process.platform==='win32'?'junction':'dir');
  try{assert.equal((await request('apps/'+app.id+'/run','POST',{})).status,400);assert.equal((await good('state')).lastRuns[app.id].status,'failed');assert.deepEqual(fs.readdirSync(outside),[]);}finally{fs.unlinkSync(root);fs.renameSync(backup,root);}
 });
 await t.test('storage expiry uses workspace retention when the app record is absent',async()=>{
  await good('settings','PUT',{retentionDays:90});const id='audit-orphan',folder=path.join(dir,'results',id);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'saved.txt'),'archive');
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));
  db.prepare('INSERT INTO records VALUES (?,?,?)').run('runs',id,JSON.stringify({id,appId:'removed-app',status:'succeeded',endedAt:new Date(Date.now()-35*86400000).toISOString()}));db.close();
  const storage=await good('storage');assert.ok(storage.resultBytes>=7);assert.equal(storage.expiringBytes,0);
 });

});
