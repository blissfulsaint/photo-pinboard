import {messageOf} from './errors.js';
import {writeJpegGps} from './jpeg.js';
import {hashFile,readMetadata} from './metadata.js';
import {sameGps} from './library.js';
import {prepareCaptureDate} from './capture-writing.js';

self.onmessage=async({data}:MessageEvent<{file:import('./models.js').FileLike}&import('./models.js').WriteFields>)=>{
 try{
  let bytes,hash;
  if(data.captureDate){
   ({bytes,hash}=await prepareCaptureDate(data.file,data.captureDate));
  }else{
   bytes=writeJpegGps(new Uint8Array(await data.file.arrayBuffer()),data.gps);
   const blob=new Blob([bytes],{type:'image/jpeg'});
   if(!sameGps((await readMetadata(blob)).embedded,data.gps))throw new Error('Written GPS failed independent verification.');
   hash=await hashFile(blob);
  }
  (self as unknown as {postMessage(message:unknown,transfer:Transferable[]):void}).postMessage({bytes:bytes.buffer,hash},[bytes.buffer]);
 }catch(error){self.postMessage({error:messageOf(error)});}
};
