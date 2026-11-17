/* A background heartbeat fills the AudioContext queue; source timing uses its clock. */
'use strict';
let timer;
onmessage=e=>{clearTimeout(timer);if(e.data){const pulse=()=>{postMessage(0);timer=setTimeout(pulse,80);};pulse();}};
