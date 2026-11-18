
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const MAX_BYTES=100*1024*1024;
const video=require('./video.cjs');
const imagePattern=/\.(jpe?g|png|webp|heic|heif|tiff?|raw|cr2|cr3|nef|arw|dng|avif)$/i;
const modules=Promise.all([import('../src/jpeg.js'),import('../src/metadata.js'),import('../src/library.js'),import('../src/capture-date.js')]);
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function isInside(root,target){const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
async function hashPath(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function verifiedBytes(bytes,gps,expectedHash){
 const [,metadata,library]=await modules;
 if(expectedHash&&digest(bytes)!==expectedHash)throw new Error('File integrity check failed.');
 const info=await metadata.readMetadata(new Blob([bytes],{type:'image/jpeg'}));
 if(!library.sameGps(info.embedded,gps))throw new Error('GPS verification failed.');
 return info;
}
async function writeExclusive(file,bytes){
 const stream=await fs.open(file,'wx');
 try{await stream.writeFile(bytes);await stream.sync();}finally{await stream.close();}
}
class StateStore{
 constructor(directory){this.directory=directory;this.file=path.join(directory,'progress.json');this.tail=Promise.resolve();this.state={schemaVersion:1,assignments:{},places:[],expanded:{},recentFolders:[]};this.warning='';}
 async initialize(){
  await fs.mkdir(this.directory,{recursive:true});
  try{this.state=await this.readValidated(this.file);}
  catch(error){
   if(error.code==='ENOENT')return this.state;
   try{this.state=await this.readValidated(this.file+'.previous');await fs.rename(this.file,this.file+'.corrupt-'+randomUUID());await fs.copyFile(this.file+'.previous',this.file);this.warning='Recovered the previous progress save because the latest file was unreadable. Export a JSON backup.';}
   catch{throw new Error('Saved progress could not be read. Your photos are untouched. Recover progress.json from a backup in '+this.directory);}
  }
  return this.state;
 }
 async readValidated(file){
  const state=JSON.parse(await fs.readFile(file,'utf8'));if(state.schemaVersion!==1)throw new Error('Unsupported progress format.');
  await this.validatePatch({assignments:state.assignments,places:state.places,expanded:state.expanded});
  if(!Array.isArray(state.recentFolders)||state.recentFolders.some(item=>typeof item.path!=='string'||!path.isAbsolute(item.path)))throw new Error('Invalid recent folders.');
  return state;
 }
 async validatePatch(patch){
  const [, ,library]=await modules;
  if(!patch||typeof patch!=='object'||JSON.stringify(patch).length>25*1024*1024)throw new Error('Invalid progress data.');
  for(const key of Object.keys(patch))if(!['assignments','places','expanded'].includes(key))throw new Error('Unknown progress field.');
  if(patch.assignments!==undefined){
   if(!patch.assignments||typeof patch.assignments!=='object'||Array.isArray(patch.assignments))throw new Error('Invalid assignments.');
   library.parseBackup({schemaVersion:2,assignments:Object.entries(patch.assignments).map(([key,value])=>({key:/^(sha256:|demo-)/.test(key)?key:'legacy:'+key,...value}))});
  }
  if(patch.places!==undefined){if(!Array.isArray(patch.places)||patch.places.length>10000)throw new Error('Invalid saved places.');library.parseBackup({schemaVersion:2,assignments:[],places:patch.places});}
  if(patch.expanded!==undefined&&(!patch.expanded||typeof patch.expanded!=='object'||Array.isArray(patch.expanded)||Object.values(patch.expanded).some(v=>typeof v!=='boolean')))throw new Error('Invalid folder expansion state.');
 }
 enqueue(operation){const result=this.tail.then(operation);this.tail=result.catch(()=>{});return result;}
 savePatch(patch){return this.enqueue(async()=>{await this.validatePatch(patch);await this.commit({...this.state,...patch});return true;});}
 rememberFolder(folder){return this.enqueue(async()=>{
  const recentFolders=[{path:folder,name:path.basename(folder)||folder},...this.state.recentFolders.filter(p=>p.path!==folder)].slice(0,8);
  await this.commit({...this.state,recentFolders});return recentFolders;
 });}
 async commit(next){
  const temp=this.file+'.'+randomUUID()+'.tmp';
  try{
   await writeExclusive(temp,Buffer.from(JSON.stringify(next)));
   try{await fs.copyFile(this.file,this.file+'.previous');}catch(e){if(e.code!=='ENOENT')throw e;}
   await fs.rename(temp,this.file);this.state=next;
  }finally{await fs.unlink(temp).catch(()=>{});}
 }
 async flush(){await this.tail;}
}
class PhotoLibrary{
 constructor(){this.roots=new Map();this.files=new Map();this.activeWrites=new Set();}
 async addRoot(directory){
  const actual=await fs.realpath(directory);if(!(await fs.stat(actual)).isDirectory())throw new Error('Choose a folder.');
  const existing=[...this.roots.values()].find(root=>root.path===actual);
  if(existing)return existing;
  const root={id:randomUUID(),path:actual,name:path.basename(actual)||path.parse(actual).root.replace(/[\\/:]/g,'')||'Photos'};this.roots.set(root.id,root);return root;
 }
 root(id){const root=this.roots.get(id);if(!root)throw new Error('Choose the folder in this app first.');return root;}
 async list(rootId){
  const root=this.root(rootId),photos=[];
  const walk=async(directory)=>{
   const entries=await fs.readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
   for(const entry of entries){
    if(entry.isSymbolicLink()||entry.name.startsWith('.pinboard-'))continue;
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()){await walk(absolute);continue;}
    if(!entry.isFile()||(!imagePattern.test(entry.name)&&!video.VIDEO.test(entry.name)))continue;
    const actual=await fs.realpath(absolute);if(!isInside(root.path,actual))continue;
    const stat=await fs.stat(actual),relative=path.relative(root.path,actual),display=[root.name,...relative.split(path.sep)].join('/');
    let record=[...this.files.values()].find(file=>file.rootId===rootId&&file.absolute===actual);
    if(!record){record={id:randomUUID(),rootId,absolute:actual,relative,name:entry.name};this.files.set(record.id,record);}
    photos.push({kind:video.VIDEO.test(entry.name)?'video':'photo',id:record.id,desktopId:record.id,path:display,name:entry.name,folder:display.slice(0,display.lastIndexOf('/')),size:stat.size,modified:Math.trunc(stat.mtimeMs),previewUrl:'pinboard://app/media/'+record.id});
   }
  };
  await walk(root.path);return photos;
 }
 async checkedFile(id){
  const record=this.files.get(id);if(!record)throw new Error('Photo is not part of an opened folder.');
  const root=this.root(record.rootId),actual=await fs.realpath(record.absolute);
  if(actual!==record.absolute||!isInside(root.path,actual))throw new Error('Source path changed. Reopen the folder.');
  const stat=await fs.stat(actual);if(!stat.isFile())throw new Error('Source is no longer a file.');
  return {record,stat};
 }
 async scan(id){
  const {record,stat}=await this.checkedFile(id);
  const hash=await hashPath(record.absolute);
  const current=await fs.stat(record.absolute);if(current.size!==stat.size||current.mtimeMs!==stat.mtimeMs)throw new Error('Photo changed during scanning. Reopen the folder.');
  if(video.VIDEO.test(record.name))return {hash,...await video.readVideo(record.absolute)};
  if(stat.size>MAX_BYTES)return {hash,scanState:'unreadable',scanError:'Files over 100 MB need an external metadata reader.',embedded:null};
  const [,metadata]=await modules;
  return {hash,...await metadata.readMetadata(new Blob([await fs.readFile(record.absolute)]))};
 }
 async writePhoto({id,expectedHash,gps,mode,outputRootId,captureDate}){
  const [, ,library,dates]=await modules;
  const capture=captureDate===undefined?null:dates.parseCaptureDate(captureDate?.value,captureDate?.offset);
  if((capture?mode!=='originals'||gps!==undefined:!library.validGps(gps))||!['originals','copies'].includes(mode)||!/^([a-f0-9]{64})$/.test(expectedHash??''))throw new Error('Invalid write request.');
  const {record,stat}=await this.checkedFile(id);
  if(!/\.jpe?g$/i.test(record.name)&&!video.WRITABLE.test(record.name))throw new Error('Writing supports JPEG photos and MP4, MOV or M4V videos.');
  if(!video.VIDEO.test(record.name)&&stat.size>MAX_BYTES)throw new Error('JPEG writing is limited to 100 MB per file.');
  if(this.activeWrites.has(record.absolute))throw new Error('This photo is already being written.');
  this.activeWrites.add(record.absolute);
  try{
   if(video.VIDEO.test(record.name))return await this.writeVideoPhoto(record,stat,expectedHash,gps,mode,outputRootId,capture);
   const source=await fs.readFile(record.absolute);
   if(digest(source)!==expectedHash)throw new Error('Source changed since import. Reopen the folder before writing.');
   const [jpeg,metadata]=await modules;
   const before=capture?await metadata.readMetadata(new Blob([source])):null;
   if(capture&&(before.scanState!=='ready'||before.capturedAt!==null))throw new Error('This photo already has a capture date or its metadata needs review.');
   const output=Buffer.from(capture?jpeg.writeJpegCaptureDate(source,capture):jpeg.writeJpegGps(source,gps)),outputHash=digest(output);
   const verify=async bytes=>{
    if(!capture)return verifiedBytes(bytes,gps,outputHash);
    if(digest(bytes)!==outputHash)throw new Error('File integrity check failed.');
    const fields=await metadata.readExifCaptureFields(bytes);
    const info=await metadata.readMetadata(new Blob([bytes]));
    const sameLocation=before.embedded?library.sameGps(before.embedded,info.embedded):info.embedded===null;
    if(fields.date!==capture.exif||fields.offset!==capture.offset||info.scanState!=='ready'||!info.capturedAt||!sameLocation)throw new Error('Saved photo capture date or GPS verification failed.');
    return info;
   };
   const info=await verify(output);
   if(mode==='originals'){
    await this.replaceOriginal(record,source,expectedHash,output,verify,stat);
    return {hash:outputHash,...info,scanError:null,size:output.length,modified:Math.trunc((await fs.stat(record.absolute)).mtimeMs),previewUrl:'pinboard://app/media/'+id+'?v='+outputHash,outputPath:record.absolute,sourceHash:expectedHash};
   }
   const outputRoot=this.root(outputRootId);
   const relative=path.join(this.root(record.rootId).name,path.dirname(record.relative));
   const directory=path.resolve(outputRoot.path,relative);
   if(!isInside(outputRoot.path,directory))throw new Error('Invalid output path.');
   await fs.mkdir(directory,{recursive:true});
   const actualDirectory=await fs.realpath(directory);if(!isInside(outputRoot.path,actualDirectory))throw new Error('Output folder resolves outside the selected destination.');
   const name=record.name.replace(/\.jpe?g$/i,'')+'.geotagged-'+expectedHash.slice(0,8)+'.jpg';
   const destination=path.join(actualDirectory,name);
   try{await writeExclusive(destination,output);}catch(error){if(error.code==='EEXIST')throw new Error('Output already exists. No file was overwritten.');throw error;}
   await verifiedBytes(await fs.readFile(destination),gps,outputHash);
   return {hash:outputHash,outputPath:destination,sourceHash:expectedHash};
  }finally{this.activeWrites.delete(record.absolute);}
 }

 async writeVideoPhoto(record,stat,expectedHash,gps,mode,outputRootId,capture){
  if(await hashPath(record.absolute)!==expectedHash)throw new Error('Source changed since import. Reopen the folder before writing.');
  let directory=path.dirname(record.absolute),destination=record.absolute;
  if(mode==='copies'){
   const outputRoot=this.root(outputRootId);
   directory=path.resolve(outputRoot.path,this.root(record.rootId).name,path.dirname(record.relative));
   if(!isInside(outputRoot.path,directory))throw new Error('Invalid output path.');
   await fs.mkdir(directory,{recursive:true});directory=await fs.realpath(directory);
   if(!isInside(outputRoot.path,directory))throw new Error('Output folder resolves outside the selected destination.');
   const extension=path.extname(record.name),name=record.name.slice(0,-extension.length)+'.geotagged-'+expectedHash.slice(0,8)+extension;
   destination=path.join(directory,name);
   try{await fs.access(destination);throw new Error('Output already exists. No file was overwritten.');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const token=randomUUID(),extension=path.extname(record.name),temporary=path.join(directory,'.pinboard-video-'+token+extension),backup=path.join(path.dirname(record.absolute),'.pinboard-backup-'+token+extension);
  const authorizedRoot=mode==='originals'?this.root(record.rootId).path:this.root(outputRootId).path;
  if(!isInside(authorizedRoot,temporary)||!isInside(this.root(record.rootId).path,backup))throw new Error('Invalid working directory.');
  let replaced=false,backupCreated=false,copyCreated=false;
  try{
   await video.prepareVideo(record.absolute,temporary,gps,capture);
   const outputHash=await hashPath(temporary);
   await this.checkedFile(record.id);
   if(await hashPath(record.absolute)!==expectedHash)throw new Error('Source changed before commit. Nothing was overwritten.');
   if(mode==='originals'){
    await fs.copyFile(record.absolute,backup,require('node:fs').constants.COPYFILE_EXCL);backupCreated=true;
    if(await hashPath(backup)!==expectedHash)throw new Error('Recovery copy verification failed. Nothing was overwritten.');
    await fs.chmod(temporary,stat.mode);
    await fs.rename(temporary,destination);replaced=true;
   }else{
    await fs.copyFile(temporary,destination,require('node:fs').constants.COPYFILE_EXCL);copyCreated=true;
   }
   const saved=await video.readVideo(destination),[, ,location]=await modules;
   if(await hashPath(destination)!==outputHash||(capture?saved.capturedAt!==capture.iso:!location.sameGps(saved.embedded,gps)))throw new Error('Saved video metadata or integrity verification failed.');
   if(backupCreated){await fs.unlink(backup);backupCreated=false;}
   return {hash:outputHash,...saved,size:(await fs.stat(destination)).size,modified:Math.trunc((await fs.stat(destination)).mtimeMs),previewUrl:'pinboard://app/media/'+record.id+'?v='+outputHash,outputPath:destination,sourceHash:expectedHash,mediaVerified:true};
  }catch(error){
   if(replaced&&backupCreated){
    try{await fs.rename(backup,record.absolute);backupCreated=false;if(await hashPath(record.absolute)!==expectedHash)throw new Error('Restored bytes differ.');}
    catch(restore){throw new Error(error.message+' Restore failed: '+restore.message+' Recovery copy: '+backup);}
   }
   if(copyCreated)await fs.unlink(destination).catch(()=>{});
   throw error;
  }finally{
   await fs.unlink(temporary).catch(()=>{});
   if(!replaced&&backupCreated)await fs.unlink(backup).catch(()=>{});
  }
 }
 async replaceOriginal(record,source,expectedHash,output,verify,stat){
  const directory=path.dirname(record.absolute),token=randomUUID();
  const temporary=path.join(directory,'.pinboard-write-'+token+'.tmp'),backup=path.join(directory,'.pinboard-backup-'+token+'.tmp');
  // Temporary and recovery files are adjacent to the exact authorized source file.
  if(!isInside(this.root(record.rootId).path,temporary)||!isInside(this.root(record.rootId).path,backup))throw new Error('Invalid source directory.');
  let replaced=false,backupCreated=false;
  try{
   await writeExclusive(temporary,output);
   await verify(await fs.readFile(temporary));
   await writeExclusive(backup,source);backupCreated=true;
   await this.checkedFile(record.id);
   if(await hashPath(record.absolute)!==expectedHash)throw new Error('Source changed before commit. Nothing was overwritten.');
   await fs.chmod(temporary,stat.mode);
   await fs.rename(temporary,record.absolute);replaced=true;
   await verify(await fs.readFile(record.absolute));
   await fs.unlink(backup);backupCreated=false;
  }catch(error){
   if(replaced&&backupCreated){
    try{await fs.rename(backup,record.absolute);backupCreated=false;if(await hashPath(record.absolute)!==expectedHash)throw new Error('Restored bytes differ.');}
    catch(restore){throw new Error(error.message+' Restore failed: '+restore.message+' Recovery copy: '+backup);}
   }
   throw error;
  }finally{
   await fs.unlink(temporary).catch(()=>{});
   if(!replaced&&backupCreated)await fs.unlink(backup).catch(()=>{});
  }
 }
}
module.exports={StateStore,PhotoLibrary,isInside,digest,verifiedBytes};
