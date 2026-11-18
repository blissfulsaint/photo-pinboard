
import {inspectFile} from './metadata.js';
self.onmessage=async ({data})=>{
 try{self.postMessage({id:data.id,...await inspectFile(data.file)});}
 catch(error){self.postMessage({id:data.id,scanState:'unreadable',scanError:'File could not be read: '+error.message});}
};
