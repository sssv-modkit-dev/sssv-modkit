"""Exercise the real page and bundled runtime in Chrome, including editor init order."""
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
    print('SKIP level page startup: Chrome/Edge unavailable')
    raise SystemExit(0)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

probe = r"""
setTimeout(()=>{
 const failures=[];const check=(ok,msg)=>{if(!ok)failures.push(msg);};
 check(document.getElementById('setup').hidden,'demo startup failed: '+document.getElementById('load-status').textContent);
 check(document.querySelectorAll('#pal-grid .pal-tile').length===68,'default Animals grid');
 check(typeof document.getElementById('ed-apply').onclick==='function','editor handlers');
 check(!document.getElementById('display-panel').open,'Display starts collapsed');
 const expected=Number(new URLSearchParams(location.search).get('width'));
 check(innerWidth===expected,'viewport width '+innerWidth+' expected '+expected);
 const phone=innerWidth<700;
 for(const id of ['ui','editor','objects-panel','add-panel']){
  const el=document.getElementById(id),r=el.getBoundingClientRect();
  check(r.left>=0&&r.right<=innerWidth,id+' horizontal overflow');
  if(phone&&id!=='ui')check(!el.open,id+' starts collapsed');
  if(phone)check(r.top>=document.getElementById('c').getBoundingClientRect().bottom,id+' follows canvas');
 }
 if(!phone){
  const slider=document.getElementById('ed-yaw-slider').getBoundingClientRect(),number=document.getElementById('ed-yaw').getBoundingClientRect();
  check(Math.abs(slider.top-number.top)<12,'Yaw wraps');
 }
 parent.document.body.append(Object.assign(parent.document.createElement('pre'),{id:'startup-result',textContent:JSON.stringify(failures)}));
},2500);
"""
with tempfile.TemporaryDirectory(prefix='level-startup-') as tmp:
    out=Path(tmp)
    # The real site as published: core pages plus the sample pack.
    subprocess.run([sys.executable,str(ROOT/'src/build_site.py'),'--pack',str(ROOT/'packs/sample'),'--out',str(out),'--no-vendor'],check=True,capture_output=True)
    # External file, not inline: the page's CSP allows only same-origin scripts.
    (out/'probe.js').write_text(probe,encoding='utf-8')
    with open(out/'level-editor.html','a',encoding='utf-8',newline='\n') as f:f.write('<script src="probe.js"></script>\n')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=tmp))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        for width,height in [(1400,900),(400,850)]:
            with open(out/'probe.html','w',encoding='utf-8',newline='\n') as f:
                f.write(f'<iframe style="border:0;width:{width}px;height:{height}px" src="level-editor.html?width={width}"></iframe>')
            result=subprocess.run([chrome,'--headless','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-proxy-server',f'--user-data-dir={out / ("profile-"+str(width))}',f'--window-size={width + (16 if os.name == "nt" else 0)},{height + (87 if os.name == "nt" else 0)}','--virtual-time-budget=5000','--dump-dom',f'http://127.0.0.1:{server.server_port}/probe.html'],capture_output=True,text=True,encoding='utf-8',timeout=45)
            assert '<pre id="startup-result">[]</pre>' in result.stdout, result.stdout[-5000:]+result.stderr[-1000:]
            print(f'Level page startup/layout passed: {width}x{height}')
    finally:
        server.shutdown()
