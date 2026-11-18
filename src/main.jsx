import {parseCaptureDate} from './capture-date.js';
import React, {useState, useEffect, useRef, useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {parseCoordinates,csvCell} from './geo';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/manrope/wght.css';
import './style.css';
import {isVideo,durationLabel,VIDEO_EXT} from './media.js';
import {photoKey,assignmentFor,photoStatus,STATUS_LABELS,sameGps,createBackup,parseBackup,mergeBackup} from './library.js';
import {hashFile,readMetadata} from './metadata.js';
import {prepareOriginal,overwriteOriginal} from './file-writing.js';
import {buildFolderTree, isInFolder, folderExpansion} from './folders';

function Icon({name,size=20,...props}) {
 const paths={pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',folder:'M3 7V4h6l3 3h9v13H3Z',upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',arrow:'m9 5 7 7-7 7',check:'m5 12 4 4L19 6',search:'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',undo:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',export:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',link:'m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',image:'M3 3h18v18H3z m0 14 6-6 6 7 3-3 3 3'};
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name]||paths.pin}/></svg>;
}
const groups=['Sample library/Outdoors/Hiking','Sample library/City walks','Sample library/Gatherings','Sample library/Outdoors/Coast'];
const seed=Array.from({length:24},(_,i)=>({id:'demo-'+i,name:'DSC_'+String(2418+i).padStart(4,'0')+'.JPG',path:groups[Math.floor(i/6)]+'/DSC_'+(2418+i)+'.JPG',folder:groups[Math.floor(i/6)],date:'2024-06-'+String(12+Math.floor(i/6)).padStart(2,'0')+'T'+String(9+i%8).padStart(2,'0')+':24:00',kind:i%6,demo:true,scanState:'ready',embedded:i%8===0?{lat:51.5074,lng:-0.1278}:null}));
const initialPlaces=[];

const desktop=window.pinboardDesktop;
let desktopState=null;
function read(key,fallback){
 if(desktopState)return desktopState[key==='pinboard.folders'?'expanded':key.replace('pinboard.','')]??fallback;
 try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}
}
function prepareJpegInWorker(file,fields){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./write.worker.js',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('JPEG processing timed out.'));},120000);
  worker.onmessage=event=>{
   clearTimeout(timer);worker.terminate();
   if(event.data.error)reject(new Error(event.data.error));
   else resolve(event.data);
  };
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('JPEG worker could not run.'));};
  worker.postMessage({file,...fields});
 });
}
function nativeScanner(){
 let stopped=false;
 const scanner={terminate(){stopped=true;},postMessage({id}){desktop.scanPhoto(id).then(result=>{if(!stopped)scanner.onmessage?.({data:{id,...result}});}).catch(error=>{if(!stopped)scanner.onmessage?.({data:{id,scanState:'unreadable',scanError:error.message}});});}};
 return scanner;
}

function Scene({kind=0,label}) {
 const sky=['#c6d8d8','#d9d2bd','#c7d3ce','#b6cdd3','#c9c7ba','#d7c6b4'][kind];
 return <svg className="scene" viewBox="0 0 480 330" role="img" aria-label={label||'Illustrated sample landscape'} preserveAspectRatio="xMidYMid slice"><rect width="480" height="330" fill={sky}/><circle cx="385" cy="62" r="29" fill="#f5e6ba" opacity=".8"/><path d="M0 150 110 80 200 160 300 105 480 160V330H0" fill="#8b9e8c"/><path d="M0 195 170 120 270 185 400 140 480 165V330H0" fill="#607f71"/>
 {kind%3===0?<><path d="M140 330 225 170h30l95 160" fill="#baa987"/><path d="m35 275 70-100 70 100Z" fill="#dca875"/><path d="m105 175 12 100h58Z" fill="#b97c54"/><path d="m90 275 15-58 17 58Z" fill="#6a6356"/>{[305,365,425].map((x,n)=><g key={x} transform={'translate('+x+' '+(135+n*18)+')'}><path d="M0 140V55" stroke="#685946" strokeWidth="9"/><path d="m-40 95 40-85 40 85Z" fill="#456d5c"/><path d="m-31 55 31-65 31 65Z" fill="#527b64"/></g>)}</>:kind%3===1?<><path d="M0 330 220 170h30l230 160" fill="#b8b2a3"/>{[0,1,2,3].map(n=><g key={n} transform={'translate('+(n*132-35)+' '+(95+n%2*30)+')'}><path d="M0 65h115v170H0" fill={n%2?'#d2c4a5':'#b6af94'}/><path d="m-12 68 70-45 70 45" fill="#454f4c"/>{[0,1,2].map(k=><rect key={k} x={14+k*32} y="92" width="17" height="64" fill="#536961"/>)}<path d="M5 180h105" stroke="#635e4c" strokeWidth="7"/></g>)}</>:<><rect y="232" width="480" height="98" fill="#89a8a5"/><path d="M0 271Q100 250 200 278T480 270M0 305Q130 281 270 310T480 300" stroke="#bacac0" fill="none" strokeWidth="3"/><path d="M50 243Q240 140 430 243" stroke="#5f5142" strokeWidth="18" fill="none"/><path d="M50 220Q240 120 430 220" stroke="#857059" strokeWidth="5" fill="none"/>{[85,140,200,260,320,380].map(x=><path key={x} d={'M'+x+' 204v36'} stroke="#685946" strokeWidth="6"/>)}</>}
 <path d="M0 0h480v330H0z" fill="#ba9b6b" opacity=".07"/></svg>;
}


