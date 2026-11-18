
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),video=require('./video.cjs'),{PhotoLibrary,digest}=require('./core.cjs'),{parseRange,mediaResponse}=require('./media-response.cjs');
const ffmpeg=path.join(__dirname,'..','vendor','ffmpeg.exe'),plain=path.join(__dirname,'..','test','fixtures','video','plain.mp4');
async function fixture(fn){
 const parent=path.resolve(__dirname,'..','work'),root=await fs.mkdtemp(path.join(parent,'video-test-'));
 try{return await fn(root);}finally{if(path.dirname(root)!==parent||!path.basename(root).startsWith('video-test-'))throw new Error('Unsafe cleanup');await fs.rm(root,{recursive:true,force:true});}
}
test('ISO 6709 decimal GPS supports hemispheres, zero, boundaries and altitude',()=>{
 for(const gps of [{lat:0,lng:0},{lat:37.453509,lng:126.447423},{lat:-90,lng:-180},{lat:90,lng:180}])assert.deepEqual(video.parseIso6709(video.iso6709(gps)),gps);
 assert.deepEqual(video.parseIso6709('+37.453509+126.447423+12.0/'),{lat:37.453509,lng:126.447423});
 assert.equal(video.parseIso6709('not coordinates'),null);assert.equal(video.parseIso6709('+91.0+180.0/'),null);
 assert.throws(()=>video.iso6709({lat:91,lng:0}));
});
test('MP4 video and audio payload, creation date, codecs and duration survive GPS updates',()=>fixture(async root=>{
 const source=path.join(root,'clip.mp4');await fs.copyFile(plain,source);
 const sourceBytes=await fs.readFile(source),gps={lat:37.453509,lng:126.447423},output=path.join(root,'tagged.mp4');
 const result=await video.prepareVideo(source,output,gps);
 assert.equal(result.mediaHashes.length,1);assert.equal((await video.readVideo(output)).scanState,'ready');
 assert.deepEqual((await video.readVideo(output)).embedded,gps);assert.equal(digest(await fs.readFile(source)),digest(sourceBytes));
 const info=await video.probe(output);assert.equal(info.streams.filter(s=>['video','audio'].includes(s.codec_type)).length,2);
 assert.equal(info.format.tags.creation_time,'2020-02-06T03:24:32.000000Z');
 assert.equal(info.format.tags.title,'Pinboard synthetic fixture');
 // Reassigning location must update both UserData and Apple's metadata key.
 const rewritten=path.join(root,'retagged.mp4'),next={lat:-35.012345,lng:-135.123456};
 await video.prepareVideo(output,rewritten,next);assert.deepEqual((await video.readVideo(rewritten)).embedded,next);
}));
test('MOV keyed Apple GPS and rotation survive reassignment',()=>fixture(async root=>{
 const source=path.join(root,'clip.mov'),output=path.join(root,'tagged.mov');
 await run(ffmpeg,['-hide_banner','-loglevel','error','-display_rotation:v:0','90','-i',plain,'-map','0','-c','copy','-metadata','com.apple.quicktime.location.ISO6709=+35.000000+135.000000/','-movflags','use_metadata_tags',source],{windowsHide:true});
 const before=await video.probe(source);assert.ok(before.streams[0].side_data_list?.some(d=>Math.abs(d.rotation)===90));
 assert.deepEqual((await video.readVideo(source)).embedded,{lat:35,lng:135});
 const gps={lat:38.123456,lng:140.123456};await video.prepareVideo(source,output,gps);
 const after=await video.probe(output);assert.deepEqual((await video.readVideo(output)).embedded,gps);
 assert.deepEqual(after.streams[0].side_data_list,before.streams[0].side_data_list);
}));
test('M4V without audio supports GPS and keeps all media bytes',()=>fixture(async root=>{
 const source=path.join(root,'clip.m4v'),output=path.join(root,'tagged.m4v');
 await run(ffmpeg,['-hide_banner','-loglevel','error','-i',plain,'-an','-c:v','copy','-f','mp4',source],{windowsHide:true});
 await video.prepareVideo(source,output,{lat:0,lng:0});assert.deepEqual((await video.readVideo(output)).embedded,{lat:0,lng:0});
 assert.equal((await video.probe(output)).streams.length,1);
}));
test('native library imports video, updates originals and copy output, and resumes status on reopen',()=>fixture(async root=>{
 const sourceRoot=path.join(root,'Mission'),sub=path.join(sourceRoot,'Airport');await fs.mkdir(sub,{recursive:true});await fs.copyFile(plain,path.join(sub,'Camera.MP4'));
 const library=new PhotoLibrary(),registered=await library.addRoot(sourceRoot),[item]=await library.list(registered.id);
 assert.equal(item.kind,'video');const before=await library.scan(item.id);assert.equal(before.embedded,null);
 const gps={lat:37.453509,lng:126.447423},updated=await library.writePhoto({id:item.id,expectedHash:before.hash,gps,mode:'originals'});
 assert.equal(path.basename(updated.outputPath),'Camera.MP4');assert.equal(updated.mediaVerified,true);
 assert.deepEqual((await library.scan(item.id)).embedded,gps);
 await fs.mkdir(path.join(root,'Copies'));const output=await library.addRoot(path.join(root,'Copies'));
 const request={id:item.id,expectedHash:updated.hash,gps:{lat:35,lng:135},mode:'copies',outputRootId:output.id},copy=await library.writePhoto(request);
 assert.match(copy.outputPath,/Camera\.geotagged-[a-f0-9]{8}\.MP4$/);
 assert.ok(copy.outputPath.includes(path.join('Copies','Mission','Airport')));
 await assert.rejects(()=>library.writePhoto(request),/already exists/);
 assert.deepEqual((await library.scan(item.id)).embedded,gps);
 const reopened=new PhotoLibrary(),again=await reopened.addRoot(sourceRoot),[photo]=await reopened.list(again.id);assert.deepEqual((await reopened.scan(photo.id)).embedded,gps);
}));
test('videos larger than the JPEG limit scan and write without loading whole files into memory',()=>fixture(async root=>{
 const file=path.join(root,'Large.mp4');await fs.copyFile(plain,file);const originalSize=(await fs.stat(file)).size,extra=101*1024*1024;
 const handle=await fs.open(file,'r+');try{const header=Buffer.alloc(8);header.writeUInt32BE(extra);header.write('free',4);await handle.write(header,0,8,originalSize);await handle.truncate(originalSize+extra);}finally{await handle.close();}
 const library=new PhotoLibrary(),registered=await library.addRoot(root),[photo]=await library.list(registered.id),scan=await library.scan(photo.id);assert.equal(scan.scanState,'ready');
 const result=await library.writePhoto({id:photo.id,expectedHash:scan.hash,gps:{lat:35,lng:135},mode:'originals'});assert.ok(result.size>100*1024*1024);assert.equal(result.mediaVerified,true);
}));
test('fragmented and malformed videos fail without modifying originals',()=>fixture(async root=>{
 const source=path.join(root,'Fragmented.mp4');
 await run(ffmpeg,['-hide_banner','-loglevel','error','-i',plain,'-c','copy','-movflags','frag_keyframe+empty_moov',source],{windowsHide:true});
 const original=digest(await fs.readFile(source)),library=new PhotoLibrary(),registered=await library.addRoot(root),[photo]=await library.list(registered.id),scan=await library.scan(photo.id);
 await assert.rejects(()=>library.writePhoto({id:photo.id,expectedHash:scan.hash,gps:{lat:35,lng:135},mode:'originals'}),/Fragmented/);
 assert.equal(digest(await fs.readFile(source)),original);
 const bad=path.join(root,'Bad.mp4');await fs.writeFile(bad,'invalid media');assert.equal((await video.readVideo(bad)).scanState,'unreadable');
}));
test('open-ended mdat sizes are finalized before metadata is appended',()=>fixture(async root=>{
 const source=path.join(root,'OpenEnded.mp4');await fs.copyFile(plain,source);
 const entries=await video.topLevel(source),mdat=entries.find(e=>e.type==='mdat');assert.equal(mdat.offset+mdat.size,(await fs.stat(source)).size);
 const handle=await fs.open(source,'r+');try{await handle.write(Buffer.alloc(4),0,4,mdat.offset);}finally{await handle.close();}
 const output=path.join(root,'Tagged.mp4');await video.prepareVideo(source,output,{lat:35,lng:135});assert.deepEqual((await video.readVideo(output)).embedded,{lat:35,lng:135});
}));
test('HTTP range responses enable seeking without buffering entire videos',()=>fixture(async root=>{
 const file=path.join(root,'clip.mp4');await fs.copyFile(plain,file);
 const response=await mediaResponse(file,new Request('https://local/media',{headers:{range:'bytes=4-15'}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),(await fs.readFile(file)).subarray(4,16));
 assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});assert.deepEqual(parseRange('bytes=90-',100),{start:90,end:99});
 const invalid=await mediaResponse(file,new Request('https://local/media',{headers:{range:'bytes=99999999-'}}));assert.equal(invalid.status,416);
}));



