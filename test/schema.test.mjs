import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {url,flag,appConfig} from '../server/validation.mjs';
test('URL validation rejects coerced arrays, numbers and credentials',()=>{
 for(const value of [[],['https://example.test'],42,false,{},'https://u:p@example.test/','javascript:alert(1)'])assert.throws(()=>url(value),error=>error.status===400);
 assert.equal(url(undefined),'');assert.equal(url('http://127.0.0.1:4180/'),'http://127.0.0.1:4180/');
});
test('boolean fields never interpret the string false as enabled',()=>{
 assert.equal(flag(false,'flag'),false);assert.equal(flag(undefined,'flag'),false);
 for(const value of ['false','true',1,0,null,{}])assert.throws(()=>flag(value,'flag'),error=>error.status===400);
});

test('app import validates raw URL types before classifying a script',()=>{
 const base={name:'Script',type:'automation',gateway:{adapter:'process',workingDirectory:process.cwd(),start:{executable:process.execPath,args:[]}}};
 for(const value of [false,[],42])assert.throws(()=>appConfig({...base,gateway:{...base.gateway,openUrl:value}},{importOnly:true}),error=>error.status===400);
});

test('desktop retains its type, clears HTTP URLs and validates the instance flag',()=>{
 const base={name:'Desktop',type:'desktop',gateway:{adapter:'process',workingDirectory:process.cwd(),start:{executable:process.execPath,args:[]},openUrl:'http://127.0.0.1:1/',healthUrl:'http://127.0.0.1:1/'}};
 const app=appConfig(base,{importOnly:true});assert.equal(app.type,'desktop');assert.equal(app.allowMultipleInstances,false);assert.equal(app.gateway.openUrl,'');assert.equal(app.gateway.healthUrl,'');
 assert.equal(appConfig({...base,allowMultipleInstances:true},{importOnly:true}).allowMultipleInstances,true);
 for(const value of [null,'false','true',0,1,{},[]])assert.throws(()=>appConfig({...base,allowMultipleInstances:value},{importOnly:true}),e=>e.status===400);
});

test('workspace and downloadable app creation skills have the same three-type contract',()=>{
 const skill=fs.readFileSync('skills/appdash-create-app/SKILL.md','utf8');
 assert.equal(fs.readFileSync('.github/skills/appdash-create-app/SKILL.md','utf8'),skill);
 for(const text of ['desktop','allowMultipleInstances','launcher MUST remain alive','false','true'])assert.ok(skill.includes(text));
 const template=JSON.parse(fs.readFileSync('templates/appdash-gateway-config.json','utf8'));assert.equal(template.allowMultipleInstances,false);
});
