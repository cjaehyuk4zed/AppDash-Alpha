import { nextDue } from '../server/schedule-time.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fixtureApp={id:'dummy-app',name:'DUMMY APP',type:'scheduled',group:'개인 업무',favorite:true,archived:false,blockers:[],connectionIds:[],tokenIds:[],gateway:{},inputDefaults:{}};

function ui() {
 const source=fs.readFileSync('public/app.js','utf8');
 const app={innerHTML:''};const dialog={innerHTML:'',showModal(){}};
 const location={hash:'#home',search:'',pathname:'/',port:'4175',replace:url=>location.redirect=url};
 const context=vm.createContext({nextDue,fixtureApp,URLSearchParams,location,console,assert,
  document:{querySelector:s=>s==='#app'?app:s==='#dialog'?dialog:null},
 });
 vm.runInContext(source.slice(0,source.indexOf("$('#dialog').addEventListener('cancel'")).replace(/^import .*\n/,''),context);
 vm.runInContext(`state={session:'test',apps:[],runs:[],activeRuns:[],lastRuns:{},schedules:[],connections:[],tokens:[],notifications:[],settings:{homeStats:true,homeCount:6,historyCount:50,tags:true},environment:{root:'C:\\Apps',dataDir:'C:\\Data',version:'1',node:'24',platform:'win32'}};`,context);
 return {context,source,app,dialog,location};
}

test('home removes banner; dashboard menu is between home and apps',()=>{
 const {context,app}=ui();vm.runInContext('render()',context);
 assert.ok(!app.innerHTML.includes('A LITTLE SPACE'));
 assert.ok(app.innerHTML.indexOf('data-nav="home"')<app.innerHTML.indexOf('data-nav="dashboard"'));
 assert.ok(app.innerHTML.indexOf('data-nav="dashboard"')<app.innerHTML.indexOf('data-nav="apps"'));
 vm.runInContext("page='dashboard';render()",context);assert.ok(app.innerHTML.includes('확인이 필요한 항목'));
});
test('registration folds advanced options and offers non-executing checks',()=>{
 const {context}=ui();vm.runInContext(`const form=appForm();assert.ok(form.includes('설정 점검 (실행하지 않음)'));assert.ok(form.includes('<details class="advanced">'));assert.equal((form.match(/name="executable"/g)||[]).length,1);for(const t of Object.values(appTypes)){assert.ok(form.includes('>'+t.label+'</option>'));}`,context);
});
test('favorites toggles as a button; archive follows connect outside filters',async()=>{
 const {context}=ui();
 await vm.runInContext(`(async()=>{
  page='apps';state.apps=[{...fixtureApp},{...fixtureApp,id:'other',name:'Other',favorite:false}];
  const html=apps(),split=html.indexOf('<div class="filters">');
  assert.ok(html.slice(0,split).includes('앱 연결하기</button><button data-action="archive-filter">'));
  assert.ok(!html.slice(split).includes('data-action="archive-filter"'));
  assert.ok(!html.includes('id="favoritesOnly"'));
  assert.ok(html.includes('aria-pressed="false">즐겨찾기만</button>'));
  await addedClick({dataset:{action:'toggle-favorites'}});
  assert.ok(apps().includes('aria-pressed="true">즐겨찾기만</button>'));
  assert.ok(!apps().includes('<h3>Other</h3>'));
  await addedClick({dataset:{action:'toggle-favorites'}});
  assert.ok(apps().includes('<h3>Other</h3>'));
 })()`,context);
});
test('DUMMY APP uses the regular UI and API without preview exceptions',async()=>{
 const {context,app}=ui();await vm.runInContext(`(async()=>{state.apps=[fixtureApp];render();assert.ok(!document.querySelector('#app').innerHTML.includes('미리보기'));query='does not exist';assert.ok(apps().includes('검색 조건에 맞는 앱이 없습니다'));assert.ok(apps().includes('필터 초기화'));let called='';fetch=async(url,options)=>{called=url+':'+options.method;return {ok:true,json:async()=>({id:'dummy-app'})}};await api('apps/dummy-app','PUT',{name:'DUMMY APP'});assert.equal(called,'/api/apps/dummy-app:PUT');})()`,context);
});

