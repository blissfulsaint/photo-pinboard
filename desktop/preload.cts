import type {DesktopBridge,IpcApi} from '../src/models.js';

import {contextBridge,ipcRenderer} from 'electron';
const invoke=<K extends keyof IpcApi>(channel:K,...args:Parameters<IpcApi[K]>):ReturnType<IpcApi[K]>=>ipcRenderer.invoke('pinboard:'+channel,...args) as ReturnType<IpcApi[K]>;
const bridge:DesktopBridge={
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
};
contextBridge.exposeInMainWorld('pinboardDesktop',bridge);
