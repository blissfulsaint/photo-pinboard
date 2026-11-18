
import test from 'node:test';import assert from 'node:assert/strict';import {isVideo,durationLabel} from './media.js';
test('recognizes common camera video extensions and native media type',()=>{
 for(const name of ['CLIP.MP4','clip.mov','clip.m4v','clip.3gp','clip.avi','clip.MTS'])assert.equal(isVideo({name}),true);
 assert.equal(isVideo({name:'photo.jpg'}),false);assert.equal(isVideo({name:'unknown',type:'video/mp4'}),true);
});
test('video durations remain readable without metadata',()=>{
 assert.equal(durationLabel(125.9),'2:05');assert.equal(durationLabel(null),'VIDEO');assert.equal(durationLabel(0),'VIDEO');
});
