
import test from 'node:test';
import assert from 'node:assert/strict';
import {photoStatus,photoKey,assignmentFor,createBackup,parseBackup,mergeBackup,validGps} from './library.js';
const hash='a'.repeat(64),gps={lat:35.01,lng:135.76},other={lat:34,lng:134};
test('states distinguish embedded GPS, pending replacement, scanning, and unreadable',()=>{
 assert.equal(photoStatus({scanState:'ready'},undefined),'needs');
 assert.equal(photoStatus({scanState:'scanning'},undefined),'scanning');
 assert.equal(photoStatus({scanState:'unreadable'},undefined),'unreadable');
 assert.equal(photoStatus({embedded:gps},undefined),'geotagged');
 assert.equal(photoStatus({embedded:gps},other),'pending');
 assert.equal(photoStatus({embedded:gps},gps),'geotagged');
 assert.equal(photoStatus({scanState:'ready'},gps),'pending');
 assert.equal(validGps({lat:0,lng:0}),true);
 assert.equal(validGps({lat:NaN,lng:135}),false);
});
test('hash follows moves and renames while byte changes cannot reuse the assignment',()=>{
 const p={path:'A/old.jpg',hash},q={path:'B/new.jpg',hash};
 const assignments={[photoKey(p)]:gps};
 assert.deepEqual(assignmentFor(q,assignments),gps);
 assert.equal(assignmentFor({...q,hash:'b'.repeat(64)},assignments),undefined);
});
test('full backup round trip retains unloaded assignments and saved places',()=>{
 const records={['sha256:'+hash]:gps,['sha256:'+'b'.repeat(64)]:other,'demo-1':gps};
 const places=[{name:'Church',...gps}];
 const backup=createBackup(records,places,[]);
 const restored=parseBackup(JSON.parse(JSON.stringify(backup)));
 assert.deepEqual(Object.keys(restored.assignments),Object.keys(records));
 assert.deepEqual(restored.places,places);
 assert.deepEqual(restored.assignments['sha256:'+hash].lat,gps.lat);
});
test('invalid backup is rejected atomically',()=>{
 assert.throws(()=>parseBackup({schemaVersion:2,assignments:[{key:'sha256:'+hash,...gps},{key:'bad',lat:200,lng:0}]}));
 assert.throws(()=>parseBackup({schemaVersion:2,assignments:[{key:'legacy:__proto__',...gps}]}));
 assert.throws(()=>parseBackup({schemaVersion:99,assignments:[]}));
});
test('legacy backup support and conflict reporting',()=>{
 const old={schemaVersion:1,photos:[{relativePath:'A/a.jpg',size:100,lastModified:123,...gps}]};
 assert.equal(parseBackup(old).legacyCount,1);
 assert.deepEqual(mergeBackup({a:gps},{a:other}).conflicts,['a']);
 assert.deepEqual(mergeBackup({a:gps},{a:gps}).conflicts,[]);
});
