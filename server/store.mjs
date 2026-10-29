import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDir, defaults } from './config.mjs';
fs.mkdirSync(dataDir, { recursive: true });
const lockPath=path.join(dataDir,'server.lock');
const lockId=randomUUID();
function acquire(){try{fs.writeFileSync(lockPath,JSON.stringify({pid:process.pid,id:lockId}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(fs.readFileSync(lockPath,'utf8'));}catch{throw new Error('데이터 잠금 파일을 확인하세요: '+lockPath);}let alive=true;try{process.kill(owner.pid,0);}catch(err){if(err.code==='ESRCH')alive=false;}if(alive)throw new Error('이 데이터 폴더를 사용하는 AppDash가 이미 실행 중입니다.');fs.unlinkSync(lockPath);fs.writeFileSync(lockPath,JSON.stringify({pid:process.pid,id:lockId}),{flag:'wx'});}}
acquire();
process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(lockPath,'utf8')).id===lockId)fs.unlinkSync(lockPath);}catch{}});
export const db = new DatabaseSync(path.join(dataDir, 'appdash.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS occurrences (schedule_id TEXT NOT NULL, due TEXT NOT NULL, PRIMARY KEY(schedule_id,due));
PRAGMA user_version=1;`);
export const list = kind => db.prepare('SELECT body FROM records WHERE kind=? ORDER BY rowid DESC').all(kind).map(r => JSON.parse(r.body));
export const get = (kind,id) => { const r = db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind,id); return r ? JSON.parse(r.body) : null; };
export function put(kind, body) { const record = { ...body, id: body.id || randomUUID() }; db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind,record.id,JSON.stringify(record)); return record; }
export const remove = (kind,id) => db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id);
export const settings = () => ({ ...defaults, ...get('settings','workspace') });
export function notify(message, runId, level='error') { put('notifications',{ message,runId,level,read:false,createdAt:new Date().toISOString() }); for (const n of list('notifications').slice(300)) remove('notifications',n.id); }
