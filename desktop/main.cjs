
const {app,BrowserWindow,ipcMain,dialog,protocol,net,shell,Menu}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {StateStore,PhotoLibrary,isInside}=require('./core.cjs');
const {mediaResponse}=require('./media-response.cjs');
const smoke=process.argv.includes('--pinboard-smoke-test')&&!app.isPackaged;
app.setName('Photo Pinboard');
const appId='app.photopinboard.desktop';
if(process.platform==='win32')app.setAppUserModelId(appId);
if(smoke)app.setPath('userData',path.join(__dirname,'..','work','desktop-smoke-profile'));
protocol.registerSchemesAsPrivileged([{scheme:'pinboard',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const library=new PhotoLibrary();
let store,window,quitting=false,busy=0,rendererIsReady=false;
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'";
function trusted(event){if(!window||event.sender!==window.webContents||!event.senderFrame?.url.startsWith('pinboard://app/'))throw new Error('Untrusted caller.');}
function handle(name,fn){ipcMain.handle('pinboard:'+name,async(event,...args)=>{trusted(event);return fn(...args);});}
async function openRoot(folder){
 const root=await library.addRoot(folder),photos=await library.list(root.id),recentFolders=await store.rememberFolder(root.path);
 return {root:{id:root.id,name:root.name,path:root.path},photos,recentFolders};
}
function external(url){try{const parsed=new URL(url);if(parsed.protocol==='https:'&&(parsed.hostname==='photos.google.com'||/(^|\.)google\.com$/.test(parsed.hostname)))shell.openExternal(url);}catch{}}
app.whenReady().then(async()=>{
 store=new StateStore(app.getPath('userData'));await store.initialize();
 protocol.handle('pinboard',async request=>{
  try{
   const url=new URL(request.url);if(url.host!=='app')return new Response('Not found',{status:404});
   if(url.pathname.startsWith('/media/')){
    const id=url.pathname.slice('/media/'.length),{record}=await library.checkedFile(id);
    return mediaResponse(record.absolute,request);
   }
   const dist=path.join(__dirname,'..','dist');
   const file=path.resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!isInside(dist,file))return new Response('Forbidden',{status:403});
   const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);
   headers.set('Content-Security-Policy',CSP);
   return new Response(response.body,{status:response.status,headers});
  }catch{return new Response('File unavailable',{status:404});}
 });
 handle('load-state',()=>({...store.state,warning:store.warning}));
 handle('save-state',patch=>store.savePatch(patch));
 handle('app-info',()=>({version:app.getVersion(),dataDirectory:app.getPath('userData')}));
 handle('renderer-ready',()=>{rendererIsReady=true;return true;});
 handle('open-folder',async()=>{
  const selected=await dialog.showOpenDialog(window,{title:'Open your photo folder',properties:['openDirectory']});
  return selected.canceled?null:openRoot(selected.filePaths[0]);
 });
 handle('open-recent',async index=>{
  if(!Number.isInteger(index)||index<0||index>=store.state.recentFolders.length)throw new Error('Choose a recent folder from the list.');
  return openRoot(store.state.recentFolders[index].path);
 });
 handle('choose-output',async()=>{
  const selected=await dialog.showOpenDialog(window,{title:'Choose a folder for geotagged copies',properties:['openDirectory','createDirectory']});
  if(selected.canceled)return null;const root=await library.addRoot(selected.filePaths[0]);return {id:root.id,name:root.name};
 });
 handle('scan-photo',id=>library.scan(id));
 handle('write-photo',async request=>{busy++;try{return await library.writePhoto(request);}finally{busy--;}});
 handle('export-text',async request=>{
  if(!request||typeof request.text!=='string'||Buffer.byteLength(request.text)>30*1024*1024)throw new Error('Export is invalid or too large.');
  const name=path.basename(String(request.name||'photo-pinboard-backup.json'));
  if(!/\.(json|csv)$/.test(name))throw new Error('Only JSON and CSV exports are supported.');
  const selected=await dialog.showSaveDialog(window,{title:'Save '+name,defaultPath:name,filters:[{name:'Photo Pinboard export',extensions:[name.split('.').at(-1)]}]});
  if(selected.canceled)return false;await fs.writeFile(selected.filePath,request.text,'utf8');return true;
 });
 handle('import-backup',async()=>{
  const selected=await dialog.showOpenDialog(window,{title:'Restore a Photo Pinboard JSON backup',properties:['openFile'],filters:[{name:'Photo Pinboard backup',extensions:['json']}]});
  if(selected.canceled)return null;const file=selected.filePaths[0];if((await fs.stat(file)).size>25*1024*1024)throw new Error('Backup exceeds 25 MB.');
  return {name:path.basename(file),text:await fs.readFile(file,'utf8')};
 });
 window=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,show:!smoke,backgroundColor:'#f8f9f6',title:'Photo Pinboard',icon:path.join(__dirname,'..','dist','favicon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 if(process.platform==='win32'){
  window.setAppDetails({
   appId,
   appIconPath:app.isPackaged?process.execPath:path.join(__dirname,'..','dist','favicon.ico'),
   appIconIndex:0,
   relaunchCommand:app.isPackaged?'"'+process.execPath+'"':'"'+process.execPath+'" "'+app.getAppPath()+'"',
   relaunchDisplayName:'Photo Pinboard'
  });
 }
 Menu.setApplicationMenu(null);
 window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('pinboard://app/')){event.preventDefault();external(url);}});
 window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
 window.on('close',event=>{
  if(busy){event.preventDefault();dialog.showMessageBox(window,{type:'info',message:'A media file is being saved. Wait for the current write to finish before closing.'});}
 });
 await window.loadURL('pinboard://app/index.html');
 if(smoke){
  const output=path.join(__dirname,'..','work','desktop-smoke-result.json');
  const timeout=Date.now()+15000;
  while(!rendererIsReady&&Date.now()<timeout)await new Promise(resolve=>setTimeout(resolve,100));
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify({rendererReady:rendererIsReady,title:window.getTitle(),electron:process.versions.electron,sandboxed:true},null,2));
  app.exit(rendererIsReady?0:1);
 }
}).catch(error=>{if(smoke)console.error(error);else dialog.showErrorBox('Photo Pinboard could not start',error.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
 if(!quitting&&store){event.preventDefault();quitting=true;store.flush().finally(()=>app.quit());}
});
