
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{tmpdir}=require('node:os');
const {StateStore,PhotoLibrary,isInside,digest}=require('./core.cjs');
async function fixture(run){
 const testParent=path.join(__dirname,'..','work');await fs.mkdir(testParent,{recursive:true});const root=await fs.mkdtemp(path.join(testParent,'pinboard-desktop-test-'));
 const files=[];
 const create=async(relative,data)=>{const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);files.push(file);return file;};
 try{return await run({root,create});}
 finally{
  // Resolved temporary roots are verified before recursive test cleanup.
  const absolute=path.resolve(root),parent=path.resolve(__dirname,'..','work');
  if(path.dirname(absolute)!==parent||!path.basename(absolute).startsWith('pinboard-desktop-test-'))throw new Error('Unsafe cleanup target.');
  await fs.rm(absolute,{recursive:true,force:true});
 }
}
const photoBytes=()=>fs.readFile(path.join(__dirname,'..','test','fixtures','plain.jpg'));
test('native scan and original overwrite keep the name and embedded GPS survives reopening',()=>fixture(async({root,create})=>{
 const source=await create('Mission/Kyoto/Original.JPG',await photoBytes()),library=new PhotoLibrary(),folder=await library.addRoot(path.join(root,'Mission'));
 const photos=await library.list(folder.id);assert.equal(photos.length,1);assert.equal(photos[0].path,'Mission/Kyoto/Original.JPG');
 const scan=await library.scan(photos[0].id);assert.equal(scan.embedded,null);
 const gps={lat:38.583900,lng:140.972050};
 const result=await library.writePhoto({id:photos[0].id,expectedHash:scan.hash,gps,mode:'originals'});
 assert.equal(result.outputPath,source);assert.notEqual(result.hash,scan.hash);
 const reopened=await library.scan(photos[0].id);assert.equal(reopened.hash,result.hash);
 assert.ok(Math.abs(reopened.embedded.lat-gps.lat)<0.000001);
 assert.deepEqual(await fs.readdir(path.dirname(source)),['Original.JPG']);
 const freshLibrary=new PhotoLibrary(),freshRoot=await freshLibrary.addRoot(path.join(root,'Mission')),freshPhotos=await freshLibrary.list(freshRoot.id);
 assert.ok((await freshLibrary.scan(freshPhotos[0].id)).embedded);
}));
test('copy mode preserves originals, keeps hierarchy, and never overwrites output files',()=>fixture(async({root,create})=>{
 const original=await photoBytes(),source=await create('Mission/Osaka/a.jpg',original),library=new PhotoLibrary(),folder=await library.addRoot(path.join(root,'Mission'));
 const [photo]=await library.list(folder.id),scan=await library.scan(photo.id);
 await fs.mkdir(path.join(root,'Copies'));const output=await library.addRoot(path.join(root,'Copies'));
 const request={id:photo.id,expectedHash:scan.hash,gps:{lat:-35,lng:-135},mode:'copies',outputRootId:output.id};
 const result=await library.writePhoto(request);
 assert.ok(result.outputPath.includes(path.join('Copies','Mission','Osaka')));
 assert.equal(digest(await fs.readFile(source)),digest(original));
 await assert.rejects(()=>library.writePhoto(request),/already exists/);
}));
test('stale hashes, unknown IDs, invalid modes, and path escape are refused',()=>fixture(async({root,create})=>{
 const source=await create('Mission/a.jpg',await photoBytes()),library=new PhotoLibrary(),folder=await library.addRoot(path.join(root,'Mission')),[photo]=await library.list(folder.id);
 const scan=await library.scan(photo.id);await fs.writeFile(source,Buffer.from('changed'));
 await assert.rejects(()=>library.writePhoto({id:photo.id,expectedHash:scan.hash,gps:{lat:35,lng:135},mode:'originals'}),/Source changed/);
 await assert.rejects(()=>library.scan('unknown'),/not part/);
 await assert.rejects(()=>library.writePhoto({id:photo.id,expectedHash:scan.hash,gps:{lat:35,lng:135},mode:'delete'}),/Invalid write/);
 assert.equal(isInside(root,path.join(root,'..','outside')),false);
 assert.equal(isInside(root,path.join(root,'safe')),true);
}));
test('progress saves are serialized, portable assignments reopen, and recent folders persist',()=>fixture(async({root})=>{
 const store=new StateStore(path.join(root,'State'));await store.initialize();
 const assignments={['sha256:'+'a'.repeat(64)]:{lat:35,lng:135,label:'Church'}};
 await Promise.all([store.savePatch({assignments}),store.savePatch({places:[{name:'Church',lat:35,lng:135}]}),store.savePatch({expanded:{Mission:true}}),store.rememberFolder(root)]);
 const reopened=new StateStore(path.join(root,'State'));await reopened.initialize();
 assert.deepEqual(reopened.state.assignments,assignments);assert.equal(reopened.state.places[0].name,'Church');assert.equal(reopened.state.expanded.Mission,true);assert.equal(reopened.state.recentFolders[0].path,root);
 await assert.rejects(()=>store.savePatch({recentFolders:[{path:'arbitrary'}]}),/Unknown/);
 await assert.rejects(()=>store.savePatch({assignments:{invalid:{lat:999,lng:0}}}),/invalid coordinates/i);
}));
test('corrupted progress recovers the previous successful save',()=>fixture(async({root})=>{
 const directory=path.join(root,'State'),store=new StateStore(directory);await store.initialize();
 await store.savePatch({places:[{name:'First',lat:35,lng:135}]});await store.savePatch({places:[{name:'Second',lat:34,lng:134}]});
 await fs.writeFile(path.join(directory,'progress.json'),'not valid JSON');
 const recovered=new StateStore(directory);await recovered.initialize();
 assert.equal(recovered.state.places[0].name,'First');assert.match(recovered.warning,/Recovered/);
}));



