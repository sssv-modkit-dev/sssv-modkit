#!/usr/bin/env node
/* Writes src/web/demo/level-4.scene.json (scene-v1) from the decoder bundle src/web/demo/level-4.json. */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),demo=path.join(root,'src/web/demo');
const Scene=require('../core/src/levels/scene.js'),SceneImport=require('../src/levels/scene-import.js');
const bundle=JSON.parse(fs.readFileSync(path.join(demo,'level-4.json'),'utf8'));
const doc=SceneImport.fromBundle(bundle),errors=Scene.validate(doc);
if(errors.length)throw Error(errors.join('; '));
fs.writeFileSync(path.join(demo,'level-4.scene.json'),JSON.stringify(doc));
console.log('Wrote demo/level-4.scene.json: '+doc.levels.length+' level(s).');
