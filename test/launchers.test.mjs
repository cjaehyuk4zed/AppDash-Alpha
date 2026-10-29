import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('server and Windows launchers reject invalid ports before starting',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'AppDash ports '));
 try{
  for(const port of ['nope','0','65536','1.5']){const result=spawnSync(process.execPath,['--input-type=module','-e',"import './server/config.mjs'"],{env:{...process.env,APPDASH_PORT:port},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/APPDASH_PORT/);}
  if(process.platform==='win32')for(const script of ['Start','Stop']){const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',`scripts/${script}-AppDash.ps1`],{env:{...process.env,APPDASH_PORT:'invalid',APPDASH_DATA_DIR:dir},encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(result.status,1);assert.match(result.stdout,/APPDASH_PORT must be an integer/);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