test('desktop reassigns GPS on an already-geotagged file after reopening it',()=>fixture(async({root,create})=>{
 const {writeJpegGps}=await import('../src/jpeg.js');
 const source=await create('Mission/Existing.JPG',writeJpegGps(await photoBytes(),{lat:35,lng:135}));
 const library=new PhotoLibrary(),folder=await library.addRoot(path.dirname(source)),[photo]=await library.list(folder.id),scan=await library.scan(photo.id);
 const gps={lat:38.583900,lng:140.972050};
 const result=await library.writePhoto({id:photo.id,expectedHash:scan.hash,gps,mode:'originals'});
 const updated=await library.scan(photo.id);
 assert.equal(result.outputPath,source);
 assert.ok(Math.abs(updated.embedded.lat-gps.lat)<0.000001);
 assert.ok(Math.abs(updated.embedded.lng-gps.lng)<0.000001);
}));


test('native capture date writes local EXIF time and offset while preserving GPS',()=>fixture(async({root,create})=>{
 const {writeJpegGps}=await import('../src/jpeg.js');
 const {readExifCaptureFields}=await import('../src/metadata.js');
 const gps={lat:35,lng:135},source=await create('Mission/LINE.jpg',writeJpegGps(await photoBytes(),gps));
 const library=new PhotoLibrary(),folder=await library.addRoot(path.join(root,'Mission')),[photo]=await library.list(folder.id);
 const before=await library.scan(photo.id);
 assert.equal(before.capturedAt,null);
 const request={id:photo.id,expectedHash:before.hash,mode:'originals',captureDate:{value:'2020-03-20T15:03:36',offset:'+09:00'}};
 const saved=await library.writePhoto(request);
 assert.deepEqual(await readExifCaptureFields(await fs.readFile(source)),{date:'2020:03:20 15:03:36',offset:'+09:00'});
 assert.deepEqual((await library.scan(photo.id)).embedded,gps);
 await assert.rejects(()=>library.writePhoto({...request,expectedHash:saved.hash}),/already has a capture date/);
 assert.equal(digest(await fs.readFile(source)),saved.hash);
}));
