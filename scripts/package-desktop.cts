
import fs = require('node:fs/promises');
import path = require('node:path');
import {createReadStream,createWriteStream} from 'node:fs';
import * as asar from '@electron/asar';
import yazl = require('yazl');
import {createHash} from 'node:crypto';
const root=path.resolve(__dirname,'..');
import {brandWindows} from './brand-windows.cjs';
async function exists(file:string){try{await fs.access(file);return true;}catch{return false;}}
async function sha256(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function zipFolder(folder:string,destination:string){
 const zip=new yazl.ZipFile();
 const walk=async(directory:string):Promise<void>=>{for(const entry of await fs.readdir(directory,{withFileTypes:true})){const source=path.join(directory,entry.name);if(entry.isDirectory())await walk(source);else zip.addFile(source,path.relative(path.dirname(folder),source).split(path.sep).join('/'));}};
 const finished=new Promise<void>((resolve,reject)=>{zip.outputStream.pipe(createWriteStream(destination)).on('close',resolve).on('error',reject);zip.outputStream.on('error',reject);});
 await walk(folder);zip.end();await finished;
}
async function main(){
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const electronDist=path.join(root,'node_modules','electron','dist');
 if(!await exists(path.join(electronDist,'electron.exe')))throw new Error('Run npm run desktop:install using Node 22.12+ first.');
 const webVersion=JSON.parse(await fs.readFile(path.join(root,'dist','version.json'),'utf8')).version;
 if(webVersion!==pkg.version)throw new Error('Web build version differs from package.json. Rebuild the web app before packaging.');
 const toolchain=JSON.parse(await fs.readFile(path.join(root,'vendor','toolchain.json'),'utf8'));
 if(!toolchain.sourceAsset||path.basename(toolchain.sourceAsset)!==toolchain.sourceAsset)throw new Error('A named FFprobe source asset is required.');
 const sourceArchive=path.join(root,'release',toolchain.sourceAsset);
 if(await sha256(path.join(root,'vendor','ffprobe.exe'))!==toolchain.ffprobeSha256)throw new Error('FFprobe does not match its recorded provenance.');
 if(await sha256(sourceArchive)!==toolchain.sourceAssetSha256)throw new Error('FFprobe source archive does not match its recorded provenance.');
 const toolFiles=['ffprobe.exe','LICENSE','FFmpeg-LICENSE.md','COPYING.MinGW-w64-runtime.txt','GCC-COPYING.RUNTIME','GCC-COPYING3','toolchain.json','BUILDINFO.txt','SOURCES.md'];
 for(const file of toolFiles)await fs.access(path.join(root,'vendor',file));
 const outputArg=process.argv.indexOf('--output-dir');
 const output=outputArg>=0?path.resolve(process.argv[outputArg+1]??''):path.join(root,'release');
 if(outputArg>=0&&!process.argv[outputArg+1])throw new Error('--output-dir requires a directory.');
 const version=pkg.version,release=path.join(output,'Photo-Pinboard-'+version+'-win-x64');
 if(await exists(release))throw new Error('Release already exists; choose a new package version instead of overwriting an existing release.');
 const staging=path.join(root,'work','package-'+version+'-'+Date.now());
 await fs.mkdir(staging,{recursive:true});await fs.mkdir(path.dirname(release),{recursive:true});
 await fs.cp(path.join(root,'dist'),path.join(staging,'dist'),{recursive:true});
 for(const folder of ['desktop','src'])await fs.cp(path.join(root,'build',folder),path.join(staging,folder),{recursive:true});
 await fs.mkdir(path.join(staging,'node_modules'),{recursive:true});
 for(const dependency of ['exifr','hash-wasm'])await fs.cp(path.join(root,'node_modules',dependency),path.join(staging,'node_modules',dependency),{recursive:true});
 await fs.writeFile(path.join(staging,'package.json'),JSON.stringify({name:pkg.name,productName:pkg.productName,version,description:pkg.description,type:'module',main:'desktop/main.cjs'}));
 await fs.cp(electronDist,release,{recursive:true});
 await asar.createPackage(staging,path.join(release,'resources','app.asar'));
 await fs.mkdir(path.join(release,'resources','tools'),{recursive:true});
 for(const file of toolFiles)await fs.copyFile(path.join(root,'vendor',file),path.join(release,'resources','tools',file));
 await brandWindows(path.join(release,'electron.exe'),path.join(release,'Photo Pinboard.exe'),path.join(root,'dist','favicon.ico'),pkg);
 await fs.unlink(path.join(release,'electron.exe'));
 await fs.unlink(path.join(release,'resources','default_app.asar')).catch(()=>{});
 const instructions=`PHOTO PINBOARD ${version} — WINDOWS

1. Extract the whole ZIP to a folder you control.
2. Run Photo Pinboard.exe. Keep the other extracted files beside it.
3. Open your photo folder. Existing embedded GPS is detected automatically.
4. Use Export locations > Restore progress backup to import a JSON backup from the web app.
5. Assign locations, then choose Write copies or Update originals.

Progress and recent folders are saved in %APPDATA%\\Photo Pinboard\\progress.json,
with a previous-save recovery file. Keep exporting JSON backups periodically.
Written GPS stays inside your photos regardless of app progress storage.
The desktop app does not modify files until you select and run a write action.
Writes JPEG photos (up to 100 MB) and MP4/MOV/M4V video (streamed from disk).
GPS updates preserve and verify encoded video/audio data and creation timestamps.
Use Missing date taken to embed capture dates in undated JPEGs and MP4/MOV/M4V.
Capture-date writes update originals. Enter the local time and its UTC offset.
Other video formats can be listed but may require external GPS tools.
Existing whole-library backups remain useful.

This portable package is unsigned. Extract and keep all resources/DLL files
beside the executable. Microsoft Store and Node.js installation are not required.
`;
 await fs.writeFile(path.join(release,'START HERE.txt'),instructions);
 await fs.copyFile(path.join(root,'LICENSE'),path.join(release,'PHOTO-PINBOARD-LICENSE.txt'));
 const notice=['Electron LICENSE and LICENSES.chromium.html are included alongside the executable.','React, exifr, hash-wasm, DM Sans and Manrope retain their upstream licenses below.',`FFprobe ${toolchain.version} is bundled as a separate program, built from unmodified FFmpeg sources under LGPL-2.1-or-later without external codec libraries. Its license, MinGW/GCC runtime notices, binary hash and build provenance are in resources/tools. Complete source/build materials: ${toolchain.sourceAsset} at ${toolchain.sourceReleaseUrl}. See resources/tools/SOURCES.md.`];
 for(const [label,file] of [['React','node_modules/react/LICENSE'],['exifr','node_modules/exifr/LICENSE'],['hash-wasm','node_modules/hash-wasm/LICENSE'],['DM Sans','node_modules/@fontsource-variable/dm-sans/LICENSE'],['Manrope','node_modules/@fontsource-variable/manrope/LICENSE']]){
  try{notice.push('\n--- '+label+' ---\n'+await fs.readFile(path.join(root,file),'utf8'));}catch{}
 }
 await fs.writeFile(path.join(release,'THIRD-PARTY-NOTICES.txt'),notice.join('\n'));
 const archive=release+'.zip';await zipFolder(release,archive);
 const digest=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
 await fs.writeFile(archive+'.sha256',digest+'  '+path.basename(archive)+'\n');
 if(path.resolve(output)!==path.resolve(root,'release')){
  await fs.copyFile(sourceArchive,path.join(output,toolchain.sourceAsset));
  await fs.writeFile(path.join(output,toolchain.sourceAsset+'.sha256'),toolchain.sourceAssetSha256+'  '+toolchain.sourceAsset+'\n');
 }
 console.log(JSON.stringify({release,archive,sha256:digest},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
