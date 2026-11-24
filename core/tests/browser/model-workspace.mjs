// Exercise the desktop and phone Model Editor with the sample and a local ROM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {evaluate, launch, open, setFile, sleep, until} from './cdp.mjs';

const {MODEL_WORKSPACE_SITE: site, MODEL_WORKSPACE_ROM: rom, MODEL_WORKSPACE_EVIDENCE: evidence,
    MODEL_WORKSPACE_INDEX: index} = process.env;
assert.ok(site && evidence, 'Set MODEL_WORKSPACE_SITE and MODEL_WORKSPACE_EVIDENCE.');
fs.mkdirSync(evidence, {recursive: true});
const server = spawn('python', ['-c', "import mimetypes,runpy;mimetypes.add_type('text/javascript','.mjs');runpy.run_module('http.server',run_name='__main__')", '8794', '--bind', '127.0.0.1', '--directory', site],
    {stdio:'ignore', windowsHide:true});
await sleep(450);
const browser = await launch(9347);
const url = 'http://127.0.0.1:8794/model-editor.html';
const session = await open(browser, 'about:blank');
const js = code => evaluate(browser, session, code);
const awaitJS = (code, timeout) => until(browser, session, code, timeout);
async function check(code, label) { assert.ok(await js(code), label); }
async function size(width, height, mobile) {
    await browser.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor:1, mobile}, session);
}
async function screenshot(name) {
    const shot = await browser.send('Page.captureScreenshot', {format:'png'}, session);
    fs.writeFileSync(`${evidence}/${name}.png`, Buffer.from(shot.data, 'base64'));
}
try {
    await size(1440, 900, false);
    await browser.send('Page.navigate', {url}, session);
    await awaitJS("!!document.querySelector('#parts .row[aria-pressed=true]') && !!document.querySelector('#rom-session')");
    await check("document.getElementById('model-header').getBoundingClientRect().height===44", '44px header');
    await check("document.querySelectorAll('#model-header .global-nav').length===1 && document.querySelector('#model-header .global-nav>a:last-child').textContent==='Play' && document.querySelectorAll('#model-header #rom-session').length===1", 'header nav and single ROM group');
    await check("!document.getElementById('view-settings').open && document.getElementById('camera-tools').parentElement.id==='view'", 'compact Display and camera tools');
    await check("!document.getElementById('deform-controls').open && document.querySelectorAll('#mesh .mesh-group .axis-number').length===9", 'compact transform controls');
    await check("/body|torso/i.test(document.querySelector('#parts .row[aria-pressed=true]').textContent)", 'sample body selected');
    await check("document.querySelector('#find-demo-picker').placeholder==='Filter animals…' && document.querySelector('#find-parts').placeholder==='Filter parts…'", 'filter placeholders');
    await screenshot('sample-desktop');

    await size(390, 844, true);
    await awaitJS("document.body.dataset.modelDrawer==='animals'");
    await check("document.elementFromPoint(40,document.getElementById('model-drawer-tabs').getBoundingClientRect().top+16).closest('#model-drawer-tabs')!==null", 'drawer tabs are tappable');
    await check("!document.getElementById('model-camera-pad').open && document.getElementById('model-camera-pad').getBoundingClientRect().height<=48", 'camera pad is collapsed');
    await check("document.querySelector('#model-drawer-tabs [aria-selected=true]').textContent==='Animals' && getComputedStyle(document.getElementById('edit-side')).display==='none'", 'Animals opens first');
    await screenshot('sample-phone');
    await js("document.getElementById('drawer-parts').click()");
    await check("document.getElementById('parts').getBoundingClientRect().height>50 && getComputedStyle(document.getElementById('model-chooser')).display==='none'", 'Parts panel available');
    await js("document.getElementById('drawer-edit').click()");
    await check("document.querySelector('#mesh .axis-number').getBoundingClientRect().width>15", 'mobile Workbench is immediately usable');
    await screenshot('sample-phone-edit');

    if (rom) {
        await size(1440, 900, false);
        await awaitJS("document.getElementById('model-header-settings').open");
        if (index) {
            await setFile(browser, session, '#local-table', index);
            await awaitJS("document.getElementById('msg').textContent.includes('indexed locally')");
        }
        await setFile(browser, session, '#session-rom-file', rom);
        try {
            await awaitJS("!!ModelEditorHost.getSource() && document.getElementById('session-state').textContent.includes('US 1.0 verified')", 120000);
        } catch (error) {
            throw Error(await js("document.getElementById('msg').textContent+' | '+document.getElementById('session-state').textContent"), {cause:error});
        }
        await awaitJS("!!document.querySelector('#demo-picker [data-model=bear]')");
        await js("document.querySelector('#demo-picker [data-model=bear]').click()");
        const bear = await js("({open:document.getElementById('model-chooser').open,selected:document.querySelector('#parts .row[aria-pressed=true]')?.textContent,parts:[...document.querySelectorAll('#parts .row')].map(b=>b.textContent)})");
        assert.ok(!bear.open && /body|torso/i.test(bear.selected), JSON.stringify(bear));
        await js("document.getElementById('model-chooser').open=true;document.getElementById('anim-walk').click()");
        await check("document.getElementById('model-animation').value==='walk' && !document.getElementById('anim-timeline').hidden", 'Walk syncs State');
        await js("document.getElementById('anim-dance').click()");
        await check("document.getElementById('model-animation').value==='dance' && document.querySelector('#animation-export #anim-webm')!==null", 'Dance and export selector');
        await screenshot('rom-desktop');
        await size(390, 844, true);
        await awaitJS("!document.getElementById('model-drawer-tabs').hidden");
        await js("document.getElementById('drawer-edit').click()");
        await screenshot('rom-phone-edit');
        await check("document.documentElement.scrollWidth===innerWidth", 'ROM mobile has no horizontal overflow');
    }
    console.log(`Model Editor desktop and 390×844 phone checks passed (${rom ? 'sample and US ROM' : 'sample'}).`);
} finally {
    await browser.close();
    server.kill();
}
