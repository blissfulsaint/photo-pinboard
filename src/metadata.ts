import {messageOf} from './errors.js';
import type {FileLike,Metadata} from "./models.js";

import exifr from 'exifr';
import {createSHA256} from 'hash-wasm';
import {validGps} from './library.js';
export async function hashFile(file:Blob) {
 const hash=await createSHA256();hash.init();
 for(let offset=0;offset<file.size;offset+=2*1024*1024)hash.update(new Uint8Array(await file.slice(offset,offset+2*1024*1024).arrayBuffer()));
 return hash.digest('hex');
}
export async function readMetadata(file:FileLike):Promise<Metadata> {
 try {
  if(/^video\//.test(file.type??'')||/\.(mp4|mov|m4v|3gp|avi|mkv|webm|mts|m2ts|mpg|mpeg|wmv)$/i.test(file.name??''))return {kind:'video',scanState:'unreadable',scanError:'Video GPS detection and writing are available in the Windows desktop app.',embedded:null};
  const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const jpeg=head[0]===255&&head[1]===216;
  const tiff=(head[0]===73&&head[1]===73)||(head[0]===77&&head[1]===77);
  const png=head[0]===137&&head[1]===80;
  const heic=String.fromCharCode(...head.slice(4,8))==='ftyp';
  if(!jpeg&&!tiff&&!png&&!heic)return {scanState:'unreadable',scanError:'This format is not supported by the GPS reader.',embedded:null};
  if(jpeg){if(file.size<4)throw new Error('Truncated JPEG.');const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65536)).arrayBuffer());let eoi=false;for(let i=0;i<tail.length-1;i++)if(tail[i]===255&&tail[i+1]===217){eoi=true;break;}if(!eoi)throw new Error('JPEG end marker was not found.');}
  const input=typeof FileReader==='undefined'?new Uint8Array(await file.arrayBuffer()):file;
  const tags=await exifr.parse(input,{xmp:true,icc:false,iptc:false});
  const original = tags?.DateTimeOriginal;
  const capturedAt = original instanceof Date && Number.isFinite(original.getTime()) ? original.toISOString() : null;
  const embedded={lat:tags?.latitude,lng:tags?.longitude};
  if(validGps(embedded))return {scanState:'ready',embedded,capturedAt};
  if(tags?.GPSLatitude!==undefined||tags?.GPSLongitude!==undefined||tags?.latitude!==undefined||tags?.longitude!==undefined)throw new Error('GPS tags exist but could not be interpreted reliably.');
  return {scanState:'ready',embedded:null,capturedAt};
 } catch(error) {return {scanState:'unreadable',scanError:messageOf(error)||'Metadata could not be read.',embedded:null};}
}
export async function inspectFile(file:FileLike) {
 const hash=await hashFile(file);
 return {hash,...await readMetadata(file)};
}


export async function readExifCaptureFields(bytes:Uint8Array) {
 const tags=await exifr.parse(bytes,{pick:['DateTimeOriginal','OffsetTimeOriginal'],reviveValues:false});
 return {date:tags?.DateTimeOriginal,offset:tags?.OffsetTimeOriginal};
}
