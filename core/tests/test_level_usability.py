"""Real browser regression for freecam and terrain placement; synthetic sample content only."""
import functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
chrome=shutil.which('google-chrome') or shutil.which('chromium') or next((str(p) for p in [Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'] if p.is_file()),None)
if not chrome:
    print('SKIP level usability: Chrome/Edge unavailable');raise SystemExit(0)
setup=r"""
// Keep frame callbacks deterministic under the headless virtual clock.
window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),16);
window.cancelAnimationFrame=clearTimeout;
if (location.search.includes('webgl1')) {
 const getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(kind,...options){
  return kind==='webgl2'?null:getContext.call(this,kind,...options);
 };
}
"""
probe=r"""
setTimeout(async()=>{
 const failures=[],check=(v,m)=>{if(!v)failures.push(m)},wait=ms=>new Promise(r=>setTimeout(r,ms)),el=id=>document.getElementById(id),cv=el('c');
 try{
 check(el('setup').hidden,'sample startup');check(el('camera-mode').value==='free','freecam default');check(!el('sea'),'no fake sea toggle');check(getComputedStyle(el('sky')).backgroundColor==='rgb(5, 5, 9)','game-style dark backdrop');
 const gl2=cv.getContext('webgl2'),gl=gl2||cv.getContext('webgl');
 check(!!gl2===!location.search.includes('webgl1'),'expected WebGL version');
 check(gl&&!gl.getContextAttributes().alpha,'opaque viewport');
 let draws=0;
 for(const name of ['drawArrays','drawElements']){
   const draw=gl[name].bind(gl);gl[name]=(...args)=>{draws++;return draw(...args);};
 }
 const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 await paint();check(draws===0,'idle viewport submits no draws');
 for(const id of ['wf','wf','wt','wt']){
   const before=draws;el(id).click();await paint();
   check(draws>before,id+' change redraws');
 }
 check(el('ed-save').closest('#project-panel'),'save controls own panel');
 check(getComputedStyle(el('objects-panel')).position==='fixed'&&el('objects-panel').getBoundingClientRect().left===0,'anchored source tree');
 const rail=[...el('level-right').children].map(p=>p.getBoundingClientRect());check(rail.every((r,i)=>!i||r.top>=rail[i-1].bottom),'rail panels do not overlap');
 const session=editorSession,eye=()=>LevelSelection.cameraEye(session.camera),beforeEye=eye();
 cv.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:600,clientY:400,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:660,clientY:420,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
 check(Math.hypot(...eye().map((v,i)=>v-beforeEye[i]))<.001,'look holds eye fixed');
 // Restore direction for a ray through the terrain at screen centre.
 cv.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:660,clientY:420,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:600,clientY:400,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
 const before=session.camera.t.slice();cv.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true}));check(Math.hypot(...session.camera.t.map((v,i)=>v-before[i]))>0,'wheel dollies freecam');
 el('ed-tool-pan').click();check(getComputedStyle(cv).cursor==='grab','pan tool cursor');const panBefore=session.camera.t.slice();cv.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:600,clientY:400,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{button:0,clientX:660,clientY:430,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));check(Math.hypot(...session.camera.t.map((v,i)=>v-panBefore[i]))>0,'pan tool left-drag pans with mouse');check(!document.querySelector('.ed-marquee'),'pan drag draws no marquee');el('ed-tool-select').click();
 el('ed-tool-add').click();el('pal-grid').querySelector('button').click();
 const r=cv.getBoundingClientRect(),x=r.width/2,y=r.height/2,p={button:0,clientX:x,clientY:y,bubbles:true};
 const count=()=>session.records[session.level.id].animals.length,old=count();
 cv.dispatchEvent(new MouseEvent('mousemove',p));await wait(80);cv.dispatchEvent(new MouseEvent('mousedown',p));window.dispatchEvent(new MouseEvent('mouseup',p));cv.dispatchEvent(new MouseEvent('click',p));
 check(count()===old+1,'terrain click places exactly one object');el('ed-undo').click();check(count()===old,'placement undo');el('ed-redo').click();check(count()===old+1,'placement redo');
 // Touch deliberately previews first; the second nearby tap creates one undoable object.
 const tap=()=>{const touch=new Touch({identifier:1,target:cv,clientX:x,clientY:y});cv.dispatchEvent(new TouchEvent('touchstart',{touches:[touch],changedTouches:[touch],bubbles:true,cancelable:true}));cv.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[touch],bubbles:true,cancelable:true}));};
 const touchCount=count();tap();check(count()===touchCount,'first touch only previews');tap();check(count()===touchCount+1,'second touch places once');el('ed-undo').click();check(count()===touchCount,'touch placement undo');
 // Sky never silently falls back to the camera target.
 const added=count(),sky={button:0,clientX:-10000,clientY:-10000,bubbles:true};cv.dispatchEvent(new MouseEvent('mousedown',sky));cv.dispatchEvent(new MouseEvent('click',sky));check(count()===added,'sky does not place');check(el('ed-tool-select').getAttribute('aria-pressed')==='true'&&el('ed-count').textContent==='0 selected','sky clears placement and selection');
 check(gl.getError()===gl.NO_ERROR,'no WebGL error after drawing, editing and toggles');
 }catch(e){failures.push(e.stack||e.message)}
 document.body.append(Object.assign(document.createElement('pre'),{id:'usability-result',textContent:JSON.stringify(failures)}));
},2000);
"""
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory(prefix='level-usability-') as tmp:
    out=Path(tmp)
    subprocess.run([sys.executable,str(ROOT/'src/build_site.py'),'--pack',str(ROOT/'packs/sample'),'--out',str(out),'--no-vendor'],check=True,capture_output=True)
    page=out/'level-editor.html'
    (out/'frame-clock.js').write_text(setup,encoding='utf-8')
    (out/'probe.js').write_text(probe,encoding='utf-8')
    html=page.read_text(encoding='utf-8').replace('<head>','<head><script src="frame-clock.js"></script>',1)
    page.write_text(html+'<script src="probe.js"></script>',encoding='utf-8')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=tmp));threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        for version in ('webgl2','webgl1'):
            result=subprocess.run([chrome,'--headless','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-proxy-server','--disable-background-networking','--no-first-run',f'--user-data-dir={out/version}','--window-size=1400,900','--virtual-time-budget=6000','--dump-dom',f'http://127.0.0.1:{server.server_port}/level-editor.html?{version}'],capture_output=True,text=True,encoding='utf-8',timeout=45)
            outcome=result.stdout.partition('<pre id="usability-result">')[2].partition('</pre>')[0]
            assert outcome=='[]',f'{version}: {outcome or "browser probe did not finish"}'
        print('Level usability passed on WebGL 2 and WebGL 1. Idle draw count, water/wireframe, freecam, placement, undo/redo and layout checks passed.')
    finally:server.shutdown()
