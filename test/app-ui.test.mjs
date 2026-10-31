import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
test('web/script lifecycle and legacy compatibility migration',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'AppDash categories ')),port=await freePort(),base='http://127.0.0.1:'+port;
 let child,exited,session,agent,log='';
 async function request(route,method='GET',body){return new Promise((resolve,reject)=>{const q=http.request(base+'/api/'+route,{method,agent,headers:{'Content-Type':'application/json','X-AppDash-Session':session||''}},r=>{let data='';r.setEncoding('utf8');r.on('data',b=>data+=b);r.on('error',reject);r.on('end',()=>{try{resolve({status:r.statusCode,body:JSON.parse(data)});}catch(e){reject(e);}});});q.on('error',reject);q.end(body===undefined?undefined:JSON.stringify(body));});}
 async function good(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;}
 async function launch(){agent=new http.Agent({keepAlive:true});child=spawn(process.execPath,['server/main.mjs'],{env:{...process.env,APPDASH_DATA_DIR:directory,APPDASH_PORT:String(port)},stdio:['ignore','pipe','pipe']});exited=new Promise(r=>child.once('exit',r));child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);for(let i=0;i<100;i++){try{session=(await good('state')).session;return;}catch{if(child.exitCode!==null)throw Error(log);await delay(60);}}throw Error(log);}
 async function stop(){if(child?.exitCode===null){await good('shutdown','POST',{});agent.destroy();await exited;}}
 t.after(async()=>{try{await stop();}finally{agent?.destroy();if(child?.exitCode===null){child.kill();await exited;}fs.rmSync(directory,{recursive:true,force:true});}});
 await launch();const uiPort=await freePort(),url='http://127.0.0.1:'+uiPort;
 const script={name:'Script',type:'scheduled',gateway:{adapter:'process',workingDirectory:directory,start:{executable:process.execPath,args:['-e',"console.log('script complete')"]},timeoutSeconds:10}};
 const uiCommand={executable:process.execPath,args:['--input-type=module','-e',"import http from 'node:http';http.createServer((q,r)=>r.end('ready')).listen("+uiPort+",'127.0.0.1');"]};
 let automation,service,uiRun;
 await t.test('legacy scheduled scripts become automation and legacy UI commands become services',async()=>{
  automation=await good('apps','POST',script);assert.equal(automation.type,'automation');
  service=await good('apps','POST',{...script,name:'UI Service',gateway:{...script.gateway,uiStart:uiCommand,openUrl:url,healthUrl:url,readinessSeconds:1}});
  assert.equal(service.type,'service');assert.deepEqual(service.gateway.start,uiCommand);assert.equal(service.gateway.uiStart,undefined);
  const noUi=await good('import','POST',{...script,type:'service'});assert.equal(noUi.type,'automation');
 });
 await t.test('service cards start and reuse the real UI server',async()=>{
  const opened=await good('apps/'+service.id+'/open-ui','POST',{});uiRun=opened.runId;assert.equal(opened.url,url);
  assert.equal((await good('apps/'+service.id+'/start-ui','POST',{})).runId,uiRun);
  assert.equal((await good('apps/'+service.id+'/run','POST',{})).id,uiRun);
  assert.equal((await good('state')).uiStates[service.id].status,'running');
 });
 await t.test('editing a running service preserves its actual UI URL and prevents type changes',async()=>{
  const changed=await good('apps/'+service.id,'PUT',{...service,gateway:{...service.gateway,openUrl:url+'/new-ui'}});
  const state=await good('state');assert.equal(state.uiStates[service.id].restartRequired,true);assert.equal(state.uiStates[service.id].url,url);
  assert.equal((await good('apps/'+service.id+'/open-ui','POST',{})).url,url);
  assert.equal((await request('apps/'+service.id,'PUT',{...changed,gateway:{...changed.gateway,openUrl:'',healthUrl:''}})).status,400);
  service=await good('apps/'+service.id,'PUT',service);
 });
 await t.test('AppDash accepts reservations only for automation scripts',async()=>{
  const rule={repeat:'daily',time:'00:00',days:[],enabled:true};
  assert.equal((await request('apps/'+service.id+'/schedules','PUT',[rule])).status,400);
  assert.equal((await request('apps/'+automation.id+'/start-ui','POST',{})).status,400);
  await good('apps/'+automation.id+'/schedules','PUT',[rule]);
  const schedule=(await good('state')).schedules.find(s=>s.appId===automation.id);
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(directory,'appdash.sqlite'));
  db.prepare("UPDATE records SET body=? WHERE kind='schedules' AND id=?").run(JSON.stringify({...schedule,nextAt:new Date(Date.now()-500).toISOString()}),schedule.id);db.close();
  let run;for(let i=0;i<40;i++){run=(await good('state')).runs.find(r=>r.appId===automation.id&&r.source==='schedule');if(run)break;await delay(100);}assert.ok(run);assert.equal(run.purpose,'task');assert.equal((await good('state')).uiStates[service.id].runId,uiRun);
  await good('apps/'+automation.id+'/schedules','PUT',[]);
 });
 await t.test('external UI cannot be terminated and owned UI stops cleanly',async()=>{
  const external=http.createServer((q,r)=>r.end('external'));await new Promise(r=>external.listen(0,'127.0.0.1',r));
  try{const externalUrl='http://127.0.0.1:'+external.address().port;const app=await good('apps','POST',{...service,name:'External',gateway:{...service.gateway,healthUrl:externalUrl,openUrl:externalUrl}});
   assert.equal((await good('apps/'+app.id+'/open-ui','POST',{})).managed,false);assert.equal((await request('apps/'+app.id+'/stop-ui','POST',{})).status,400);
  }finally{external.closeAllConnections();await new Promise(r=>external.close(r));}
  await good('apps/'+service.id+'/stop-ui','POST',{});assert.equal((await good('state')).uiStates[service.id].status,'stopped');
 });
 await t.test('startup migrates old database definitions and safely disables service schedules',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(directory,'appdash.sqlite'));
  const legacy={...automation,id:'legacy-ui',type:'scheduled',gateway:{...automation.gateway,openUrl:url,healthUrl:url,uiStart:uiCommand}};
  db.prepare('INSERT INTO records VALUES (?,?,?)').run('apps',legacy.id,JSON.stringify(legacy));
  db.prepare('INSERT INTO records VALUES (?,?,?)').run('schedules','legacy-schedule',JSON.stringify({id:'legacy-schedule',appId:legacy.id,repeat:'daily',time:'00:00',days:[],enabled:true,nextAt:new Date().toISOString()}));db.close();
  await stop();await launch();const state=await good('state'),migrated=state.apps.find(a=>a.id===legacy.id);assert.equal(migrated.type,'service');assert.deepEqual(migrated.gateway.start,uiCommand);assert.ok(!state.schedules.some(s=>s.appId===legacy.id));
  const inspect=new DatabaseSync(path.join(directory,'appdash.sqlite'));assert.equal(JSON.parse(inspect.prepare("SELECT body FROM records WHERE kind='schedules' AND id='legacy-schedule'").get().body).enabled,false);inspect.close();
  assert.ok((await good('apps/'+legacy.id+'/versions')).some(v=>v.config.type==='scheduled'));
 });
});
