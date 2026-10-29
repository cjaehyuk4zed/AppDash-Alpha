import { list, get, settings } from './store.mjs';
import { check } from './validation.mjs';

function seoulDay(value,end=false) {
 if(!value)return null;
 check(/^\d{4}-\d{2}-\d{2}$/.test(value),'날짜는 YYYY-MM-DD 형식이어야 합니다.');
 const date=new Date(`${value}T00:00:00+09:00`);
 check(Number.isFinite(date.getTime())&&new Date(date.getTime()+9*3600000).toISOString().slice(0,10)===value,'존재하지 않는 날짜입니다.');
 return date.getTime()+(end?86400000-1:0);
}
export function runHistory(params) {
 const appId=params.get('appId')||'',status=params.get('status')||'',source=params.get('source')||'';
 check(!status||['starting','running','stopping','succeeded','failed','blocked','skipped','interrupted','stopped'].includes(status),'실행 상태가 올바르지 않습니다.');
 check(!source||['manual','schedule'].includes(source),'실행 구분이 올바르지 않습니다.');
 const from=seoulDay(params.get('from')),to=seoulDay(params.get('to'),true);
 check(from===null||to===null||from<=to,'시작 날짜는 종료 날짜보다 늦을 수 없습니다.');
 const requestedPage=Number(params.get('page')||1),pageSize=Number(params.get('pageSize')||settings().historyCount);
 check(Number.isInteger(requestedPage)&&requestedPage>0&&Number.isInteger(pageSize)&&pageSize>0&&pageSize<=500,'페이지 범위를 확인하세요.');
 const rows=list('runs').filter(r=>(!appId||r.appId===appId)&&(!status||r.status===status)&&(!source||r.source===source)&&(from===null||Date.parse(r.startedAt)>=from)&&(to===null||Date.parse(r.startedAt)<=to));
 const total=rows.length,pageCount=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requestedPage,pageCount);
 return {items:rows.slice((page-1)*pageSize,page*pageSize).map(({log,input,...r})=>r),total,page,pageSize,pageCount};
}
export function runDetail(run) {
 const retentionDays=get('apps',run.appId)?.retentionDays??settings().retentionDays;
 return {...run,retentionDays,resultExpiresAt:run.endedAt?new Date(Date.parse(run.endedAt)+retentionDays*86400000).toISOString():null};
}
