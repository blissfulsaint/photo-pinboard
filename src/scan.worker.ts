import {messageOf} from './errors.js';

import {inspectFile} from './metadata.js';
self.onmessage=async ({data}:MessageEvent<{id:string;file:import('./models.js').FileLike}>)=>{
 try{self.postMessage({id:data.id,...await inspectFile(data.file)});}
 catch(error){self.postMessage({id:data.id,scanState:'unreadable',scanError:'File could not be read: '+messageOf(error)});}
};
