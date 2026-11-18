
const fs=require('node:fs/promises'),path=require('node:path'),{createReadStream}=require('node:fs'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
const VIDEO=/\.(mp4|mov|m4v|3gp|3g2|avi|mkv|webm|mts|m2ts|mpg|mpeg|wmv)$/i;
const WRITABLE=/\.(mp4|mov|m4v)$/i;
const MAX_MOOV=64*1024*1024,XYZ='\xa9xyz',KEY='com.apple.quicktime.location.ISO6709';
function toolPath(){return __dirname.includes('.asar'+path.sep)?path.join(__dirname,'..','..','tools','ffprobe.exe'):path.join(__dirname,'..','vendor','ffprobe.exe');}
function parseIso6709(value){
 const match=String(value??'').trim().match(/^([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]+)?\/?$/);
 if(!match)return null;
 const lat=Number(match[1]),lng=Number(match[2]);return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
function iso6709(gps){if(!Number.isFinite(gps.lat)||!Number.isFinite(gps.lng)||Math.abs(gps.lat)>90||Math.abs(gps.lng)>180)throw new Error('Invalid coordinates.');return (gps.lat<0?'-':'+')+Math.abs(gps.lat).toFixed(6).padStart(9,'0')+(gps.lng<0?'-':'+')+Math.abs(gps.lng).toFixed(6).padStart(10,'0')+'/';}
async function probe(file){
 const {stdout}=await run(toolPath(),['-v','error','-show_format','-show_streams','-show_chapters','-of','json',file],{windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
 return JSON.parse(stdout);
}
function locations(info){
 const values=[];
 for(const tags of [info.format?.tags,...(info.streams??[]).map(s=>s.tags)]){
  for(const [key,value]of Object.entries(tags??{}))if(/^(location(?:-[a-z]{3})?|com\.apple\.quicktime\.location\.ISO6709|GPSCoordinates)$/i.test(key))values.push({key,value,gps:parseIso6709(value)});
 }
 return values;
}
function videoCaptureDate(info){
 for(const tags of [info.format?.tags,...(info.streams??[]).map(stream=>stream.tags)]){
  for(const [key,value] of Object.entries(tags??{})){
   if(!/^(creation_time|date|com\.apple\.quicktime\.creationdate|dateTimeOriginal|dateTimeDigitized)$/i.test(key))continue;
   const timestamp=Date.parse(value);
   if(Number.isFinite(timestamp))return new Date(timestamp).toISOString();
  }
 }
 return null;
}
function patchMovieDate(movie,iso){
 const headers=boxes(movie.bytes,movie.header).filter(node=>node.type==='mvhd');
 if(headers.length!==1)throw new Error('Expected one video creation header.');
 const header=headers[0],start=header.payload;
 const bytes=Buffer.from(movie.bytes),version=bytes[start];
 const seconds=BigInt(Date.parse(iso)/1000)+2082844800n;
 if(seconds<=0n)throw new Error('Video capture dates must be after January 1, 1904.');
 if(version===0&&header.end>=start+8&&seconds<=0xffffffffn)bytes.writeUInt32BE(Number(seconds),start+4);
 else if(version===1&&header.end>=start+12)bytes.writeBigUInt64BE(seconds,start+4);
 else throw new Error('This video header cannot store the selected date.');
 return bytes;
}
function probeMetadata(info,file){
 const found=locations(info),valid=found.filter(v=>v.gps),gps=valid[0]?.gps??null;
 const conflicting=valid.some(v=>Math.abs(v.gps.lat-gps.lat)>0.0001||Math.abs(v.gps.lng-gps.lng)>0.0001);
 const supported=WRITABLE.test(file)&&/mov|mp4/.test(info.format?.format_name??'');
 const unreadable=conflicting||found.some(v=>!v.gps)||!supported;
 return {scanState:unreadable?'unreadable':'ready',scanError:conflicting?'Video has conflicting location fields. Review before assigning.':found.some(v=>!v.gps)?'Video has location metadata that could not be interpreted.':!supported?'GPS detection/writing is currently supported for MP4, MOV and M4V videos.':null,embedded:conflicting?null:gps,kind:'video',duration:Number(info.format?.duration)||null,videoCodec:info.streams?.find(s=>s.codec_type==='video')?.codec_name??null,capturedAt:videoCaptureDate(info)};
}
async function readVideo(file){try{return probeMetadata(await probe(file),file);}catch(error){return {kind:'video',scanState:'unreadable',scanError:'Video metadata could not be read: '+error.message,embedded:null};}}
function boxes(buffer,start=0,end=buffer.length){
 const entries=[];let offset=start;
 while(offset<end){
  if(end-offset<8)throw new Error('Truncated video metadata box.');
  let size=buffer.readUInt32BE(offset),header=8;
  if(size===1){if(end-offset<16)throw new Error('Truncated extended box.');const large=buffer.readBigUInt64BE(offset+8);if(large>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Video box is too large.');size=Number(large);header=16;}
  if(size===0)size=end-offset;
  if(size<header||offset+size>end)throw new Error('Invalid video metadata box size.');
  entries.push({type:buffer.toString('latin1',offset+4,offset+8),start:offset,end:offset+size,size,header,payload:offset+header,bytes:buffer.subarray(offset,offset+size)});
  offset+=size;
 }
 return entries;
}
function box(type,payload){
 const result=Buffer.alloc(8+payload.length);result.writeUInt32BE(result.length,0);
 if(Buffer.isBuffer(type))type.copy(result,4);else result.write(type,4,4,'latin1');
 payload.copy(result,8);return result;
}
function textData(value){const header=Buffer.alloc(8);header.writeUInt32BE(1,0);return box('data',Buffer.concat([header,Buffer.from(value)]));}
function patchMeta(node,value){
 const payload=node.bytes.subarray(node.header),prefix=payload.readUInt32BE(0)===0?4:0,children=boxes(payload,prefix),keys=children.find(c=>c.type==='keys'),ilst=children.find(c=>c.type==='ilst');
 if(!keys||!ilst)return node.bytes; // Keep non-keyed metadata intact; canonical GPS is also written in UserData.
 const keyPayload=keys.bytes.subarray(keys.header);
 if(keyPayload.length<8)throw new Error('Truncated video metadata keys.');
 const count=keyPayload.readUInt32BE(4),targets=new Set();let offset=8;
 for(let i=1;i<=count;i++){
  if(offset+8>keyPayload.length)throw new Error('Invalid video metadata key.');
  const length=keyPayload.readUInt32BE(offset);if(length<8||offset+length>keyPayload.length)throw new Error('Invalid video metadata key length.');
  const key=keyPayload.toString('utf8',offset+8,offset+length);
  if(key===KEY||/^location(?:-[a-z]{3})?$/i.test(key))targets.add(i);
  offset+=length;
 }
 if(!targets.size)return node.bytes;
 const items=boxes(ilst.bytes,ilst.header).map(item=>{
  const index=item.bytes.readUInt32BE(4);if(!targets.has(index))return item.bytes;
  const data=boxes(item.bytes,item.header).filter(c=>c.type!=='data').map(c=>c.bytes);
  return box(item.bytes.subarray(4,8),Buffer.concat([...data,textData(value)]));
 });
 const rebuilt=box('ilst',Buffer.concat(items));
 return box('meta',Buffer.concat([payload.subarray(0,prefix),...children.map(c=>c===ilst?rebuilt:c.bytes)]));
}
function patchContainer(node,value){
 const children=boxes(node.bytes,node.header);let foundUserData=false;
 const output=children.map(child=>{
  if(child.type==='udta'){
   foundUserData=true;
   const data=boxes(child.bytes,child.header).filter(c=>c.type!==XYZ&&c.type!=='loci');
   const text=Buffer.from(value),head=Buffer.alloc(4);head.writeUInt16BE(text.length);head.writeUInt16BE(0x55c4,2); // 'und'
   return box('udta',Buffer.concat([...data.map(c=>c.type==='meta'?patchMeta(c,value):c.bytes),box(XYZ,Buffer.concat([head,text]))]));
  }
  if(child.type==='meta')return patchMeta(child,value);
  if(child.type==='trak'||child.type==='mdia')return patchContainer(child,value);
  return child.bytes;
 });
 if(node.type==='moov'){
  if(!foundUserData){const text=Buffer.from(value),head=Buffer.alloc(4);head.writeUInt16BE(text.length);head.writeUInt16BE(0x55c4,2);output.push(box('udta',box(XYZ,Buffer.concat([head,text]))));}

 }
 return box(node.type,Buffer.concat(output));
}
async function topLevel(file){
 const handle=await fs.open(file,'r');try{
  const {size:total}=await handle.stat(),entries=[];let offset=0;
  while(offset<total){
   const header=Buffer.alloc(16),{bytesRead}=await handle.read(header,0,Math.min(16,total-offset),offset);
   if(bytesRead<8)throw new Error('Truncated video container.');
   const initial=header.readUInt32BE(0);let size=initial,headerSize=8;
   if(size===1){if(bytesRead<16)throw new Error('Truncated extended video box.');const n=header.readBigUInt64BE(8);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Video box is too large.');size=Number(n);headerSize=16;}
   if(size===0)size=total-offset;
   if(size<headerSize||offset+size>total)throw new Error('Invalid video box size.');
   entries.push({type:header.toString('latin1',4,8),offset,size,header:headerSize,openEnded:initial===0});offset+=size;
  }
  return entries;
 }finally{await handle.close();}
}
async function mediaHashes(file,entries){
 const result=[];
 for(const entry of entries.filter(e=>e.type==='mdat')){
  const hash=createHash('sha256');const start=entry.offset+entry.header,end=entry.offset+entry.size-1;
  if(end>=start)for await(const chunk of createReadStream(file,{start,end}))hash.update(chunk);
  result.push({bytes:entry.size-entry.header,sha256:hash.digest('hex')});
 }
 return result;
}
async function prepareVideo(source,destination,gps,capture){
 if(!WRITABLE.test(source))throw new Error('Video writing supports MP4, MOV and M4V.');
 const entries=await topLevel(source),moovs=entries.filter(e=>e.type==='moov'),media=entries.filter(e=>e.type==='mdat');
 if(moovs.length!==1||!media.length)throw new Error('Unsupported video layout: expected one movie header and media data.');
 if(entries.some(e=>['moof','sidx','mfra'].includes(e.type)))throw new Error('Fragmented videos need a dedicated metadata tool; the original was not changed.');
 if(entries.some(e=>e.openEnded&&e.size>0xffffffff))throw new Error('Open-ended video boxes over 4 GB are not supported.');
 const moov=moovs[0];if(moov.size>MAX_MOOV)throw new Error('Movie metadata exceeds the supported 64 MB limit.');
 const handle=await fs.open(source,'r');let original;
 try{original=Buffer.alloc(moov.size);const result=await handle.read(original,0,moov.size,moov.offset);if(result.bytesRead!==moov.size)throw new Error('Movie header could not be read.');}finally{await handle.close();}
 if(gps&&/exif:GPSLatitude|exif:GPSLongitude/.test(original.toString('latin1')))throw new Error('This video contains XMP GPS fields that need a full metadata editor.');
 const before=await probe(source);
 if(capture&&(videoCaptureDate(before)||/DateTimeOriginal|DateCreated|CreateDate|CreationDate/i.test(original.toString('latin1'))))throw new Error('This video already has date metadata.');
 const movie=boxes(original)[0];
 const updated=capture?patchMovieDate(movie,capture.iso):patchContainer(movie,iso6709(gps));
 await fs.copyFile(source,destination,require('node:fs').constants.COPYFILE_EXCL);
 const writable=await fs.open(destination,'r+');
 try{
  // Keep every existing data offset valid: retire the old moov and append the updated header.
  for(const entry of entries.filter(e=>e.openEnded)){const length=Buffer.alloc(4);length.writeUInt32BE(entry.size);await writable.write(length,0,4,entry.offset);}
  await writable.write(Buffer.from('free'),0,4,moov.offset+4);
  const size=(await writable.stat()).size;await writable.write(updated,0,updated.length,size);await writable.sync();
 }finally{await writable.close();}
 const after=await probe(destination);
 const actual=locations(after).filter(v=>v.gps);
 if(gps&&(!actual.length||actual.some(v=>Math.abs(v.gps.lat-gps.lat)>0.000001||Math.abs(v.gps.lng-gps.lng)>0.000001)))throw new Error('Saved video GPS failed independent readback.');

 const cleanTags=tags=>Object.entries(tags??{}).filter(([key])=>capture?key!=='creation_time':!/^(location(?:-[a-z]{3})?|com\.apple\.quicktime\.location\.ISO6709|GPSCoordinates)$/i.test(key)).sort(([a],[b])=>a.localeCompare(b));
 if(JSON.stringify(cleanTags(before.format?.tags))!==JSON.stringify(cleanTags(after.format?.tags)))throw new Error('Unrelated video metadata changed unexpectedly.');
 if(JSON.stringify(before.chapters??[])!==JSON.stringify(after.chapters??[]))throw new Error('Video chapter metadata changed unexpectedly.');
 const signature=info=>(info.streams??[]).map(s=>({type:s.codec_type,codec:s.codec_name,tag:s.codec_tag_string,width:s.width,height:s.height,sampleRate:s.sample_rate,channels:s.channels,frames:s.nb_frames,duration:s.duration,timeBase:s.time_base,rotate:s.tags?.rotate,display:s.side_data_list?.filter(d=>d.side_data_type==='Display Matrix')}));
 if(JSON.stringify(signature(before))!==JSON.stringify(signature(after)))throw new Error('Video stream metadata changed unexpectedly.');
 if(capture&&videoCaptureDate(after)!==capture.iso)throw new Error('Saved video capture date failed independent readback.');
 if(!capture&&before.format?.tags?.creation_time!==after.format?.tags?.creation_time)throw new Error('Video creation timestamp changed unexpectedly.');
 const hashes=await mediaHashes(source,entries),afterHashes=await mediaHashes(destination,await topLevel(destination));
 if(JSON.stringify(hashes)!==JSON.stringify(afterHashes))throw new Error('Video/audio data verification failed.');
 return {embedded:capture?probeMetadata(after,destination).embedded:{lat:gps.lat,lng:gps.lng},duration:Number(after.format?.duration)||null,mediaHashes:hashes};
}
module.exports={VIDEO,WRITABLE,toolPath,probe,readVideo,probeMetadata,parseIso6709,iso6709,boxes,box,topLevel,mediaHashes,prepareVideo};
