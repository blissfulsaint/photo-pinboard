
export const STATUS_LABELS = {needs:'Needs location',pending:'Pending write',geotagged:'Geotagged',scanning:'Scanning',unreadable:'Check metadata'};
export function validGps(gps) {return !!gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && Math.abs(gps.lat)<=90 && Math.abs(gps.lng)<=180;}
export function sameGps(a,b) {return validGps(a)&&validGps(b)&&Math.abs(a.lat-b.lat)<0.000001&&Math.abs(a.lng-b.lng)<0.000001;}
export function photoKey(photo) {return photo.demo?photo.id:photo.hash?'sha256:'+photo.hash:photo.path+'|'+photo.size+'|'+photo.modified;}
export function assignmentFor(photo,assignments) {return assignments[photoKey(photo)] || assignments[photo.path+'|'+photo.size+'|'+photo.modified];}
export function photoStatus(photo,assignment) {
 if (assignment && !sameGps(assignment,photo.embedded)) return 'pending';
 if(validGps(photo.embedded)) return 'geotagged';
 if(photo.scanState==='scanning') return 'scanning';
 if(photo.scanState==='unreadable') return 'unreadable';
 return 'needs';
}
export function cleanLocation(row) {
 if(!validGps(row)) throw new Error('A location has invalid coordinates.');
 return {lat:row.lat,lng:row.lng,label:String(row.label??'').slice(0,500),source:String(row.source??'').slice(0,2000),provenance:String(row.provenance??'manual').slice(0,100),assignedAt:String(row.assignedAt??'')};
}
export function parseBackup(input) {
 if(!input||typeof input!=='object'||![1,2].includes(input.schemaVersion))throw new Error('Choose a Photo Pinboard JSON backup (version 1 or 2).');
 const assignments={};let legacyCount=0;
 if(input.schemaVersion===2){
  if(!Array.isArray(input.assignments)||input.assignments.length>100000)throw new Error('Backup assignments are missing or too large.');
  for(const item of input.assignments){
   if(!/^sha256:[a-f0-9]{64}$/.test(item.key)&&!/^demo-\d+$/.test(item.key)&&!/^legacy:/.test(item.key))throw new Error('Invalid file identity in backup.');
   const key=item.key.startsWith('legacy:')?item.key.slice(7):item.key;
   if(!key||['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid file identity in backup.');
   if(item.key.startsWith('legacy:'))legacyCount++;
   if(Object.hasOwn(assignments,key)&&!sameGps(assignments[key],item))throw new Error('Backup has conflicting assignments for one file.');
   assignments[key]=cleanLocation(item);
  }
 }else{
  if(!Array.isArray(input.photos)||input.photos.length>100000)throw new Error('Backup photos are missing or too large.');
  for(const row of input.photos){
   if(typeof row.relativePath!=='string'||!Number.isFinite(row.size)||!Number.isFinite(row.lastModified))throw new Error('This old backup has no reliable file identity. Reopen its original folder in the browser that created it.');
   const key=row.relativePath+'|'+row.size+'|'+row.lastModified;
   assignments[key]=cleanLocation(row);legacyCount++;
  }
 }
 const places=Array.isArray(input.places)?input.places.map(p=>{if(!validGps(p)||typeof p.name!=='string')throw new Error('Invalid saved place.');return {name:p.name.slice(0,500),lat:p.lat,lng:p.lng};}):[];
 return {assignments,places,legacyCount};
}
export function mergeBackup(current,incoming) {
 const conflicts=Object.keys(incoming).filter(key=>Object.hasOwn(current,key)&&!sameGps(current[key],incoming[key]));
 return {assignments:{...current,...incoming},conflicts};
}
export function createBackup(assignments,places,photos) {
 return {schemaVersion:2,createdAt:new Date().toISOString(),assignments:Object.entries(assignments).map(([key,value])=>({key:/^(sha256:|demo-)/.test(key)?key:'legacy:'+key,...cleanLocation(value)})),places,photos:photos.map(p=>({relativePath:p.path,sha256:p.hash??null,size:p.size??null,lastModified:p.modified??null,embedded:p.embedded??null,status:photoStatus(p,assignmentFor(p,assignments)),assignment:assignmentFor(p,assignments)??null}))};
}
