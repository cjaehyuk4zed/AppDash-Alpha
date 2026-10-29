import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { logFilter, boundedLog } from './log-filter.mjs';
import { dataDir, baseUrl } from './config.mjs';
import { list, get, put, notify, settings } from './store.mjs';
import { check } from './validation.mjs';
import { allowedTokens, blockers, tokenValue } from './vault.mjs';
export class Gateway {
 active=new Map(); locks=new Set(); closing=false; uiChecks=new Map(); uiStarts=new Map();
 async start(appId,input={},source='manual',extra={}) {
  check(!this.closing,'AppDash 종료 중입니다.');const storedApp=get('apps',appId);check(storedApp,'앱을 찾을 수 없습니다.');const purpose=extra.purpose==='ui'||storedApp.type==='service'?'ui':'task';const g=storedApp.gateway;check(purpose!=='ui'||storedApp.type==='service'||g.uiStart?.executable,'앱 화면 시작 명령이 설정되지 않았습니다.');const app=purpose==='ui'?{...storedApp,type:'service',gateway:{...g,healthUrl:g.healthUrl||g.openUrl,start:g.uiStart?.executable?g.uiStart:g.start,stop:g.uiStop?.executable?g.uiStop:storedApp.type==='service'?g.stop:{executable:'',args:[]}}}:storedApp;const lockKey=appId+':'+purpose;
  const existing=[...this.active.values()].find(a=>a.run.appId===appId&&a.run.purpose===purpose);
  if(existing&&app.type==='service')return existing.run;
  if(existing||this.locks.has(lockKey)){
   if(source==='schedule'){const blocked=put('runs',{appId,appName:app.name,status:'blocked',source,...extra,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),reason:'이 앱은 이미 실행 중입니다. 동시 실행 제한으로 예약을 실행하지 않았습니다.',log:''});notify(app.name+': 동시 실행 제한으로 예약이 차단되었습니다.',blocked.id);}
   check(false,'이 앱은 이미 실행 중입니다.');
  }this.locks.add(lockKey);
  let run;
  try {
   const errors=blockers(app);check(!errors.length,errors.join('\n'));
   check(input&&typeof input==='object'&&!Array.isArray(input)&&JSON.stringify(input).length<=16000,'실행 입력은 JSON 객체여야 합니다.');
   const actual={...app.inputDefaults,...input};check(JSON.stringify(actual).length<=16000,'기본값과 합쳐진 실행 입력은 16000자 이하여야 합니다.');
   const key=randomBytes(32).toString('hex');const secrets=[key];const injected={};const grants=allowedTokens(app).map(id=>get('tokens',id));const connectionConfig=()=>app.connectionIds.map(id=>{const {lastCheck,...c}=get('connections',id)||{};return c;});const connectionSnapshot=JSON.stringify(connectionConfig());
   for(const token of grants){injected[token.envName]=await tokenValue(token.id);secrets.push(injected[token.envName]);}
   check(!this.closing,'AppDash 종료 중입니다.');check(JSON.stringify(connectionConfig())===connectionSnapshot&&grants.every(t=>{const c=get('tokens',t.id);return c&&c.envName===t.envName&&c.ciphertext===t.ciphertext;}),'준비 중 연결 또는 토큰이 변경되었습니다. 다시 실행하세요.');check(JSON.stringify(get('apps',appId))===JSON.stringify(storedApp)&&!blockers(app).length,'준비 중 앱 설정 또는 권한이 변경되었습니다. 다시 실행하세요.');
   run=put('runs',{appId,appName:app.name,status:'starting',source,purpose,input:actual,startedAt:new Date().toISOString(),log:'',...extra});
   const resultRoot=path.join(dataDir,'results');fs.mkdirSync(resultRoot,{recursive:true});check(!fs.lstatSync(resultRoot).isSymbolicLink(),'결과 폴더에 링크를 사용할 수 없습니다.');const output=path.join(resultRoot,run.id);fs.mkdirSync(output,{recursive:true});
   const connections=app.connectionIds.map(id=>{const c=get('connections',id);return {id:c.id,name:c.name,type:c.type,url:c.url,authEnvName:c.tokenId?get('tokens',c.tokenId)?.envName:c.envRef};});
   const env={...process.env,...injected,APPDASH_APP_ID:appId,APPDASH_RUN_ID:run.id,APPDASH_INPUT_JSON:JSON.stringify(actual),APPDASH_OUTPUT_DIR:output,APPDASH_CONNECTIONS_JSON:JSON.stringify(connections),APPDASH_URL:baseUrl,APPDASH_TOKEN_ACCESS_KEY:key};
   const child=spawn(app.gateway.start.executable,app.gateway.start.args,{cwd:app.gateway.workingDirectory,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
   let done;const completed=new Promise(r=>done=r);const a={run,child,key,secrets,tokenIds:grants.map(t=>t.id),gatewaySnapshot:storedApp.gateway,stopCommand:app.gateway.stop,workingDirectory:app.gateway.workingDirectory,completed,ended:false,timers:[],stopReason:null};this.active.set(run.id,a);
   const redact=s=>{for(const secret of secrets.filter(Boolean).sort((x,y)=>y.length-x.length))s=s.split(secret).join('[REDACTED]');return s;};
   const append=s=>{if(!s)return;run.log=boundedLog(run.log+redact(s));put('runs',run);};
   const flushers=[];
   for(const stream of [child.stdout,child.stderr]){const filter=logFilter(secrets,append);stream.setEncoding('utf8');stream.on('data',s=>filter.write(s));flushers.push(()=>filter.end());}
   const finish=(code,error)=>{if(a.ended)return;a.ended=true;a.key=null;for(const t of a.timers)clearTimeout(t);flushers.forEach(f=>f());run.status=a.failure?'failed':a.stopReason?'stopped':error||code!==0?'failed':'succeeded';run.reason=a.stopReason||error|| (code!==0?`종료 코드 ${code}`:'');run.exitCode=code;run.endedAt=new Date().toISOString();put('runs',run);this.active.delete(run.id);if(run.status==='failed')notify(`${app.name}: ${run.reason}`,run.id);else if(settings().successNotifications&&run.status==='succeeded')notify(`${app.name} 실행 완료`,run.id,'success');done();};
   child.on('error',e=>finish(null,redact(e.message)));child.on('close',code=>finish(code));
   if(app.rememberInput&&(purpose==='task'||storedApp.type==='service'))put('apps',{...storedApp,inputDefaults:actual});
   if(app.type!=='service'){a.timers.push(setTimeout(()=>{a.failure=true;a.stopReason='제한 시간 초과';void this.kill(a);},app.gateway.timeoutSeconds*1000));run.status='running';put('runs',run);}
   else {void this.ready(a,app);}
   return run;
  } catch(e) {if(run&&!this.active.has(run.id)){put('runs',{...run,status:'failed',reason:e.message,endedAt:new Date().toISOString()});notify(`${app.name}: ${e.message}`,run.id);}if(!run){const failed=put('runs',{appId,appName:app.name,status:'blocked',source,...extra,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),reason:e.message,log:''});notify(`${app.name}: ${e.message}`,failed.id);}throw e;}
  finally{this.locks.delete(lockKey);}
 }

