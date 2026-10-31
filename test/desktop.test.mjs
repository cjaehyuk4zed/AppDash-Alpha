import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';

test('desktop process ownership, multiple instances, stopping and persistence',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'AppDash desktop '));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const base='http://127.0.0.1:'+port;
 let server,exited,agent,session,output='',external;
 async function request(route,method='GET',data){return new Promise((resolve,reject)=>{const q=http.request(base+'/api/'+route,{method,agent,headers:{'Content-Type':'application/json','X-AppDash-Session':session||''}},r=>{let text='';r.setEncoding('utf8');r.on('data',s=>text+=s);r.on('end',()=>{try{resolve({status:r.statusCode,body:JSON.parse(text)});}catch(e){reject(e);}});});q.on('error',reject);q.end(data===undefined?undefined:JSON.stringify(data));});}
 async function good(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;}
 async function launch(){agent=new http.Agent({keepAlive:true});server=spawn(process.execPath,['server/main.mjs'],{env:{...process.env,APPDASH_DATA_DIR:directory,APPDASH_PORT:String(port)},stdio:['ignore','pipe','pipe']});exited=new Promise(r=>server.once('exit',r));server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{session=(await good('state')).session;return;}catch{if(server.exitCode!==null)throw Error(output);await delay(50);}}throw Error('startup: '+output);}
 async function shutdown(){if(server?.exitCode===null){await good('shutdown','POST',{});agent.destroy();await exited;}}
 t.after(async()=>{try{await shutdown();}finally{if(external?.exitCode===null){const exit=new Promise(r=>external.once('exit',r));external.kill();await exit;}agent?.destroy();if(server?.exitCode===null){server.kill();await exited;}fs.rmSync(directory,{recursive:true,force:true});}});
 const worker=path.join(directory,'desktop fixture.mjs');
 fs.writeFileSync(worker,"import fs from 'node:fs';import path from 'node:path';const id=process.env.APPDASH_RUN_ID;console.log('instance '+id+' pid '+process.pid);setInterval(()=>{if(fs.existsSync(path.join(process.cwd(),id+'.close'))){console.log('window closed '+id);process.exit(0);}},40);");
 const config={name:'Desktop fixture',type:'desktop',gateway:{adapter:'process',workingDirectory:directory,start:{executable:process.execPath,args:[worker]},stop:{executable:'',args:[]},openUrl:'http://127.0.0.1:1/',healthUrl:'http://127.0.0.1:1/',timeoutSeconds:1,readinessSeconds:1}};
 let single,multiple,first;
 await launch();
 await t.test('desktop has no HTTP checks or automation timeout and default concurrent clicks reuse one instance',async()=>{
  single=await good('apps','POST',config);assert.equal(single.type,'desktop');assert.equal(single.allowMultipleInstances,false);assert.equal(single.gateway.openUrl,'');assert.equal(single.gateway.healthUrl,'');
  const starts=await Promise.all(Array.from({length:4},()=>good('apps/'+single.id+'/start-desktop','POST',{})));first=starts[0].runId;assert.equal(new Set(starts.map(r=>r.runId)).size,1);assert.equal(starts.filter(r=>!r.alreadyRunning).length,1);
  await delay(1200);const state=await good('state');assert.equal(state.uiStates[single.id].status,'running');assert.equal(state.uiStates[single.id].instanceCount,1);
  const run=await good('runs/'+first);assert.equal(run.purpose,'desktop');assert.ok(run.log.includes(first));assert.equal(run.status,'running');
  assert.equal((await request('apps/'+single.id+'/open-ui','POST',{})).status,400);assert.equal((await request('apps/'+single.id+'/start-ui','POST',{})).status,400);assert.equal((await request('apps/'+single.id+'/schedules','PUT',[])).status,400);
 });
 await t.test('closing an owned app naturally completes just its run',async()=>{
  fs.writeFileSync(path.join(directory,first+'.close'),'');
  for(let i=0;i<50;i++){if((await good('runs/'+first)).endedAt)break;await delay(50);}
  assert.equal((await good('runs/'+first)).status,'succeeded');assert.equal((await good('state')).uiStates[single.id].instanceCount,0);
 });
 await t.test('multiple simultaneous clicks get independent processes and logs',async()=>{
  multiple=await good('apps','POST',{...config,name:'Multiple desktops',allowMultipleInstances:true});
  const starts=await Promise.all(Array.from({length:4},()=>good('apps/'+multiple.id+'/start-desktop','POST',{})));
  assert.equal(new Set(starts.map(s=>s.runId)).size,4);assert.ok(starts.every(s=>!s.alreadyRunning));
  let state;for(let i=0;i<50;i++){state=await good('state');if((await Promise.all(starts.map(s=>good('runs/'+s.runId)))).every(r=>r.log.includes(r.id)))break;await delay(50);}
  assert.equal(state.uiStates[multiple.id].instanceCount,4);
  const pids=[];for(const s of starts){const r=await good('runs/'+s.runId);assert.ok(r.log.includes(s.runId));pids.push(r.log.match(/pid (\d+)/)?.[1]);}
  assert.equal(new Set(pids).size,4);assert.ok(pids.every(Boolean));
 });
 await t.test('stop all blocks starts throughout shutdown and never kills an unrelated process',async()=>{
  const slowStop={executable:process.execPath,args:['-e','setTimeout(()=>{},900)']};
  multiple=await good('apps/'+multiple.id,'PUT',{...multiple,gateway:{...multiple.gateway,stop:slowStop}});
  // Restart fixture instances so their immutable stop-command snapshot includes the delay.
  await good('apps/'+multiple.id+'/stop-desktop','POST',{});
  await Promise.all([good('apps/'+multiple.id+'/start-desktop','POST',{}),good('apps/'+multiple.id+'/start-desktop','POST',{})]);
  external=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
  const stopping=good('apps/'+multiple.id+'/stop-desktop','POST',{});
  for(let i=0;i<50;i++){if((await good('state')).uiStates[multiple.id].status==='stopping')break;await delay(10);}
  const rejected=await Promise.all(Array.from({length:3},()=>request('apps/'+multiple.id+'/start-desktop','POST',{})));assert.ok(rejected.every(r=>r.status===400&&r.body.error.includes('종료 중')));
  await Promise.all([stopping,good('apps/'+multiple.id+'/stop-desktop','POST',{})]);
  const state=await good('state');assert.equal(state.uiStates[multiple.id].instanceCount,0);assert.ok(!state.activeRuns.some(r=>r.appId===multiple.id));assert.equal(external.exitCode,null);
  assert.ok(state.runs.filter(r=>r.appId===multiple.id&&r.purpose==='desktop').every(r=>r.status==='stopped'&&r.endedAt));
 });

 await t.test('stop all cancels a start still preparing and blocks a new request until it settles',{skip:process.platform!=='win32'},async()=>{
  const token=await good('tokens','POST',{name:'Isolated desktop fixture',envName:'DESKTOP_FIXTURE_TOKEN',value:'non-secret-test-value'});
  const app=await good('apps','POST',{...config,name:'Preparing desktop',tokenIds:[token.id]});
  const launching=request('apps/'+app.id+'/start-desktop','POST',{});
  let preparing=false;for(let i=0;i<80;i++){const status=(await good('state')).uiStates[app.id];if(status.pendingCount>0){preparing=true;break;}await delay(5);}
  assert.ok(preparing,'fixture must observe preparation before stop');
  const stopping=good('apps/'+app.id+'/stop-desktop','POST',{});
  for(let i=0;i<80;i++){if((await good('state')).uiStates[app.id].status==='stopping')break;await delay(5);}
  assert.equal((await request('apps/'+app.id+'/start-desktop','POST',{})).status,400);
  const rejected=await launching;assert.equal(rejected.status,400);assert.ok(rejected.body.error.includes('종료 중'));
  await stopping;const state=await good('state');assert.equal(state.uiStates[app.id].status,'stopped');assert.ok(!state.activeRuns.some(r=>r.appId===app.id));
 });
 await t.test('instance policy persists in versions and restores; conversion and restore disable old schedules',async()=>{
  const versions=await good('apps/'+single.id+'/versions');const saved=await good('apps/'+single.id,'PUT',{...single,allowMultipleInstances:true});assert.equal(saved.allowMultipleInstances,true);
  const restored=await good('apps/'+single.id+'/restore','POST',{versionId:versions[0].id});assert.equal(restored.allowMultipleInstances,false);
  const desktopVersion=(await good('apps/'+single.id+'/versions'))[0].id;
  const script=await good('apps/'+single.id,'PUT',{...single,type:'automation'});
  const rule={repeat:'daily',time:'09:00',days:[],enabled:true};await good('apps/'+single.id+'/schedules','PUT',[rule]);
  await good('apps/'+single.id,'PUT',{...script,type:'desktop'});assert.ok(!(await good('state')).schedules.some(s=>s.appId===single.id));
  const db=new DatabaseSync(path.join(directory,'appdash.sqlite'));assert.ok(db.prepare("SELECT body FROM records WHERE kind='schedules'").all().map(r=>JSON.parse(r.body)).filter(s=>s.appId===single.id).every(s=>!s.enabled));db.close();
  await good('apps/'+single.id,'PUT',script);await good('apps/'+single.id+'/schedules','PUT',[rule]);await good('apps/'+single.id+'/restore','POST',{versionId:desktopVersion});
  const inspect=new DatabaseSync(path.join(directory,'appdash.sqlite'));assert.ok(inspect.prepare("SELECT body FROM records WHERE kind='schedules'").all().map(r=>JSON.parse(r.body)).filter(s=>s.appId===single.id).every(s=>!s.enabled));inspect.close();
 });
 await t.test('restart preserves desktop configuration and migrates missing default without dropping old data',async()=>{
  const db=new DatabaseSync(path.join(directory,'appdash.sqlite'));const legacy={...single};delete legacy.allowMultipleInstances;db.prepare("UPDATE records SET body=? WHERE kind='apps' AND id=?").run(JSON.stringify(legacy),single.id);db.close();
  await shutdown();await launch();const state=await good('state'),app=state.apps.find(a=>a.id===single.id);assert.equal(app.type,'desktop');assert.equal(app.allowMultipleInstances,false);assert.ok(state.runs.some(r=>r.id===first));assert.equal(state.uiStates[single.id].status,'stopped');
 });
});
