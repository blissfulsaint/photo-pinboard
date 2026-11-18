
import {validGps} from './library.js';
const EXIF=[69,120,105,102,0,0];
function concat(parts){const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){output.set(part,at);at+=part.length;}return output;}
function segments(bytes){
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw new Error('Only JPEG files can be written.');
 const result=[];let at=2;
 while(at<bytes.length){
  const start=at;if(bytes[at++]!==255)throw new Error('Malformed JPEG marker.');
  while(bytes[at]===255)at++;
  const marker=bytes[at++];
  if(marker===218||marker===217){result.push({start,end:bytes.length,marker});return result;}
  if(marker===1||(marker>=208&&marker<=215)){result.push({start,end:at,marker});continue;}
  if(at+2>bytes.length)throw new Error('Truncated JPEG.');
  const length=(bytes[at]<<8)|bytes[at+1];
  if(length<2||at+length>bytes.length)throw new Error('Invalid JPEG segment length.');
  result.push({start,end:at+length,marker,payload:at+2});at+=length;
 }
 throw new Error('JPEG has no image scan.');
}
function patchTiff(original,gps,capture){
 const old=original??new Uint8Array([73,73,42,0,8,0,0,0,0,0,0,0,0,0]);
 if(old.length<8)throw new Error('Invalid EXIF header.');
 const little=old[0]===73&&old[1]===73;
 if(!little&&!(old[0]===77&&old[1]===77))throw new Error('Unknown TIFF byte order.');
 const oldView=new DataView(old.buffer,old.byteOffset,old.length);
 const read16=at=>oldView.getUint16(at,little),read32=at=>oldView.getUint32(at,little);
 if(read16(2)!==42)throw new Error('Unsupported EXIF TIFF format.');
 const entriesAt=offset=>{
  if(offset<8||offset+2>old.length)throw new Error('Invalid EXIF directory pointer.');
  const count=read16(offset),end=offset+2+count*12;
  if(end+4>old.length)throw new Error('Truncated EXIF directory.');
  return {entries:Array.from({length:count},(_,i)=>old.slice(offset+2+i*12,offset+14+i*12)),next:read32(end)};
 };
 const root=entriesAt(read32(4));
 const getTag=e=>new DataView(e.buffer,e.byteOffset,e.byteLength).getUint16(0,little);
 if(capture){
  const pointers=root.entries.filter(e=>getTag(e)===34665);
  if(pointers.length>1)throw new Error('Ambiguous EXIF directories.');
  const directory=pointers.length?readExifDirectory(pointers[0]):{entries:[],next:0};
  function readExifDirectory(entry){
   const view=new DataView(entry.buffer,entry.byteOffset,entry.byteLength);
   if(view.getUint16(2,little)!==4||view.getUint32(4,little)!==1)throw new Error('Invalid EXIF directory.');
   return entriesAt(view.getUint32(8,little));
  }
  const encoder=new TextEncoder();
  const date=encoder.encode(capture.exif+'\0'),zone=encoder.encode(capture.offset+'\0');
  const dateAt=(old.length+1)&~1,zoneAt=dateAt+date.length,exifAt=(zoneAt+zone.length+1)&~1;
  const rootEntries=root.entries.filter(e=>getTag(e)!==34665);
  const exifEntries=directory.entries.filter(e=>![36867,36881,37521].includes(getTag(e)));
  const rootAt=exifAt+6+(exifEntries.length+2)*12;
  const output=new Uint8Array(rootAt+6+(rootEntries.length+1)*12);
  output.set(old);output.set(date,dateAt);output.set(zone,zoneAt);
  const view=new DataView(output.buffer);
  function makeEntry(tag,type,count,value){
   const bytes=new Uint8Array(12),entry=new DataView(bytes.buffer);
   entry.setUint16(0,tag,little);entry.setUint16(2,type,little);
   entry.setUint32(4,count,little);entry.setUint32(8,value,little);
   return bytes;
  }
  function writeDirectory(at,entries,next){
   entries.sort((a,b)=>getTag(a)-getTag(b));
   view.setUint16(at,entries.length,little);
   entries.forEach((entry,index)=>output.set(entry,at+2+index*12));
   view.setUint32(at+2+entries.length*12,next,little);
  }
  exifEntries.push(makeEntry(36867,2,date.length,dateAt),makeEntry(36881,2,zone.length,zoneAt));
  rootEntries.push(makeEntry(34665,4,1,exifAt));
  writeDirectory(exifAt,exifEntries,directory.next);
  writeDirectory(rootAt,rootEntries,root.next);
  view.setUint32(4,rootAt,little);
  return output;
 }
 const pointers=root.entries.filter(e=>getTag(e)===34853);
 if(pointers.length>1)throw new Error('Ambiguous GPS directories.');
 let gpsEntries=[];
 if(pointers.length){
  // Buffer slices share a backing allocation; honor this entry’s byte range.
  const pointer=new DataView(pointers[0].buffer,pointers[0].byteOffset,pointers[0].byteLength);
  if(pointer.getUint16(2,little)!==4||pointer.getUint32(4,little)!==1)throw new Error('Invalid GPS directory.');
  gpsEntries=entriesAt(pointer.getUint32(8,little)).entries.filter(e=>![0,1,2,3,4].includes(getTag(e)));
 }
 const latOffset=(old.length+1)&~1,lngOffset=latOffset+24,gpsOffset=lngOffset+24;
 const gpsCount=gpsEntries.length+5,rootOffset=gpsOffset+2+gpsCount*12+4;
 const rootEntries=root.entries.filter(e=>getTag(e)!==34853);
 const output=new Uint8Array(rootOffset+2+(rootEntries.length+1)*12+4);output.set(old);
 const view=new DataView(output.buffer);
 const set16=(at,value)=>view.setUint16(at,value,little),set32=(at,value)=>view.setUint32(at,value,little);
 const entry=(tag,type,count,value,inline=false)=>{const e=new Uint8Array(12),v=new DataView(e.buffer);v.setUint16(0,tag,little);v.setUint16(2,type,little);v.setUint32(4,count,little);if(inline)e.set(value,8);else v.setUint32(8,value,little);return e;};
 const rational=(at,value)=>{const abs=Math.abs(value),degrees=Math.floor(abs),minutes=Math.floor((abs-degrees)*60),seconds=Math.round(((abs-degrees)*60-minutes)*60*1000000);[[degrees,1],[minutes,1],[seconds,1000000]].forEach(([n,d],i)=>{set32(at+i*8,n);set32(at+i*8+4,d);});};
 rational(latOffset,gps.lat);rational(lngOffset,gps.lng);
 gpsEntries.push(entry(0,1,4,[2,3,0,0],true),entry(1,2,2,[gps.lat<0?83:78,0],true),entry(2,5,3,latOffset),entry(3,2,2,[gps.lng<0?87:69,0],true),entry(4,5,3,lngOffset));
 const writeDirectory=(offset,entries,next)=>{entries.sort((a,b)=>getTag(a)-getTag(b));set16(offset,entries.length);entries.forEach((e,i)=>output.set(e,offset+2+i*12));set32(offset+2+entries.length*12,next);};
 writeDirectory(gpsOffset,gpsEntries,0);
 rootEntries.push(entry(34853,4,1,gpsOffset));writeDirectory(rootOffset,rootEntries,root.next);set32(4,rootOffset);
 return output;
}
export function writeJpegGps(bytes,gps){
 if(!validGps(gps))throw new Error('Invalid GPS coordinates.');
 return writeJpegExif(bytes,gps,null);
}
export function writeJpegCaptureDate(bytes,capture){return writeJpegExif(bytes,null,capture);}
function writeJpegExif(bytes,gps,capture){
 const list=segments(bytes);
 const exif=list.filter(s=>s.marker===225&&EXIF.every((b,i)=>bytes[s.payload+i]===b));
 if(exif.length>1)throw new Error('Multiple EXIF blocks need a dedicated metadata editor.');
 for(const s of list.filter(s=>s.marker===225&&!exif.includes(s))){
  const text=new TextDecoder().decode(bytes.subarray(s.payload,s.end));
  if(capture&&/DateTimeOriginal|DateCreated|CreateDate/i.test(text))throw new Error('This JPEG has additional date metadata. Review it in a full metadata editor.');
  if(gps&&/GPSLatitude|GPSLongitude|GPSPosition/i.test(text))throw new Error('This JPEG has additional location metadata. Use a full metadata editor to keep its location fields consistent.');
 }
 const original=exif[0],tiff=patchTiff(original?bytes.slice(original.payload+6,original.end):null,gps,capture);
 const length=tiff.length+8;if(length>65535)throw new Error('EXIF block is too large to extend safely.');
 const block=concat([new Uint8Array([255,225,length>>8,length&255,...EXIF]),tiff]);
 return original?concat([bytes.subarray(0,original.start),block,bytes.subarray(original.end)]):concat([bytes.subarray(0,2),block,bytes.subarray(2)]);
}
export function validateJpeg(bytes){segments(bytes);return true;}
