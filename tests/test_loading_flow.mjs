import {launch,open,evaluate,until} from '../core/tests/browser/cdp.mjs';
const c=await launch(9386);
try{
 const s=await open(c,'about:blank');
 await c.send('Emulation.setDeviceMetricsOverride',{width:360,height:844,deviceScaleFactor:1,mobile:true},s);
 await c.send('Page.navigate',{url:process.argv[2]},s);
 await until(c,s,`document.getElementById('loading-result')`,20000);
 const failures=await evaluate(c,s,`document.getElementById('loading-result').textContent`);
 if(failures!=='[]')throw Error(failures);
 console.log('Browser consent and loading flow passed at 360px');
}finally{c.close();}
