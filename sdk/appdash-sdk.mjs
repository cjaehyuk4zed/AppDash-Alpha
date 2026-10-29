export async function getToken(name,{fresh=false}={}) {
 if(!fresh&&process.env[name])return process.env[name];
 if(!process.env.APPDASH_URL||!process.env.APPDASH_TOKEN_ACCESS_KEY)throw new Error('AppDash 실행 권한이 없습니다. 앱 자체 인증 설정을 확인하세요.');
 const response=await fetch(`${process.env.APPDASH_URL}/api/runtime/tokens/${encodeURIComponent(name)}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.APPDASH_TOKEN_ACCESS_KEY}`}});
 if(!response.ok)throw new Error('토큰 조회가 거부되었습니다.');return (await response.json()).value;
}
