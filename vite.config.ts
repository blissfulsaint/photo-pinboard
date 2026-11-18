import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';

const {version}=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

export default defineConfig({
 define:{__APP_VERSION__:JSON.stringify(version)},
 plugins:[{
  name:'app-version',
  generateBundle(){
   this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({version})});
  }
 }],
 server:{host:'127.0.0.1'},
 preview:{host:'127.0.0.1'}
});
