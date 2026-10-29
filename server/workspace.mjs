import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './config.mjs';
import { appConfig } from './validation.mjs';
import { get, put, list, settings } from './store.mjs';
import { blockers, tokenUsable } from './vault.mjs';

export function preflight(value) {
 const app=appConfig(value,{importOnly:true});
 const checks=[];
 const add=(name,ok,message)=>checks.push({name,ok,message});
 const cwd=app.gateway.workingDirectory;
 add('작업 폴더',fs.existsSync(cwd)&&fs.statSync(cwd).isDirectory(),cwd);
 function checkExecutable(name,executable){
 const candidates=path.isAbsolute(executable)?[executable]:executable.includes('/')||executable.includes('\\')?[path.resolve(cwd,executable)]: (process.env.PATH||'').split(path.delimiter).flatMap(dir=>[path.join(dir,executable),...(process.platform==='win32'?(process.env.PATHEXT||'.EXE;.CMD;.BAT').split(';').map(ext=>path.join(dir,executable+ext)):[])]);
 add(name,candidates.some(file=>{try{return fs.statSync(file).isFile();}catch{return false;}}),executable);
 }
 checkExecutable('실행 파일',app.gateway.start.executable);
 if(app.gateway.uiStart?.executable)checkExecutable('앱 화면 실행 파일',app.gateway.uiStart.executable);
 if(app.type==='service'||app.gateway.uiStart?.executable){
  add('준비 확인 URL',!!app.gateway.healthUrl,'서비스의 실제 준비 여부를 확인할 URL을 권장합니다.');
  add('앱 접속 URL',!!app.gateway.openUrl,'서비스 화면을 새 탭에서 열 URL입니다.');
 }
 const errors=blockers(app);
 add('연결·토큰',!errors.length,errors.join(' · ')||'선택한 연결과 토큰을 사용할 수 있습니다.');
 return {checks,valid:checks.every(c=>c.ok),executed:false};
}

export async function inspectConnection(c) {
 const authValid=(!c.tokenId||tokenUsable(get('tokens',c.tokenId)))&&(!c.envRef||!!process.env[c.envRef]);
 const result={checkedAt:new Date().toISOString(),kind:c.healthUrl?'http':'configuration',authVerified:false,valid:authValid,message:authValid?'주소·인증 참조 확인 완료. 인증 성공 여부는 검증하지 않았습니다.':'토큰 누락·만료 또는 인증 환경변수 누락입니다.'};
 if(c.healthUrl){
  try{const response=await fetch(c.healthUrl,{signal:AbortSignal.timeout(5000),redirect:'error'});await response.body?.cancel();result.httpStatus=response.status;result.valid=authValid&&response.ok;result.message=`상태 확인 GET: HTTP ${response.status}. 인증 헤더 없이 응답만 확인했습니다.${authValid?'':' 인증 참조에 문제가 있습니다.'}`;}
  catch{result.valid=false;result.message='상태 확인 URL에 연결하지 못했습니다. 인증 성공 여부는 검증하지 않았습니다.';}
 }else result.message+=' 실제 요청·웹훅 전송은 하지 않았습니다.';
 const current=get('connections',c.id);
 if(current&&JSON.stringify([current.url,current.healthUrl,current.tokenId,current.envRef])===JSON.stringify([c.url,c.healthUrl,c.tokenId,c.envRef]))put('connections',{...current,lastCheck:result});
 return result;
}

export function storageUsage() {
 let resultBytes=0,expiringBytes=0,fileCount=0;
 const root=path.join(dataDir,'results');
 if(!fs.existsSync(root)||fs.lstatSync(root).isSymbolicLink())return {resultBytes,expiringBytes,fileCount};
 for(const run of list('runs')){
  const dir=path.join(root,run.id);
  if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink())continue;
  const days=get('apps',run.appId)?.retentionDays??settings().retentionDays;
  const expires=run.endedAt?new Date(run.endedAt).getTime()+days*86400000:Infinity;
  const soon=expires<=Date.now()+7*86400000;
  function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())walk(file);else if(entry.isFile()){const size=fs.statSync(file).size;resultBytes+=size;fileCount++;if(soon)expiringBytes+=size;}}}
  try{walk(dir);}catch{}
 }
 return {resultBytes,expiringBytes,fileCount};
}
