/* Original synthetic MIDI events only. */
'use strict';
const vl=n=>{const a=[n&127];while(n=Math.floor(n/128))a.unshift((n&127)|128);return a;};
const be=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
function midi(tracks,division=480,format=tracks.length===1?0:1){const chunks=tracks.map(events=>{const body=[];let last=0;for(const [tick,bytes] of events){body.push(...vl(tick-last),...bytes);last=tick;}body.push(0,255,47,0);return [77,84,114,107,...be(body.length),...body];});return Uint8Array.from([77,84,104,100,0,0,0,6,0,format,tracks.length>>>8,tracks.length&255,division>>>8,division&255,...chunks.flat()]);}
function tiny(){return midi([[[0,[255,81,3,7,161,32]],[0,[192,2]],[0,[144,60,100]],[480,[128,60,0]]]]);}
function complex(){return midi([
 [[0,[255,81,3,6,26,128]],[480,[255,81,3,7,161,32]]],
 [[0,[192,0]],[0,[176,7,90]],[0,[224,0,64]],[0,[144,60,100]],[120,[60,80]],[240,[128,60,0]],[360,[144,60,0]],[480,[192,1]],[480,[144,64,90]],[960,[128,64,0]]],
 [[0,[193,12]],[0,[145,48,96]],[720,[129,48,0]]]
 ]);}
module.exports={midi,tiny,complex,vl};
