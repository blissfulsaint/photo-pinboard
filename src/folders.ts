import type {FolderNode} from "./models.js";
interface MutableNode {name:string;path:string;count:number;children:Map<string,MutableNode>}
export function isInFolder(path:string, folder:string|null) {
 return folder === null || path === folder || path.startsWith(folder + '/');
}
export function buildFolderTree(photos:ReadonlyArray<{folder:string}>):FolderNode[] {
 const roots = new Map<string,MutableNode>();
 for (const photo of photos) {
  let siblings = roots, path = '';
  for (const name of photo.folder.split('/').filter(Boolean)) {
   path = path ? path + '/' + name : name;
   if (!siblings.has(name)) siblings.set(name, { name, path, count: 0, children: new Map() });
   const node = siblings.get(name)!;
   node.count++;
   siblings = node.children;
  }
 }
 const finish = (nodes:Map<string,MutableNode>):FolderNode[] => [...nodes.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})).map(node=>({...node,children:finish(node.children)}));
 return finish(roots);
}
export function folderExpansion(nodes:FolderNode[], open:boolean) {
 const result:Record<string,boolean> = {};
 const visit = (items:FolderNode[]):void => items.forEach(node=>{if(node.children.length){result[node.path]=open;visit(node.children);}});
 visit(nodes);
 return result;
}
