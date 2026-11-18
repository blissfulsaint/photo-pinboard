import type {CaptureDate,CaptureInput,Gps,FileLike} from "./models.js";
import {parseCaptureDate} from './capture-date.js';
import {writeJpegCaptureDate} from './jpeg.js';
import {hashFile,readMetadata,readExifCaptureFields} from './metadata.js';
import {sameGps} from './library.js';

export async function verifyCaptureDate(file:FileLike,capture:CaptureDate,gps:Gps|null|undefined){
 const info=await readMetadata(file);
 const fields=await readExifCaptureFields(new Uint8Array(await file.arrayBuffer()));
 const locationMatches=gps?sameGps(info.embedded,gps):info.embedded===null;
 if(info.scanState!=='ready'||!info.capturedAt||fields.date!==capture.exif||fields.offset!==capture.offset||!locationMatches){
  throw new Error('Capture date or preserved GPS failed verification.');
 }
 return info;
}

export async function prepareCaptureDate(file:FileLike,input:CaptureInput){
 if(file.size>100*1024*1024)throw new Error('JPEG writing is limited to 100 MB per file.');
 const capture=parseCaptureDate(input.value,input.offset);
 const before=await readMetadata(file);
 if(before.scanState!=='ready'||before.capturedAt!==null){
  throw new Error('This photo already has a capture date or its metadata needs review.');
 }
 const bytes=writeJpegCaptureDate(new Uint8Array(await file.arrayBuffer()),capture);
 const output=new Blob([bytes],{type:'image/jpeg'});
 await verifyCaptureDate(output,capture,before.embedded);
 return {bytes,hash:await hashFile(output)};
}
