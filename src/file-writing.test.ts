import type {SourceDirectory} from './models.js';
import {fileURLToPath} from 'node:url';

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareOriginal,overwriteOriginal,sourceRelativeParts} from './file-writing.js';
import {writeJpegGps} from './jpeg.js';
import {hashFile} from './metadata.js';
import {photoStatus,photoKey,assignmentFor} from './library.js';
const gps={lat:35.0116,lng:135.7681};
const plain=()=>readFile(new URL('../test/fixtures/plain.jpg',import.meta.url));
function memoryHandle(initial:Uint8Array,{corruptOnce=false,failWrite=false}={}){
 let bytes=initial,writes=0,opens=0,aborts=0;
 return {
  name:'photo.JPG',get writes(){return writes;},get opens(){return opens;},get aborts(){return aborts;},
  async getFile(){return Object.assign(new Blob([Uint8Array.from(bytes)],{type:'image/jpeg'}),{lastModified:100+writes});},
  async createWritable(){opens++;return {async write(blob:Blob){if(failWrite)throw new Error('Disk is full.');bytes=new Uint8Array(await blob.arrayBuffer());},async close(){writes++;if(corruptOnce&&writes===1)bytes=new Uint8Array([1,2,3]);},async abort(){aborts++;}};}
 };
}
test('resolves the exact source path without creating folders or changing filenames',async()=>{
 const data=await plain(),hash=await hashFile(new Blob([data])),handle=memoryHandle(data),calls:Array<[string,{create?:boolean}|undefined]>=[];
 const directory:SourceDirectory={name:'Japan',async getFileHandle(){throw new Error('Unexpected root file access');},async getDirectoryHandle(name,options){calls.push([name,options]);return {name,async getDirectoryHandle(){throw new Error('Unexpected child directory');},async getFileHandle(name,options){calls.push([name,options]);return handle;}};}};
 const photo={path:'Japan/Kyoto/photo.JPG',name:'photo.JPG',hash};
 const result=await prepareOriginal(directory,photo);
 assert.equal(result.handle,handle);
 assert.deepEqual(calls,[['Kyoto',{create:false}],['photo.JPG',{create:false}]]);
 assert.equal(handle.opens,0);
 assert.equal(await hashFile(result.snapshot),hash);
});
test('rejects path traversal and wrong source contents before writing',async()=>{
 for(const path of ['Japan/../photo.JPG','Japan/./photo.JPG','Japan//photo.JPG','Japan/evil\\photo.JPG'])assert.throws(()=>sourceRelativeParts({path,name:'photo.JPG'}));
 const handle=memoryHandle(await plain()),directory:SourceDirectory={name:'Japan',async getDirectoryHandle(){throw new Error('Unexpected child directory');},async getFileHandle(){return handle;}};
 await assert.rejects(()=>prepareOriginal(directory,{path:'Japan/photo.JPG',name:'photo.JPG',hash:'0'.repeat(64)}),/wrong folder/);
 assert.equal(handle.opens,0);
});
test('verified overwrite refreshes metadata and identity so the original counts as geotagged',async()=>{
 const data=await plain(),snapshot=new Blob([data]),hash=await hashFile(snapshot),output=new Blob([writeJpegGps(data,gps)],{type:'image/jpeg'}),outputHash=await hashFile(output),handle=memoryHandle(data);
 const refreshed=await overwriteOriginal(handle,snapshot,hash,output,outputHash,gps);
 const updated={id:'one',path:'Japan/photo.JPG',name:'photo.JPG',...refreshed};
 assert.equal(handle.name,'photo.JPG');assert.equal(handle.writes,1);
 assert.equal(photoStatus(updated,assignmentFor(updated,{[photoKey(updated)]:gps})),'geotagged');
 assert.notEqual(refreshed.hash,hash);
});
test('refuses externally changed originals and unverified output',async()=>{
 const data=await plain(),snapshot=new Blob([data]),hash=await hashFile(snapshot),output=new Blob([writeJpegGps(data,gps)]),outputHash=await hashFile(output);
 const changed=memoryHandle(new Uint8Array([1,2,3]));
 await assert.rejects(()=>overwriteOriginal(changed,snapshot,hash,output,outputHash,gps),/Source file changed/);assert.equal(changed.opens,0);
 const intact=memoryHandle(data);
 await assert.rejects(()=>overwriteOriginal(intact,snapshot,hash,output,'0'.repeat(64),gps),/Prepared JPEG failed/);assert.equal(intact.opens,0);
});
test('failed saved-file verification restores the original bytes',async()=>{
 const data=await plain(),snapshot=new Blob([data]),hash=await hashFile(snapshot),output=new Blob([writeJpegGps(data,gps)]),handle=memoryHandle(data,{corruptOnce:true});
 await assert.rejects(async()=>overwriteOriginal(handle,snapshot,hash,output,await hashFile(output),gps),/Original bytes were restored/);
 assert.equal(await hashFile(await handle.getFile()),hash);assert.equal(handle.writes,2);
});
test('write-stream failure aborts and never reports success',async()=>{
 const data=await plain(),snapshot=new Blob([data]),output=new Blob([writeJpegGps(data,gps)]),handle=memoryHandle(data,{failWrite:true});
 await assert.rejects(async()=>overwriteOriginal(handle,snapshot,await hashFile(snapshot),output,await hashFile(output),gps),/Disk is full/);
 assert.equal(handle.aborts,1);assert.equal(handle.writes,0);
});
test('overwrites a real fixture file at the same path and verifies it from disk',async()=>{
 const directory=await mkdtemp(fileURLToPath(new URL('../test/write-originals-',import.meta.url))),path=join(directory,'Original.JPG');
 try{
  const data=await plain();await writeFile(path,data);
  const snapshot=new Blob([data]),output=new Blob([writeJpegGps(data,gps)]);
  const handle={async getFile(){return Object.assign(new Blob([await readFile(path)],{type:'image/jpeg'}),{lastModified:123});},async createWritable(){let buffer:Uint8Array;return {async write(blob:Blob){buffer=new Uint8Array(await blob.arrayBuffer());},async close(){await writeFile(path,buffer);},async abort(){}};}};
  const refreshed=await overwriteOriginal(handle,snapshot,await hashFile(snapshot),output,await hashFile(output),gps);
  assert.equal(photoStatus(refreshed,gps),'geotagged');
  assert.equal(await hashFile(new Blob([await readFile(path)])),refreshed.hash);
 }finally{await unlink(path).catch(()=>{});await rmdir(directory);}
});

