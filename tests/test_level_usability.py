"""Real browser regression for freecam and terrain placement; synthetic sample content only."""
import functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
chrome=shutil.which('google-chrome') or shutil.which('chromium') or next((str(p) for p in [Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'] if p.is_file()),None)
if not chrome:
    print('SKIP level usability: Chrome/Edge unavailable');raise SystemExit(0)
probe=r"""
setTimeout(async()=>{
 const failures=[],check=(v,m)=>{if(!v)failures.push(m)},wait=ms=>new Promise(r=>setTimeout(r,ms)),el=id=>document.getElementById(id),cv=el('c');
 try{
 check(el('setup').hidden,'sample startup');check(el('camera-mode').value==='free','freecam default');
 check(el('ed-save').closest('#project-panel'),'save controls own panel');
 for(const id of ['ui','editor','objects-panel','add-panel','project-panel'])check(getComputedStyle(el(id)).resize==='both',id+' resizable');
 const session=editorSession,eye=()=>LevelSelection.cameraEye(session.camera),beforeEye=eye();
 cv.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:600,clientY:400,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:660,clientY:420,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
 check(Math.hypot(...eye().map((v,i)=>v-beforeEye[i]))<.001,'look holds eye fixed');
 // Restore direction for a ray through the terrain at screen centre.
 cv.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:660,clientY:420,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:600,clientY:400,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
 const before=session.camera.t.slice();cv.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true}));check(Math.hypot(...session.camera.t.map((v,i)=>v-before[i]))>0,'wheel dollies freecam');
 el('ed-tool-add').click();el('pal-grid').querySelector('button').click();
 const r=cv.getBoundingClientRect(),x=r.width/2,y=r.height/2,p={button:0,clientX:x,clientY:y,bubbles:true};
 const count=()=>session.records[session.level.id].animals.length,old=count();
 cv.dispatchEvent(new MouseEvent('mousemove',p));await wait(80);cv.dispatchEvent(new MouseEvent('mousedown',p));window.dispatchEvent(new MouseEvent('mouseup',p));cv.dispatchEvent(new MouseEvent('click',p));
 check(count()===old+1,'terrain click places exactly one object');el('ed-undo').click();check(count()===old,'placement undo');el('ed-redo').click();check(count()===old+1,'placement redo');
 // Touch deliberately previews first; the second nearby tap creates one undoable object.
 const tap=()=>{const touch=new Touch({identifier:1,target:cv,clientX:x,clientY:y});cv.dispatchEvent(new TouchEvent('touchstart',{touches:[touch],changedTouches:[touch],bubbles:true,cancelable:true}));cv.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[touch],bubbles:true,cancelable:true}));};
 const touchCount=count();tap();check(count()===touchCount,'first touch only previews');tap();check(count()===touchCount+1,'second touch places once');el('ed-undo').click();check(count()===touchCount,'touch placement undo');
 // Sky never silently falls back to the camera target.
 const added=count(),sky={button:0,clientX:-10000,clientY:-10000,bubbles:true};cv.dispatchEvent(new MouseEvent('mousedown',sky));cv.dispatchEvent(new MouseEvent('click',sky));check(count()===added,'sky does not place');
 }catch(e){failures.push(e.stack||e.message)}
 document.body.append(Object.assign(document.createElement('pre'),{id:'usability-result',textContent:JSON.stringify(failures)}));
},2000);
"""
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory(prefix='level-usability-') as tmp:
    out=Path(tmp)
    subprocess.run([sys.executable,str(ROOT/'src/build_site.py'),'--pack',str(ROOT/'packs/sample'),'--out',str(out),'--no-vendor'],check=True,capture_output=True)
    (out/'probe.js').write_text(probe,encoding='utf-8')
    with (out/'level-editor.html').open('a',encoding='utf-8') as f:f.write('<script src="probe.js"></script>')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=tmp));threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        result=subprocess.run([chrome,'--headless','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-proxy-server',f'--user-data-dir={out/"profile"}','--window-size=1400,900','--virtual-time-budget=6000','--dump-dom',f'http://127.0.0.1:{server.server_port}/level-editor.html'],capture_output=True,text=True,encoding='utf-8',timeout=45)
        assert '<pre id="usability-result">[]</pre>' in result.stdout,result.stdout[-7000:]+result.stderr[-1500:]
        print('Browser freecam, independent resizable save panel, terrain click/double-tap placement, sky rejection and undo/redo passed.')
    finally:server.shutdown()