function PhotoPreview({photo,large=false}) {
 const ref=useRef(),[visible,setVisible]=useState(large),[url,setUrl]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{if(large)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'300px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[large,photo.id]);

 useEffect(()=>{
  setFailed(false);if(!visible)return;
  if(photo.previewUrl){setUrl(photo.previewUrl);return()=>setUrl(null);}
  if(!photo.file)return;const objectUrl=URL.createObjectURL(photo.file);setUrl(objectUrl);return()=>{URL.revokeObjectURL(objectUrl);setUrl(null);};
 },[photo.file,photo.previewUrl,visible]);

 return <div ref={ref} className="photo-preview">{photo.demo?<Scene kind={photo.kind}/>:failed?<div className="preview-fallback"><Icon name="image" size={28}/><span>Preview unavailable</span><small>Metadata scan is independent</small></div>:url?isVideo(photo)?<video src={url} aria-label={photo.name} controls={large} preload="metadata" playsInline onError={()=>setFailed(true)}/>:<img src={url} alt={photo.name} decoding="async" loading={large?'eager':'lazy'} onError={()=>setFailed(true)}/>:<div className="preview-fallback"><Icon name="image" size={26}/></div>}</div>;
}

function FolderTree({nodes, folder, onSelect, expanded, setExpanded, depth=0}) {
 return <ul className="folder-tree-list">{nodes.map(node=>{
  const hasChildren=node.children.length>0;
  const open=expanded[node.path] ?? depth===0;
  const current=folder===node.path;
  return <li key={node.path}>
   <div className={'folder-row '+(current?'current':'')} style={{paddingLeft:8+depth*14}}>
    {hasChildren?<button className={'folder-disclosure '+(open?'open':'')} aria-label={(open?'Collapse ':'Expand ')+node.path} aria-expanded={open} onClick={()=>setExpanded(prev=>({...prev,[node.path]:!open}))}><Icon name="arrow" size={12}/></button>:<span className="folder-disclosure-spacer"/>}
    <button className="folder-select" title={node.path+' · '+node.count+' files including subfolders'} aria-current={current?'page':undefined} onClick={()=>onSelect(node.path)}>
     <Icon name="folder" size={15}/><span className="folder-name">{node.name}</span><span className="folder-count">{node.count}</span>
    </button>
   </div>
   {hasChildren&&open&&<FolderTree nodes={node.children} folder={folder} onSelect={onSelect} expanded={expanded} setExpanded={setExpanded} depth={depth+1}/>}
  </li>;
 })}</ul>;
}

function App(){
 useEffect(()=>{if(desktop)desktop.rendererReady().catch(()=>{});},[]);
 const [photos,setPhotos]=useState(seed),[assignments,setAssignments]=useState(()=>read('pinboard.assignments',{})),[places,setPlaces]=useState(()=>read('pinboard.places',initialPlaces));
 const [folder,setFolder]=useState('All photos'),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState(new Set()),[active,setActive]=useState(null),[mode,setMode]=useState('grid');
 const [coords,setCoords]=useState(''),[placeName,setPlaceName]=useState(''),[source,setSource]=useState(''),[error,setError]=useState(''),[toast,setToast]=useState(''),[history,setHistory]=useState([]),[exportOpen,setExportOpen]=useState(false);

 const inputRef=useRef(),backupInputRef=useRef(),workers=useRef([]),scanRun=useRef(0);
 const [scanProgress,setScanProgress]=useState(null),[page,setPage]=useState(0),[storageError,setStorageError]=useState(''),[writeProgress,setWriteProgress]=useState(null),[writeReport,setWriteReport]=useState(null);
 const writing=writeProgress?.running;
 const [captureValue,setCaptureValue]=useState(''),[captureOffset,setCaptureOffset]=useState('');
 const [recentFolders,setRecentFolders]=useState(desktopState?.recentFolders??[]);
 const [writeMode,setWriteMode]=useState('copies'),[sourceDirectory,setSourceDirectory]=useState(null);

 const [expanded,setExpanded]=useState(()=>read('pinboard.folders',{}));

 useEffect(()=>{if(desktop){desktop.saveState({expanded}).catch(error=>setStorageError(error.message));return;}try{localStorage.setItem('pinboard.folders',JSON.stringify(expanded));}catch{}},[expanded]);


 useEffect(()=>{
  if(desktop){desktop.saveState({assignments,places}).then(()=>setStorageError('')).catch(error=>setStorageError('Progress could not be saved: '+error.message+'. Export a JSON backup before closing.'));return;}
  try{localStorage.setItem('pinboard.assignments',JSON.stringify(assignments));localStorage.setItem('pinboard.places',JSON.stringify(places));setStorageError('');}
  catch{setStorageError('Browser storage could not save your progress. Download a JSON backup before leaving.');}
 },[assignments,places]);

 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);}},[toast]);
 useEffect(()=>()=>workers.current.forEach(worker=>worker.terminate()),[]);
 const key=photoKey;
 const assigned=p=>assignmentFor(p,assignments);
 const status=p=>photoStatus(p,assigned(p));
 function matchesFilter(photo, value) {
  if (value === 'all') return true;
  if (value === 'missing-date') return !photo.demo && photo.scanState === 'ready' && photo.capturedAt === null;
  return status(photo) === value;
 }
 const filtered=photos.filter(p=>(isInFolder(p.folder,folder==='All photos'?null:folder))&&(!query||p.name.toLowerCase().includes(query.toLowerCase())||p.folder.toLowerCase().includes(query.toLowerCase()))&&matchesFilter(p,filter));
 const focused=filtered.find(p=>p.id===active)||filtered[0];
 const targets=mode==='review'?(focused?[focused]:[]):photos.filter(p=>selected.has(p.id));
 const dateTargets=targets.filter(p=>filtered.includes(p)&&(desktop?p.desktopId:p.file)&&p.hash&&matchesFilter(p,'missing-date')&&(desktop?/\.(jpe?g|mp4|mov|m4v)$/i.test(p.name):/\.jpe?g$/i.test(p.name)));
 const pendingWriteTargets=(targets.length?targets:photos.filter(p=>status(p)==='pending')).filter(p=>status(p)==='pending');
 const canWriteFolder=!!desktop||typeof window.showDirectoryPicker==='function';

 const counts=useMemo(()=>photos.reduce((result,p)=>{const state=photoStatus(p,assignmentFor(p,assignments));result[state]=(result[state]??0)+1;return result;},{}),[photos,assignments]);
 const complete=counts.geotagged??0;
 const resolved=complete+(counts.pending??0);
 const scanning=photos.some(p=>p.scanState==='scanning');
 const pageCount=Math.max(1,Math.ceil(filtered.length/60));
 const pagePhotos=filtered.slice(Math.min(page,pageCount-1)*60,(Math.min(page,pageCount-1)+1)*60);
 useEffect(()=>setPage(0),[folder,filter,query]);

 const folderTree=useMemo(()=>buildFolderTree(photos),[photos]);
 function selectFolder(path){setFolder(path);setSelected(new Set());setActive(null);setPage(0);}
 function notify(text){setToast(text);}
 function toggle(id){setSelected(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});setActive(id);}
 function next(){const index=filtered.findIndex(p=>p.id===focused?.id);setActive(filtered[(index+1)%filtered.length]?.id);setSource('');}
 function commit(){
  try{
   const gps=parseCoordinates(coords); if(!targets.length)throw new Error('Select at least one photo first.');
   if(targets.some(p=>!p.demo&&!p.hash))throw new Error('Wait for the selected photos to finish their identity scan.');
   if(source.trim()){
    let url;
    try{url=new URL(source.trim());}catch{throw new Error('Enter a full HTTPS source link, or leave it blank.');}
    if(url.protocol!=='https:')throw new Error('Source links must use HTTPS.');
   }
   const existing=targets.filter(p=>assigned(p)||p.embedded).length;
   if(existing&&!window.confirm('Assign a replacement location to '+existing+' photo(s) with saved or embedded coordinates? This stays pending until written to the original or a copy.'))return;
   setHistory(h=>[...h.slice(-19),assignments]);
   const updated={...assignments};targets.forEach(p=>updated[key(p)]={...gps,label:placeName.trim(),source:source.trim(),provenance:source.trim()?'source-link':'manual',assignedAt:new Date().toISOString()});
   setAssignments(updated);setError('');notify('Location saved for '+targets.length+' file'+(targets.length===1?'':'s')+'.');
   if(mode==='review')next();else setSelected(new Set());
  }catch(e){setError(e.message);}
 }

 function clearPending(){
  const pending=targets.filter(p=>status(p)==='pending');
  if(!pending.length)return;
  setHistory(h=>[...h.slice(-19),assignments]);
  const updated={...assignments};
  for(const p of pending){delete updated[key(p)];delete updated[p.path+'|'+p.size+'|'+p.modified];}
  setAssignments(updated);notify('Pending assignment removed. Existing embedded GPS is unchanged.');
 }
 function undo(){if(writing||!history.length)return;setAssignments(history.at(-1));setHistory(h=>h.slice(0,-1));notify('Last assignment undone.');}
 function savePlace(){try{const gps=parseCoordinates(coords);if(!placeName.trim())throw new Error('Add a place name to save this preset.');setPlaces(p=>[...p.filter(v=>v.name!==placeName.trim()),{name:placeName.trim(),...gps}]);setError('');notify('Place saved.');}catch(e){setError(e.message);}}


 async function openPhotoFolder(recentIndex){
  if(writing)return;
  if(!desktop){inputRef.current.click();return;}
  try{
   const result=Number.isInteger(recentIndex)?await desktop.openRecent(recentIndex):await desktop.openFolder();
   if(!result)return;setRecentFolders(result.recentFolders);importFiles(result.photos,result.root);
  }catch(error){setError('Could not open the folder: '+error.message);}
 }
 function importFiles(files,nativeRoot=null){
  if(writing){notify('Wait for the current write to finish.');return;}
  setSourceDirectory(nativeRoot);
  const accepted=[...files].filter(f=>f.desktopId||/^(image|video)\//.test(f.type)||VIDEO_EXT.test(f.name)||/\.(jpe?g|png|webp|heic|heif|tiff?|raw|cr2|cr3|nef|arw|dng)$/i.test(f.name));
  if(!accepted.length){notify('No supported photo or video files found.');return;}
  workers.current.forEach(worker=>worker.terminate());workers.current=[];
  const run=++scanRun.current;

  const imported=accepted.map((file,i)=>{
   if(file.desktopId)return {...file,scanState:'scanning',embedded:null};
   const path=file.webkitRelativePath||file.name;return {id:'local-'+run+'-'+i,kind:isVideo(file)?'video':'photo',name:file.name,path,folder:path.includes('/')?path.slice(0,path.lastIndexOf('/')):'Imported photos',size:file.size,modified:file.lastModified,file,scanState:'scanning',embedded:null};
  });

  setPhotos(imported);setSelected(new Set());setActive(imported[0].id);setFolder('All photos');setFilter('all');setQuery('');setPage(0);setScanProgress({done:0,total:imported.length});setWriteReport(null);
  let cursor=0,done=0;
  const dispatch=worker=>{if(cursor<imported.length){const p=imported[cursor++];worker.postMessage({id:p.id,file:p.file});}else worker.terminate();};
  for(let i=0;i<Math.min(2,imported.length);i++){
   const worker=desktop?nativeScanner():new Worker(new URL('./scan.worker.js',import.meta.url),{type:'module'});
   let currentId;
   const send=()=>{if(cursor<imported.length)currentId=imported[cursor].id;dispatch(worker);};
   const receive=result=>{
    if(scanRun.current!==run)return;
    const original=imported.find(p=>p.id===result.id);
    setPhotos(previous=>previous.map(p=>p.id===result.id?{...p,...result}:p));
    if(result.hash&&original)setAssignments(previous=>{
     const legacy=original.path+'|'+original.size+'|'+original.modified,newKey='sha256:'+result.hash;
     if(!previous[legacy]||previous[newKey])return previous;
     return {...previous,[newKey]:previous[legacy]};
    });
    done++;setScanProgress({done,total:imported.length});
    if(done===imported.length)notify('Metadata scan complete.');
    send();
   };
   worker.onmessage=event=>receive(event.data);
   worker.onerror=()=>{receive({id:currentId,scanState:'unreadable',scanError:'Background scanner failed. Reopen the folder to retry.'});};
   workers.current.push(worker);send();
  }
  notify(imported.length+' media files opened locally. Scanning GPS and file identities…');
 }
 async function saveDownload(content,name,type){
  if(desktop){try{return await desktop.exportText({text:typeof content==='string'?content:await content.text(),name});}catch(error){setError('Export failed: '+error.message);return false;}}
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
 }
 async function download(format){
  let saved;
  if(format==='json'){
   saved=await saveDownload(JSON.stringify(createBackup(assignments,places,photos),null,2),'photo-pinboard-backup.json','application/json');
  }else{
   const rows=photos.map(p=>({p,gps:assigned(p)||p.embedded}));
   const content=['relativePath,sha256,status,latitude,longitude,label,source',...rows.map(({p,gps})=>[p.path,p.hash??'',status(p),gps?.lat??'',gps?.lng??'',gps?.label??'',gps?.source??''].map(csvCell).join(','))].join('\r\n');
   saved=await saveDownload(content,'photo-pinboard-locations.csv','text/csv;charset=utf-8');
  }
  setExportOpen(false);if(saved)notify(format==='json'?'Full progress backup exported.':'Location inventory exported.');
 }

 async function chooseProgressBackup(){
  if(!desktop){backupInputRef.current.click();return;}
  try{const backup=await desktop.importBackup();if(backup)await restoreBackup({size:new Blob([backup.text]).size,text:async()=>backup.text});}
  catch(error){setError('Backup was not imported: '+error.message);}
 }
 async function restoreBackup(file){
  if(writing){notify('Wait for the current write to finish before restoring progress.');return;}
  try{
   if(file.size>25*1024*1024)throw new Error('Backup is too large (25 MB maximum).');
   const backup=parseBackup(JSON.parse(await file.text()));

   const incoming={...backup.assignments};
   for(const p of photos){
    const legacy=p.path+'|'+p.size+'|'+p.modified;
    if(p.hash&&incoming[legacy]&&!incoming['sha256:'+p.hash])incoming['sha256:'+p.hash]=incoming[legacy];
   }
   const merged=mergeBackup(assignments,incoming);

   if(merged.conflicts.length&&!window.confirm('This backup has '+merged.conflicts.length+' conflicting location(s). Replace those assignments with the backup values?'))return;
   setHistory(h=>[...h.slice(-19),assignments]);setAssignments(merged.assignments);
   setPlaces(previous=>[...previous.filter(p=>!backup.places.some(b=>b.name===p.name)),...backup.places]);
   setError('');
   notify('Restored '+Object.keys(backup.assignments).length+' assignments. Open the photo folder to match by content.'+(backup.legacyCount?' Older entries need their original paths on the first scan.':''));
  }catch(e){setError('Backup was not imported: '+e.message);}
 }

 async function chooseSourceDirectory(){
  if(desktop){if(!sourceDirectory)setError('Open the photo folder first. Source access is connected automatically in the desktop app.');return sourceDirectory;}
  if(!canWriteFolder){setError('Updating originals needs folder-write access. Open this app in Chrome or Edge.');return null;}
  try{
   const directory=await window.showDirectoryPicker({mode:'readwrite',id:'pinboard-source'});
   setSourceDirectory(directory);setError('');return directory;
  }catch(e){if(e.name!=='AbortError')setError(e.message);return null;}
 }

 async function writeDesktopPhotos(candidates){
  const originals=writeMode==='originals';let destination=null;
  if(!originals){try{destination=await desktop.chooseOutput();if(!destination)return;}catch(error){setError(error.message);return;}}
  const results=[];setWriteProgress({running:true,done:0,total:candidates.length});setError('');
  try{
   for(const [index,p] of candidates.entries()){
    const gps=assigned(p);
    try{
     if(!p.desktopId||p.demo)throw new Error('Open a local photo folder before writing.');
     const result=await desktop.writePhoto({id:p.desktopId,expectedHash:p.hash,gps:{lat:gps.lat,lng:gps.lng},mode:writeMode,outputRootId:destination?.id});
     if(originals){
      setAssignments(previous=>({...previous,['sha256:'+result.hash]:gps}));
      setPhotos(previous=>previous.map(photo=>photo.id===p.id?{...photo,...result}:photo));
     }
     results.push({sourcePath:p.path,sourceHash:p.hash,outputPath:result.outputPath,outputHash:result.hash,lat:gps.lat,lng:gps.lng,success:true,verification:'saved-file',delivery:originals?'original':'chosen-folder'});
    }catch(error){results.push({sourcePath:p.path,success:false,error:error.message});}
    setWriteProgress({running:true,done:index+1,total:candidates.length});
   }
  }finally{
   setWriteProgress({running:false,done:candidates.length,total:candidates.length});
   setWriteReport({createdAt:new Date().toISOString(),mode:writeMode,results});
   const success=results.filter(r=>r.success).length;
   if(originals&&success)setHistory([]);
   notify(originals?success+' originals updated and verified. Geotagging progress refreshed.':success+' geotagged copies saved and verified.');
  }
 }

 async function writeCaptureDates(){
  if(writing||scanning||!dateTargets.length)return;
  let capture;
  try{capture=parseCaptureDate(captureValue,captureOffset);}catch(error){notify(error.message);return;}
  if(!canWriteFolder){setError('Date writing requires folder-write access. Open the web app in Chrome or Edge.');return;}
  if(!window.confirm('Embed this capture date and time in '+dateTargets.length+' original file(s)?'))return;
  let directory;
  if(!desktop){
   try{
    directory=sourceDirectory||await chooseSourceDirectory();
    if(!directory)return;
    if(directory.queryPermission&&await directory.queryPermission({mode:'readwrite'})!=='granted'){
     if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Write access to the source folder was not granted.');
    }
   }catch(error){if(error.name!=='AbortError')setError(error.message);return;}
  }
  const results=[];
  setError('');
  setWriteReport(null);
  setWriteProgress({running:true,done:0,total:dateTargets.length,kind:'dates'});
  try{
   for(const [index,photo] of dateTargets.entries()){
    try{
     let result;
     const captureDate={value:captureValue,offset:captureOffset};
     if(desktop){
      result=await desktop.writePhoto({id:photo.desktopId,expectedHash:photo.hash,mode:'originals',captureDate});
     }else{
      if(!photo.file||!/\.jpe?g$/i.test(photo.name)||photo.size>100*1024*1024)throw new Error('Web capture-date writing supports JPEG files up to 100 MB.');
      const original=await prepareOriginal(directory,photo);
      const written=await prepareJpegInWorker(original.snapshot,{captureDate});
      const output=new Blob([written.bytes],{type:'image/jpeg'});
      result=await overwriteOriginal(original.handle,original.snapshot,photo.hash,output,written.hash,photo.embedded,capture);
      result.outputPath=photo.path;
     }
     setAssignments(previous=>{
      const assignment=assignmentFor(photo,previous);
      return assignment?{...previous,['sha256:'+result.hash]:assignment}:previous;
     });
     setPhotos(previous=>previous.map(item=>item.id===photo.id?{...item,...result}:item));
     setSelected(previous=>{const next=new Set(previous);next.delete(photo.id);return next;});
     results.push({sourcePath:photo.path,outputPath:result.outputPath,capturedAt:result.capturedAt,success:true});
    }catch(error){results.push({sourcePath:photo.path,success:false,error:error.message});}
    setWriteProgress({running:true,done:index+1,total:dateTargets.length,kind:'dates'});
   }
  }finally{
   setWriteProgress(null);
   setWriteReport({createdAt:new Date().toISOString(),mode:'dates',results});
   if(results.some(result=>result.success))setHistory([]);
  }
 }
 function selectPage(checked){
  setSelected(previous=>{
   const next=new Set(previous);
   for(const photo of pagePhotos){
    if(checked)next.add(photo.id);
    else next.delete(photo.id);
   }
   return next;
  });
 }
 async function writePhotos(){
  const candidates=pendingWriteTargets;
  if(!candidates.length){notify('Select pending photos, or clear the selection to write all pending photos.');return;}
  if(scanning){notify('Wait for the metadata scan to finish before writing photos.');return;}
  if(desktop){await writeDesktopPhotos(candidates);return;}
  const updatingOriginals=writeMode==='originals';
  if(updatingOriginals&&!canWriteFolder){setError('Updating originals requires Chrome or Edge with folder-write access.');return;}
  if(!updatingOriginals&&!window.showDirectoryPicker&&candidates.length>1){setError('This browser can download one JPEG copy at a time. Select one photo, or open the app in Chrome or Edge to write a batch to a folder.');return;}
  let directory;

  try{
   if(updatingOriginals){
    directory=sourceDirectory||await chooseSourceDirectory();
    if(!directory)return;
    if(directory.queryPermission&&await directory.queryPermission({mode:'readwrite'})!=='granted'){
     if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Write access to the source folder was not granted.');
    }
   }else if(canWriteFolder)directory=await window.showDirectoryPicker({mode:'readwrite',id:'pinboard-output'});
  }catch(e){if(e.name!=='AbortError')setError(e.message);return;}

  const results=[];setWriteProgress({running:true,done:0,total:candidates.length});setError('');
  try{
   for(const [index,p] of candidates.entries()){
    const gps=assigned(p);
    try{
     if(isVideo(p))throw new Error('Video GPS writing is available in the Windows desktop app.');
     if(!p.file||!/\.jpe?g$/i.test(p.name)||p.demo)throw new Error('Writing currently supports local JPEG files only.');

     if(p.file.size>100*1024*1024)throw new Error('JPEG writing is limited to 100 MB per photo.');
     const original=updatingOriginals?await prepareOriginal(directory,p):null;
     const sourceFile=original?original.snapshot:p.file;
     const written=await prepareJpegInWorker(sourceFile,{gps});
     const blob=new Blob([written.bytes],{type:'image/jpeg'}),outputHash=written.hash;
     if(updatingOriginals){
      const refreshed=await overwriteOriginal(original.handle,original.snapshot,p.hash,blob,outputHash,gps);
      setAssignments(previous=>({...previous,['sha256:'+outputHash]:gps}));
      setPhotos(previous=>previous.map(photo=>photo.id===p.id?{...photo,...refreshed}:photo));
      results.push({sourcePath:p.path,sourceHash:p.hash,outputPath:p.path,outputHash,lat:gps.lat,lng:gps.lng,success:true,verification:'saved-file',delivery:'original'});
      continue;
     }

     const name=p.name.replace(/\.jpe?g$/i,'')+'.geotagged-'+p.hash.slice(0,8)+'.jpg';
     if(!directory){
      saveDownload(blob,name,'image/jpeg');
      results.push({sourcePath:p.path,sourceHash:p.hash,outputPath:name,outputHash,lat:gps.lat,lng:gps.lng,success:true,verification:'generated-copy',delivery:'browser-download'});
      continue;
     }
     let parent=directory;
     for(const segment of p.folder.split('/').filter(Boolean))parent=await parent.getDirectoryHandle(segment,{create:true});

     let exists=false;try{await parent.getFileHandle(name);exists=true;}catch(e){if(e.name!=='NotFoundError')throw e;}
     if(exists)throw new Error('Output already exists; no file was overwritten. Choose a fresh output folder.');
     const handle=await parent.getFileHandle(name,{create:true});
     const writable=await handle.createWritable();try{await writable.write(blob);await writable.close();}catch(e){try{await writable.abort();}catch{}throw e;}
     const disk=await handle.getFile();
     if(await hashFile(disk)!==outputHash||!sameGps((await readMetadata(disk)).embedded,gps))throw new Error('Saved copy could not be verified. Check the output file.');
     results.push({sourcePath:p.path,sourceHash:p.hash,outputPath:p.folder+'/'+name,outputHash,lat:gps.lat,lng:gps.lng,success:true,verification:'saved-file',delivery:'chosen-folder'});
    }catch(e){results.push({sourcePath:p.path,success:false,error:e.message});}
    finally{setWriteProgress({running:true,done:index+1,total:candidates.length});}
   }
  }finally{
   setWriteProgress({running:false,done:candidates.length,total:candidates.length});
   setWriteReport({createdAt:new Date().toISOString(),mode:updatingOriginals?'originals':'copies',results});
   const successful=results.filter(r=>r.success).length;

   if(updatingOriginals&&successful)setHistory([]);
   notify(updatingOriginals?successful+' originals updated and verified. Geotagging progress has been refreshed.':successful+' media copies '+(directory?'saved and verified.':'verified and sent to browser downloads.')+' Originals remain unchanged; open the copies to see Geotagged status.');

  }
 }
 useEffect(()=>{const handler=e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(writing)return;if(e.key==='Escape')setSelected(new Set());if(e.key==='ArrowRight'&&mode==='review')next();if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);});
 let preview;try{preview=parseCoordinates(coords);}catch{}
 return <div className="app">
 <aside className="sidebar"><a className="brand" href="./"><img className="brand-icon" src="./app-icon.svg" alt=""/><span>photo<span className="brand-light">pinboard</span></span></a>
 <div className="workspace-label">YOUR WORKSPACE <span>{desktop?'DESKTOP':'LOCAL'}</span></div><button className="nav active" onClick={()=>{setFolder('All photos');setFilter('all');}}><Icon name="grid"/> Media library <span>{photos.length}</span></button>


 {desktop&&recentFolders.length>0&&<div className="recent-folders"><div className="nav-label">RECENT FOLDERS</div>{recentFolders.slice(0,3).map((item,index)=><button key={item.path} title={item.path} disabled={writing} onClick={()=>openPhotoFolder(index)}><Icon name="folder" size={13}/><span>{item.name}</span><Icon name="arrow" size={11}/></button>)}</div>}
 <div className="collections-heading"><div className="nav-label">COLLECTIONS</div><div className="tree-actions"><button aria-label="Expand all folders" title="Expand all folders" onClick={()=>setExpanded(folderExpansion(folderTree,true))}>+</button><button aria-label="Collapse all folders" title="Collapse all folders" onClick={()=>setExpanded(folderExpansion(folderTree,false))}>−</button></div></div>
 <nav className="collections-scroll" aria-label="Photo collections" tabIndex={0}>
 <button className={'folder-nav '+(folder==='All photos'?'current':'')} onClick={()=>selectFolder('All photos')} aria-current={folder==='All photos'?'page':undefined}><Icon name="image" size={17}/>All media<span>{photos.length}</span></button>
 <FolderTree nodes={folderTree} folder={folder} onSelect={selectFolder} expanded={expanded} setExpanded={setExpanded}/>
 </nav>
 <button className="import-side" disabled={writing} onClick={()=>openPhotoFolder()}><Icon name="plus" size={17}/> Open media folder</button>
 <div className="sidebar-bottom"><div className="progress-heading"><span>Geotagging progress</span><strong>{Math.round(complete/photos.length*100)}%</strong></div><div className="progress-track"><span style={{width:complete/photos.length*100+'%'}}/></div><p>{complete} geotagged · {counts.pending??0} pending write</p><small className="progress-detail">{resolved} of {photos.length} locations resolved</small><div className="privacy"><span className="green-dot"/> Files stay on your computer</div></div></aside>
 <div className="workspace"><header><div className="breadcrumb">Workspace <span>/</span> Media library</div><div className="header-actions"><span className="app-edition">{desktop?'WINDOWS':'WEB'} · v{__APP_VERSION__}</span><button className="button" disabled={writing||!history.length} onClick={undo} title="Undo last assignment"><Icon name="undo" size={16}/>Undo</button><div className="export-wrap"><button className="button" onClick={()=>setExportOpen(!exportOpen)}><Icon name="export" size={16}/>Export locations</button>{exportOpen&&<div className="export-menu"><button onClick={()=>download('json')}>Back up all progress (JSON)</button><button onClick={()=>download('csv')}>Export location inventory (CSV)</button><button onClick={()=>{setExportOpen(false);chooseProgressBackup();}}>Restore progress backup…</button></div>}</div></div></header>
 <main><div className="page-title"><div className="eyebrow">A PLACE FOR EVERY MEMORY</div><h1>{folder==='All photos'?'Put your memories on the map.':folder}</h1><p>{folder==='All photos'?'Add locations and restore missing capture dates in your media library.':'Showing this folder and all its subfolders.'}</p></div>
 <div className="demo-banner"><span className="banner-icon"><Icon name="folder" size={19}/></span><div><strong>{photos[0]?.demo?'Start with a little exploring.':'Your folder is ready.'}</strong><span>{photos[0]?.demo?'You’re viewing illustrated sample photos. Add a folder to work with your own.':'Existing GPS is detected automatically. Restore a JSON backup to bring in pending work.'}</span></div><button disabled={writing} onClick={()=>openPhotoFolder()}>{photos[0]?.demo?'Open a folder':'Change folder'} <Icon name="arrow" size={16}/></button></div>
 {storageError&&<div className="error" role="alert">{storageError}</div>}
 {error&&<div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><Icon name="close" size={15}/></button></div>}
 {scanProgress&&<div className="scan-banner" role="status"><span className={scanning?'scan-dot spinning':'scan-dot'}/><div><strong>{scanning?'Reading capture dates, GPS and file identities…':'Metadata scan complete'}</strong><span>{scanProgress.done} / {scanProgress.total} checked{(counts.unreadable??0)>0?' · '+counts.unreadable+' need metadata review':''}</span></div><progress aria-label="Metadata scan progress" value={scanProgress.done} max={scanProgress.total}/></div>}
 <div className="status-summary"><span><i className="status-dot geotagged"/><strong>{counts.geotagged??0}</strong> Geotagged</span><span><i className="status-dot pending"/><strong>{counts.pending??0}</strong> Pending write</span><span><i className="status-dot needs"/><strong>{counts.needs??0}</strong> Need location</span>{(counts.unreadable??0)>0&&<span><i className="status-dot unreadable"/><strong>{counts.unreadable}</strong> Check metadata</span>}</div>

 <div className="toolbar"><div className="tabs">{[['all','All media'],['needs','Needs location'],['pending','Pending write'],['geotagged','Geotagged'],['missing-date','Missing date taken'],...((counts.unreadable??0)>0?[['unreadable','Check metadata']]:[])].map(([v,l])=><button key={v} className={filter===v?'chosen':''} onClick={()=>{setFilter(v);setSelected(new Set());setActive(null);}}>{l}<span>{photos.filter(p=>(isInFolder(p.folder,folder==='All photos'?null:folder))&&matchesFilter(p,v)).length}</span></button>)}</div><div className="view-toggle"><button className={mode==='grid'?'chosen':''} onClick={()=>setMode('grid')}><Icon name="grid" size={15}/>Batch</button><button className={mode==='review'?'chosen':''} onClick={()=>setMode('review')}><Icon name="image" size={15}/>Review</button></div></div>
 <div className="library-layout"><section className="library"><div className="library-top"><label className="search"><Icon name="search" size={17}/><input aria-label="Search files" placeholder="Search files or folders…" value={query} onChange={e=>setQuery(e.target.value)}/></label><span>{filtered.length} files</span></div>

 {filter==='missing-date'&&<p className="review-tip">Shows photos without a usable EXIF Date Taken and supported videos without a readable capture timestamp. Photos with scan errors appear under Check metadata.</p>}
 {filter==='missing-date'&&<div className="capture-panel">
  <strong>Embed capture date</strong>
  {canWriteFolder?<><p>Apply the same date and time to {dateTargets.length} eligible {desktop?'JPEG photos or MP4, MOV and M4V videos':'JPEG photos'}. The date is written to the original files.</p>
  {!desktop&&<p>Select the same source folder when prompted to grant write access.</p>}
  <div className="capture-controls">
   <label>Local date and time <input type="datetime-local" step="1" value={captureValue} onChange={event=>setCaptureValue(event.target.value)} disabled={writing}/></label>
   <label>UTC offset <input type="text" value={captureOffset} onChange={event=>setCaptureOffset(event.target.value)} placeholder="+00:00" size="7" disabled={writing}/></label>
   <button className="button" disabled={writing||scanning||!captureValue||!dateTargets.length} onClick={writeCaptureDates}>{writing&&writeProgress.kind==='dates'?'Writing '+writeProgress.done+' / '+writeProgress.total:'Embed date in '+dateTargets.length+' files'}</button>
  </div><p>Enter the UTC offset at the place and date of capture, including daylight saving time if applicable.</p></>:<p>Embedding capture dates needs folder-write access. Open the web app in Chrome or Edge, or use the Windows app.</p>}
 </div>}

 {mode==='grid'?<><div className="selection-line"><label><input type="checkbox" checked={filtered.length>0&&filtered.every(p=>selected.has(p.id))} onChange={e=>setSelected(e.target.checked?new Set(filtered.map(p=>p.id)):new Set())}/> Select all {filtered.length} matching files</label><label><input type="checkbox" checked={pagePhotos.length>0&&pagePhotos.every(p=>selected.has(p.id))} disabled={!pagePhotos.length} onChange={event=>selectPage(event.target.checked)}/> Select this page ({pagePhotos.length})</label><span>{selected.size?selected.size+' selected':'Select files to assign a place'}</span></div><div className="photo-grid">{pagePhotos.map(p=><button key={p.id} className={'photo-card '+(selected.has(p.id)?'selected':'')} onClick={()=>toggle(p.id)} onDoubleClick={()=>{setActive(p.id);setMode('review');}} aria-pressed={selected.has(p.id)} aria-label={'Select '+p.name}><div className="thumbnail"><PhotoPreview photo={p}/>{isVideo(p)&&<span className="video-badge">▶ {durationLabel(p.duration)}</span>}<span className="photo-check">{selected.has(p.id)&&<Icon name="check" size={13}/>}</span><span className={'placed-badge status-'+status(p)} title={p.scanError||STATUS_LABELS[status(p)]}><Icon name="pin" size={12}/>{STATUS_LABELS[status(p)]}</span>{p.demo&&<span className="sample-tag">SAMPLE</span>}</div><div className="photo-info"><strong>{p.name}</strong><span>{assigned(p)?.label||p.folder}</span></div></button>)}</div></>:focused&&<div className="review"><div className="review-image"><PhotoPreview key={focused.id} photo={focused} large/></div><div className="review-meta"><div><strong>{focused.name}</strong>{isVideo(focused)&&<p className="video-details">Video · {durationLabel(focused.duration)}{focused.videoCodec?' · '+focused.videoCodec.toUpperCase():''}</p>}<p>{focused.path}</p><span className={'review-gps state-'+status(focused)}>{STATUS_LABELS[status(focused)]}</span>{focused.embedded&&<div className="review-gps">In file: {focused.embedded.lat}, {focused.embedded.lng}</div>}{assigned(focused)&&<div className="review-gps">Assigned: {assigned(focused).lat}, {assigned(focused).lng}</div>}{focused.scanError&&<p className="scan-warning">{focused.scanError}</p>}<button className="text-button" onClick={()=>{const gps=assigned(focused)||focused.embedded;if(gps){setCoords(gps.lat+', '+gps.lng);setPlaceName(assigned(focused)?.label||'');setSource(assigned(focused)?.source||'');}}} disabled={!assigned(focused)&&!focused.embedded}>Use these coordinates</button></div><button className="button" onClick={next}>Next file<Icon name="arrow" size={16}/></button></div><p className="review-tip">Paste a coordinate, save, and move to the next memory. Use → to skip.</p></div>}
 {!filtered.length&&<div className="empty"><Icon name="check" size={30}/><h3>{filter==='missing-date'&&scanning?'Still checking capture dates…':'No photos in this category.'}</h3><p>Try another folder or filter.</p></div>}
 {mode==='grid'&&pageCount>1&&<div className="pagination"><button className="button" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Previous</button><span>Page {Math.min(page,pageCount-1)+1} of {pageCount} · 60 files per page</span><button className="button" disabled={page>=pageCount-1} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 <footer><span><span className="green-dot"/> {storageError?'Backup needed — progress save failed':desktop?'Progress saved on this computer':'Progress saved in this browser · JSON backup recommended'}</span><span>{mode==='grid'?'Double-click a file to review':'→ Next file'} <kbd>Esc</kbd> Clear selection</span></footer></section>
 <aside className="inspector"><div className="inspector-title"><span className="pin-box"><Icon name="pin"/></span><div><h2>Assign a location</h2><p>{targets.length?targets.length+' file'+(targets.length>1?'s':'')+' ready to place':'Select a file to get started'}</p></div></div>
 <div className="coordinate-map"><svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice"><rect width="400" height="160" fill="#e6ebde"/><path d="M-20 60 420 120M100-20 160 180M250-20 210 180M0 20l400 20M0 145l400-10" stroke="#faf9f1" strokeWidth="13"/><path d="M300-10Q180 70 300 175" stroke="#bdd6d2" fill="none" strokeWidth="22"/><path d="M40 80h55v48H40zM310 60h60v33h-60zM165 50h38v28h-38z" fill="#cfdbc5"/></svg><span className="map-pin"><Icon name="pin" size={28}/></span><span className="map-caption">ILLUSTRATIVE MAP</span>{preview&&<a href={'https://www.google.com/maps/search/?api=1&query='+preview.lat+','+preview.lng} target="_blank" rel="noreferrer">Verify pin in Maps ↗</a>}</div>
 <div className="form"><label htmlFor="coordinates">Coordinates or Google Maps link</label><textarea id="coordinates" rows="2" value={coords} onChange={e=>{setCoords(e.target.value);setError('');}} placeholder="51.5074, -0.1278"/><div className={'coordinate-hint '+(preview?'valid':'')}>{preview?<><Icon name="check" size={13}/>{preview.lat.toFixed(6)}° , {preview.lng.toFixed(6)}°</>:'Latitude first, then longitude. Use the actual pin.'}</div>
 <label htmlFor="place-name">Place name <span>optional</span></label><input id="place-name" value={placeName} onChange={e=>setPlaceName(e.target.value)} placeholder="e.g. Riverside park"/><label htmlFor="source">Source link <span>optional</span></label><input id="source" value={source} onChange={e=>setSource(e.target.value)} placeholder="https://…"/>
 <button className="primary save" disabled={writing||!targets.length||!coords.trim()||targets.some(p=>!p.demo&&!p.hash)} onClick={commit}><Icon name="pin" size={17}/>{mode==='review'?'Save location & next':'Assign to '+targets.length+' file'+(targets.length!==1?'s':'')}<Icon name="arrow" size={16}/></button>
 {targets.some(p=>status(p)==='pending')&&<button className="text-button clear-pending" disabled={writing} onClick={clearPending}>Remove pending assignment{targets.filter(p=>status(p)==='pending').length>1?'s':''}</button>}
 <p className="save-note">Saves a pending assignment. Choose below whether to update originals or write copies.</p>

 <div className="write-panel"><h3>Write GPS to files</h3>
 <fieldset className="write-mode" disabled={writing}><legend>Write destination</legend>
 <label className={writeMode==='copies'?'selected-mode':''}><input type="radio" name="write-mode" value="copies" checked={writeMode==='copies'} onChange={()=>setWriteMode('copies')}/>Write copies</label>
 <label className={writeMode==='originals'?'selected-mode':''}><input type="radio" name="write-mode" value="originals" checked={writeMode==='originals'} onChange={()=>setWriteMode('originals')}/>Update originals</label>
 </fieldset>
 {writeMode==='originals'?<div className="originals-explanation"><p>Updates GPS in {desktop?'JPEG photos and MP4/MOV/M4V videos':'JPEG photos'}, keeping their names and folders. Verified originals immediately count as Geotagged.</p>
 {canWriteFolder?<>{!desktop&&<button className="text-button" disabled={writing} onClick={chooseSourceDirectory}>{sourceDirectory?'Change connected source folder…':'Connect source folder…'}</button>}<p className="source-folder">{sourceDirectory?'Connected: '+sourceDirectory.name:desktop?'Open a photo folder to connect source access.':'Select the same top-level folder you originally opened.'}</p></>:<p className="browser-write-note">Open this app in Chrome or Edge to grant write access to your source folder. This browser supports downloading copies only.</p>}
 <p className="originals-note">Writes replace the original files. Use your existing backup to reverse disk changes; assignment Undo does not restore files.</p></div>:<p>{canWriteFolder?'Choose a separate output folder. Copies are verified after saving; originals stay untouched.':'Download one selected JPEG at a time here. Chrome or Edge also supports saving a batch to a folder.'}</p>}
 {desktop&&<p className="video-support-note">Supports JPEG photos and MP4, MOV, M4V video. Video/audio bytes are verified unchanged.</p>}<p className="write-scope">{pendingWriteTargets.length} pending file{pendingWriteTargets.length===1?'':'s'} · {targets.length?'current selection':'all pending files in the library'}</p>
 <button className="button" disabled={writing||scanning||!pendingWriteTargets.some(p=>!p.demo)||(writeMode==='originals'&&!canWriteFolder)||(writeMode==='copies'&&!canWriteFolder&&pendingWriteTargets.length!==1)} onClick={writePhotos}><Icon name="export" size={15}/>{writing?'Writing '+writeProgress.done+' / '+writeProgress.total:writeMode==='originals'?'Update originals':canWriteFolder?'Choose output folder…':pendingWriteTargets.length>1?'Select one photo to download':'Download JPEG copy'}</button>
 {writing&&<progress aria-label="Media write progress" value={writeProgress.done} max={writeProgress.total}/>}
 {writeReport&&<div className="write-result" role="status"><strong>{writeReport.results.filter(r=>r.success).length} / {writeReport.results.length} {writeReport.mode==='dates'?'capture dates written':writeReport.mode==='originals'?'originals updated':'copies verified'}</strong><p>{writeReport.mode==='dates'?'Successful files now have an embedded capture date. Failed files remain available for review.':writeReport.mode==='originals'?'Verified originals are now Geotagged in this library. Failed files stay pending.':'Open the saved or downloaded copies to count them as Geotagged. Original files still have pending assignments.'}</p>{writeReport.results.filter(r=>!r.success).slice(0,3).map((r,i)=><p className="error" key={i}>{r.sourcePath}: {r.error}</p>)}<button className="text-button" onClick={()=>saveDownload(JSON.stringify(writeReport,null,2),'photo-pinboard-write-report.json','application/json')}>Download write report</button></div>}</div>

 <div className="saved-heading"><h3>Saved places</h3><button onClick={savePlace} title="Save the entered coordinates and place name as a preset" aria-label="Save current place"><Icon name="plus" size={17}/></button></div>{places.map((p,i)=><button key={p.name} className="place" onClick={()=>{setCoords(p.lat+', '+p.lng);setPlaceName(p.name);setSource('');setError('');}}><span className={'place-icon color-'+i%3}><Icon name="pin" size={15}/></span><span><strong>{p.name}</strong><small>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</small></span><Icon name="arrow" size={14}/></button>)}
 {!places.length&&<p className="preset-note">Enter coordinates and a place name, then use + to save a reusable place.</p>}
 </div><div className="workflow-note"><strong>Find a location</strong><p>Copy coordinates from a map or a location shown in your photo library, then paste them here.</p><a href="https://photos.google.com" target="_blank" rel="noreferrer">Open Google Photos ↗</a></div>
 </aside></div></main></div>
 <input ref={backupInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);e.target.value='';}}/>
 <input ref={inputRef} className="visually-hidden" type="file" multiple webkitdirectory="" onChange={e=>{importFiles(e.target.files);e.target.value='';}}/>
 {toast&&<div className="toast" role="status"><Icon name="check" size={17}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><Icon name="close" size={15}/></button></div>}
 </div>;
}

async function start(){
 try{
  if(desktop)desktopState=await desktop.loadState();
  createRoot(document.getElementById('root')).render(<App/>);

 }catch(error){document.getElementById('root').textContent='Photo Pinboard could not load progress: '+error.message;}
}
start();
