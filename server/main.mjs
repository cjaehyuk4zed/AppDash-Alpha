import { runHistory, runDetail } from './history.mjs';
import { preflight, inspectConnection, storageUsage } from './workspace.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { root, dataDir, baseUrl, port, defaults } from './config.mjs';
import { db, get, list, put, remove, settings } from './store.mjs';
import { check, appConfig, connectionConfig, scheduleConfig, envName, string } from './validation.mjs';
import { protect, publicToken, blockers, allowedTokens, tokenValue } from './vault.mjs';
import { Gateway, resultFiles, resultPath, cleanupResults } from './gateway.mjs';
import { startScheduler, nextDue } from './scheduler.mjs';
const gateway=new Gateway();const csrf=randomBytes(32).toString('hex');
const installation=createHash('sha256').update(root.toLowerCase()).digest('hex');
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function body(req){const chunks=[];let size=0;for await(const b of req){size+=b.length;check(size<=65536,'요청이 너무 큽니다.');chunks.push(b);}let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{check(false,'JSON 형식이 올바르지 않습니다.');}check(value&&typeof value==='object','JSON 객체 또는 배열이 필요합니다.');return value;}
function refs(app){for(const id of app.connectionIds)check(get('connections',id),'연결을 찾을 수 없습니다.');for(const id of app.tokenIds)check(get('tokens',id),'토큰을 찾을 수 없습니다.');const names=allowedTokens(app).map(id=>get('tokens',id)?.envName);check(new Set(names).size===names.length,'토큰 환경변수 이름이 충돌합니다.');}
function affected(kind,id){return list('apps').filter(a=>kind==='connections'?a.connectionIds.includes(id):allowedTokens(a).includes(id)).map(a=>({id:a.id,name:a.name,schedules:list('schedules').filter(s=>s.appId===a.id&&s.enabled).length}));}
function runState(){const all=list('runs'),lastRuns={};for(const r of all)if(!lastRuns[r.appId])lastRuns[r.appId]={...r,log:undefined,input:undefined};return {activeRuns:[...gateway.active.values()].map(a=>({...a.run,log:undefined,input:undefined})),lastRuns,runs:all.slice(0,500).map(r=>({...r,log:undefined}))};}
const server=http.createServer(async(req,res)=>{try{
 check(req.headers.host===`127.0.0.1:${port}`,'허용되지 않은 Host입니다.');
 const u=new URL(req.url,baseUrl), p=u.pathname.split('/').filter(Boolean);const method=req.method;
 if(req.headers.origin)check(req.headers.origin===baseUrl,'허용되지 않은 Origin입니다.');
 if(u.pathname==='/api/ready'&&method==='GET')return json(res,{product:'AppDash',installation,root,ready:!gateway.closing});
 if(p[0]==='api'&&p[1]==='runtime'&&p[2]==='tokens'&&p.length===4&&method==='POST'){
  const key=(req.headers.authorization||'').replace(/^Bearer /,'');const a=[...gateway.active.values()].find(a=>a.key===key&&key&&!a.ended&&!a.stopReason);check(a,'실행 권한이 만료되었습니다.');const app=get('apps',a.run.appId);check(app&&!app.archived,'현재 앱 설정에서 토큰 조회가 차단되었습니다.');const id=allowedTokens(app).find(id=>get('tokens',id)?.envName===decodeURIComponent(p[3]));check(id&&a.tokenIds.includes(id),'허용되지 않은 토큰입니다.');const value=await tokenValue(id);check(gateway.active.has(a.run.id)&&!a.stopReason,'실행 권한이 만료되었습니다.');const currentApp=get('apps',a.run.appId);check(currentApp&&!currentApp.archived&&allowedTokens(currentApp).includes(id)&&a.tokenIds.includes(id)&&get('tokens',id)?.envName===decodeURIComponent(p[3]),'현재 설정에서 토큰 접근이 취소되었습니다.');a.secrets.push(value);return json(res,{value});
 }
 if(p[0]==='api'){
  check(req.headers['sec-fetch-site']!=='cross-site','교차 사이트 요청입니다.');
  if(!['GET','HEAD'].includes(method))check(req.headers['x-appdash-session']===csrf,'관리 세션이 필요합니다.');
  if(u.pathname==='/api/state'&&method==='GET')return json(res,{session:csrf,apps:list('apps').map(a=>({...a,blockers:blockers(a)})),...runState(),schedules:list('schedules'),connections:list('connections'),tokens:list('tokens').map(publicToken),notifications:list('notifications').map(n=>{const r=n.runId?get('runs',n.runId):null,a=r?get('apps',r.appId):null;return {...n,appId:r?.appId,connectionIds:a?.connectionIds||[],tokenIds:a?allowedTokens(a):[]};}),settings:settings(),environment:{version:'1.0.0',node:process.version,timezone:'Asia/Seoul',dataDir,root,platform:process.platform,tokenStorage:process.platform==='win32'?'Windows DPAPI CurrentUser':'중앙 토큰 미지원'}});
  if(u.pathname==='/api/preflight'&&method==='POST')return json(res,preflight(await body(req)));
  if(u.pathname==='/api/storage'&&method==='GET')return json(res,storageUsage());
  if(u.pathname==='/api/import'&&method==='POST'){const d=settings();return json(res,appConfig({askInput:d.askInput,rememberInput:d.rememberInput,retentionDays:d.retentionDays,missedPolicy:d.missedPolicy,...await body(req)},{importOnly:true}));}
  if(p[1]==='apps'){
   if(p.length===2&&method==='POST'){const app=appConfig(await body(req));refs(app);const saved=put('apps',app);put('versions',{appId:saved.id,config:saved,createdAt:new Date().toISOString()});return json(res,saved,201);}
   const app=get('apps',p[2]);check(app,'앱이 없습니다.');
   if(p.length===3&&method==='PUT'){const next=appConfig(await body(req));refs(next);if(next.archived)for(const s of list('schedules').filter(s=>s.appId===app.id))put('schedules',{...s,enabled:false});const saved=put('apps',{...next,id:app.id});put('versions',{appId:app.id,config:saved,createdAt:new Date().toISOString()});return json(res,saved);}
   if(p[3]==='run'&&method==='POST')return json(res,await gateway.start(app.id,await body(req)));
   if(p[3]==='versions'&&method==='GET')return json(res,list('versions').filter(v=>v.appId===app.id));
   if(p[3]==='restore'&&method==='POST'){const {versionId,expectedConfig}=await body(req);if(expectedConfig)check(JSON.stringify(expectedConfig)===JSON.stringify(app),'설정이 변경되었습니다. 현재 설정과 다시 비교하세요.');const v=get('versions',versionId);check(v?.appId===app.id,'설정 버전이 없습니다.');const restored=appConfig(v.config);refs(restored);if(restored.archived)for(const s of list('schedules').filter(s=>s.appId===app.id))put('schedules',{...s,enabled:false});const saved=put('apps',{...restored,id:app.id});put('versions',{appId:app.id,config:saved,createdAt:new Date().toISOString()});return json(res,saved);}
   if(p[3]==='schedules'&&method==='PUT'){const data=await body(req);check(Array.isArray(data)&&data.length<=50,'예약은 최대 50개입니다.');const schedules=data.map(scheduleConfig);const keys=schedules.map(s=>JSON.stringify([s.repeat,s.repeat==='weekly'?s.days:[],s.time]));check(new Set(keys).size===keys.length,'같은 반복·요일·시각의 중복 예약입니다.');check(!app.archived||schedules.every(s=>!s.enabled),'보관된 앱의 예약은 활성화할 수 없습니다.');const old=list('schedules').filter(s=>s.appId===app.id);for(const s of schedules)if(s.id)check(old.some(o=>o.id===s.id),'예약 ID가 올바르지 않습니다.');check(new Set(schedules.map(s=>s.id).filter(Boolean)).size===schedules.filter(s=>s.id).length,'예약 ID가 중복되었습니다.');db.exec('BEGIN');try{for(const s of old)remove('schedules',s.id);for(const s of schedules)put('schedules',{...s,appId:app.id,nextAt:nextDue(s)});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,{ok:true});}
  }
  if(p[1]==='runs'&&p.length===2&&method==='GET')return json(res,runHistory(u.searchParams));
  if(p[1]==='runs'){const run=get('runs',p[2]);check(run,'실행이 없습니다.');if(p[3]==='stop'&&method==='POST'){await gateway.stop(run.id);return json(res,{ok:true});}if(p[3]==='log'&&method==='GET'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="${run.id}.log"`});res.end(run.log||'');return;}if(p[3]==='files'&&method==='GET')return json(res,resultFiles(run.id));if(p[3]==='download'&&method==='GET'){const name=u.searchParams.get('name');const full=resultPath(run.id,name);const file=await fs.promises.open(full,'r');const stream=file.createReadStream();stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(name))}`,'X-Content-Type-Options':'nosniff'});stream.pipe(res);return;}if(p.length===3&&method==='GET')return json(res,runDetail(run));}
  if(p[1]==='connections'){
   if(p.length===2&&method==='POST'){const c=connectionConfig(await body(req));check(!c.tokenId||get('tokens',c.tokenId),'토큰이 없습니다.');return json(res,put('connections',c));}
   const c=get('connections',p[2]);check(c,'연결이 없습니다.');if(p[3]==='impact')return json(res,affected('connections',c.id));
   if(method==='PUT'){const v=connectionConfig(await body(req));check(!v.tokenId||get('tokens',v.tokenId),'토큰이 없습니다.');return json(res,put('connections',{...v,id:c.id}));}
   if(method==='DELETE'){remove('connections',c.id);return json(res,{ok:true});}
   if(p[3]==='check'&&method==='POST')return json(res,await inspectConnection(c));
  }
  if(p[1]==='tokens'){
   if(p[3]==='impact')return json(res,affected('tokens',p[2]));
   if(method==='DELETE'){check(get('tokens',p[2]),'토큰이 없습니다.');remove('tokens',p[2]);return json(res,{ok:true});}
   if(method==='POST'||method==='PUT'){const v=await body(req),old=p[2]?get('tokens',p[2]):null;check(!p[2]||old,'토큰이 없습니다.');const name=string(v.name,'이름',120),provider=string(v.provider??'','서비스',120),variable=envName(v.envName);check(!list('tokens').some(t=>t.id!==old?.id&&t.envName===variable),'이미 사용 중인 환경변수 이름입니다.');check(!v.expiresAt||Number.isFinite(Date.parse(v.expiresAt)),'만료일이 올바르지 않습니다.');check(old||typeof v.value==='string'&&v.value.length>0,'토큰 원문이 필요합니다.');check(!v.value||typeof v.value==='string'&&v.value.length<=16000&&!v.value.includes('\0'),'토큰이 너무 깁니다.');const ciphertext=v.value?await protect(v.value):old.ciphertext;const current=old?get('tokens',old.id):null;check(!old||current&&JSON.stringify({...current,lastUsedAt:null})===JSON.stringify({...old,lastUsedAt:null}),'저장 중 토큰이 변경되거나 삭제되었습니다. 다시 시도하세요.');check(!list('tokens').some(t=>t.id!==old?.id&&t.envName===variable),'이미 사용 중인 환경변수 이름입니다.');const saved=put('tokens',{id:old?.id,name,provider,envName:variable,expiresAt:v.expiresAt||null,ciphertext,lastUsedAt:current?.lastUsedAt||null});return json(res,publicToken(saved));}
  }
  if(p[1]==='settings'&&method==='PUT'){const v=await body(req);for(const [key,value]of Object.entries(v)){check(key in defaults,'알 수 없는 설정입니다.');check(typeof value===typeof defaults[key],'설정 유형이 올바르지 않습니다.');}for(const k of ['homeCount','historyCount','retentionDays'])if(k in v)check(Number.isInteger(v[k])&&v[k]>=1&&v[k]<=(k==='retentionDays'?3650:500),'설정 범위를 확인하세요.');check(!v.missedPolicy||['skip','latest'].includes(v.missedPolicy),'누락 정책을 확인하세요.');return json(res,put('settings',{...settings(),...v,id:'workspace'}));}
  if(p[1]==='notifications'&&method==='POST'){for(const n of list('notifications').filter(n=>!p[2]||n.id===p[2]))put('notifications',{...n,read:true});return json(res,{ok:true});}
  if(p[1]==='shutdown'&&method==='POST'){json(res,{ok:true});setImmediate(()=>void shutdown());return;}
  return json(res,{error:'경로를 찾을 수 없습니다.'},404);
 }
 const downloads={'/downloads/appdash-gateway-config.json':['templates/appdash-gateway-config.json','appdash-gateway-config.json'],'/downloads/SKILL.md':['skills/appdash-create-app/SKILL.md','SKILL.md'],'/downloads/appdash-sdk.mjs':['sdk/appdash-sdk.mjs','appdash-sdk.mjs']};
 if(downloads[u.pathname]){const [file,name]=downloads[u.pathname];res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`});res.end(fs.readFileSync(path.join(root,file)));return;}
 if(u.pathname==='/schedule-time.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(root,'server/schedule-time.mjs')));return;}
 const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};const file=assets[u.pathname]|| (u.pathname==='/run'?'index.html':null);if(!file){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,'public',file)));
 }catch(e){if(!res.headersSent)json(res,{error:e.message},e.status||500);else res.end();}});
let stopping=false,stopScheduler=async()=>{},cleanup;
async function shutdown(){if(stopping)return;stopping=true;gateway.closing=true;clearInterval(cleanup);await stopScheduler();await gateway.close();await new Promise(resolve=>server.close(resolve));db.close();}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
server.on('error',async e=>{console.error(`AppDash 시작 실패: ${e.message}. 포트 ${port}와 로그를 확인하세요.`);await stopScheduler();clearInterval(cleanup);db.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{for(const run of list('runs'))if(['starting','running','stopping'].includes(run.status))put('runs',{...run,status:'interrupted',reason:'AppDash 재시작: 이전 프로세스 소유권을 인계하지 않습니다.',endedAt:new Date().toISOString()});stopScheduler=startScheduler(gateway);cleanup=setInterval(cleanupResults,3600000);cleanupResults();console.log(`AppDash ${baseUrl}\nData: ${dataDir}`);});
