import fs = require('node:fs/promises');
import path = require('node:path');
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import yazl = require('yazl');
const root=path.resolve(__dirname,'..'),run=promisify(execFile);
const downloads=[
 {name:'ffmpeg-9.0.2.tar.xz',url:'https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz',sha256:'8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e'},
 {name:'w64devkit-x64-2.11.0.7z.exe',url:'https://github.com/skeeto/w64devkit/releases/download/v2.11.0/w64devkit-x64-2.11.0.7z.exe',sha256:'54c2bb9962e8a30c8270e34c5efc3d5fee579f53087fa7d435b95fbba2af7b2b'},
 {name:'w64devkit-source-2.11.0.tar',url:'https://github.com/skeeto/w64devkit/releases/download/v2.11.0/source.tar',sha256:'50ee43ca02b9ca49e0e16da7eaf9701c9a396a019ebb2416a93d16769d53e5ff'},
 {name:'w64devkit-build-2.11.0.tar.gz',url:'https://github.com/skeeto/w64devkit/archive/refs/tags/v2.11.0.tar.gz',sha256:'d24cfcf20ae5a344fd005e66e64ec642f702eecec320d47d02d31410b0c83572'}
];
async function exists(file:string){try{await fs.access(file);return true;}catch{return false;}}
async function hash(file:string){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
async function command(exe:string,args:string[],cwd:string,log:string,env=process.env){
 const output=createWriteStream(log);
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(output,{end:false});child.stderr.pipe(output,{end:false});
  child.on('error',error=>{output.end();reject(error);});
  child.on('close',code=>{output.end(()=>code===0?resolve():reject(new Error(`${exe} exited ${code}; see ${log}`)));});
 });
}
async function zipFolder(folder:string,destination:string){
 const zip=new yazl.ZipFile();
 const finished=new Promise<void>((resolve,reject)=>{zip.outputStream.pipe(createWriteStream(destination)).on('close',resolve).on('error',reject);zip.outputStream.on('error',reject);});
 async function walk(directory:string):Promise<void>{for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else zip.addFile(file,path.relative(folder,file).split(path.sep).join('/'));}}
 await walk(folder);zip.end();await finished;
}
async function main(){
 if(process.platform!=='win32')throw new Error('This recipe builds natively on Windows using w64devkit.');
 const arg=process.argv.indexOf('--work-dir'),collect=process.argv.includes('--collect');
 if(arg<0||!process.argv[arg+1])throw new Error('Provide --work-dir with a dedicated directory without spaces (a Windows short path also works).');
 const work=path.resolve(process.argv[arg+1]);
 if(/\s|'/.test(work))throw new Error('FFmpeg requires a build directory without spaces or apostrophes; use a Windows short path if necessary.');
 await fs.mkdir(work,{recursive:true});
 for(const item of downloads){
  const file=path.join(work,item.name);
  if(!await exists(file)){
   console.log(`Downloading ${item.name}`);
   const response=await fetch(item.url,{signal:AbortSignal.timeout(600000)});
   if(!response.ok||!response.body)throw new Error(`Download failed: ${response.status} ${item.url}`);
   const partial=file+'.partial';
   const body=response.body;
   async function* chunks(){const reader=body.getReader();try{while(true){const {value,done}=await reader.read();if(done)return;yield value;}}finally{reader.releaseLock();}}
   await pipeline(Readable.from(chunks()),createWriteStream(partial));
   if(await hash(partial)!==item.sha256)throw new Error(`Checksum mismatch: ${item.name}`);
   await fs.rename(partial,file);
  }
  if(await hash(file)!==item.sha256)throw new Error(`Checksum mismatch: ${item.name}`);
 }
 const kit=path.join(work,'w64devkit'),source=path.join(work,'ffmpeg-9.0.2');
 if(!await exists(path.join(kit,'bin','sh.exe')))await command(path.join(work,downloads[1].name),['-y','-o'+work],work,path.join(work,'extract-toolchain.log'));
 if(!await exists(path.join(source,'configure')))await command('tar.exe',['-xf',path.join(work,downloads[0].name),'-C',work],work,path.join(work,'extract-ffmpeg.log'));
 if(!collect){
  console.log('Configuring and compiling FFprobe; see ffprobe-build.log in the work directory.');
  const quote=(value:string)=>"'"+value.replaceAll('\\','/').replaceAll("'","'\\''")+"'";
  await command(path.join(kit,'bin','sh.exe'),['-c',`cd ${quote(source)} && sh ${quote(path.join(root,'scripts','build-ffprobe.sh'))}`],work,path.join(work,'ffprobe-build.log'),{...process.env,PATH:path.join(kit,'bin')+';'+process.env.PATH});
 }
 const binary=path.join(source,'ffprobe.exe');
 const {stdout:version}=await run(binary,['-version'],{windowsHide:true});
 const {stdout:license}=await run(binary,['-L'],{windowsHide:true});
 if(!version.startsWith('ffprobe version 9.0.2 ')||!license.includes('Lesser General Public License')||/--enable-(gpl|nonfree|version3)/.test(version))throw new Error('Unexpected FFprobe version or license configuration.');
 const {stdout:imports}=await run(path.join(kit,'bin','objdump.exe'),['-p',binary],{windowsHide:true,maxBuffer:8*1024*1024});
 const dlls=[...imports.matchAll(/DLL Name:\s*(\S+)/g)].map(match=>match[1]);
 const allowed=/^(?:advapi32|bcrypt|crypt32|gdi32|kernel32|msvcrt|ole32|psapi|secur32|shell32|user32|vfw32|ws2_32|winmm)\.dll$/i;
 if(!dlls.length||dlls.some(dll=>!allowed.test(dll)))throw new Error('Unexpected imported DLLs: '+dlls.join(', '));
 const ffprobeSha256=await hash(binary),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const bundleName=`Photo-Pinboard-${pkg.version}-ffprobe-sources.zip`;
 const material=path.join(work,'source-package-'+ffprobeSha256.slice(0,12));
 await fs.mkdir(material,{recursive:true});
 for(const name of [downloads[0].name,downloads[2].name,downloads[3].name])await fs.copyFile(path.join(work,name),path.join(material,name));
 await fs.copyFile(path.join(root,'scripts','build-ffprobe.sh'),path.join(material,'build-ffprobe.sh'));
 await fs.mkdir(path.join(material,'w64devkit-build'),{recursive:true});
 for(const name of ['Dockerfile','README.md','VERSION.txt','COPYING.MinGW-w64-runtime.txt'])await fs.copyFile(path.join(kit,name),path.join(material,'w64devkit-build',name));
 await fs.cp(path.join(kit,'src'),path.join(material,'w64devkit-build','src'),{recursive:true});
 await fs.mkdir(path.join(material,'configuration'),{recursive:true});
 for(const name of ['config.h','config_components.h','ffbuild/config.mak','ffbuild/config.log'])await fs.copyFile(path.join(source,name),path.join(material,'configuration',path.basename(name)));
 for(const name of ['ffprobe-build.log','configure-output.txt','make-output.txt'])if(await exists(path.join(work,name)))await fs.copyFile(path.join(work,name),path.join(material,'configuration',name));
 await fs.writeFile(path.join(material,'BUILDINFO.txt'),version+'\n'+license+'\nImported Windows system DLLs:\n'+dlls.join('\n')+'\n');
 const provenance={purpose:'Separate, local-only video metadata reader and independent write verifier',build:'Photo Pinboard native Windows x64 build; unmodified FFmpeg source; no external codec libraries',version:'9.0.2',ffprobeSha256,license:'LGPL-2.1-or-later; see LICENSE and FFmpeg-LICENSE.md',sourceUrl:downloads[0].url,sourceSha256:downloads[0].sha256,toolchain:'w64devkit 2.11.0 (MinGW-w64 14.0.0, GCC 16.2.0)',downloads,buildRecipe:'scripts/build-ffprobe.sh',buildInfoFile:'BUILDINFO.txt',importedSystemDlls:dlls,sourceAsset:bundleName,sourceReleaseUrl:'https://github.com/blissfulsaint/photo-pinboard/releases/tag/v'+pkg.version};
 await fs.writeFile(path.join(material,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 await fs.writeFile(path.join(material,'README.txt'),`FFPROBE CORRESPONDING SOURCE AND BUILD MATERIALS\n\nBinary SHA-256: ${ffprobeSha256}\n\nffmpeg-9.0.2.tar.xz is the complete, unmodified FFmpeg source, including licenses.\nw64devkit-source-2.11.0.tar contains the compiler, MinGW runtime and build-tool source archives.\nw64devkit-build contains the pinned kit Dockerfile and its local sources/patches.\nprovenance.json records the upstream HTTPS downloads and their SHA-256 hashes.\nconfiguration contains the actual FFmpeg configuration and build logs.\n\nTo rebuild on Windows:\n1. Obtain the exact w64devkit binary recorded in provenance.json (or build it using the included sources and Dockerfile).\n2. Extract FFmpeg into a dedicated working directory without spaces. Windows short paths work too.\n3. Put w64devkit/bin first on PATH, then run sh /path/to/build-ffprobe.sh from inside ffmpeg-9.0.2.\n4. The resulting ffprobe.exe requires only Windows system DLLs. No FFmpeg DLLs or external codec libraries are used.\n\nThis is a source-complete rebuild recipe, not a promise of byte-identical output: timestamps and build paths can affect executable hashes.\nPhoto Pinboard launches this executable as a separate process and does not link to its libraries.\n`);
 const release=path.join(root,'release');await fs.mkdir(release,{recursive:true});
 const archive=path.join(release,bundleName);await zipFolder(material,archive);
 const sourceAssetSha256=await hash(archive);
 await fs.writeFile(archive+'.sha256',sourceAssetSha256+'  '+bundleName+'\n');
 const vendor=path.join(root,'vendor');
 // Retain the previous executable and provenance locally before replacing it.
 const backup=path.join(work,'previous-vendor');await fs.mkdir(backup,{recursive:true});
 for(const name of ['ffprobe.exe','LICENSE','toolchain.json','BUILDINFO.txt'])if(await exists(path.join(vendor,name))&&!await exists(path.join(backup,name)))await fs.copyFile(path.join(vendor,name),path.join(backup,name));
 await fs.copyFile(binary,path.join(vendor,'ffprobe.exe'));
 for(const [from,to] of [['COPYING.LGPLv2.1','LICENSE'],['LICENSE.md','FFmpeg-LICENSE.md']])await fs.copyFile(path.join(source,from),path.join(vendor,to));
 await fs.copyFile(path.join(kit,'COPYING.MinGW-w64-runtime.txt'),path.join(vendor,'COPYING.MinGW-w64-runtime.txt'));
 await command('tar.exe',['-xf',path.join(work,downloads[2].name),'-C',work,'source/gcc-16.2.0.tar.xz'],work,path.join(work,'extract-runtime-source.log'));
 for(const name of ['COPYING.RUNTIME','COPYING3']){
  const {stdout}=await run(path.join(kit,'bin','tar.exe'),['-xOf',path.join(work,'source','gcc-16.2.0.tar.xz'),'gcc-16.2.0/'+name],{windowsHide:true,maxBuffer:1024*1024});
  await fs.writeFile(path.join(vendor,'GCC-'+name),stdout);
 }
 await fs.copyFile(path.join(material,'BUILDINFO.txt'),path.join(vendor,'BUILDINFO.txt'));
 await fs.writeFile(path.join(vendor,'toolchain.json'),JSON.stringify({...provenance,sourceAssetSha256},null,2)+'\n');
 await fs.writeFile(path.join(vendor,'SOURCES.md'),`# Bundled FFprobe\n\nFFprobe 9.0.2 is built from unmodified FFmpeg sources under LGPL-2.1-or-later, without GPL/nonfree components or external codec libraries. MinGW runtime notices are included separately.\n\nThe exact source and build materials are supplied as **${bundleName}** alongside the Windows download at:\n\n${provenance.sourceReleaseUrl}\n\nSource archive SHA-256: ${sourceAssetSha256}\n\nBinary SHA-256: ${ffprobeSha256}\n\nThe archive includes FFmpeg sources, compiler/runtime sources, build recipes, configuration and provenance. See toolchain.json and BUILDINFO.txt. Photo Pinboard's original code retains its MIT license.\n`);
 console.log(JSON.stringify({binary,ffprobeSha256,archive,sourceAssetSha256,importedSystemDlls:dlls},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
