import { spawn } from 'node:child_process';
import { envName, check } from './validation.mjs';
import { get, list, put } from './store.mjs';
export function protect(value,decrypt=false) {
 check(process.platform==='win32','중앙 토큰 저장은 Windows DPAPI에서만 지원합니다. 앱 자체 인증 또는 기존 환경변수를 사용하세요.');
 const script=`Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
 return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.resume();p.on('error',reject);p.on('exit',code=>code===0?resolve(decrypt?Buffer.from(out,'base64').toString('utf8'):out):reject(new Error('Windows 자격 증명 암호화에 실패했습니다.')));p.stdin.end(decrypt?value:Buffer.from(value).toString('base64'));});
}
export const publicToken = t => { const {ciphertext,...meta}=t;return {...meta,masked:'••••••••'}; };
export function allowedTokens(app) {return [...new Set([...app.tokenIds,...app.connectionIds.map(id=>get('connections',id)?.tokenId).filter(Boolean)])];}
export function tokenUsable(t) {return t&&(!t.expiresAt||new Date(t.expiresAt)>new Date());}
export function blockers(app) {const errors=[];if(app.archived)errors.push('보관된 앱입니다.'); for(const id of app.connectionIds){const c=get('connections',id);if(!c||c.paused)errors.push(`연결 중단 또는 해지: ${c?.name||id}`);if(c?.envRef&&!process.env[c.envRef])errors.push(`환경변수 누락: ${c.envRef}`);} const names=new Set();for(const id of allowedTokens(app)){const t=get('tokens',id);if(!tokenUsable(t))errors.push(`토큰 삭제 또는 만료: ${t?.name||id}`);else if(names.has(t.envName))errors.push(`토큰 변수 충돌: ${t.envName}`);else names.add(t.envName);}return errors;}
export async function tokenValue(id) { const t=get('tokens',id);check(tokenUsable(t),'토큰이 없거나 만료되었습니다.');envName(t.envName);const value=await protect(t.ciphertext,true);const current=get('tokens',id);check(tokenUsable(current)&&current.ciphertext===t.ciphertext,'조회 중 토큰이 변경되거나 삭제되었습니다. 다시 시도하세요.');put('tokens',{...current,lastUsedAt:new Date().toISOString()});return value; }
