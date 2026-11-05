const assert=require('assert');
global.LevelSelection=require('../src/levels/selection.js');
const palette=require('../src/levels/palette.js');
// Type lists: every animal; named props; never the player start.
assert.equal(palette.animalTypes().length,68);
assert(!palette.propTypes().includes(55)&&palette.propTypes().includes(34));
assert.equal(palette.initials('Racing Dog'),'RD');assert.equal(palette.initials('Fox'),'FO');
// Zero-based record when no stock record of that type is loaded.
const empty=palette.make('props',34,[100,-200,300],{});
assert.equal(empty.templated,false);assert.equal(empty.hex.length,44);
assert.equal(empty.hex,'0022'+'0064'+'ff38'+'012c'+'0000'+'0000'+'00'.repeat(10));
// Cloned stock record keeps its extra bytes; pose and type are overwritten.
const stock={4:{props:[],animals:['0021'+'0001'+'0002'+'0003'+'0004'+'aabbccddeeff']}};
const animal=palette.make('animals',33,[10,20,30],stock,90);
assert.equal(animal.templated,true);assert.equal(animal.hex.length,32);
assert.equal(animal.hex,'0021'+'000a'+'0014'+'001e'+'005a'+'aabbccddeeff');
// Template must come from the requested type only.
assert.equal(palette.make('animals',32,[0,0,0],stock).templated,false);
// Validation.
for(const bad of [()=>palette.make('props',55,[0,0,0],{}),()=>palette.make('props',247,[0,0,0],{}),()=>palette.make('animals',68,[0,0,0],{}),()=>palette.make('props',34,[40000,0,0],{}),()=>palette.make('lights',1,[0,0,0],{})])assert.throws(bad);
// Coordinates round to integers.
assert.equal(palette.make('props',34,[1.6,0,0],{}).hex.slice(4,8),'0002');
console.log('Level palette record construction passed.');
