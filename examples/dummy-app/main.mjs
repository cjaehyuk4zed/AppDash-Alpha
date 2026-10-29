import fs from 'node:fs/promises';
import path from 'node:path';

const input=JSON.parse(process.env.APPDASH_INPUT_JSON||'{}');
const output=process.env.APPDASH_OUTPUT_DIR;
if(!output)throw new Error('APPDASH_OUTPUT_DIR이 필요합니다. AppDash에서 실행하세요.');
const items=Array.isArray(input.items)?input.items:['등록 설정 확인','예약 설정 확인','실행 결과 확인'];
console.log('DUMMY APP 시작');
console.log(`${items.length}개 항목을 정리합니다.`);
await new Promise(resolve=>setTimeout(resolve,1000));
await fs.mkdir(output,{recursive:true});
const summary={title:input.report||'작업 보고서',items,createdAt:new Date().toISOString()};
await fs.writeFile(path.join(output,'report.md'),`# ${summary.title}\n\n${items.map(item=>`- ${String(item)}`).join('\n')}\n`,'utf8');
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2),'utf8');
console.log('report.md, summary.json 저장 완료');
