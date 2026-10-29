// Keep unfinished secret prefixes between chunks, including across line breaks.
export function logFilter(secrets,append) {
 let pending='';
 function flush(ending=false) {
  const values=[...new Set(secrets.filter(Boolean))].sort((a,b)=>b.length-a.length);
  let offset=0,output='';
  while(offset<pending.length){
   let next=pending.length;
   for(const value of values){const index=pending.indexOf(value[0],offset);if(index>=0)next=Math.min(next,index);}
   if(next>offset){output+=pending.slice(offset,next);offset=next;continue;}
   const rest=pending.slice(offset);
   if(!ending&&values.some(value=>value.length>rest.length&&value.startsWith(rest)))break;
   const match=values.find(value=>rest.startsWith(value));
   if(match){output+='[REDACTED]';offset+=match.length;}else output+=pending[offset++];
  }
  pending=pending.slice(offset);if(output)append(output);
 }
 return {write(value){pending+=value;flush();},end(){flush(true);}};
}

export function boundedLog(text,maxBytes=128*1024){
 const bytes=Buffer.from(text,'utf8');if(bytes.length<=maxBytes)return text;
 let start=bytes.length-maxBytes;while(start<bytes.length&&(bytes[start]&0xc0)===0x80)start++;
 return bytes.subarray(start).toString('utf8');
}
