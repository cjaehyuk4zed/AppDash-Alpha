const minute=60000;
export function matches(s,date) {const local=new Date(date.getTime()+9*3600000);const d=local.getUTCDay();return local.toISOString().slice(11,16)===s.time&&(s.repeat==='daily'||s.repeat==='weekdays'&&d>=1&&d<=5||s.repeat==='weekly'&&s.days.includes(d));}
export function nextDue(s,from=new Date()) {let t=Math.floor(from.getTime()/minute)*minute+minute;for(let i=0;i<8*1440;i++,t+=minute)if(matches(s,new Date(t)))return new Date(t).toISOString();return null;}
export function latestDue(s,from=new Date()) {let t=Math.floor(from.getTime()/minute)*minute;for(let i=0;i<8*1440;i++,t-=minute)if(matches(s,new Date(t)))return new Date(t).toISOString();return null;}
