import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {prepareCaptureDate,verifyCaptureDate} from './capture-writing.js';
import {parseCaptureDate} from './capture-date.js';
import {writeJpegGps} from './jpeg.js';
import {hashFile,readExifCaptureFields} from './metadata.js';

const input={value:'2020-03-20T15:03:36',offset:'+09:00'};
const fixture=()=>readFile(new URL('../test/fixtures/plain.jpg',import.meta.url));

test('web date preparation embeds local capture time and UTC offset while preserving GPS and image data',async()=>{
 const gps={lat:35,lng:135};
 const source=writeJpegGps(await fixture(),gps);
 const {bytes,hash}=await prepareCaptureDate(new Blob([source]),input);
 const output=new Blob([bytes]);
 assert.equal(hash,await hashFile(output));
 assert.deepEqual(await readExifCaptureFields(bytes),{date:'2020:03:20 15:03:36',offset:'+09:00'});
 assert.deepEqual((await verifyCaptureDate(output,parseCaptureDate(input.value,input.offset),gps)).embedded,gps);
 const imageScan=bytes=>Buffer.from(bytes).subarray(Buffer.from(bytes).indexOf(Buffer.from([255,218])));
 assert.deepEqual(imageScan(bytes),imageScan(source));
 await assert.rejects(()=>prepareCaptureDate(output,input),/already has a capture date/);
});

test('web date preparation rejects invalid dates, offsets, unreadable media, and oversize JPEGs',async()=>{
 const blob=new Blob([await fixture()]);
 for(const invalid of [{...input,value:'2020-02-30T12:00'},{...input,offset:''},{...input,offset:'+14:30'}]){
  await assert.rejects(()=>prepareCaptureDate(blob,invalid));
 }
 await assert.rejects(()=>prepareCaptureDate(new Blob(['corrupt JPEG']),input),/metadata needs review/);
 await assert.rejects(()=>prepareCaptureDate({size:101*1024*1024},input),/100 MB/);
});

test('the shared browser write worker dispatches capture-date requests',async()=>{
 const workerUrl=new URL('./write.worker.js',import.meta.url).href;
 const worker=new Worker(`
  const {parentPort}=require('node:worker_threads');
  global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
  import(${JSON.stringify(workerUrl)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));
 `,{eval:true});
 try{
  const reply=new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  worker.postMessage({file:new Blob([await fixture()]),captureDate:input});
  const result=await reply;
  assert.equal(result.error,undefined);
  const output=new Blob([result.bytes]);
  assert.equal(result.hash,await hashFile(output));
  assert.equal((await verifyCaptureDate(output,parseCaptureDate(input.value,input.offset),null)).embedded,null);
 }finally{await worker.terminate();}
});
