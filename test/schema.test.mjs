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
