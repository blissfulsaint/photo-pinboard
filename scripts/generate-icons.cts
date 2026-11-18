import fs = require('node:fs/promises');
import path = require('node:path');
import {Resvg} from '@resvg/resvg-js';

async function main(){
 const directory=path.join(__dirname,'..','public');
 const source=await fs.readFile(path.join(directory,'app-icon.svg'));
 const sizes=[16,20,24,32,40,48,64,128,256];
 const images=sizes.map(size=>new Resvg(source,{fitTo:{mode:'width',value:size}}).render().asPng());
 const header=Buffer.alloc(6+16*sizes.length);
 header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 for(const [index,size] of sizes.entries()){
  const at=6+index*16;
  header[at]=header[at+1]=size===256?0:size;
  header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
  header.writeUInt32LE(images[index].length,at+8);header.writeUInt32LE(offset,at+12);
  offset+=images[index].length;
 }
 await fs.writeFile(path.join(directory,'favicon.ico'),Buffer.concat([header,...images]));
 for(const [name,size] of [['app-icon.png',256],['apple-touch-icon.png',180]] as const){
  await fs.writeFile(path.join(directory,name),new Resvg(source,{fitTo:{mode:'width',value:size}}).render().asPng());
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
