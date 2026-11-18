
import path = require('node:path');
import fs = require('node:fs');
import {spawnSync} from 'node:child_process';
const root=path.resolve(__dirname,'..'),temp=path.join(root,'work','electron-temp');
fs.mkdirSync(temp,{recursive:true});
const result=spawnSync(process.execPath,[path.join(root,'node_modules','electron','install.js')],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp,electron_config_cache:path.join(root,'work','electron-cache')}});
process.exit(result.status??1);
