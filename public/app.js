import { nextDue } from '/schedule-time.js';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',home:'m3 10 9-7 9 7 M5 9v12h5v-7h4v7h5V9',apps:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',plus:'M12 5v14 M5 12h14',clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',link:'m10 13 4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',book:'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3z M4 17h16 M8 7h8 M8 11h6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 4 4 1 1 6-4 2-1 4-6 1-2-4-4-1-1-6 4-2z',bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4',arrow:'M5 12h14 m-5-5 5 5-5 5',star:'m12 3 3 6 6 1-4.5 5 1 6-5.5-3-5.5 3 1-6L3 10l6-1z',play:'m8 4 12 8-12 8z',check:'m5 12 4 4 10-10',leaf:'M19 3C6 2 1 10 7 16s14-1 12-13 M5 21 16 8',close:'m6 6 12 12 M6 18 18 6',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',folder:'M3 6h7l2 3h9v12H3z'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.apps}"/></svg>`;
let state,page=location.hash.slice(1)||'home',query='',typeFilter='',groupFilter='',archive=false,tab='connections',editing=null,scheduleApp=null,scheduleDraft=[];
const appTypes={
 service:{label:'서비스·에이전트',description:'앱 자체의 화면을 열어 사용 · 예약은 앱 안에서 관리'},
 automation:{label:'자동화 스크립트',description:'화면 없이 작업 실행 · AppDash에서 직접 실행·예약 관리'}
};
const labels={home:'홈',dashboard:'대시보드',apps:'앱',create:'앱 만들기',history:'실행 기록',connections:'연결 관리',templates:'템플릿·스킬',settings:'설정',notifications:'알림함'};
const statusNames={running:'실행 중',starting:'시작 중',stopping:'종료 중',succeeded:'완료',failed:'실패',blocked:'실행 차단',skipped:'건너뜀',interrupted:'중단됨',stopped:'종료'};
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const badge=r=>`<span class="badge ${esc(r.status)}">${statusNames[r.status]||esc(r.status)}</span>`;
function toast(s,runId){$('#toast').innerHTML=esc(s)+(runId?' <button data-run="'+esc(runId)+'">실행 기록 보기</button>':'');$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
let serverConnected=true;
const connectionMarkup=()=>'<span id="connectionStatus" role="status" class="'+(serverConnected?'':'connection-lost')+'">'+(serverConnected?'서버 연결됨':'서버 연결 끊김 · 재연결 중')+'</span>';
function connectionStatus(connected){serverConnected=connected;const node=$('#connectionStatus');if(node){node.textContent=connected?'서버 연결됨':'서버 연결 끊김 · 재연결 중';node.classList.toggle('connection-lost',!connected);}}
async function refresh(renderPage=true){try{state=await api('state');state.apps=state.apps.map(app=>({...app,type:app.gateway?.openUrl?'service':'automation'}));observeTaskResults();connectionStatus(true);if(renderPage)render();}catch(error){connectionStatus(false);throw error;}}
const empty=(title,text,action='create',button='앱 연결하기',symbol='apps')=>`<div class="empty"><div class="empty-icon">${icon(symbol)}</div><h3>${title}</h3><p>${text}</p>${action?`<button data-nav="${action}">${icon('plus')}${button}</button>`:''}</div>`;
const section=(title,body,extra='')=>`<section class="panel"><div class="section-title"><h2>${title}</h2>${extra}</div>${body}</section>`;
const title=(name,desc,buttons='')=>`<div class="page-head"><div><div class="eyebrow">MY LOCAL WORKSPACE</div><h1>${name}</h1><p>${desc}</p></div><div class="head-buttons">${buttons}</div></div>`;
const navButton=(key,symbol)=>`<button data-nav="${key}" class="${page===key?'active':''}">${icon(symbol)}${labels[key]}</button>`;
function render(){if(location.pathname==='/run')return;$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brandmark">${icon('grid')}</span>AppDash</div><div class="nav-label">WORKSPACE</div><nav class="nav" aria-label="주 메뉴">${navButton('home','home')}${navButton('dashboard','grid')}${navButton('apps','apps')}${navButton('create','plus')}${navButton('history','clock')}${navButton('connections','link')}<div class="spacer"></div>${navButton('templates','book')}${navButton('settings','settings')}</nav><div class="side-bottom"><div class="local-card"><strong><i class="dot"></i>로컬 환경에서 실행 중</strong>내 PC에서 안전하게, 나만의 앱을.<br>127.0.0.1:${location.port}</div><div class="profile"><div class="avatar">ME</div><div>개인 워크스페이스<small>AppDash v1.0.0</small></div></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">워크스페이스 <span>/</span><strong>${labels[page]||'홈'}</strong></div><div class="top-actions">${connectionMarkup()}<button data-nav="notifications" aria-label="알림함">${icon('bell')}${state.notifications.some(n=>!n.read)?'<span class="count">'+state.notifications.filter(n=>!n.read).length+'</span>':''}</button><span class="avatar">ME</span></div></header><div class="content">${({home:home,dashboard:dashboard,apps:apps,create:()=>createPage(),history:history,connections:connections,templates:templates,settings:settingsPage,notifications:notifications}[page]||home)()}<footer class="footer"><span>AppDash · 나의 앱이 모이는 공간</span><span>로컬 워크스페이스 <i class="dot"></i></span></footer></div></main></div>`;}
function home(detailed=false){const live=active(),fav=state.apps.filter(a=>a.favorite&&!a.archived),up=state.schedules.filter(s=>s.enabled).sort((a,b)=>a.nextAt.localeCompare(b.nextAt));return title(detailed?'대시보드':'나의 워크스페이스',detailed?'앱 상태와 확인이 필요한 항목을 자세히 살펴보세요.':'필요한 앱을 연결하고, 반복되는 일은 조금 더 가볍게.',`<button data-nav="templates">${icon('book')}연결 가이드</button><button class="primary" data-nav="create">${icon('plus')}앱 연결하기</button>`)+(detailed?attention():'')+(state.settings.homeStats?`<div class="stats">${[['등록된 앱',state.apps.filter(a=>!a.archived).length,'나만의 도구와 서비스','apps','개'],['실행 중',new Set(live.map(r=>r.appId)).size,'현재 작업하고 있는 앱','play','개'],['활성 예약',up.length,'Asia/Seoul 기준','clock','개'],['서비스 연결',state.connections.filter(c=>!c.paused).length,'사용 가능한 외부 연결','link','개']].map(([l,n,note,i,unit])=>`<div class="stat"><div class="stat-label">${l}${icon(i)}</div><div class="stat-value">${n}<small>${unit}</small></div><div class="stat-note">${note}</div></div>`).join('')}</div>`:'')+`<div class="section-title"><h2>${icon('star')}즐겨찾는 앱 <span class="count">${fav.length}</span></h2><button class="text-btn" data-nav="apps">모든 앱 보기 →</button></div><div class="panel">${fav.length?`<div class="cards">${fav.slice(0,state.settings.homeCount).map(card).join('')}</div>`:empty('자주 쓰는 앱을 가까이에','앱을 연결하고 별표를 눌러 즐겨찾기에 추가해 보세요.','create','첫 앱 연결하기','star')}</div><div class="two-col">${section('최근 실행',state.runs.length?state.runs.slice(0,state.settings.homeCount).map(runRow).join(''):empty('아직 실행 기록이 없어요','앱을 실행하면 이곳에서 진행 상황과 결과를 확인할 수 있어요.','','','clock'),'<button class="text-btn" data-nav="history">전체 보기 →</button>')}${section('다가오는 예약',up.length?up.slice(0,state.settings.homeCount).map(s=>`<div class="activity-row"><div class="activity-main"><strong>${esc(state.apps.find(a=>a.id===s.appId)?.name)}</strong><small>${date(s.nextAt)} · ${s.time}</small></div><button class="text-btn" data-schedule="${s.appId}">관리</button></div>`).join(''):empty('예정된 작업이 없어요','자동화 스크립트에 예약을 추가하면 정해진 시간에 실행할 수 있어요.','','','clock'),'<span class="tiny-label">SEOUL</span>')}</div>`+(live.length?section('실행 중 작업',live.map(runRow).join('')):'')+`<div class="guide">${icon('leaf')}<div><h3>아이디어를 나만의 앱으로</h3><p>외부 AI에 제작 스킬을 전달하고, 완성된 로컬 앱을 AppDash에 연결해 보세요.</p></div><button data-nav="create">앱 만들기 알아보기 ${icon('arrow')}</button></div>`;}
function appControls(a){
 const ui=state.uiStates?.[a.id]||{configured:a.type==='service',canStart:a.type==='service',status:'stopped',managed:false};
 const task=active().find(r=>r.appId===a.id&&r.purpose!=='ui'&&a.type!=='service');
 return {ui,task};
}
function card(a){
 const {ui,task}=appControls(a),r=state.lastRuns[a.id],schedules=state.schedules.filter(s=>s.appId===a.id&&s.enabled);
 const running=['starting','running','stopping'].includes(ui.status),status=ui.configured?ui.status:task?.status||'stopped';
 const note=a.type==='automation'?'활성 예약 '+schedules.length+'개 · '+(schedules.length?date([...schedules].sort((x,y)=>x.nextAt.localeCompare(y.nextAt))[0].nextAt):'예약 없음'):'최근 사용 '+date(r?.startedAt);
 const uiControl=ui.configured?running?'<button data-stop-ui="'+a.id+'" '+(!ui.managed||ui.status==='stopping'?'disabled':'')+' title="'+(!ui.managed?'외부에서 시작한 앱은 해당 앱에서 종료하세요.':'앱 화면 서버 종료')+'">종료</button>':'<button data-start-ui="'+a.id+'" '+(a.archived||!ui.canStart?'disabled':'')+' title="'+(!ui.canStart?'앱 관리에서 앱 화면 시작 명령을 설정하세요.':'앱 화면 서버 시작')+'">시작</button>':'';
 const jobControl=task?'<button data-stop-task="'+task.id+'">실행 중지</button>':'';
 return '<article class="app-card"><button class="card-favorite" data-favorite="'+a.id+'" aria-label="즐겨찾기 '+(a.favorite?'해제':'추가')+'">'+(a.favorite?'★':'☆')+'</button><button class="card-use" data-use="'+a.id+'"><div class="app-logo">'+icon(a.type==='service'?'grid':a.type==='automation'?'play':'grid')+'</div><h3>'+esc(a.name)+'</h3>'+(state.settings.descriptions?'<p>'+esc(a.description||'나의 로컬 앱')+'</p>':'')+'<div class="app-state '+status+'"><i></i>'+esc(statusNames[status]||'종료')+(running&&!ui.managed?' <small>외부 실행</small>':'')+((ui.restartRequired)?' <small>· 설정 변경 · 재시작 필요</small>':'')+'</div><div class="card-meta">'+esc(note)+'</div><div class="card-labels"><span class="badge">'+esc(appTypes[a.type].label)+'</span>'+(state.settings.tags?'<span class="badge">'+esc(a.group||'미분류')+'</span>':'')+'</div>'+(a.blockers.length?'<div class="card-warning">'+esc(a.blockers.join(' · '))+'</div>':'')+'</button><div class="card-foot card-controls">'+uiControl+jobControl+(a.type==='automation'?'<button data-schedule="'+a.id+'" '+(a.archived?'disabled':'')+'>◷ 예약 관리</button>':'')+'<details class="card-more"><summary aria-label="'+esc(a.name)+' 더 보기">⋯</summary><div class="card-menu"><button data-edit="'+a.id+'">앱 관리</button><button data-app-history="'+a.id+'">실행 기록</button><button data-archive-app="'+a.id+'">'+(a.archived?'보관함에서 복원':'보관함으로 이동')+'</button></div></details></div></article>';
}
function runRow(r){return `<div class="activity-row"><div class="app-logo">${icon('play')}</div><div class="activity-main"><strong>${esc(r.appName)}</strong><small>${date(r.startedAt)} · ${r.purpose==='ui'?'앱 시작':r.source==='schedule'?'예약 실행':'직접 실행'} · ${durationText(r)}</small></div>${badge(r)}<button class="text-btn" data-run="${r.id}">보기 ↗</button></div>`;}
const field=(label,name,value='',type='text',hint='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}">${hint?`<small>${hint}</small>`:''}</label>`;
const area=(label,name,value,hint='')=>`<label class="field full">${label}<textarea name="${name}">${esc(value)}</textarea>${hint?`<small>${hint}</small>`:''}</label>`;
const checkbox=(name,label,value)=>`<label class="check"><input type="checkbox" name="${name}" ${value?'checked':''}>${label}</label>`;
function instructions(){return `<div class="split"><details><summary>AI로 앱 생성 및 연결하기</summary><div class="details-body"><p>외부 코딩 AI에 제작 스킬과 요구사항을 전달하세요. AI가 만든 로컬 앱을 내 PC에 준비한 다음 설정 파일을 가져와 검토·등록합니다.</p><a href="/downloads/SKILL.md" download="SKILL.md">↓ appdash-create-app 스킬 다운로드</a><p>AppDash는 외부 AI를 호출하거나 앱 코드를 자동 제작하지 않습니다.</p></div></details><details><summary>수동으로 앱 연결 설정하기</summary><div class="details-body"><p>다운로드 → 경로와 실행 명령 수정 → JSON 가져오기 → 검토 → 등록</p><a href="/downloads/appdash-gateway-config.json" download>↓ appdash-gateway-config.json</a><p>실행 파일과 인수는 분리합니다. 가져오기만으로 명령이 실행되지 않습니다.</p></div></details></div>`;}
function createPage(a){return title(a?'앱 관리':'앱 만들기 · 연결하기',a?'Gateway, 입력, 연결과 예약을 관리하세요.':'내가 만든 로컬 앱을 나의 워크스페이스로.')+(!a?instructions():'')+section(a?esc(a.name):'앱 연결 설정',`<div class="help">등록한 명령은 내 Windows 계정 권한으로 실행됩니다. 경로와 실행 파일을 검토한 뒤 저장하세요.</div>${!a?'<label class="field">appdash-gateway-config.json 가져오기<input type="file" id="importFile" accept=".json,application/json"></label>':''}<div id="configForm">${appForm(a)}</div>`);}
function scriptOnly(html,type){return html.replace('<label ','<label data-script-only '+(type==='service'?'hidden ':''));}
function serviceOnly(html,type){return html.replace('<label ','<label data-service-only '+(type==='service'?'':'hidden ')).replace('<input ','<input '+(type==='service'?'':'disabled '));}
function serviceField(label,name,value,type){return field(label,name,value,'url').replace('<label ','<label data-service-only '+(type==='service'?'':'hidden ')).replace('<input ','<input '+(name==='openUrl'&&type==='service'?'required ':'')+(type==='service'?'':'disabled '));}
function baseAppForm(a={}){const g=a.gateway||{},d=state.settings;return `<form id="appForm" data-id="${a.id||''}"><div class="form-grid">${field('앱 이름','name',a.name)}${field('그룹 (선택)','group',a.group)}${area('설명 (선택)','description',a.description||'')}<div class="field"><div class="field-heading"><label for="appType">유형</label><div class="type-help"><button type="button" class="type-help-toggle" aria-label="앱 유형 설명" aria-expanded="false">?</button><div class="type-help-content">${Object.values(appTypes).map(type=>`<p><strong>${esc(type.label)}</strong>${esc(type.description)}</p>`).join('')}</div></div></div><select id="appType" name="type">${Object.entries(appTypes).map(([value,type])=>[value,type.label]).map(([v,l])=>`<option value="${v}" ${(a.type||'automation')===v?'selected':''}>${l}</option>`).join('')}</select></div>${field('버전','version',a.version||'1')}</div><fieldset class="field-set"><legend>Gateway · 로컬 프로세스</legend>${field('작업 폴더 (절대 경로)','workingDirectory',g.workingDirectory,'text','예: C:\\Apps\\my-app')}<div class="form-grid">${field('시작 실행 파일','executable',g.start?.executable||'node')}${area('시작 인수 · JSON 배열','args',JSON.stringify(g.start?.args||['main.mjs']))}${field('종료 실행 파일 (선택)','stopExecutable',g.stop?.executable)}${area('종료 인수 · JSON 배열 (선택)','stopArgs',JSON.stringify(g.stop?.args||[]))}${serviceField('준비 확인 URL (선택)','healthUrl',g.healthUrl,a.type)}${serviceField('앱 접속 URL','openUrl',g.openUrl,a.type)}${scriptOnly(field('일회성 제한 시간 (초)','timeoutSeconds',g.timeoutSeconds||300,'number'),a.type)}${serviceOnly(field('서비스 준비 대기 (초)','readinessSeconds',g.readinessSeconds||20,'number'),a.type)}</div></fieldset><div class="form-grid">${scriptOnly(area('기본 실행 입력 · JSON 객체','inputDefaults',JSON.stringify(a.inputDefaults||{},null,2)),a.type)}${field('결과 보관 기간 (일)','retentionDays',a.retentionDays??d.retentionDays,'number')}<label class="field" data-script-only ${a.type==='service'?'hidden':''}>누락 예약 정책<select name="missedPolicy"><option value="skip">건너뛰기</option><option value="latest" ${(a.missedPolicy||d.missedPolicy)==='latest'?'selected':''}>최근 8일 내 각 예약의 마지막 1회</option></select></label></div>${scriptOnly(checkbox('askInput','실행 전 입력 받기',a.askInput??d.askInput),a.type)}${scriptOnly(checkbox('rememberInput','마지막 입력 기억',a.rememberInput??d.rememberInput),a.type)}${checkbox('favorite','즐겨찾기에 추가',a.favorite)}${checkbox('archived','보관함에 보관 · 예약은 중단되며 복원 시 자동 재개되지 않습니다',a.archived)}<div class="form-grid"><fieldset class="field-set"><legend>사용할 서비스 연결</legend>${state.connections.map(c=>checkbox('connection:'+c.id,esc(c.name)+(c.paused?' (중단)':''),a.connectionIds?.includes(c.id))).join('')||'<p>등록된 연결이 없습니다.</p>'}</fieldset><fieldset class="field-set"><legend>사용할 중앙 토큰</legend>${state.tokens.map(t=>checkbox('token:'+t.id,esc(t.name)+' · '+esc(t.envName),a.tokenIds?.includes(t.id))).join('')||'<p>앱 자체 .env 인증도 사용할 수 있습니다.</p>'}</fieldset></div><div class="actions">${a.id?`<button type="button" data-schedule="${a.id}">예약 관리</button><button type="button" data-versions="${a.id}">등록 설정 이력</button>`:''}<button type="submit" class="primary">${a.id?'설정 저장':'검토한 설정 등록'}</button></div></form>`;}
function modal(name,html){$('#dialog').innerHTML=`<div class="modal-head"><h2>${esc(name)}</h2><button data-action="close" aria-label="닫기">${icon('close')}</button></div>${html}`;if(!$('#dialog').open)$('#dialog').showModal();}
function formData(form){return Object.fromEntries(new FormData(form));}
function readApp(form){const d=formData(form);return {name:d.name,description:d.description,group:d.group,type:d.type,version:d.version,gateway:{adapter:'process',workingDirectory:d.workingDirectory,start:{executable:d.executable,args:JSON.parse(d.args)},stop:{executable:d.stopExecutable,args:JSON.parse(d.stopArgs)},healthUrl:d.type==='service'?d.healthUrl:'',openUrl:d.type==='service'?d.openUrl:'',timeoutSeconds:d.type==='automation'?+d.timeoutSeconds:300,readinessSeconds:d.type==='service'?+d.readinessSeconds:20},inputDefaults:JSON.parse(d.inputDefaults),favorite:!!d.favorite,archived:!!d.archived,askInput:!!d.askInput,rememberInput:!!d.rememberInput,retentionDays:+d.retentionDays,missedPolicy:d.missedPolicy,connectionIds:state.connections.filter(c=>d['connection:'+c.id]).map(c=>c.id),tokenIds:state.tokens.filter(t=>d['token:'+t.id]).map(t=>t.id)};}
function useApp(id){
 const app=state.apps.find(a=>a.id===id);if(!app)return;
 if(app.archived){toast('보관함에서 복원한 뒤 앱을 열어 주세요.');return;}
 if(app.type==='automation')return quickRun(id);
 if(appControls(app).ui.status==='running'){window.open(appControls(app).ui.url||app.gateway.openUrl,'_blank','noopener');return;}
 const popup=window.open('about:blank','_blank');
 if(!popup){toast('앱 화면을 열려면 새 탭 열기를 허용해 주세요.');return;}
 popup.opener=null;popup.document.title=app.name;popup.document.body.textContent=app.name+' 화면을 여는 중…';
 void (async()=>{try{const opened=await api('apps/'+id+'/open-ui','POST',{});if(!popup.closed)popup.location.replace(opened.url);await refresh();}
 catch(error){if(!popup.closed)popup.close();toast(error.message);}})();
}
function openApp(id){useApp(id);}
const pendingTasks=new Map();
function observeTaskResults(){
 for(const [id,name]of pendingTasks){const run=state.runs.find(r=>r.id===id);if(run&&!['starting','running','stopping'].includes(run.status)){pendingTasks.delete(id);toast(name+' · '+(statusNames[run.status]||run.status),id);}}
}
async function launchTask(id,input={}){
 const app=state.apps.find(a=>a.id===id);const run=await api('apps/'+id+'/run','POST',input);
 pendingTasks.set(run.id,app.name);await refresh();toast(app.name+' 작업을 실행했습니다.',run.id);
}
function quickRun(id){
 const app=state.apps.find(a=>a.id===id);if(app.type==='service')return useApp(id);
 const recent=state.lastRuns[app.id],upcoming=state.schedules.filter(s=>s.appId===id&&s.enabled).sort((a,b)=>a.nextAt.localeCompare(b.nextAt))[0];
 const task=appControls(app).task;
 modal('스크립트 실행 · '+app.name,'<p>'+esc(app.description||'등록한 스크립트를 실행합니다.')+'</p><div class="help"><p>최근 실행: '+(recent?badge(recent)+' · '+date(recent.startedAt):'없음')+'</p><p>다음 예약: '+(upcoming?date(upcoming.nextAt):'예약 없음')+'</p></div>'+(task?'<p>현재 작업이 실행 중입니다.</p><div class="actions"><button data-stop-task="'+task.id+'">실행 중지</button><button data-run="'+task.id+'">실행 기록 보기</button><button data-schedule="'+id+'">예약 관리</button></div>':'<form id="quickRunForm" data-id="'+id+'">'+(app.askInput?area('실행 입력 · JSON 객체','input',JSON.stringify(app.inputDefaults,null,2)):'<input type="hidden" name="input" value="{}">')+'<div class="actions"><button type="button" data-schedule="'+id+'">예약 관리</button><button type="button" data-action="close">취소</button><button type="submit" class="primary">지금 실행</button></div></form>'));
}

function connectionModal(id){const c=state.connections.find(c=>c.id===id)||{};modal(id?'서비스 연결 수정':'서비스 연결 추가',`<form id="connectionForm" data-id="${id||''}">${field('연결 이름','name',c.name)}<label class="field">유형<select name="type"><option value="api">HTTP API</option><option value="webhook" ${c.type==='webhook'?'selected':''}>발신 웹훅 대상</option></select></label>${field('서비스 URL','url',c.url,'url')}${field('상태 확인 URL (선택)','healthUrl',c.healthUrl,'url','검사 시 이 URL에만 GET 요청합니다.')}<label class="field">중앙 토큰 (선택)<select name="tokenId"><option value="">없음</option>${state.tokens.map(t=>`<option value="${t.id}" ${c.tokenId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>${field('기존 인증 환경변수 참조 (선택)','envRef',c.envRef)}<input type="hidden" name="paused" value="${c.paused?'true':'false'}"><div class="actions"><button type="button" data-action="close">취소</button><button class="primary">저장</button></div></form>`);}
function tokenModal(id){const t=state.tokens.find(t=>t.id===id)||{};modal(id?'토큰 수정·교체':'중앙 토큰 등록',`<form id="tokenForm" data-id="${id||''}"><div class="help">Windows DPAPI CurrentUser로 암호화합니다. 원문은 입력 시에만 받습니다. 실행 중 앱의 기존 환경변수는 즉시 바뀌거나 회수되지 않습니다.</div>${field('이름','name',t.name)}${field('제공 서비스 (선택)','provider',t.provider)}${field('앱에 제공할 환경변수 이름','envName',t.envName||'GITHUB_TOKEN')}${field(id?'새 토큰 원문 (선택)':'토큰 원문','value','','password')}${field('만료일 (선택)','expiresAt',t.expiresAt?t.expiresAt.slice(0,10):'','date')}<div class="actions"><button type="button" data-action="close">취소</button><button class="primary">암호화하여 저장</button></div></form>`);}
async function impact(kind,id,next){const rows=await api(`${kind}/${id}/impact`);modal('영향 확인',`<p>영향을 받는 앱 ${rows.length}개. 저장된 연결 설정과 이미 실행 중인 앱의 환경변수는 자동 회수되지 않습니다.</p><div class="spaced">${rows.map(a=>`<p>${esc(a.name)} · 활성 예약 ${a.schedules}개</p>`).join('')||'<p>사용 중인 앱이 없습니다.</p>'}</div><div class="actions"><button data-action="close">취소</button><button class="danger" id="confirmImpact">확인하여 적용</button></div>`);$('#confirmImpact').onclick=async()=>{try{await next();$('#dialog').close();await refresh();toast('적용했습니다.');}catch(e){toast(e.message);}};}
function baseConnections(){return title('연결 관리','앱이 사용할 외부 서비스와 인증정보를 관리하세요.',`<button class="primary" data-action="add-${tab==='tokens'?'token':'connection'}">${icon('plus')}${tab==='tokens'?'토큰 등록':'연결 추가'}</button>`)+`<div class="tabs"><button data-tab="connections" class="${tab==='connections'?'active':''}">서비스 연결 <span class="count">${state.connections.length}</span></button><button data-tab="tokens" class="${tab==='tokens'?'active':''}">토큰 관리 <span class="count">${state.tokens.length}</span></button></div>`+(tab==='connections'?section('서비스 연결',state.connections.length?state.connections.map(c=>`<div class="activity-row"><div class="app-logo">${icon('link')}</div><div class="activity-main"><strong>${esc(c.name)} <span class="badge">${c.paused?'일시 중단':c.type==='webhook'?'발신 웹훅':'HTTP API'}</span></strong>${state.settings.connectionDetails?`<p class="break">${esc(c.url)}</p>`:''}</div><div class="row-actions"><button data-check="${c.id}">검사</button><button data-connection="${c.id}">수정</button><button data-pause="${c.id}">${c.paused?'재개':'중단'}</button><button data-delete-connection="${c.id}">해지</button></div></div>`).join(''):empty('연결된 서비스가 없어요','로컬 실행기는 기본 환경입니다. 외부 API나 발신 웹훅이 필요할 때 연결하세요.','','','link')):section('중앙 토큰',`<div class="help">${esc(state.environment.tokenStorage)} · 원문은 저장 후 다시 표시하지 않습니다. 교체된 값은 다음 실행 또는 실행 중 최신 조회에 적용됩니다.</div>`+(state.tokens.length?state.tokens.map(t=>`<div class="activity-row"><div class="activity-main"><strong>${esc(t.name)} · ${esc(t.provider)}</strong><p>${esc(t.envName)} · •••••••• · 만료 ${date(t.expiresAt)} · 최근 사용 ${date(t.lastUsedAt)}</p><p>사용 앱: ${state.apps.filter(a=>a.tokenIds.includes(t.id)||a.connectionIds.some(id=>state.connections.find(c=>c.id===id)?.tokenId===t.id)).map(a=>esc(a.name)).join(', ')||'없음'} · 연결: ${state.connections.filter(c=>c.tokenId===t.id).map(c=>esc(c.name)).join(', ')||'없음'}</p></div><button data-token="${t.id}">수정·교체</button><button data-delete-token="${t.id}">삭제</button></div>`).join(''):empty('저장된 토큰이 없습니다','필요한 앱에만 명시적으로 토큰을 지정하세요.','','','link'))));}
function baseTemplates(){return title('템플릿·스킬','공통 실행 규격과 외부 AI용 제작 지침을 확인하세요.')+`<details><summary>공용 Gateway 설명 전체</summary><div class="details-body"><p>서비스 시작과 자동화 스크립트의 직접·예약 실행은 공통 Gateway를 호출합니다. Gateway는 등록 설정을 검증하고 process 어댑터로 로컬 명령을 실행합니다. 실행 기록·로그·결과·연결 권한은 공통으로 관리합니다.</p><p>앱별 JSON은 이름, 작업 폴더, 실행 파일·인수, 준비 확인 URL과 접속 URL을 선언합니다. Gateway 코드를 앱마다 복사할 필요가 없습니다. 앱의 고유 업무 로직과 UI는 앱이 담당합니다.</p><p>service는 자체 화면이 있는 서비스·에이전트이고 예약은 해당 앱에서 관리합니다. automation은 화면 없는 자동화 스크립트이며 실행·예약은 AppDash에서 관리합니다.</p><a href="/downloads/appdash-gateway-config.json" download>↓ 연결 설정 템플릿</a></div></details><details><summary>Gateway 전용 앱 제작 스킬 전체</summary><div class="details-body"><h3>appdash-create-app</h3><p>외부 Codex 또는 코딩 AI에 SKILL.md와 만들고 싶은 앱의 요구사항을 전달하세요. 생성된 소스와 실행 안내를 검토하고 설치한 뒤 appdash-gateway-config.json을 AppDash로 가져옵니다.</p>${state.settings.skillHelp?'<p>스킬은 외부 AI의 제작 지침입니다. Gateway는 AppDash의 공통 실행 코드이고, JSON은 앱별 선언적 설정입니다. AppDash 내부에서 AI 개발이 실행되지 않습니다.</p>':''}<a href="/downloads/SKILL.md" download>↓ SKILL.md 다운로드</a><p><a href="/downloads/appdash-sdk.mjs" download>↓ 선택적 토큰 SDK</a></p></div></details>`;}
function baseSettingsPage(){const s=state.settings;return title('워크스페이스 설정','화면 표시와 새 앱의 기본 동작을 조정하세요.')+section('메뉴별 표시',`<form id="settingsForm"><div class="form-grid"><fieldset class="field-set"><legend>홈</legend>${checkbox('homeStats','실제 데이터 요약 표시',s.homeStats)}${field('표시 항목 수','homeCount',s.homeCount,'number')}</fieldset><fieldset class="field-set"><legend>앱 · 실행 기록</legend>${checkbox('descriptions','앱 설명 표시',s.descriptions)}${checkbox('tags','그룹 태그 표시',s.tags)}${field('실행 기록 표시 수','historyCount',s.historyCount,'number')}</fieldset><fieldset class="field-set"><legend>연결 · 스킬 · 알림</legend>${checkbox('connectionDetails','연결 URL 표시',s.connectionDetails)}${checkbox('skillHelp','스킬 추가 안내 표시',s.skillHelp)}${checkbox('successNotifications','성공 알림 받기',s.successNotifications)}<p>실패·실행 차단 알림은 항상 저장됩니다.</p></fieldset><fieldset class="field-set"><legend>새 앱 기본값</legend>${checkbox('askInput','실행 전 입력 받기',s.askInput)}${checkbox('rememberInput','마지막 입력 기억',s.rememberInput)}${field('결과 보관 기간 (일)','retentionDays',s.retentionDays,'number')}<label class="field">누락 예약<select name="missedPolicy"><option value="skip">건너뛰기</option><option value="latest" ${s.missedPolicy==='latest'?'selected':''}>각 예약의 최근 누락 1회</option></select></label></fieldset></div><div class="help">위 ‘새 앱 기본값’은 앞으로 등록할 앱에만 적용됩니다. 기존 앱의 입력·결과 보관·누락 예약 설정은 유지되며 앱 수정에서 개별 변경합니다. 메뉴별 표시 설정은 현재 화면에도 적용됩니다.</div><div class="actions"><button class="primary">설정 저장</button></div></form>`)+section('실행 환경',`<p class="break">AppDash ${state.environment.version} · ${esc(state.environment.node)} · ${esc(state.environment.platform)}<br>시간대: Asia/Seoul<br>데이터: ${esc(state.environment.dataDir)}<br>로그: 실행별 128 KiB · 알림: 최근 300개 · 실행 이력: 유지<br>PC와 AppDash 서버가 켜져 있을 때만 예약이 실행됩니다.</p><div class="actions"><button class="danger" data-action="shutdown">AppDash 및 소유 앱 종료</button></div>`);}
let appSort='recent',favoritesOnly=false,unreadOnly=false,storageInfo=null;
async function api(url,method='GET',data){
 const r=await fetch('/api/'+url,{method,headers:{'Content-Type':'application/json','X-AppDash-Session':state?.session||''},body:data===undefined?undefined:JSON.stringify(data)});
 const b=await r.json();if(!r.ok)throw new Error(b.error);
 return b;
}
const active=()=>state.activeRuns||[];
const bytes=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KiB':(n/1048576).toFixed(1)+' MiB';
function attention(){
 const items=[];
 for(const a of state.apps.filter(a=>!a.archived&&a.blockers.length))items.push(`<div class="activity-row"><div class="activity-main"><strong>${esc(a.name)}</strong><p>${esc(a.blockers.join(' · '))}</p></div><button data-edit="${a.id}">앱 설정</button><button data-nav="connections">연결 확인</button></div>`);
 for(const token of state.tokens){if(!token.expiresAt)continue;const days=Math.ceil((new Date(token.expiresAt)-Date.now())/86400000);if(days<=7)items.push(`<div class="activity-row"><div class="activity-main"><strong>${esc(token.name)} · ${days<1?'만료됨':days+'일 후 만료'}</strong><p>토큰을 교체하고 사용 앱의 적용 시점을 확인하세요.</p></div><button data-token="${token.id}">토큰 확인</button></div>`);}
 for(const r of Object.values(state.lastRuns).filter(r=>r&&['failed','blocked','interrupted'].includes(r.status)))items.push(runRow(r));
 for(const c of state.connections.filter(c=>c.lastCheck&&!c.lastCheck.valid))items.push(`<div class="activity-row"><div class="activity-main"><strong>${esc(c.name)} · 최근 검사 실패</strong><p>${esc(c.lastCheck.message)}</p></div><button data-connection="${c.id}">연결 수정</button></div>`);
 return section(`확인이 필요한 항목 <span class="count">${items.length}</span>`,items.join('')||'<p class="all-clear">✓ 확인이 필요한 항목이 없습니다. 앱 실행과 연결에 문제가 생기면 여기에 표시됩니다.</p>');
}
function dashboard(){return home(true);}
function apps(){
 const matched=state.apps.filter(a=>!!a.archived===archive&&(!query||`${a.name} ${a.description} ${a.group}`.toLowerCase().includes(query.toLowerCase()))&&(!typeFilter||a.type===typeFilter)&&(!groupFilter||a.group===groupFilter)&&(!favoritesOnly||a.favorite));
 matched.sort((a,b)=>appSort==='name'?a.name.localeCompare(b.name,'ko'):new Date(state.lastRuns[b.id]?.startedAt||0)-new Date(state.lastRuns[a.id]?.startedAt||0));
 return title('나의 앱','로컬 앱과 서비스를 한곳에서 관리하세요.',`<button class="primary" data-nav="create">${icon('plus')}앱 연결하기</button><button data-action="archive-filter">${archive?'현재 앱 보기':'보관함'}</button>`)+
 `<div class="filters"><input id="search" aria-label="앱 검색" placeholder="앱 이름, 설명, 그룹 검색" value="${esc(query)}"><select id="typeFilter" aria-label="유형"><option value="">모든 유형</option>${Object.entries(appTypes).map(([v,t])=>`<option value="${v}" ${typeFilter===v?'selected':''}>${t.label}</option>`).join('')}</select><select id="groupFilter" aria-label="그룹"><option value="">모든 그룹</option>${[...new Set(state.apps.map(a=>a.group).filter(Boolean))].map(g=>`<option ${groupFilter===g?'selected':''}>${esc(g)}</option>`).join('')}</select><select id="appSort" aria-label="앱 정렬"><option value="recent">최근 사용순</option><option value="name" ${appSort==='name'?'selected':''}>이름순</option></select><button class="filter-toggle" data-action="toggle-favorites" aria-pressed="${favoritesOnly}">즐겨찾기만</button><button data-action="reset-filters">필터 초기화</button></div><p class="list-count">${matched.length}개 앱</p>`+
 (matched.length?`<div class="cards">${matched.map(card).join('')}</div>`:section('',empty(state.apps.some(a=>!!a.archived===archive)?'검색 조건에 맞는 앱이 없습니다':archive?'보관된 앱이 없습니다':'아직 연결된 앱이 없어요',state.apps.some(a=>!!a.archived===archive)?'검색어와 필터를 바꾸거나 초기화해 보세요.':'설정 파일을 가져오거나 직접 실행 설정을 등록해 보세요.',state.apps.some(a=>!!a.archived===archive)?'':'create')));
}
function appForm(a={}){
 let html=baseAppForm(a);
 if(a.id)return managementForm(a,html);
 const start=html.indexOf('<fieldset class="field-set">');
 const end=html.indexOf('<div class="actions">');
 const fields=html.slice(start,end);
 // Keep the existing management form intact; only the new-app form folds advanced settings.
 const g=a.gateway||{};
 const basics=`<fieldset class="field-set"><legend>실행에 필요한 기본 설정</legend>${field('작업 폴더 (절대 경로)','workingDirectory',g.workingDirectory)}${field('시작 실행 파일','executable',g.start?.executable||'node')}${area('시작 인수 · JSON 배열','args',JSON.stringify(g.start?.args||['main.mjs']))}</fieldset>`;
 const advanced=fields.replace(/<label class="field">작업 폴더[\s\S]*?<\/label>/,'').replace(/<label class="field">시작 실행 파일[\s\S]*?<\/label>/,'').replace(/<label class="field full">시작 인수[\s\S]*?<\/label>/,'');
 return html.slice(0,start)+basics+`<details class="advanced"><summary>고급 실행 설정 · 입력·연결·토큰·보관</summary><div class="details-body">${advanced}</div></details><div id="preflightResult"></div>`+html.slice(end).replace('<button type="submit"','<button type="button" data-action="preflight">설정 점검 (실행하지 않음)</button><button type="submit"');
}
function connections(){
 const content=baseConnections();
 if(tab!=='connections')return content;
 const container=document.createElement('div');container.innerHTML=content;
 for(const c of state.connections){
  const row=container.querySelector(`[data-connection="${c.id}"]`)?.closest('.activity-row');if(!row)continue;
  const used=state.apps.filter(a=>a.connectionIds.includes(c.id));
  const node=document.createElement('div');node.className='connection-check';
  node.innerHTML=`<p>사용 앱 ${used.length}개${used.length?' · '+used.map(a=>esc(a.name)).join(', '):''}</p>`+(c.lastCheck?`<p><span class="badge ${c.lastCheck.valid?'succeeded':'failed'}">${c.lastCheck.kind==='http'?'HTTP 응답 확인':'설정 확인'} · ${c.lastCheck.valid?'확인 완료':'문제 있음'}</span> ${date(c.lastCheck.checkedAt)}</p><p>${esc(c.lastCheck.message)}</p><p>인증 성공 여부: 미검증</p>`:'<p>아직 검사하지 않았습니다. 검사는 인증 성공을 보장하지 않습니다.</p>');
  row.querySelector('.activity-main').append(node);
 }
 return container.innerHTML;
}
function templates(){
 const extras=section('외부 AI에 요청하기',`<p>아래 요청문과 다운로드한 appdash-create-app/SKILL.md를 외부 코딩 AI에 전달하세요.</p><pre id="aiRequest">appdash-create-app 스킬을 사용해 다음 로컬 앱을 만들어 주세요.

만들 앱: [원하는 작업과 사용 화면을 적어 주세요]
앱 유형: [서비스·에이전트 / 자동화 스크립트]

동작하는 소스, 설치·실행 안내, appdash-gateway-config.json을 제공하고 실제 수행한 검증과 미검증 항목을 구분해 주세요. 비밀정보는 소스와 설정 파일에 넣지 마세요.</pre><button data-action="copy-request">요청문 복사</button>`)+section('가져오기 문제 해결',`<details><summary>작업 폴더가 존재하지 않습니다</summary><div class="details-body"><p>앱을 설치한 실제 절대 경로로 workingDirectory를 수정하세요. 외부 AI의 예시 경로는 내 PC에 존재하지 않을 수 있습니다.</p></div></details><details><summary>인수 또는 JSON 형식 오류</summary><div class="details-body"><p>인수는 ["main.mjs"] 같은 문자열 배열입니다. Windows 경로의 역슬래시는 JSON에서 \\ 두 번 입력하세요. 설정 파일명은 appdash-gateway-config.json입니다.</p></div></details><details><summary>연결 또는 토큰 문제로 실행 차단</summary><div class="details-body"><p>연결 관리에서 일시 중단·삭제·만료 여부를 확인하고 앱 수정에서 사용할 연결과 토큰을 다시 지정하세요. 토큰 원문을 연결 JSON에 넣지 마세요.</p></div></details>`);
 return baseTemplates().replace(/<\/div><\/details>$/,extras+'</div></details>');
}
function settingsPage(){
 return baseSettingsPage()+section('저장 공간과 백업',`<div id="storageInfo">${storageInfo?storageMarkup(storageInfo):'<p>저장 공간 정보를 확인하고 있습니다…</p>'}</div><div class="help spaced">표시되는 정리 예정 용량은 7일 이내 보관 기간이 만료될 결과 파일입니다. 실행 이력과 등록 설정은 결과 정리 시 삭제되지 않습니다.</div><ol class="backup-steps"><li>중요한 실행이 끝났는지 확인한 뒤 Stop-AppDash.bat로 서버를 종료합니다.</li><li>데이터 폴더 전체를 안전한 위치로 복사합니다. SQLite 파일만 실행 중에 복사하지 마세요.</li><li>복원 전 서버를 종료하고 백업 데이터 폴더를 사용하도록 지정합니다.</li></ol><p>토큰 암호문은 Windows DPAPI에 묶여 있습니다. 다른 PC·계정에서는 토큰 재등록이 필요할 수 있습니다.</p>`);
}
function storageMarkup(s){return `<div class="stats compact-stats"><div class="stat"><p>결과 파일 총용량</p><h2>${bytes(s.resultBytes)}</h2></div><div class="stat"><p>7일 내 정리 예정</p><h2>${bytes(s.expiringBytes)}</h2></div><div class="stat"><p>결과 파일 수</p><h2>${s.fileCount}개</h2></div></div>`;}
async function loadStorage(){try{storageInfo=await api('storage');if($('#storageInfo'))$('#storageInfo').innerHTML=storageMarkup(storageInfo);}catch(e){if($('#storageInfo'))$('#storageInfo').textContent=e.message;}}
function notificationContext(n){
 const run=state.runs.find(r=>r.id===n.runId)||(n.appId?{id:n.runId,appId:n.appId}:null);
 const latest=run?state.lastRuns[run.appId]:null;
 const resolved=n.level==='success'||!!(latest&&latest.id!==run.id&&['succeeded','running'].includes(latest.status));
 return {run,resolved};
}
function notifications(){
 const filtered=state.notifications.filter(n=>!unreadOnly||!n.read);
 return title('알림함','읽음 여부와 문제 해결 여부를 구분해 확인하세요.',`<button data-action="filter-unread">${unreadOnly?'전체 알림 보기':'안 읽은 알림만'}</button><button data-action="read-notifications">모두 읽음</button>`)+section('최근 알림',filtered.length?filtered.map(n=>{const {run,resolved}=notificationContext(n);return `<div class="activity-row"><div class="activity-main"><strong>${n.read?'':'• '}${esc(n.message)}</strong><small>${date(n.createdAt)} · ${n.read?'읽음':'안 읽음'} · ${resolved?'후속 실행 정상·완료':'원인 확인 필요'}</small></div><div class="row-actions">${!n.read?`<button data-read-notification="${n.id}">읽음</button>`:''}${n.runId?`<button data-run="${n.runId}">실행 보기</button>`:''}${run?`<button data-edit="${run.appId}">관련 앱</button>`:''}${(n.connectionIds||[]).filter(id=>state.connections.some(c=>c.id===id)).slice(0,3).map(id=>`<button data-connection="${id}">관련 연결</button>`).join('')}${(n.tokenIds||[]).filter(id=>state.tokens.some(t=>t.id===id)).slice(0,3).map(id=>`<button data-token="${id}">관련 토큰</button>`).join('')}<button data-nav="connections">연결·토큰 관리</button></div></div>`;}).join(''):empty('표시할 알림이 없습니다','실행 실패와 실행 차단 알림은 여기에 표시됩니다.','','','bell'));
}
async function addedClick(b){
 if(b.dataset.readNotification){await api('notifications/'+b.dataset.readNotification,'POST');await refresh();return true;}
 switch(b.dataset.action){
  case 'toggle-favorites':favoritesOnly=!favoritesOnly;render();return true;
  case 'reset-filters':query='';typeFilter='';groupFilter='';favoritesOnly=false;appSort='recent';render();return true;
  case 'filter-unread':unreadOnly=!unreadOnly;render();return true;
  case 'copy-request':await navigator.clipboard.writeText($('#aiRequest').textContent);toast('외부 AI 요청문을 복사했습니다.');return true;
  case 'preflight':{
   const result=await api('preflight','POST',readApp($('#appForm')));
   $('#preflightResult').innerHTML=`<div class="help"><strong>설정 점검 · 명령을 실행하지 않았습니다</strong>${result.checks.map(c=>`<p>${c.ok?'✓':'⚠'} ${esc(c.name)}: ${esc(c.message)}</p>`).join('')}</div>`;return true;
  }
 }
 return false;
}

let formBaseline=null,scheduleBaseline=null,managementTab='overview',versionCache=[],restoreExpected=null;
let historyFilters={appId:'',status:'',source:'',from:'',to:''},historyPage=1,historyData=null,historyError='',historyRequest=0;
let runDetails=null,runFiles=[],logQuery='',renderedLog=null;
const fullDate=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
function durationText(run){
 if(!run.startedAt)return '—';
 const ms=Math.max(0,(run.endedAt?Date.parse(run.endedAt):Date.now())-Date.parse(run.startedAt));
 if(!Number.isFinite(ms))return '—';
 const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
 return (hours?`${hours}시간 ${minutes%60}분`:minutes?`${minutes}분 ${seconds%60}초`:`${seconds}초`)+(run.endedAt?'':' · 진행 중');
}
function serializedForm(form){return JSON.stringify([...new FormData(form).entries()]);}
function markDialogClean(){const f=$('#dialog #appForm');formBaseline=f?serializedForm(f):null;scheduleBaseline=null;}
function dialogDirty(){
 const f=$('#dialog #appForm');
 if(f&&formBaseline!==null)return serializedForm(f)!==formBaseline;
 return !!$('#dialog #scheduleList')&&scheduleBaseline!==null&&JSON.stringify(scheduleDraft)!==scheduleBaseline;
}
function confirmDiscard(){
 return new Promise(resolve=>{
  const dialog=$('#discardDialog');
  dialog.innerHTML='<h2 id="discardTitle">저장하지 않은 변경 사항</h2><p>현재 변경 내용을 버리고 이동할까요? 계속 편집하면 입력한 내용이 유지됩니다.</p><div class="actions"><button type="button" id="keepEditing">계속 편집</button><button type="button" class="danger" id="discardEditing">변경 버리기</button></div>';
  const finish=value=>{dialog.close();resolve(value);};
  $('#keepEditing').onclick=()=>finish(false);$('#discardEditing').onclick=()=>finish(true);
  dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();$('#keepEditing').focus();
 });
}
async function discardChanges(){
 if(dialogDirty()&&!await confirmDiscard())return false;
 formBaseline=null;scheduleBaseline=null;return true;
}
function managementForm(a,html){
 const formEnd=html.indexOf('>')+1,gatewayStart=html.indexOf('<fieldset class="field-set">'),gatewayEnd=html.indexOf('</fieldset>',gatewayStart)+11;
 const connectionsStart=html.indexOf('<div class="form-grid"><fieldset',gatewayEnd),actionsStart=html.indexOf('<div class="actions">',connectionsStart);
 let options=html.slice(gatewayEnd,connectionsStart),flags='';
 for(const name of ['favorite','archived']){const pattern=new RegExp('<label class="check"><input type="checkbox" name="'+name+'"[^]*?</label>');const match=options.match(pattern);if(match){flags+=match[0];options=options.replace(match[0],'');}}
 const tabs=[['overview','개요'],['execution','실행 설정'],['connections','연결·토큰'],...(a.type==='automation'?[['schedules','예약']]:[])];
 const schedules=state.schedules.filter(s=>s.appId===a.id);
 const content={overview:html.slice(formEnd,gatewayStart)+flags,execution:html.slice(gatewayStart,gatewayEnd)+options,connections:html.slice(connectionsStart,actionsStart),schedules:`<div class="help">예약은 Asia/Seoul 기준입니다. 예약 변경은 예약 관리에서 별도로 저장합니다.</div>${schedules.map(s=>`<div class="activity-row"><div class="activity-main"><strong>${esc(scheduleSummary(s))}</strong><p>${s.enabled?'다음 실행: '+date(nextDue(s)):'중단됨'}</p></div><span class="badge">${s.enabled?'활성':'중단'}</span></div>`).join('')||'<p>등록된 예약이 없습니다.</p>'}<div class="actions"><button type="button" data-schedule="${a.id}">예약 관리 열기</button></div>`};
 managementTab='overview';
 return html.slice(0,formEnd)+`<div class="tabs management-tabs" role="tablist" aria-label="앱 관리">${tabs.map(([key,label])=>`<button type="button" role="tab" id="manage-tab-${key}" data-management-tab="${key}" aria-controls="manage-panel-${key}" aria-selected="${key==='overview'}" tabindex="${key==='overview'?0:-1}">${label}</button>`).join('')}</div>`+tabs.map(([key])=>`<section role="tabpanel" id="manage-panel-${key}" aria-labelledby="manage-tab-${key}" ${key==='overview'?'':'hidden'}>${content[key]}</section>`).join('')+`<div class="actions"><button type="button" data-versions="${a.id}">등록 설정 이력</button><button type="submit" class="primary">설정 저장</button></div></form>`;
}
function selectManagementTab(key){
 managementTab=key;
 for(const button of document.querySelectorAll('[data-management-tab]')){const selected=button.dataset.managementTab===key;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;$('#manage-panel-'+button.dataset.managementTab).hidden=!selected;}
}
function revealInvalidField(target){
 const panel=target.closest('[role="tabpanel"]');
 if(panel?.hidden)selectManagementTab(panel.id.replace('manage-panel-',''));
 for(let details=target.closest('details');details;details=details.parentElement?.closest('details'))details.open=true;
}
function configChanges(current,target,prefix=''){
 const changes=[];
 for(const key of new Set([...Object.keys(current||{}),...Object.keys(target||{})])){
  if(!prefix&&['id','blockers'].includes(key))continue;
  const before=current?.[key],after=target?.[key],name=prefix?prefix+'.'+key:key;
  if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))changes.push(...configChanges(before,after,name));
  else if(JSON.stringify(before)!==JSON.stringify(after))changes.push({name,before,after});
 }
 return changes;
}
function configValue(name,value){
 if(name==='tokenIds')return (value||[]).map(id=>state.tokens.find(t=>t.id===id)?.name||id).join(', ')||'없음';
 if(name==='connectionIds')return (value||[]).map(id=>state.connections.find(c=>c.id===id)?.name||id).join(', ')||'없음';
 if(typeof value==='boolean')return value?'사용':'사용 안 함';
 return value===undefined?'설정 없음':typeof value==='string'?value||'비어 있음':JSON.stringify(value,null,2);
}
function showVersionComparison(appId,versionId){
 const current=state.apps.find(a=>a.id===appId),version=versionCache.find(v=>v.id===versionId);
 if(!current||!version)throw new Error('설정 버전을 다시 불러오세요.');
 const {blockers,...config}=current;restoreExpected=config;
 const changes=configChanges(current,version.config);
 const names={name:'앱 이름',description:'설명',group:'그룹',type:'유형',version:'버전',favorite:'즐겨찾기',archived:'보관',inputDefaults:'기본 입력',retentionDays:'결과 보관 기간',missedPolicy:'누락 예약 정책',askInput:'실행 전 입력',rememberInput:'마지막 입력 기억',tokenIds:'중앙 토큰',connectionIds:'서비스 연결','gateway.workingDirectory':'작업 폴더','gateway.start.executable':'시작 실행 파일','gateway.start.args':'시작 인수','gateway.stop.executable':'종료 실행 파일','gateway.stop.args':'종료 인수','gateway.healthUrl':'준비 확인 URL','gateway.openUrl':'앱 접속 URL','gateway.timeoutSeconds':'제한 시간','gateway.readinessSeconds':'준비 대기 시간'};
 modal('등록 설정 복원 전 비교',`<div class="help">현재 등록 설정 → ${date(version.createdAt)}의 설정으로 복원합니다. 앱 소스·외부 데이터·예약 시간표는 복원하지 않습니다.</div>${changes.length?`<div class="table-wrap"><table class="config-diff"><thead><tr><th>항목</th><th>현재</th><th>복원 후</th></tr></thead><tbody>${changes.map(c=>`<tr><td>${esc(names[c.name]||c.name)}</td><td>${esc(configValue(c.name,c.before))}</td><td>${esc(configValue(c.name,c.after))}</td></tr>`).join('')}</tbody></table></div>`:'<p>현재 설정과 다른 항목이 없습니다.</p>'}<div class="actions"><button data-action="close">취소</button><button class="primary" data-restore="${appId}" data-version="${versionId}" ${changes.length?'':'disabled'}>비교한 설정 복원</button></div>`);
}
function scheduleSummary(s){
 const repeat=s.repeat==='daily'?'매일':s.repeat==='weekdays'?'평일 월~금':s.days.length?'매주 '+s.days.map(d=>['일','월','화','수','목','금','토'][d]).join('·'):'매주 (요일 선택 필요)';
 return `${repeat} ${s.time||'(시각 선택 필요)'}`;
}
function scheduleNextText(s){return !s.enabled?'중단됨':nextDue(s)?'다음 실행: '+fullDate(nextDue(s)):'요일·시각을 확인하세요.';}
function scheduleModal(id){if(state.apps.find(a=>a.id===id)?.type!=='automation'){toast('서비스의 예약은 해당 앱 화면에서 관리하세요.');return;}scheduleApp=id;scheduleDraft=structuredClone(state.schedules.filter(s=>s.appId===id));formBaseline=null;scheduleBaseline=JSON.stringify(scheduleDraft);drawSchedule();}
function drawSchedule(){
 const archived=state.apps.find(a=>a.id===scheduleApp)?.archived;
 modal('예약 관리 · Asia/Seoul',`<p>저장해야 변경 내용이 적용됩니다. 모든 예약을 삭제해도 직접 실행할 수 있습니다.</p>${archived?'<div class="help">보관된 앱의 예약은 활성화할 수 없습니다.</div>':''}<div id="scheduleList" class="spaced">${scheduleDraft.map((s,i)=>`<div class="schedule-row" data-index="${i}"><strong class="schedule-summary">${esc(scheduleSummary(s))}</strong><div class="schedule-fields"><select aria-label="반복 유형" data-sfield="repeat">${[['daily','매일'],['weekdays','평일'],['weekly','매주']].map(([v,l])=>`<option value="${v}" ${s.repeat===v?'selected':''}>${l}</option>`).join('')}</select><input aria-label="예약 시각" data-sfield="time" type="time" value="${s.time}"><label class="check"><input type="checkbox" data-sfield="enabled" ${s.enabled?'checked':''} ${archived?'disabled':''}>활성</label><button data-remove-schedule="${i}">삭제</button></div>${s.repeat==='weekly'?`<div class="days">${['일','월','화','수','목','금','토'].map((l,d)=>`<label><input type="checkbox" data-day="${d}" ${s.days.includes(d)?'checked':''}>${l}</label>`).join('')}</div>`:`<p class="repeat-help">${s.repeat==='daily'?'모든 요일에 실행합니다.':'월요일부터 금요일까지 실행합니다.'}</p>`}<p class="schedule-next">${esc(scheduleNextText(s))}</p></div>`).join('')}</div><button data-action="add-schedule">${icon('plus')}예약 추가</button><div class="actions"><button data-action="close">취소</button><button class="primary" data-action="save-schedules">예약 저장</button></div>`);
}
function updateScheduleField(target){
 const row=target.closest('[data-index]');if(!row)return false;
 const s=scheduleDraft[+row.dataset.index];
 if(target.dataset.sfield)s[target.dataset.sfield]=target.type==='checkbox'?target.checked:target.value;
 if(target.dataset.day!==undefined){const d=+target.dataset.day;s.days=target.checked?[...new Set([...s.days,d])].sort():s.days.filter(x=>x!==d);}
 if(target.dataset.sfield==='repeat'){if(s.repeat!=='weekly')s.days=[];drawSchedule();}
 else {row.querySelector('.schedule-summary').textContent=scheduleSummary(s);row.querySelector('.schedule-next').textContent=scheduleNextText(s);}
 return true;
}
function history(){
 return title('실행 기록','앱·상태·기간·실행 구분으로 기록을 찾아보세요.')+`<div class="filters history-filters"><label>앱<select data-history-filter="appId"><option value="">모든 앱</option>${state.apps.map(a=>`<option value="${a.id}" ${historyFilters.appId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><label>상태<select data-history-filter="status"><option value="">모든 상태</option>${Object.entries(statusNames).map(([v,l])=>`<option value="${v}" ${historyFilters.status===v?'selected':''}>${l}</option>`).join('')}</select></label><label>실행 구분<select data-history-filter="source"><option value="">전체</option><option value="manual" ${historyFilters.source==='manual'?'selected':''}>직접 실행</option><option value="schedule" ${historyFilters.source==='schedule'?'selected':''}>예약 실행</option></select></label><label>시작일 (Seoul)<input type="date" data-history-filter="from" value="${historyFilters.from}"></label><label>종료일 (Seoul)<input type="date" data-history-filter="to" value="${historyFilters.to}"></label><button data-action="reset-history">필터 초기화</button></div>`+section(historyData?`실행 ${historyData.total}건`:'실행 기록',historyError?`<div class="error">${esc(historyError)}</div>`:!historyData?'<p role="status">실행 기록을 불러오고 있습니다…</p>':historyData.items.length?historyData.items.map(r=>runRow(r)).join(''):'<p>조건에 맞는 실행 기록이 없습니다.</p>')+(historyData?`<div class="pagination"><button data-history-page="${historyData.page-1}" ${historyData.page<=1?'disabled':''}>이전</button><span>${historyData.page} / ${historyData.pageCount} 페이지 · ${historyData.pageSize}개씩</span><button data-history-page="${historyData.page+1}" ${historyData.page>=historyData.pageCount?'disabled':''}>다음</button></div>`:'');
}
async function loadHistory(){
 const request=++historyRequest;historyError='';
 const params=new URLSearchParams({...historyFilters,page:String(historyPage),pageSize:String(state.settings.historyCount)});
 try{const result=await api('runs?'+params);if(request!==historyRequest)return;historyData=result;historyPage=result.page;}
 catch(e){if(request!==historyRequest)return;historyData=null;historyError=e.message;}
 if(page==='history'&&!$('#dialog').open)render();
}
function highlightedLog(text,needle){
 if(!needle)return {html:esc(text),count:0};
 const regex=new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
 let html='',end=0,count=0;
 for(const match of text.matchAll(regex)){html+=esc(text.slice(end,match.index))+'<mark>'+esc(match[0])+'</mark>';end=match.index+match[0].length;count++;}
 return {html:html+esc(text.slice(end)),count};
}
function drawLog(){
 const node=$('#runLog');if(!node||!runDetails)return;
 const raw=runDetails.log||'',key=JSON.stringify([raw,logQuery]);if(key===renderedLog)return;
 const top=node.scrollTop,left=node.scrollLeft,result=highlightedLog(raw,logQuery);
 node.innerHTML=result.html||'출력을 기다리고 있습니다…';node.scrollTop=top;node.scrollLeft=left;
 $('#logMatches').textContent=logQuery?`${result.count}건 일치`:'';renderedLog=key;
}
async function renderRun(){
 if(!runId)return;
 const requestedId=runId,[r,files]=await Promise.all([api('runs/'+runId),api('runs/'+runId+'/files')]);
 if(runId!==requestedId)return;
 const a=state.apps.find(a=>a.id===r.appId);
 if(autoOpen&&a?.type==='service'&&r.status==='running'&&a.gateway.openUrl&&!renderRun.opened){renderRun.opened=true;location.replace(a.gateway.openUrl);return;}
 runDetails=r;runFiles=files;
 if($('#runView')?.dataset.id!==runId){
  renderedLog=null;
  $('#app').innerHTML=`<div class="run-page" id="runView" data-id="${runId}"><div class="brand"><span class="brandmark">${icon('grid')}</span>AppDash</div>${connectionMarkup()}${title(esc(r.appName),'실행 진행 상황과 결과','<span id="runStatus"></span>')}<div class="panel"><p id="runMeta"></p><div id="runReason" class="error spaced" hidden></div><div class="log-tools"><label>로그 검색<input id="logSearch" type="search" maxlength="200" value="${esc(logQuery)}" placeholder="검색어 입력"></label><span id="logMatches" role="status"></span><button data-action="copy-log">전체 로그 복사</button><a class="button-link" href="/api/runs/${runId}/log" download="${runId}.log">로그 다운로드</a></div><pre id="runLog" tabindex="0" aria-label="실행 로그"></pre><div class="actions"><button class="danger" id="stopRun">실행 종료</button><button data-action="confirm-rerun" id="rerunButton">재실행</button>${a?.gateway.openUrl?`<a href="${esc(a.gateway.openUrl)}" target="_blank" rel="noopener">앱 UI 열기 ↗</a>`:''}<a href="/#history" target="_blank" rel="noopener">워크스페이스 ↗</a></div></div>${section('결과 파일','<p id="resultExpiry"></p><div id="resultFiles"></div>')}</div>`;
 }
 $('#runStatus').innerHTML=badge(r);
 $('#runMeta').textContent=`${r.source==='schedule'?'예약':'직접'} 실행 · 시작 ${fullDate(r.startedAt)} · 종료 ${fullDate(r.endedAt)} · 소요 ${durationText(r)} · 종료 코드 ${r.exitCode??'—'}`;
 $('#runReason').hidden=!r.reason;$('#runReason').textContent=r.reason||'';
 drawLog();
 $('#stopRun').hidden=!['running','starting','stopping'].includes(r.status);
 $('#stopRun').onclick=async()=>{try{await api('runs/'+runId+'/stop','POST');await renderRun();}catch(e){toast(e.message);}};
 $('#rerunButton').disabled=!a||!!a.archived;
 $('#resultExpiry').textContent=r.resultExpiresAt?`${r.resultsExpired?'보관 기간 만료':'만료 예정일'}: ${fullDate(r.resultExpiresAt)} · 현재 보관 기간 ${r.retentionDays}일 기준`:`실행 종료 후 보관 기간 ${r.retentionDays??a?.retentionDays??30}일이 적용됩니다.`;
 const fileHtml=files.length?files.map(f=>`<div class="activity-row"><span class="activity-main">${esc(f.name)} <small>${f.size} bytes</small></span><a href="/api/runs/${r.id}/download?name=${encodeURIComponent(f.name)}" download>다운로드 ↓</a></div>`).join(''):`<p>${r.resultsExpired?'보관 기간이 지나 결과 파일이 정리되었습니다.':'아직 결과 파일이 없습니다.'}</p>`;
 if($('#resultFiles').innerHTML!==fileHtml)$('#resultFiles').innerHTML=fileHtml;
}
async function rerunFromForm(form){
 const ui=form.dataset.purpose==='ui',input=ui?{}:JSON.parse(new FormData(form).get('input'));
 const result=await api('apps/'+form.dataset.appId+(ui?'/start-ui':'/run'),'POST',input);
 const id=ui?result.runId:result.id;
 if(!id){$('#dialog').close();toast('앱이 외부에서 실행 중입니다. 카드에서 앱 화면을 열 수 있습니다.');return;}
 runId=id;autoOpen=false;logQuery='';renderedLog=null;$('#dialog').close();historyReplace();await refresh(false);await renderRun();
}

function confirmRerun(){
 const a=state.apps.find(a=>a.id===runDetails?.appId);if(!a)throw new Error('앱을 찾을 수 없습니다.');
 if(runDetails.purpose==='ui'){modal('앱 화면 시작 확인','<p>'+esc(a.name)+'의 화면 서버를 시작합니다. 이미 실행 중이면 기존 화면 서버를 사용하며, 예약 작업은 실행하지 않습니다.</p><form id="rerunForm" data-app-id="'+a.id+'" data-purpose="ui"><div class="actions"><button type="button" data-action="close">취소</button><button type="submit" class="primary">앱 화면 시작</button></div></form>');return;}
 modal('재실행 확인',`<p>${esc(a.name)}을 현재 앱 실행 설정으로 다시 실행합니다. 이전 실행의 외부 작업이 반복될 수 있으므로 입력을 확인하세요.</p><form id="rerunForm" data-app-id="${a.id}">${area('재실행 입력 · JSON 객체','input',JSON.stringify(runDetails.input??a.inputDefaults??{},null,2))}${runDetails.input===undefined?'<div class="help">이전 실행 입력이 저장되지 않아 현재 앱의 기본 입력을 사용합니다.</div>':''}<div class="actions"><button type="button" data-action="close">취소</button><button type="submit" class="primary">확인 후 재실행</button></div></form>`);
}

$('#dialog').addEventListener('cancel',async event=>{event.preventDefault();if(await discardChanges())$('#dialog').close();});
window.addEventListener('beforeunload',event=>{if($('#dialog').open&&dialogDirty()){event.preventDefault();event.returnValue='';}});
document.addEventListener('invalid',event=>{if(event.target===event.target.form?.querySelector('input:invalid,select:invalid,textarea:invalid'))revealInvalidField(event.target);},true);
document.addEventListener('keydown',event=>{const tab=event.target.closest?.('[data-management-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-management-tab]')];let index=tabs.indexOf(tab);index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectManagementTab(tabs[index].dataset.managementTab);tabs[index].focus();});
document.addEventListener('click',async e=>{
 for(const help of document.querySelectorAll('.type-help.is-open'))if(!help.contains(e.target)){help.classList.remove('is-open');help.querySelector('button').setAttribute('aria-expanded','false');}
 for(const menu of document.querySelectorAll('.card-more[open]'))if(!menu.contains(e.target))menu.open=false;
 const b=e.target.closest('button');if(!b)return;
 if(b.classList.contains('type-help-toggle')){const open=b.closest('.type-help').classList.toggle('is-open');b.setAttribute('aria-expanded',String(open));return;}
 try{
 const leavesDialog=b.dataset.nav||b.dataset.edit||b.dataset.schedule||b.dataset.versions||b.dataset.versionPreview||b.dataset.action==='close';
 if(leavesDialog&&!await discardChanges())return;
 if(b.dataset.managementTab){selectManagementTab(b.dataset.managementTab);return;}
 if(b.dataset.historyPage){historyPage=+b.dataset.historyPage;await loadHistory();return;}
 if(b.dataset.versionPreview){showVersionComparison(b.dataset.appId,b.dataset.versionPreview);return;}
 if(b.dataset.action==='reset-history'){historyFilters={appId:'',status:'',source:'',from:'',to:''};historyPage=1;historyData=null;render();await loadHistory();return;}
 if(b.dataset.action==='copy-log'){await navigator.clipboard.writeText(runDetails?.log||'');toast('전체 로그를 복사했습니다.');return;}
 if(b.dataset.action==='confirm-rerun'){confirmRerun();return;}
 if(await addedClick(b))return;
 if(b.dataset.nav){page=b.dataset.nav;location.hash=page;$('#dialog').close();render();if(page==='settings')void loadStorage();if(page==='history')void loadHistory();return;}

 if(b.dataset.startUi||b.dataset.stopUi){b.disabled=true;try{const id=b.dataset.startUi||b.dataset.stopUi;await api('apps/'+id+'/'+(b.dataset.startUi?'start-ui':'stop-ui'),'POST',{});await refresh();toast(b.dataset.startUi?'앱 시작을 요청했습니다.':'앱을 종료했습니다.');}finally{b.disabled=false;}return;}
 if(b.dataset.quickRun){b.disabled=true;try{await quickRun(b.dataset.quickRun);}finally{b.disabled=false;}return;}
 if(b.dataset.stopTask){b.disabled=true;try{await api('runs/'+b.dataset.stopTask+'/stop','POST',{});await refresh();}finally{b.disabled=false;}return;}
 if(b.dataset.appHistory){historyFilters={appId:b.dataset.appHistory,status:'',source:'',from:'',to:''};historyPage=1;historyData=null;page='history';location.hash=page;render();await loadHistory();return;}
 if(b.dataset.archiveApp){const app=state.apps.find(a=>a.id===b.dataset.archiveApp);modal(app.archived?'보관함에서 복원':'보관함으로 이동','<p>'+esc(app.name)+(app.archived?'을 복원합니다. 예약은 자동으로 재개되지 않습니다.':'을 보관합니다. 예약은 중단되며, 실행 중인 앱은 종료 버튼으로 따로 종료할 수 있습니다.')+'</p><div class="actions"><button data-action="close">취소</button><button class="primary" data-confirm-archive="'+app.id+'">확인</button></div>');return;}
 if(b.dataset.confirmArchive){const app=state.apps.find(a=>a.id===b.dataset.confirmArchive);await api('apps/'+app.id,'PUT',{...app,archived:!app.archived});$('#dialog').close();await refresh();return;}

 if(b.dataset.use)return useApp(b.dataset.use);
 if(b.dataset.openApp){openApp(b.dataset.openApp);$('#dialog').close();return;}
 if(b.dataset.edit){editing=state.apps.find(a=>a.id===b.dataset.edit);modal('앱 관리',createPage(editing));markDialogClean();return;}
 if(b.dataset.favorite){const a=state.apps.find(a=>a.id===b.dataset.favorite);await api('apps/'+a.id,'PUT',{...a,favorite:!a.favorite});await refresh();return;}
 if(b.dataset.run){window.open('/run?id='+b.dataset.run,'_blank','noopener');return;}
 if(b.dataset.schedule){scheduleModal(b.dataset.schedule);return;}
 if(b.dataset.removeSchedule!==undefined){scheduleDraft.splice(+b.dataset.removeSchedule,1);drawSchedule();return;}
 if(b.dataset.tab){tab=b.dataset.tab;render();return;}
 if(b.dataset.connection)return connectionModal(b.dataset.connection);
 if(b.dataset.token)return tokenModal(b.dataset.token);
 if(b.dataset.check){const r=await api('connections/'+b.dataset.check+'/check','POST');toast(r.message+(r.valid?'':' · 설정을 확인하세요.'));return;}
 if(b.dataset.pause){const c=state.connections.find(c=>c.id===b.dataset.pause);if(c.paused){await api('connections/'+c.id,'PUT',{...c,paused:false});await refresh();}else await impact('connections',c.id,()=>api('connections/'+c.id,'PUT',{...c,paused:true}));return;}
 if(b.dataset.deleteConnection)return impact('connections',b.dataset.deleteConnection,()=>api('connections/'+b.dataset.deleteConnection,'DELETE'));
 if(b.dataset.deleteToken)return impact('tokens',b.dataset.deleteToken,()=>api('tokens/'+b.dataset.deleteToken,'DELETE'));
 if(b.dataset.versions){const id=b.dataset.versions,vs=await api(`apps/${id}/versions`);versionCache=vs;modal('등록 설정 이력',`<p>AppDash 등록 설정만 복원합니다. 앱 소스와 외부 데이터는 되돌리지 않습니다.</p>${vs.map(v=>`<div class="version-row"><span>${date(v.createdAt)} · ${esc(v.config.name)} · v${esc(v.config.version)}</span><button data-version-preview="${v.id}" data-app-id="${id}">변경 비교</button></div>`).join('')}`);return;}
 if(b.dataset.restore){await api(`apps/${b.dataset.restore}/restore`,'POST',{versionId:b.dataset.version,expectedConfig:restoreExpected});$('#dialog').close();await refresh();toast('등록 설정을 복원했습니다.');return;}
 switch(b.dataset.action){case 'close':$('#dialog').close();break;case 'archive-filter':archive=!archive;render();break;case 'add-connection':connectionModal();break;case 'add-token':tokenModal();break;case 'add-schedule':scheduleDraft.push({repeat:'daily',time:'09:00',days:[],enabled:!state.apps.find(a=>a.id===scheduleApp)?.archived});drawSchedule();break;case 'save-schedules':await api(`apps/${scheduleApp}/schedules`,'PUT',scheduleDraft);scheduleBaseline=null;$('#dialog').close();await refresh();toast('예약을 저장했습니다.');break;case 'read-notifications':await api('notifications','POST');await refresh();break;case 'shutdown':modal('AppDash 종료',`<p>현재 소유한 실행 ${active().length}개와 AppDash 서버를 종료합니다. 예약은 다음 시작까지 실행되지 않습니다.</p><div class="actions"><button data-action="close">취소</button><button class="danger" data-action="shutdown-confirm">모두 종료</button></div>`);break;case 'shutdown-confirm':await api('shutdown','POST');$('#dialog').close();$('#app').innerHTML='<div class="run-page"><h1>AppDash를 종료했습니다.</h1><p>AppDash.bat를 실행하면 다시 시작합니다.</p></div>';clearInterval(poll);break;}
 }catch(err){toast(err.message);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const help of document.querySelectorAll('.type-help.is-open')){help.classList.remove('is-open');help.querySelector('button').setAttribute('aria-expanded','false');}});
document.addEventListener('change',async e=>{try{if(e.target.id==='appType'){for(const node of document.querySelectorAll('[data-service-only]')){node.hidden=e.target.value!=='service';for(const input of node.querySelectorAll('input,select,textarea'))input.disabled=e.target.value!=='service';}for(const node of document.querySelectorAll('[data-script-only]'))node.hidden=e.target.value==='service';const url=document.querySelector('[name="openUrl"]');if(url)url.required=e.target.value==='service';}if(e.target.dataset.historyFilter){historyFilters[e.target.dataset.historyFilter]=e.target.value;historyPage=1;historyData=null;await loadHistory();return;}if(e.target.id==='appSort'){appSort=e.target.value;render();}if(e.target.id==='importFile'){const file=e.target.files[0];if(!file)return;if(file.size>65536)throw new Error('설정 파일은 64 KiB 이하만 허용합니다.');const config=await api('import','POST',JSON.parse(await file.text()));$('#configForm').innerHTML=appForm(config);toast('가져왔습니다. 명령과 경로를 검토한 뒤 등록하세요.');}if(e.target.id==='typeFilter'){typeFilter=e.target.value;render();}if(e.target.id==='groupFilter'){groupFilter=e.target.value;render();}updateScheduleField(e.target);}catch(err){toast(err.message);}});
document.addEventListener('input',e=>{if(e.target.id==='logSearch'){logQuery=e.target.value;drawLog();return;}if(e.target.dataset.sfield==='time'){updateScheduleField(e.target);return;}if(e.target.id==='search'){query=e.target.value;const pos=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);}});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const submit=f.querySelector('[type=submit],button.primary');try{if(submit)submit.disabled=true;
 if(f.id==='appForm'){const value=readApp(f);if(value.archived&&active().some(r=>r.appId===f.dataset.id)&&!confirm('실행 중 앱은 계속 실행됩니다. 보관 후 실행 기록에서 종료할 수 있습니다. 보관할까요?'))return;await api('apps'+(f.dataset.id?'/'+f.dataset.id:''),f.dataset.id?'PUT':'POST',value);formBaseline=null;scheduleBaseline=null;$('#dialog').close();page='apps';location.hash=page;await refresh();toast('앱 설정을 저장했습니다.');}
 if(f.id==='quickRunForm'){const input=JSON.parse(new FormData(f).get('input'));await launchTask(f.dataset.id,input);$('#dialog').close();}
 if(f.id==='connectionForm'){const d=formData(f);await api('connections'+(f.dataset.id?'/'+f.dataset.id:''),f.dataset.id?'PUT':'POST',{...d,paused:d.paused==='true'});$('#dialog').close();await refresh();toast('연결을 저장했습니다.');}
 if(f.id==='tokenForm'){await api('tokens'+(f.dataset.id?'/'+f.dataset.id:''),f.dataset.id?'PUT':'POST',formData(f));f.reset();$('#dialog').close();await refresh();toast('토큰을 암호화하여 저장했습니다.');}
 if(f.id==='settingsForm'){const d=formData(f),v={};for(const [k,val]of Object.entries(state.settings)){if(k==='id')continue;v[k]=typeof val==='boolean'?!!d[k]:typeof val==='number'?+d[k]:d[k];}await api('settings','PUT',v);await refresh();toast('설정을 저장했습니다.');}
 if(f.id==='rerunForm')await rerunFromForm(f);
 if(f.id==='runInput'){const input=JSON.parse(new FormData(f).get('input'));await beginRun(input);}
 }catch(err){toast(err.message);}finally{if(submit)submit.disabled=false;}});
window.addEventListener('hashchange',async()=>{if($('#dialog').open){if(!await discardChanges()){window.history.replaceState(null,'','#'+page);return;}$('#dialog').close();}{page=location.hash.slice(1)||'home';render();if(page==='settings')void loadStorage();}});
let runId=new URLSearchParams(location.search).get('id'),runApp=new URLSearchParams(location.search).get('app'),runError='',autoOpen=!!runApp;
async function beginRun(input={}){try{const r=await api(`apps/${runApp}/run`,'POST',input);runId=r.id;historyReplace();await renderRun();}catch(e){runError=e.message;$('#app').innerHTML=`<div class="run-page"><h1>실행할 수 없습니다</h1><div class="error">${esc(runError)}</div><p><a href="/#connections">연결·토큰 확인</a></p></div>`;}}
function historyReplace(){window.history.replaceState(null,'','/run?id='+runId);}
let poll;
try {
 localStorage.removeItem('appdash-preview');localStorage.removeItem('appdash-preview-epoch');
 const params=new URLSearchParams(location.search);
 if(params.has('preview')){params.delete('preview');window.history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
 await refresh(false);
 if(location.pathname==='/run') {
  if(runId) await renderRun();
  else {
   const a=state.apps.find(a=>a.id===runApp);
   if(!a)throw new Error('앱을 찾을 수 없습니다.');
   if(a.askInput)$('#app').innerHTML=`<div class="run-page">${title(esc(a.name),'이번 실행에 전달할 입력을 확인하세요.')}<form id="runInput">${area('실행 입력 · JSON 객체','input',JSON.stringify(a.inputDefaults,null,2))}<button class="primary">실행</button></form></div>`;
   else await beginRun();
  }
 } else {render();if(page==='settings')void loadStorage();}
 poll=setInterval(async()=>{
  try {
   const previous=JSON.stringify(state);
   await refresh(false);
   if(location.pathname==='/run'){if(runId)await renderRun();}
   else if(page==='history'&&previous!==JSON.stringify(state)&&!$('#dialog').open&&!document.activeElement?.matches('input,select'))await loadHistory();
   else if(previous!==JSON.stringify(state)&&!$('#dialog').open&&!document.activeElement?.matches('input,textarea,select')&&!['create','settings'].includes(page))render();
  } catch {}
 },2500);
} catch(e){$('#app').innerHTML=`<div class="run-page"><h1>AppDash 연결 오류</h1><div class="error">${esc(e.message)}</div></div>`;}
