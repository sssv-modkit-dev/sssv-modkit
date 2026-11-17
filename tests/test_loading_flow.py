"""Real built-page consent/worker gating and mobile layout; no ROM or runtime download."""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
chrome = shutil.which('google-chrome') or shutil.which('chromium') or next((str(p) for p in [Path(os.environ.get('PROGRAMFILES', '')) / 'Google/Chrome/Application/chrome.exe', Path(os.environ.get('PROGRAMFILES(X86)', '')) / 'Microsoft/Edge/Application/msedge.exe'] if p.is_file()), None)
if not chrome:
    print('SKIP loading flow: Chrome/Edge unavailable')
    raise SystemExit(0)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

probe = r"""
setTimeout(async()=>{
 const failures=[],check=(ok,msg)=>{if(!ok)failures.push(msg);},tick=()=>new Promise(r=>setTimeout(r,20));
 try{
  sessionStorage.clear();localStorage.clear();let starts=0;
  window.Worker=class{constructor(){starts++;}terminate(){}postMessage(m){setTimeout(()=>this.onmessage({data:{id:m.id,type:'drawn',pictures:{}}}),0);}};
  const call=()=>SSSVBuilder.art(new ArrayBuffer(8),[]).catch(e=>e);
  let job=call();await tick();
  check(!!document.getElementById('runtime-consent'),'dialog before worker');check(starts===0,'worker gated');
  check(document.getElementById('runtime-download').textContent.includes((SSSVRuntimeSizes.pyodide.bytes/1e6).toFixed(1)),'manifest size in dialog');
  check(document.activeElement.id==='runtime-download','initial focus');
  document.getElementById('runtime-consent').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
  check(document.activeElement.id==='runtime-not-now','focus trap');
  document.getElementById('runtime-not-now').click();check((await job).code==='RUNTIME_DECLINED','decline is retryable');check(starts===0,'Not now starts no worker');
  job=call();await tick();document.getElementById('runtime-consent').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await job;check(starts===0,'Escape starts no worker');
  job=call();await tick();
  const r=document.getElementById('runtime-consent').firstChild.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth,'360px dialog fits');
  document.getElementById('runtime-remember').checked=true;document.getElementById('runtime-download').click();await job;check(starts===1,'accepted starts worker');
  check(Object.keys(sessionStorage).some(k=>k.includes('pyodide')),'session remembered');check(Object.keys(localStorage).some(k=>k.includes('pyodide')),'persistent opt-in');
  await call();check(starts===1&&!document.getElementById('runtime-consent'),'reuse worker without asking');SSSVBuilder.terminate();
  sessionStorage.clear();localStorage.clear();
  const realRequest=SSSVDownloads.request,asked=[];
  SSSVDownloads.request=async id=>{asked.push(id);return false;};
  // Exercise the actual ROM handler: optional animals decline, then gallery/editor still finish.
  const demo=await fetch('demo/level-4.scene.json').then(r=>r.json()),bundle=Scene.toRuntime(demo);
  const decode=LevelRom.decode,normalize=LevelRom.normalize;
  LevelRom.normalize=b=>new Uint8Array(b);LevelRom.decode=async()=>bundle;
  const testROM=new Uint8Array(0x800000);testROM.set([0x80,0x37,0x12,0x40]);testROM.set([83,83,83,86],0x20);testROM[0x3e]=0x45;
  const romInput=document.getElementById('level-rom');Object.defineProperty(romInput,'files',{configurable:true,value:[new File([testROM],'private-test.z64')]});
  // Session capture normally checks the source; this synthetic test directly dispatches to the adapter.
  await romInput.onchange({target:romInput});
  for(let i=0;i<150&&!document.getElementById('load-status').textContent.includes('placeholder');i++)await tick();
  check(document.getElementById('load-status').textContent.includes('placeholder'),'declined animals still open levels: '+document.getElementById('load-status').textContent);check(asked[0]==='pyodide','animal assembly asks for runtime');check(starts===1,'declined animals start no worker');
  check(document.querySelectorAll('#gallery-list .card').length===1,'prepared gallery installed');
  LevelRom.decode=decode;LevelRom.normalize=normalize;SSSVDownloads.request=realRequest;
  await LoadProgress.start(['Testing failure']);window.dispatchEvent(new Event('error'));await LoadProgress.done();
  check(!document.getElementById('load-progress').hidden,'late done cannot hide browser failure');
  check(document.querySelector('.load-progress-bar').hidden,'browser error fails');
 }catch(e){failures.push(e.stack||String(e));}
 parent.document.body.append(Object.assign(parent.document.createElement('pre'),{id:'loading-result',textContent:JSON.stringify(failures)}));
},500);
"""
with tempfile.TemporaryDirectory(prefix='loading-flow-') as tmp:
    out=Path(tmp)
    subprocess.run([sys.executable,str(ROOT/'core/src/build_site.py'),'--pack',str(ROOT/'packs/sssv'),'--out',str(out),'--no-vendor'],check=True,capture_output=True)
    deps=json.loads((ROOT/'tools/vendor-manifest.json').read_text())['deps']
    sizes=json.loads((out/'runtime-sizes.js').read_text().split('=',1)[1].rstrip(';\n'))
    assert sizes['pyodide']['bytes']==sum(f['size'] for f in deps[0]['files'])
    for key in ('mupen64plus_next','parallel_n64'):
        dep=next(d for d in deps if d['id']==key)
        common=next(d for d in deps if d['id']=='emulatorjs')
        expected=sum(f['size'] for f in common['files'] if f['path'].endswith(('loader.js','emulator.min.js','emulator.min.css','extract7z.js')))+max(f['size'] for f in dep['files'] if f['path'].endswith('.data'))+sum(f['size'] for f in dep['files'] if f['path'].endswith('.json'))
        assert sizes[key]['bytes']==expected
    (out/'loading-probe.js').write_text(probe,encoding='utf-8')
    with (out/'level-editor.html').open('a',encoding='utf-8') as f:
        f.write('<script src="loading-probe.js"></script>')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=tmp))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        result=subprocess.run(['node',str(ROOT/'tests/test_loading_flow.mjs'),f'http://127.0.0.1:{server.server_port}/level-editor.html'],capture_output=True,text=True,encoding='utf-8',timeout=45)
        assert result.returncode==0,result.stdout+result.stderr
    finally:
        server.shutdown()
print('Loading flow: manifest sizes, consent/decline, focus, worker gate, placeholder levels and browser errors passed.')
