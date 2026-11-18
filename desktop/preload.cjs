
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke('pinboard:'+channel,...args);
contextBridge.exposeInMainWorld('pinboardDesktop',{
 loadState:()=>invoke('load-state'),
 saveState:patch=>invoke('save-state',patch),
 openFolder:()=>invoke('open-folder'),
 openRecent:index=>invoke('open-recent',index),
 chooseOutput:()=>invoke('choose-output'),
 scanPhoto:id=>invoke('scan-photo',id),
 writePhoto:request=>invoke('write-photo',request),
 exportText:request=>invoke('export-text',request),
 importBackup:()=>invoke('import-backup'),
 appInfo:()=>invoke('app-info'),
 rendererReady:()=>invoke('renderer-ready')
});
