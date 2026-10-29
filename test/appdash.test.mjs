import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { nextDue, latestDue, matches } from '../server/schedule-time.mjs';

test('Seoul schedules: weekdays, weekly, next time and latest missed occurrence',()=>{
 const s={repeat:'weekdays',time:'09:00',days:[]};
 assert.equal(nextDue(s,new Date('2026-10-30T01:00:00Z')),'2026-11-02T00:00:00.000Z');
 assert.equal(latestDue(s,new Date('2026-11-01T01:00:00Z')),'2026-10-30T00:00:00.000Z');
 assert.equal(nextDue({repeat:'weekly',time:'00:00',days:[0]},new Date('2026-10-30T00:00:00Z')),'2026-10-31T15:00:00.000Z');
 assert.equal(matches(s,new Date('2026-10-29T00:00:00Z')),true);
});
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('real Windows/local integration, isolated data, execution and security',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'AppDash 한글 space '));const port=await freePort(),base=`http://127.0.0.1:${port}`;let child,session,output='';
 async function launch(){child=spawn(process.execPath,['server/main.mjs'],{env:{...process.env,APPDASH_DATA_DIR:dir,APPDASH_PORT:String(port)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/ready')).ok)return;}catch{}await delay(100);}throw new Error(output);}
 async function api(route,method='GET',data,headers={}){const r=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-AppDash-Session':session||'',...headers},body:data===undefined?undefined:JSON.stringify(data)});let b;try{b=await r.json();}catch{}return {status:r.status,b};}
 const good=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify(r));return r.b;};
 const config=(code,type='automation',g={})=>({name:'테스트 앱',description:'isolated',type,group:'테스트',gateway:{adapter:'process',workingDirectory:dir,start:{executable:process.execPath,args:['--input-type=module','-e',code]},stop:{executable:'',args:[]},healthUrl:'',openUrl:'',timeoutSeconds:type==='service'&&!g.healthUrl&&!g.openUrl?60:5,readinessSeconds:2,openUrl:g.openUrl||g.healthUrl||'',...g},tokenIds:[],connectionIds:[]});
 async function waitRun(id){for(let i=0;i<150;i++){const r=await good('runs/'+id);if(!['starting','running','stopping'].includes(r.status))return r;await delay(100);}throw new Error('Run did not finish');}
 async function stop(){if(child?.exitCode===null){await good('shutdown','POST',{});await new Promise(r=>child.once('exit',r));}}
 t.after(async()=>{try{await stop();}finally{if(child?.exitCode===null)child.kill();fs.rmSync(dir,{recursive:true,force:true});}});
 await launch();let s=await good('state');session=s.session;
 await t.test('empty workspace and request forgery protection',async()=>{assert.equal(s.apps.length,0);assert.equal(s.tokens.length,0);assert.equal(s.connections.length,0);assert.equal((await api('apps','POST',config(''),{'X-AppDash-Session':''})).status,400);assert.equal((await api('state','GET',undefined,{Origin:'https://evil.test'})).status,400);assert.equal(await new Promise((resolve,reject)=>{const q=http.get(base+'/api/state',{headers:{Host:'evil.test'}},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);}),400);assert.equal((await api('apps','POST',config('', 'bogus'))).status,400);});
 let task;
 await t.test('import validation does not register or execute; shipped files identical',async()=>{const template=JSON.parse(fs.readFileSync('templates/appdash-gateway-config.json','utf8'));await good('settings','PUT',{retentionDays:45,askInput:true});const imported=await good('import','POST',template);assert.equal(imported.retentionDays,45);assert.equal(imported.askInput,true);await good('settings','PUT',{retentionDays:30,askInput:false});assert.equal((await good('state')).apps.length,0);assert.equal(await (await fetch(base+'/downloads/appdash-gateway-config.json')).text(),fs.readFileSync('templates/appdash-gateway-config.json','utf8'));assert.equal(await (await fetch(base+'/downloads/SKILL.md')).text(),fs.readFileSync('skills/appdash-create-app/SKILL.md','utf8'));});
 await t.test('real successful process, UTF-8 paths, logs and result downloads',async()=>{task=await good('apps','POST',config(`import fs from 'node:fs'; fs.writeFileSync(process.env.APPDASH_OUTPUT_DIR+'/결과.txt','결과');console.log('hello',process.env.APPDASH_APP_ID,process.env.APPDASH_INPUT_JSON);`));const run=await good(`apps/${task.id}/run`,'POST',{value:1});const finished=await waitRun(run.id);assert.equal(finished.status,'succeeded');assert.match(finished.log,/hello/);assert.match(finished.log,/"value":1/);const files=await good(`runs/${run.id}/files`);assert.equal(files[0].name,'결과.txt');assert.equal(await(await fetch(base+`/api/runs/${run.id}/download?name=${encodeURIComponent('결과.txt')}`)).text(),'결과');assert.equal((await api(`runs/${run.id}/download?name=../appdash.sqlite`)).status,400);});
 await t.test('failing process, timeout, own process stop and concurrency limit',async()=>{const fail=await good('apps','POST',config("console.error('oops');process.exit(3)"));const r=await waitRun((await good(`apps/${fail.id}/run`,'POST',{})).id);assert.equal(r.exitCode,3);assert.equal(r.status,'failed');const slow=await good('apps','POST',config('setInterval(()=>{},1000)','automation',{timeoutSeconds:1}));const run=await good(`apps/${slow.id}/run`,'POST',{});assert.equal((await api(`apps/${slow.id}/run`,'POST',{})).status,400);const timed=await waitRun(run.id);assert.match(timed.reason,/제한 시간/);assert.equal(timed.status,'failed');assert.ok((await good('state')).notifications.some(n=>n.runId===run.id));});
 let service;
 await t.test('persistent service health readiness, duplicate reuse and stop',async()=>{const servicePort=await freePort();service=await good('apps','POST',config(`import http from 'node:http';http.createServer((q,r)=>r.end('ready')).listen(${servicePort},'127.0.0.1');`,'service',{healthUrl:`http://127.0.0.1:${servicePort}`,openUrl:`http://127.0.0.1:${servicePort}`}));const run=await good(`apps/${service.id}/run`,'POST',{});assert.equal((await good(`apps/${service.id}/run`,'POST',{})).id,run.id);for(let i=0;i<50;i++){if((await good('runs/'+run.id)).status==='running')break;await delay(100);}assert.equal((await good('runs/'+run.id)).status,'running');await good(`runs/${run.id}/stop`,'POST',{});assert.equal((await good('runs/'+run.id)).status,'stopped');assert.equal((await api(`runs/${run.id}/stop`,'POST',{})).status,400);});
 await t.test('readiness failure and immediate shutdown during health polling',async()=>{const a=await good('apps','POST',config('setInterval(()=>{},1000)','service',{healthUrl:'http://127.0.0.1:1'}));const r=await good(`apps/${a.id}/run`,'POST',{});const timeout=await waitRun(r.id);assert.match(timeout.reason,/준비 확인/);assert.equal(timeout.status,'failed');await good(`apps/${a.id}/run`,'POST',{});await stop();await launch();session=(await good('state')).session;assert.ok(!(await good('state')).runs.some(r=>r.status==='running'));});
 await t.test('multiple schedules: edit, duplicate reject, archive and restore',async()=>{await good(`apps/${task.id}/schedules`,'PUT',[{repeat:'daily',time:'09:00',days:[],enabled:true},{repeat:'weekly',time:'10:00',days:[1,3],enabled:true}]);assert.equal((await good('state')).schedules.filter(s=>s.appId===task.id).length,2);const dup={repeat:'daily',time:'09:00',days:[],enabled:true};assert.equal((await api(`apps/${task.id}/schedules`,'PUT',[dup,dup])).status,400);await good('apps/'+task.id,'PUT',{...task,archived:true});assert.ok((await good('state')).schedules.filter(s=>s.appId===task.id).every(s=>!s.enabled));assert.equal((await api(`apps/${task.id}/run`,'POST',{})).status,400);const vs=await good(`apps/${task.id}/versions`);await good(`apps/${task.id}/restore`,'POST',{versionId:vs.at(-1).id});assert.ok((await good('state')).schedules.filter(s=>s.appId===task.id).every(s=>!s.enabled));});
 await t.test('webhook validation sends nothing, pause blocks and resume preserves config',async()=>{let requests=0;const hook=httpServer();function httpServer(){const s=net.createServer(c=>{requests++;c.end();});return s;}await new Promise(r=>hook.listen(0,'127.0.0.1',r));try{const c=await good('connections','POST',{name:'webhook',type:'webhook',url:`http://127.0.0.1:${hook.address().port}`,healthUrl:''});await good(`connections/${c.id}/check`,'POST',{});assert.equal(requests,0);assert.equal((await good('state')).connections.find(x=>x.id===c.id).lastCheck.kind,'configuration');await good('apps/'+task.id,'PUT',{...task,connectionIds:[c.id]});await good('connections/'+c.id,'PUT',{...c,paused:true});assert.equal((await api(`apps/${task.id}/run`,'POST',{})).status,400);assert.equal((await good(`connections/${c.id}/impact`))[0].id,task.id);await good('connections/'+c.id,'PUT',{...c,paused:false});assert.equal((await waitRun((await good(`apps/${task.id}/run`,'POST',{})).id)).status,'succeeded');}finally{hook.close();}});
 await t.test('DPAPI encryption, selective injection, split log masking, fresh access, rotation and revocation',async()=>{if(process.platform!=='win32'){assert.equal((await api('tokens','POST',{name:'x',envName:'EXAMPLE_TOKEN',value:'secret'})).status,400);return;}const secret='AppDash_secret_abcdef123456';const token=await good('tokens','POST',{name:'test',provider:'test',envName:'EXAMPLE_TOKEN',value:secret});assert.equal(token.ciphertext,undefined);assert.equal(token.value,undefined);assert.ok(!JSON.stringify(await good('state')).includes(secret));assert.equal((await api('tokens','POST',{name:'bad',envName:'PATH',value:'x'})).status,400);const app=await good('apps','POST',{...config(`const token=process.env.EXAMPLE_TOKEN;console.log(token.slice(0,9));process.stdout.write(token.slice(0,9));setTimeout(()=>{console.log(token.slice(9));},30);console.log(process.env.APPDASH_TOKEN_ACCESS_KEY);console.log(process.env.EXAMPLE_TOKEN?'injected':'absent');setInterval(()=>{},1000);`,'service'),tokenIds:[token.id]});const run=await good(`apps/${app.id}/run`,'POST',{});await delay(300);const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));const saved=JSON.parse(db.prepare("SELECT body FROM records WHERE kind='tokens'").get().body);assert.ok(!saved.ciphertext.includes(secret));db.close();const own=await good('runs/'+run.id);assert.ok(!own.log.includes(secret));assert.match(own.log,/REDACTED/);assert.match(own.log,/injected/);assert.equal((await api('runtime/tokens/EXAMPLE_TOKEN','POST',{}, {Authorization:'Bearer invalid'})).status,400);await good('tokens/'+token.id,'PUT',{...token,value:'replacement'});await good('tokens/'+token.id,'DELETE');assert.equal((await api(`apps/${app.id}/run`,'POST',{})).status,400);await good(`runs/${run.id}/stop`,'POST',{});assert.equal((await api(`apps/${app.id}/run`,'POST',{})).status,400);});
 await t.test('runtime token scope, fresh rotation, expiry and ended-run denial',async()=>{
  if(process.platform!=='win32')return;
  const token=await good('tokens','POST',{name:'runtime',envName:'RUNTIME_TEST_TOKEN',value:'initial-secret'});
  const other=await good('tokens','POST',{name:'other',envName:'OTHER_TEST_TOKEN',value:'other-secret'});
  const a=await good('apps','POST',{...config(`import fs from 'node:fs';fs.writeFileSync('test-access-key',process.env.APPDASH_TOKEN_ACCESS_KEY);console.log(process.env.OTHER_TEST_TOKEN||'no-other-token');process.stdout.write(process.env.RUNTIME_TEST_TOKEN.slice(0,5));setTimeout(()=>console.log(process.env.RUNTIME_TEST_TOKEN.slice(5)),25);setInterval(()=>{},1000);`,'service'),tokenIds:[token.id]});
  const run=await good(`apps/${a.id}/run`,'POST',{});
  for(let i=0;i<50&&!fs.existsSync(path.join(dir,'test-access-key'));i++)await delay(50);
  const key=fs.readFileSync(path.join(dir,'test-access-key'),'utf8'),headers={Authorization:'Bearer '+key};
  const conn=await good('connections','POST',{name:'pause test',type:'api',url:'http://127.0.0.1:1',tokenId:token.id});
  await good('apps/'+a.id,'PUT',{...a,connectionIds:[conn.id]});
  await good('connections/'+conn.id,'PUT',{...conn,paused:true});
  assert.equal((await api('runtime/tokens/RUNTIME_TEST_TOKEN','POST',{},headers)).b.value,'initial-secret');
  const blocked=await good('apps','POST',{...a,id:undefined,name:'blocked new run',connectionIds:[conn.id]});
  assert.equal((await api('apps/'+blocked.id+'/run','POST',{})).status,400);
  await good('connections/'+conn.id,'PUT',{...conn,paused:false});
  assert.equal((await api('runtime/tokens/RUNTIME_TEST_TOKEN','POST',{},headers)).b.value,'initial-secret');
  assert.equal((await api('runtime/tokens/OTHER_TEST_TOKEN','POST',{},headers)).status,400);
  await good('tokens/'+token.id,'PUT',{...token,value:'rotated-secret'});
  assert.equal((await api('runtime/tokens/RUNTIME_TEST_TOKEN','POST',{},headers)).b.value,'rotated-secret');
  await delay(100);const log=(await good('runs/'+run.id)).log;assert.match(log,/no-other-token/);assert.ok(!log.includes('initial-secret'));assert.match(log,/REDACTED/);
  await good('tokens/'+token.id,'PUT',{...token,expiresAt:'2000-01-01'});const check=await good('connections/'+conn.id+'/check','POST',{});assert.equal(check.valid,false);assert.equal(check.authVerified,false);assert.equal((await good('state')).connections.find(c=>c.id===conn.id).lastCheck.valid,false);
  assert.equal((await api('runtime/tokens/RUNTIME_TEST_TOKEN','POST',{},headers)).status,400);
  await good(`runs/${run.id}/stop`,'POST',{});
  assert.equal((await api('runtime/tokens/RUNTIME_TEST_TOKEN','POST',{},headers)).status,400);
  await good('tokens/'+other.id,'DELETE');
 });
 await t.test('durable scheduled execution claims suppress duplicate occurrences',async()=>{
  const a=await good('apps','POST',{...config("console.log('scheduled')",'scheduled'),missedPolicy:'latest'});
  const local=new Date(Date.now()+9*3600000).toISOString().slice(11,16);
  await good(`apps/${a.id}/schedules`,'PUT',[{repeat:'daily',time:local,days:[],enabled:true}]);
  const schedule=(await good('state')).schedules.find(s=>s.appId===a.id);
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));
  const forceDue=()=>{const s=JSON.parse(db.prepare("SELECT body FROM records WHERE kind='schedules' AND id=?").get(schedule.id).body);s.nextAt=new Date(Date.now()-120000).toISOString();db.prepare("UPDATE records SET body=? WHERE kind='schedules' AND id=?").run(JSON.stringify(s),s.id);};
  forceDue();let runs=[];for(let i=0;i<40;i++){runs=(await good('state')).runs.filter(r=>r.appId===a.id);if(runs.length)break;await delay(100);}assert.equal(runs.length,1);assert.equal(runs[0].source,'schedule');await waitRun(runs[0].id);
  forceDue();await delay(1300);assert.equal((await good('state')).runs.filter(r=>r.appId===a.id).length,1);db.close();
 });
 await t.test('preflight never executes; active state survives 500 newer runs; busy schedule is recorded',async()=>{
  const checked=await good('preflight','POST',config("throw new Error('must not run')"));assert.equal(checked.executed,false);assert.ok(checked.checks.find(c=>c.name==='실행 파일').ok);
  const a=await good('apps','POST',config('setInterval(()=>{},1000)','automation',{timeoutSeconds:30}));
  const run=await good('apps/'+a.id+'/run','POST',{});
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));
  for(let i=0;i<505;i++)db.prepare("INSERT INTO records VALUES ('runs',?,?)").run('filler-'+i,JSON.stringify({id:'filler-'+i,appId:'fixture',status:'succeeded',startedAt:new Date().toISOString()}));
  const state=await good('state');assert.equal(state.runs.length,500);assert.ok(!state.runs.some(r=>r.id===run.id));assert.ok(state.activeRuns.some(r=>r.id===run.id));assert.equal(state.lastRuns[a.id].id,run.id);
  await good('apps/'+a.id+'/schedules','PUT',[{repeat:'daily',time:'09:00',days:[],enabled:true}]);const schedule=(await good('state')).schedules.find(s=>s.appId===a.id);schedule.nextAt=new Date().toISOString();db.prepare("UPDATE records SET body=? WHERE kind='schedules' AND id=?").run(JSON.stringify(schedule),schedule.id);
  let blockedRun;for(let i=0;i<40;i++){blockedRun=(await good('state')).runs.find(r=>r.appId===a.id&&r.source==='schedule');if(blockedRun)break;await delay(100);}assert.equal(blockedRun.status,'blocked');assert.match(blockedRun.reason,/동시 실행/);db.close();await good('runs/'+run.id+'/stop','POST',{});
  const notices=(await good('state')).notifications;await good('notifications/'+notices[0].id,'POST',{});assert.equal((await good('state')).notifications.find(n=>n.id===notices[0].id).read,true);
  const storage=await good('storage');assert.ok(storage.resultBytes>0);assert.ok(storage.fileCount>0);
 });
 await t.test('DUMMY APP runs, saves results and archives through ordinary app APIs',async()=>{
  const a=await good('apps','POST',{...config(''),name:'DUMMY APP',type:'scheduled',gateway:{adapter:'process',workingDirectory:path.resolve('examples/dummy-app'),start:{executable:process.execPath,args:['main.mjs']},stop:{executable:'',args:[]},healthUrl:'',openUrl:'',timeoutSeconds:10,readinessSeconds:20}});
  assert.notEqual(a.id,'dummy-app');const run=await good('apps/'+a.id+'/run','POST',{report:'검증 보고서'});assert.equal((await waitRun(run.id)).status,'succeeded');const files=await good('runs/'+run.id+'/files');assert.deepEqual(files.map(f=>f.name).sort(),['report.md','summary.json']);
  await good('apps/'+a.id,'PUT',{...a,description:'수정된 앱',archived:true});assert.equal((await good('state')).apps.find(x=>x.id===a.id).archived,true);assert.equal((await api('apps/'+a.id+'/run','POST',{})).status,400);await good('apps/'+a.id,'PUT',{...a,archived:false});assert.equal((await good('state')).apps.find(x=>x.id===a.id).archived,false);
 });
 await t.test('history filters span all records, use Seoul dates and validate pages',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));
  const samples=[['history-before','2026-10-29T14:59:59.000Z','failed','manual'],['history-midnight','2026-10-29T15:00:00.000Z','failed','manual'],['history-after','2026-10-29T17:00:00.000Z','succeeded','schedule']];
  for(const [id,startedAt,status,source] of samples)db.prepare("INSERT INTO records VALUES ('runs',?,?)").run(id,JSON.stringify({id,appId:'history-fixture',appName:'History',startedAt,endedAt:new Date(Date.parse(startedAt)+12000).toISOString(),status,source,log:'private log',input:{notInList:true}}));db.close();
  const filtered=await good('runs?appId=history-fixture&from=2026-10-30&to=2026-10-30&pageSize=1');assert.equal(filtered.total,2);assert.equal(filtered.pageCount,2);assert.equal(filtered.items[0].log,undefined);assert.equal(filtered.items[0].input,undefined);
  const second=await good('runs?appId=history-fixture&from=2026-10-30&to=2026-10-30&pageSize=1&page=2');assert.notEqual(filtered.items[0].id,second.items[0].id);
  const status=await good('runs?appId=history-fixture&status=failed&source=manual&from=2026-10-30&to=2026-10-30');assert.equal(status.total,1);assert.equal(status.items[0].id,'history-midnight');
  assert.ok((await good('runs?page=2&pageSize=500')).items.length>0);
  for(const query of ['page=0','pageSize=501','status=invalid','from=2026-02-31','from=2026-10-31&to=2026-10-30'])assert.equal((await api('runs?'+query)).status,400);
 });
 await t.test('run detail retains execution input, exposes expiry and downloads masked log',async()=>{
  const run=await good('apps/'+task.id+'/run','POST',{report:'original input'});await waitRun(run.id);const detail=await good('runs/'+run.id);assert.deepEqual(detail.input,{report:'original input'});assert.equal(Date.parse(detail.resultExpiresAt)-Date.parse(detail.endedAt),detail.retentionDays*86400000);
  const download=await fetch(base+'/api/runs/'+run.id+'/log');assert.equal(download.headers.get('cache-control'),'no-store');assert.ok(download.headers.get('content-disposition').includes(run.id+'.log'));assert.equal(await download.text(),detail.log);
  const versions=await good('apps/'+task.id+'/versions');assert.equal((await api('apps/'+task.id+'/restore','POST',{versionId:versions[0].id,expectedConfig:{name:'stale'}})).status,400);const {blockers,...expectedConfig}=(await good('state')).apps.find(a=>a.id===task.id);await good('apps/'+task.id+'/restore','POST',{versionId:versions[0].id,expectedConfig});
 });
 await t.test('symlink result roots are rejected',async()=>{
  const run=await good(`apps/${task.id}/run`,'POST',{});await waitRun(run.id);const result=path.join(dir,'results',run.id),outside=path.join(dir,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'private.txt'),'private');fs.rmSync(result,{recursive:true});fs.symlinkSync(outside,result,process.platform==='win32'?'junction':'dir');try{assert.equal((await api(`runs/${run.id}/files`)).status,400);assert.equal((await api(`runs/${run.id}/download?name=private.txt`)).status,400);}finally{fs.unlinkSync(result);}
 });
 await t.test('restart preserves metadata, recovers interrupted runs and expires only owned results',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(dir,'appdash.sqlite'));
  const insert=(id,record)=>db.prepare("INSERT INTO records VALUES ('runs',?,?)").run(id,JSON.stringify({id,appId:task.id,appName:task.name,...record}));
  insert('test-interrupted',{status:'running',startedAt:new Date().toISOString()});
  insert('test-old',{status:'succeeded',endedAt:'2000-01-01',startedAt:'2000-01-01'});fs.mkdirSync(path.join(dir,'results','test-old'));fs.writeFileSync(path.join(dir,'results','test-old','old.txt'),'expired');db.close();
  const before=await good('state');await stop();await launch();session=(await good('state')).session;const after=await good('state');assert.equal(after.apps.length,before.apps.length);assert.equal(after.connections.length,before.connections.length);assert.ok(after.connections.every(c=>['api','webhook'].includes(c.type)));assert.equal((await good('runs/test-interrupted')).status,'interrupted');assert.equal((await good('runs/test-old')).resultsExpired,true);assert.ok(!fs.existsSync(path.join(dir,'results','test-old')));
 });
});
