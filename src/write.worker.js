import {writeJpegGps} from './jpeg.js';
import {hashFile,readMetadata} from './metadata.js';
import {sameGps} from './library.js';
import {prepareCaptureDate} from './capture-writing.js';

self.onmessage=async({data})=>{
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
  self.postMessage({bytes:bytes.buffer,hash},[bytes.buffer]);
 }catch(error){self.postMessage({error:error.message});}
};
