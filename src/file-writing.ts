import {messageOf} from './errors.js';
import type {MediaRecord,SourceDirectory,SourceFileHandle,Gps,CaptureDate,FileLike} from "./models.js";
import {hashFile,readMetadata} from './metadata.js';
import {sameGps} from './library.js';
import {verifyCaptureDate} from './capture-writing.js';

export function sourceRelativeParts(photo:Pick<MediaRecord,'path'|'name'>){
 const parts=photo.path.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw new Error('Invalid source path.');
 if(parts.length>1)parts.shift(); // Browser directory imports include the selected root folder.
 if(parts.at(-1)!==photo.name)throw new Error('Source filename does not match the imported photo.');
 return parts;
}
export async function prepareOriginal(directory:SourceDirectory,photo:Pick<MediaRecord,'path'|'name'|'hash'>){
 if(!photo.hash)throw new Error('Wait for the identity scan to finish before writing originals.');
 const parts=sourceRelativeParts(photo);
 let parent=directory;
 for(const segment of parts.slice(0,-1))parent=await parent.getDirectoryHandle(segment,{create:false});
 const handle=await parent.getFileHandle(parts.at(-1)!,{create:false});
 const file=await handle.getFile();
 const snapshot=new Blob([await file.arrayBuffer()],{type:file.type||'image/jpeg'});
 if(await hashFile(snapshot)!==photo.hash)throw new Error('Source file changed or the wrong folder was chosen. Reopen the source folder before trying again.');
 return {handle,snapshot};
}
async function writeBlob(handle:SourceFileHandle,blob:Blob){
 const writable=await handle.createWritable({keepExistingData:false});
 try{await writable.write(blob);await writable.close();}
 catch(error){try{await writable.abort();}catch{}throw error;}
}
export async function overwriteOriginal(handle:SourceFileHandle,snapshot:Blob,expectedHash:string,output:Blob,outputHash:string,gps:Gps|null|undefined,capture:CaptureDate|null=null){
 async function verify(file:FileLike){
  if(await hashFile(file)!==outputHash)throw new Error('File integrity check failed.');
  if(capture)return verifyCaptureDate(file,capture,gps);
  const info=await readMetadata(file);
  if(!sameGps(info.embedded,gps))throw new Error('GPS verification failed.');
  return info;
 }
 // Recheck the source after JPEG generation and before opening a writable stream.
 if(await hashFile(await handle.getFile())!==expectedHash)throw new Error('Source file changed while preparing the metadata update. Nothing was overwritten.');
 if(capture){
  const before=await readMetadata(snapshot);
  if(before.scanState!=='ready'||before.capturedAt!==null)throw new Error('This photo already has a capture date or its metadata needs review.');
 }
 try{await verify(output);}catch(error){throw new Error('Prepared JPEG failed verification. '+messageOf(error)+' Nothing was overwritten.');}
 await writeBlob(handle,output);
 try{
  const file=await handle.getFile();
  const info=await verify(file);
  return {file,hash:outputHash,...info,scanError:null,size:file.size,modified:file.lastModified};
 }catch(error){
  try{
   await writeBlob(handle,snapshot);
   if(await hashFile(await handle.getFile())!==expectedHash)throw new Error('Restored bytes did not match.');
  }catch(rollback){throw new Error(messageOf(error)+' Automatic restore also failed: '+messageOf(rollback)+' Use your backup for this file.');}
  throw new Error(messageOf(error)+' Original bytes were restored; the update did not complete.');
 }
}