test('native capture date restores an undated MP4 without changing GPS or media bytes',()=>fixture(async root=>{
 const source=path.join(root,'LINE.mp4');
 await run(ffmpeg,['-hide_banner','-loglevel','error','-i',plain,'-map','0','-map_metadata','-1','-map_metadata:s','-1','-c','copy','-metadata','location=+35.000000+135.000000/',source],{windowsHide:true});
 const library=new PhotoLibrary(),folder=await library.addRoot(root),[photo]=await library.list(folder.id);
 const before=await library.scan(photo.id);
 assert.equal(before.capturedAt,null);
 assert.deepEqual(before.embedded,{lat:35,lng:135});
 const media=await video.mediaHashes(source,await video.topLevel(source));
 const request={id:photo.id,expectedHash:before.hash,mode:'originals',captureDate:{value:'2020-03-20T15:03:36',offset:'+09:00'}};
 const saved=await library.writePhoto(request);
 assert.equal(saved.capturedAt,'2020-03-20T06:03:36.000Z');
 assert.deepEqual(saved.embedded,before.embedded);
 assert.deepEqual(await video.mediaHashes(source,await video.topLevel(source)),media);
 await assert.rejects(()=>library.writePhoto({...request,expectedHash:saved.hash}),/already has date metadata/);
}));
