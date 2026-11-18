
import {createReadStream} from 'node:fs';
import fs = require('node:fs/promises');
import {Readable} from 'node:stream';
import path = require('node:path');
function parseRange(value:string|null,size:number){
 if(!value)return null;
 const match=value.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))throw new Error('Invalid byte range.');
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new Error('Unsatisfiable range.');
 return {start,end:Math.min(end,size-1)};
}
async function mediaResponse(file:string,request:Request){
 const size=(await fs.stat(file)).size;
 const types:Record<string,string>={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.3gp':'video/3gpp','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
 const headers:Record<string,string>={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
 let range;try{range=parseRange(request.headers.get('range'),size);}catch{return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+size}});}
 if(range){headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+size;headers['Content-Length']=String(range.end-range.start+1);}
 else headers['Content-Length']=String(size);
 if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
 const stream=createReadStream(file,range||{});
 return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array<ArrayBuffer>>,{status:range?206:200,headers});
}
export {parseRange,mediaResponse};
