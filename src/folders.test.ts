import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFolderTree,isInFolder,folderExpansion} from './folders.js';
test('preserves intermediate directories and counts direct and descendant photos',()=>{
 const tree=buildFolderTree([{folder:'Japan/Kyoto/Church'},{folder:'Japan/Kyoto/Church'},{folder:'Japan/Kyoto'},{folder:'Japan/Osaka'},{folder:'Japan/Kyoto 2'}]);
 assert.equal(tree[0].count,5);
 assert.deepEqual(tree[0].children.map(n=>[n.name,n.count]),[['Kyoto',3],['Kyoto 2',1],['Osaka',1]]);
 assert.equal(tree[0].children[0].children[0].path,'Japan/Kyoto/Church');
 assert.deepEqual(folderExpansion(tree,false),{'Japan':false,'Japan/Kyoto':false});
});
test('folder scope includes descendants but not similarly named siblings',()=>{
 assert.equal(isInFolder('Japan/Kyoto/Church','Japan/Kyoto'),true);
 assert.equal(isInFolder('Japan/Kyoto','Japan/Kyoto'),true);
 assert.equal(isInFolder('Japan/Kyoto 2','Japan/Kyoto'),false);
 assert.equal(isInFolder('Japan/Kyoto','Japan/Kyoto/Church'),false);
 assert.equal(isInFolder('Japan',null),true);
});