test('web date overwrite refreshes saved metadata and preserves a pending GPS assignment across its new hash',async()=>{
 const {prepareCaptureDate}=await import('./capture-writing.js');
 const {parseCaptureDate}=await import('./capture-date.js');
 const data=writeJpegGps(await plain(),gps),snapshot=new Blob([data]),handle=memoryHandle(data);
 const input={value:'2020-03-20T15:03:36',offset:'+09:00'};
 const written=await prepareCaptureDate(snapshot,input),output=new Blob([written.bytes]);
 const updated=await overwriteOriginal(handle,snapshot,await hashFile(snapshot),output,written.hash,gps,parseCaptureDate(input.value,input.offset));
 assert.ok(updated.capturedAt);
 assert.deepEqual(updated.embedded,gps);
 assert.equal(updated.hash,written.hash);
 assert.equal(handle.writes,1);
 const pending={lat:37,lng:126,label:'Saved assignment'};
 assert.equal(photoStatus(updated,pending),'pending');
 assert.equal(assignmentFor(updated,{['sha256:'+updated.hash]:pending}),pending);
});

test('web date overwrite refuses a stale source and restores original bytes after a failed saved-file verification',async()=>{
 const {prepareCaptureDate}=await import('./capture-writing.js');
 const {parseCaptureDate}=await import('./capture-date.js');
 const snapshot=new Blob([await plain()]),hash=await hashFile(snapshot);
 const input={value:'2020-03-20T15:03:36',offset:'-05:00'},capture=parseCaptureDate(input.value,input.offset);
 const written=await prepareCaptureDate(snapshot,input),output=new Blob([written.bytes]);
 const stale=memoryHandle(new Uint8Array([1,2,3]));
 await assert.rejects(()=>overwriteOriginal(stale,snapshot,hash,output,written.hash,null,capture),/Source file changed/);
 assert.equal(stale.opens,0);
 const corrupted=memoryHandle(await plain(),{corruptOnce:true});
 await assert.rejects(()=>overwriteOriginal(corrupted,snapshot,hash,output,written.hash,null,capture),/Original bytes were restored/);
 assert.equal(await hashFile(await corrupted.getFile()),hash);
 assert.equal(corrupted.writes,2);
});