 async uiStatus(app,fresh=false){
  const owned=[...this.active.values()].find(a=>a.run.appId===app.id&&a.run.purpose==='ui');
  const configured=app.type==='service';
  const canStart=app.type==='service';
  if(owned)return {configured,canStart,status:owned.run.status,managed:true,runId:owned.run.id,url:owned.gatewaySnapshot?.openUrl||app.gateway.openUrl,restartRequired:!!owned.gatewaySnapshot&&JSON.stringify(owned.gatewaySnapshot)!==JSON.stringify(app.gateway)};
  if(!configured)return {configured:false,canStart:false,status:'stopped',managed:false};
  const url=app.gateway.healthUrl||app.gateway.openUrl,signature=JSON.stringify([url,canStart]);
  let cached=this.uiChecks.get(app.id);
  if(fresh||!cached||cached.signature!==signature||Date.now()-cached.at>2000){
   const promise=(async()=>{let online=false;if(url)try{const response=await fetch(url,{signal:AbortSignal.timeout(700),redirect:'error'});online=response.ok;await response.body?.cancel();}catch{}return {configured,canStart,status:online?'running':'stopped',managed:false};})();
   cached={signature,at:Date.now(),promise};this.uiChecks.set(app.id,cached);
  }
  return cached.promise;
 }
 async ensureUi(appId,wait=true){
  check(!this.closing,'AppDash 종료 중입니다.');let pending=this.uiStarts.get(appId);
  if(!pending){
   pending=(async()=>{const app=get('apps',appId);check(app,'앱이 없습니다.');check(!app.archived,'보관된 앱입니다.');check(app.type==='service','자동화 스크립트는 실행 패널에서 실행하세요.');check(app.gateway.openUrl||!wait,'앱 접속 URL을 앱 관리에서 설정하세요.');const status=await this.uiStatus(app,true);
    if(status.status==='running')return {url:status.url||app.gateway.openUrl,runId:status.runId,managed:status.managed};
    check(status.canStart,'앱 화면이 종료되어 있습니다. 앱 화면 시작 명령을 설정하세요.');check(JSON.stringify(get('apps',appId))===JSON.stringify(app),'준비 중 앱 설정이 변경되었습니다. 다시 열어 주세요.');
    const run=await this.start(appId,{},'manual',{purpose:'ui'});return {url:app.gateway.openUrl,runId:run.id,managed:true};
   })();this.uiStarts.set(appId,pending);
  }
  let result;try{result=await pending;}finally{if(this.uiStarts.get(appId)===pending)this.uiStarts.delete(appId);}
  if(wait&&result.runId){
   let run=get('runs',result.runId);
   while(run?.status==='starting'&&!this.closing){await new Promise(resolve=>setTimeout(resolve,100));run=get('runs',result.runId);}
   check(run?.status==='running'&&!this.closing,run?.reason||'앱 화면을 시작하지 못했습니다.');
  }
  return result;
 }
 async stopUi(appId){
  const owned=[...this.active.values()].find(a=>a.run.appId===appId&&a.run.purpose==='ui');
  check(owned,'AppDash에서 시작한 앱만 종료할 수 있습니다. 외부에서 시작한 앱은 해당 앱에서 종료하세요.');
  await this.stop(owned.run.id);this.uiChecks.delete(appId);
 }

