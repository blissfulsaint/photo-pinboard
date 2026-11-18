
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import exifr from 'exifr';
import {writeJpegGps,validateJpeg} from './jpeg.js';
import {sameGps} from './library.js';
import {readMetadata} from './metadata.js';
const fixture=new URL('../test/fixtures/plain.jpg',import.meta.url);
function addExif(jpeg:Uint8Array,little:boolean){
 const tiff=new Uint8Array(49),v=new DataView(tiff.buffer);
 tiff.set(little?[73,73]:[77,77]);v.setUint16(2,42,little);v.setUint32(4,8,little);v.setUint16(8,2,little);
 v.setUint16(10,271,little);v.setUint16(12,2,little);v.setUint32(14,11,little);v.setUint32(18,38,little);
 v.setUint16(22,274,little);v.setUint16(24,3,little);v.setUint32(26,1,little);v.setUint16(30,6,little);
 tiff.set(new TextEncoder().encode('MissionCam\0'),38);
 const block=new Uint8Array(10+tiff.length);block.set([255,225,(tiff.length+8)>>8,(tiff.length+8)&255,69,120,105,102,0,0]);block.set(tiff,10);
 return Buffer.concat([jpeg.subarray(0,2),block,jpeg.subarray(2)]);
}
test('adds verifiable GPS without changing original bytes or compressed image data',async()=>{
 const original=await readFile(fixture),snapshot=Buffer.from(original),gps={lat:-35.011612,lng:135.768123};
 const output=writeJpegGps(original,gps);
 assert.ok(sameGps((await readMetadata(new Blob([output]))).embedded,gps));
 assert.deepEqual(original,snapshot);
 const scan=(bytes:Uint8Array)=>Buffer.from(bytes).subarray(Buffer.from(bytes).indexOf(Buffer.from([255,218])));
 assert.deepEqual(scan(output),scan(original));
 assert.notEqual(createHash('sha256').update(output).digest('hex'),createHash('sha256').update(original).digest('hex'));
});
test('preserves little- and big-endian camera/orientation metadata and original offsets',async()=>{
 const plain=await readFile(fixture);
 for(const little of [true,false]){
  const original=addExif(plain,little),gps={lat:35.012345,lng:-135.765432},output=writeJpegGps(original,gps);
  const tags=await exifr.parse(output);
  assert.equal(tags.Make,'MissionCam');assert.equal(tags.Orientation,'Rotate 90 CW');
  assert.ok(sameGps((await readMetadata(new Blob([output]))).embedded,gps));
  // Original TIFF data is retained in place. Only the root IFD pointer changes.
  assert.deepEqual(Buffer.from(output.subarray(20,10+49)),original.subarray(20,10+49));
 }
});
test('replaces existing GPS and handles zero, boundaries, and hemispheres',async()=>{
 let data=new Uint8Array(await readFile(fixture));
 for(const gps of [{lat:0,lng:0},{lat:90,lng:-180},{lat:-90,lng:180},{lat:35.000001,lng:135.999999}]){
  data=writeJpegGps(data,gps);
  assert.ok(sameGps((await readMetadata(new Blob([data]))).embedded,gps));
 }
});
test('rejects malformed JPEG, ambiguous EXIF, invalid coordinates, and conflicting XMP',async()=>{
 const jpeg=await readFile(fixture);
 assert.throws(()=>validateJpeg(new Uint8Array([255,216,1,2])));
 assert.throws(()=>writeJpegGps(jpeg,{lat:91,lng:0}));
 const data=writeJpegGps(jpeg,{lat:35,lng:135}),end=4+((data[4]<<8)|data[5]);
 const duplicated=Buffer.concat([data.subarray(0,2),data.subarray(2,end),data.subarray(2)]);
 assert.throws(()=>writeJpegGps(duplicated,{lat:35,lng:135}),/Multiple EXIF/);
 const text=Buffer.from('http://ns.adobe.com/xap/1.0/\0<exif:GPSLatitude>35</exif:GPSLatitude>'),size=text.length+2;
 const xmp=Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225,size>>8,size&255]),text,jpeg.subarray(2)]);
 assert.throws(()=>writeJpegGps(xmp,{lat:35,lng:135}),/additional location/);
});


test('existing GPS can be updated from desktop Buffers with nonzero backing offsets',async()=>{
 const plain=await readFile(fixture);
 for(const little of [true,false]){
  const first=writeJpegGps(addExif(plain,little),{lat:35,lng:135});
  const allocation=Buffer.alloc(first.length+83,0xA5);
  allocation.set(first,37);const buffer=allocation.subarray(37,37+first.length),before=Buffer.from(allocation);
  const gps={lat:-38.583900,lng:140.972050},output=writeJpegGps(buffer,gps);
  const tags=await exifr.parse(output);
  assert.equal(tags.Make,'MissionCam');assert.equal(tags.Orientation,'Rotate 90 CW');
  assert.ok(sameGps((await readMetadata(new Blob([output]))).embedded,gps));
  assert.deepEqual(allocation,before);
  const sos=(bytes:Uint8Array)=>Buffer.from(bytes).subarray(Buffer.from(bytes).indexOf(Buffer.from([255,218])));
  assert.deepEqual(sos(output),sos(buffer));
 }
});