test('optional labels, unread filtering and individual read actions',()=>{
 const {context,dialog}=ui();vm.runInContext(`connectionModal();`,context);assert.ok(dialog.innerHTML.includes('상태 확인 URL (선택)'));assert.ok(!dialog.innerHTML.includes('· 선택'));
 vm.runInContext('tokenModal()',context);assert.ok(dialog.innerHTML.includes('만료일 (선택)'));
 vm.runInContext(`state.notifications=[{id:'a',message:'new',read:false,level:'error'},{id:'b',message:'old',read:true,level:'success'}];unreadOnly=true;const html=notifications();assert.ok(html.includes('data-read-notification="a"'));assert.ok(!html.includes('<strong>old</strong>'));`,context);
});
test('service detail stays on logs; only launching a service redirects',async()=>{
 const {context,source,app,location}=ui();
 vm.runInContext(`const logNodes={};const priorQuery=document.querySelector;document.querySelector=selector=>{if(selector==='#runView')return null;if(['#runStatus','#runMeta','#runReason','#runLog','#logMatches','#stopRun','#rerunButton','#resultExpiry','#resultFiles'].includes(selector))return logNodes[selector]??=( {innerHTML:'',textContent:'',scrollTop:31,scrollLeft:7} );return priorQuery(selector);};`,context);
 const start=source.indexOf('let runId=new URLSearchParams');const end=source.indexOf('let poll;',start);
 vm.runInContext(source.slice(start,end),context);
 await vm.runInContext(`(async()=>{state.apps=[{id:'svc',type:'service',gateway:{openUrl:'http://127.0.0.1:9999'}}];runId='real-run';api=async url=>url.endsWith('/files')?[]:{id:'real-run',appId:'svc',appName:'Service',status:'running',log:'log content'};autoOpen=false;await renderRun();})()`,context);
 assert.equal(location.redirect,undefined);assert.ok(vm.runInContext("logNodes['#runLog'].innerHTML.includes('log content')",context));assert.ok(app.innerHTML.includes('앱 UI 열기'));assert.equal(vm.runInContext("logNodes['#runLog'].scrollTop",context),31);
 await vm.runInContext('autoOpen=true;renderRun()',context);assert.equal(location.redirect,'http://127.0.0.1:9999');
});
test('management tabs preserve one set of editable fields; version diff ignores runtime metadata',()=>{
 const {context}=ui();vm.runInContext(`
 const html=appForm(fixtureApp);
 assert.equal((html.match(/role="tabpanel"/g)||[]).length,4);
 assert.equal((html.match(/name="name"/g)||[]).length,1);
 assert.equal((html.match(/name="executable"/g)||[]).length,1);
 assert.ok(html.includes('연결·토큰'));assert.ok(html.includes('등록 설정 이력'));
 const changes=configChanges({id:'a',blockers:[],name:'Before',gateway:{start:{args:['a']}}},{id:'b',name:'After',gateway:{start:{args:['b']}}});
 assert.equal(changes.length,2);assert.equal(changes[1].name,'gateway.start.args');
 `,context);
});
test('dirty form cancellation keeps edits; accepted discard clears the guard',async()=>{
 const {context}=ui();await vm.runInContext(`(async()=>{
 const form={values:[['name','original']]};const oldQuery=document.querySelector;
 document.querySelector=selector=>selector==='#dialog #appForm'?form:oldQuery(selector);
 FormData=class{constructor(f){this.entries=()=>f.values[Symbol.iterator]();}};
 markDialogClean();assert.equal(dialogDirty(),false);form.values[0][1]='edited';assert.equal(dialogDirty(),true);
 confirmDiscard=async()=>false;assert.equal(await discardChanges(),false);assert.equal(dialogDirty(),true);assert.equal(form.values[0][1],'edited');
 confirmDiscard=async()=>true;assert.equal(await discardChanges(),true);assert.equal(dialogDirty(),false);
 })()`,context);
});
test('schedule drafts show only applicable days, disabled status and summary',()=>{
 const {context,dialog}=ui();vm.runInContext(`state.apps=[fixtureApp];scheduleApp=fixtureApp.id;scheduleDraft=[{repeat:'daily',time:'09:00',days:[],enabled:true},{repeat:'weekly',time:'18:30',days:[1,3],enabled:false}];drawSchedule();`,context);
 assert.equal((dialog.innerHTML.match(/class="days"/g)||[]).length,1);assert.ok(dialog.innerHTML.includes('매주 월·수 18:30'));assert.ok(dialog.innerHTML.includes('중단됨'));
 vm.runInContext(`assert.equal(scheduleNextText({repeat:'weekly',time:'09:00',days:[],enabled:true}),'요일·시각을 확인하세요.');`,context);
});
test('log search treats special characters literally and escapes HTML',()=>{
 const {context}=ui();vm.runInContext(`
 const result=highlightedLog('<script>[x].*</script> [x].*','[x].*');
 assert.equal(result.count,2);assert.ok(!result.html.includes('<script>'));assert.ok(result.html.includes('<mark>[x].*</mark>'));
 assert.equal(highlightedLog('ABC abc','abc').count,2);
 `,context);
});
test('rerun requires confirmation, retains the previous input and warns for legacy records',()=>{
 const {context,dialog}=ui();vm.runInContext(`state.apps=[{...fixtureApp,inputDefaults:{current:2}}];runDetails={appId:fixtureApp.id,input:{previous:1}};confirmRerun();`,context);
 assert.ok(dialog.innerHTML.includes('확인 후 재실행'));assert.ok(dialog.innerHTML.includes('&quot;previous&quot;: 1'));assert.ok(!dialog.innerHTML.includes('이전 실행 입력이 저장되지 않아'));
 vm.runInContext(`runDetails={appId:fixtureApp.id};confirmRerun();`,context);assert.ok(dialog.innerHTML.includes('이전 실행 입력이 저장되지 않아'));
});

test('invalid fields reveal the management tab and collapsed advanced options',()=>{
 const {context}=ui();vm.runInContext(`
  let selected;selectManagementTab=key=>selected=key;
  const details={open:false,parentElement:null};
  const panel={id:'manage-panel-execution',hidden:true};
  revealInvalidField({closest:selector=>selector==='details'?details:panel});
  assert.equal(selected,'execution');assert.equal(details.open,true);
 `,context);
});

test('server disconnection is visible and clears on successful reconnection',async()=>{
 const {context,app}=ui();await vm.runInContext(`(async()=>{
  const saved=state;api=async()=>{throw new Error('offline');};
  await assert.rejects(refresh(false));render();assert.ok(document.querySelector('#app').innerHTML.includes('서버 연결 끊김'));
  api=async()=>saved;await refresh();assert.ok(!document.querySelector('#app').innerHTML.includes('서버 연결 끊김'));
 })()`,context);
});