 async ready(a,app){const deadline=Date.now()+app.gateway.readinessSeconds*1000;while(!a.ended&&!a.stopReason&&Date.now()<deadline){if(!app.gateway.healthUrl){a.run.status='running';put('runs',a.run);return;}try{const r=await fetch(app.gateway.healthUrl,{signal:AbortSignal.timeout(1500),redirect:'error'});await r.body?.cancel();if(r.ok&&!a.ended&&!a.stopReason){a.run.status='running';put('runs',a.run);return;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!a.ended&&!a.stopReason){a.failure=true;a.stopReason='서비스 준비 확인 시간 초과';await this.kill(a);}}
 async kill(a){if(a.ended)return;if(process.platform==='win32'){await new Promise(resolve=>{const p=spawn('taskkill.exe',['/PID',String(a.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('error',resolve);p.on('close',resolve);});}else{try{process.kill(-a.child.pid,'SIGTERM');}catch{}const t=setTimeout(()=>{try{process.kill(-a.child.pid,'SIGKILL');}catch{}},1500);a.timers.push(t);}await a.completed;}
 async stop(id,reason='사용자가 종료했습니다.'){const a=this.active.get(id);check(a,'현재 AppDash가 소유한 실행이 아닙니다.');if(a.stopping)return a.completed;a.stopping=true;a.stopReason=reason;a.run.status='stopping';put('runs',a.run);const cmd=a.stopCommand;if(cmd?.executable){await new Promise(resolve=>{const p=spawn(cmd.executable,cmd.args,{cwd:a.workingDirectory,shell:false,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{p.kill();resolve();},3000);p.on('error',()=>{clearTimeout(timer);resolve();});p.on('close',()=>{clearTimeout(timer);resolve();});});}await this.kill(a);}
 async close(){this.closing=true;while(this.locks.size)await new Promise(r=>setTimeout(r,20));await Promise.all([...this.active.keys()].map(id=>this.stop(id,'AppDash 종료')));}
}
export function resultFiles(runId){check(get('runs',runId),'실행이 없습니다.');const dir=path.join(dataDir,'results',runId);if(!fs.existsSync(dir))return [];check(!fs.lstatSync(dir).isSymbolicLink()&&fs.realpathSync(dir).startsWith(fs.realpathSync(dataDir)+path.sep),'결과 폴더가 외부 경로를 가리킵니다.');const files=[];function walk(folder,prefix=''){for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.isSymbolicLink())continue;const full=path.join(folder,e.name),rel=prefix+e.name;if(e.isDirectory())walk(full,rel+'/');else if(e.isFile())files.push({name:rel,size:fs.statSync(full).size});if(files.length>=1000)return;}}walk(dir);return files;}
export function resultPath(runId,name){check(typeof name==='string'&&!name.includes('\\')&&!name.split('/').some(s=>s==='..'||s==='.'),'잘못된 결과 경로입니다.');check(resultFiles(runId).some(f=>f.name===name),'결과 파일이 없습니다.');const dir=fs.realpathSync(path.join(dataDir,'results',runId));const full=fs.realpathSync(path.join(dir,name));check(full.startsWith(dir+path.sep),'결과 경로를 벗어났습니다.');return full;}
export function cleanupResults(){for(const r of list('runs')){if(!r.endedAt||r.resultsExpired)continue;const days=get('apps',r.appId)?.retentionDays??settings().retentionDays;if(Date.now()-new Date(r.endedAt)>days*86400000){const dir=path.join(dataDir,'results',r.id);if(fs.existsSync(dir)){if(fs.lstatSync(dir).isSymbolicLink()||!fs.realpathSync(dir).startsWith(fs.realpathSync(dataDir)+path.sep))continue;fs.rmSync(dir,{recursive:true,force:true});}put('runs',{...r,resultsExpired:true});}}}
