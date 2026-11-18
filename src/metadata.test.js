
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectFile,hashFile,readMetadata} from './metadata.js';
test('streaming file hash equals SHA-256 independently of filename',async()=>{
 const data=Buffer.alloc(5*1024*1024+17,7),blob=new Blob([data]);
 assert.equal(await hashFile(blob),createHash('sha256').update(data).digest('hex'));
});
test('JPEG without GPS is readable and needs a location',async()=>{
 const blob=new Blob([await readFile(new URL('../test/fixtures/plain.jpg',import.meta.url))]);
 const result=await inspectFile(blob);
 assert.equal(result.scanState,'ready');assert.equal(result.embedded,null);assert.equal(result.hash.length,64);assert.equal(result.capturedAt,null);
});
test('unsupported or corrupt photos are not reported as missing GPS',async()=>{
 assert.equal((await readMetadata(new Blob(['unreadable bytes']))).scanState,'unreadable');
 assert.equal((await readMetadata(new Blob([new Uint8Array([255,216,1,2,3])]))).scanState,'unreadable');
});


test('JPEG with an EXIF capture date but no GPS is recognized as dated',async()=>{
 const jpeg=await readFile(new URL('../test/fixtures/plain.jpg',import.meta.url));
 const exif=Buffer.from('ffe1004845786966000049492a0008000000010069870400010000001a00000000000000010003900200140000002c00000000000000','hex');
 const timestamp=Buffer.from('2020:02:06 20:56:12\0','ascii');
 const result=await readMetadata(new Blob([jpeg.subarray(0,2),exif,timestamp,jpeg.subarray(2)]));
 assert.equal(result.scanState,'ready');
 assert.equal(result.embedded,null);
 assert.equal(result.capturedAt,new Date(2020,1,6,20,56,12).toISOString());
});
