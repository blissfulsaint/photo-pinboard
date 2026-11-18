import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCoordinates,csvCell} from './geo.js';
test('decimal and signed coordinates',()=>{assert.deepEqual(parseCoordinates(' -90, 180 '),{lat:-90,lng:180});});
test('explicit pin overrides viewport',()=>assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/Kyoto/@34,134,12z/data=!3d35.01!4d135.76'),{lat:35.01,lng:135.76}));
test('numeric query',()=>assert.deepEqual(parseCoordinates('https://maps.google.com/?q=35.1,135.2'),{lat:35.1,lng:135.2}));
test('reject ambiguous and invalid inputs',()=>{for(const v of ['https://www.google.com/maps/@35,135,12z','https://maps.app.goo.gl/test','91,135','35,181','Kyoto','35,135,2','https://evil.com/?q=35,135']) assert.throws(()=>parseCoordinates(v));});
test('CSV escaping',()=>assert.equal(csvCell('a"b'),'"a""b"'));
