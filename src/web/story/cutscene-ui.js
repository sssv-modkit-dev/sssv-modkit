/* DOM controller for the Dialogue page's object scripts. */
(function(root){
'use strict';
root.mountCutscenes=function({data,scripts,onChange,onDialogue,onError,isBusy}){
 const $=id=>document.getElementById(id),C=root.Cutscenes;
 let level='1',entry=null;
 const text=()=>Number(level)<=31?data.banks[Number(level)-1]?.strings||{}:{};
 const el=(tag,content)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=content;return n;};
 function showSteps(){
  const script=scripts[level]?.find(s=>s.entry===entry),list=$('script-steps');list.replaceChildren();
  $('script-title').textContent=script?`Script at record ${entry}`:'Steps';
  $('script-objects').textContent=script?script.objects.join(', '):'No object scripts in this level.';
  for(const b of $('script-list').children)b.setAttribute('aria-pressed',String(Number(b.dataset.entry)===entry));
  if(!script)return;
  list.start=entry;
  for(let i=entry-1;i<entry-1+script.count;i++){
   const record=data.cutscenes[level][i],row=el('li'),summary=el('p',C.describe(record,text()));row.dataset.record=i+1;row.append(summary);
   const zoomText=[0x4d,0x4e].includes(record.op)?el('p'):null;
   const showZoom=()=>{if(zoomText){const range=C.zoom(record);zoomText.textContent=`zoom ${range.min} to ${range.max}`;}};
   showZoom();if(zoomText)row.append(zoomText);
   const controls=el('div');controls.className='shot-fields';
   for(const field of C.fields(record,$('raw-edit').checked)){
    const label=el('label',field.label+' '),input=el('input'),word=record.args[field.arg];
    input.dataset.arg=field.arg;input.dataset.shift=String(field.shift);input.disabled=field.disabled;input.setAttribute('aria-label',`Record ${i+1}: ${field.label}`);
    if(field.raw){input.type='text';input.value=C.hex(word);input.maxLength=4;input.pattern='[0-9a-fA-F]{1,4}';}
    else if(field.disabled){input.type='text';input.value=C.value(word);input.title='This value comes from a variable or object property.';}
    else{input.type='number';input.min=0;input.max=field.max;input.step=1;input.value=field.shift===null?word:(word>>>field.shift)&255;}
    input.oninput=()=>{
     if(isBusy())return;
     try{
      if(input.value.trim()===''||(field.raw&&!/^[0-9a-f]{1,4}$/i.test(input.value)))throw Error('Enter a valid '+(field.raw?'hexadecimal argument.':'whole number.'));
      const next=field.raw?parseInt(input.value,16):Number(input.value);C.edit(record,field,next,$('raw-edit').checked);
      const timing=data.levels[level]?.find(r=>r.i===i);
      if(timing){if(record.op===0x44){timing.text=record.args[0];timing.hold_seconds=record.args[1];}else if(record.op===6)timing.frames=record.args[0];}
      input.setCustomValidity('');summary.textContent=C.describe(record,text());showZoom();rawText.textContent=raw();onChange();
     }catch(error){input.setCustomValidity(error.message);onError(error.message);}
    };
    label.append(input);controls.append(label);
   }
   row.append(controls);
   if(!controls.children.length)row.append(el('small','Read-only step.'));
   const details=el('details'),raw=()=>`op 0x${record.op.toString(16).toUpperCase().padStart(2,'0')}  `+record.args.map(C.hex).join(' '),rawText=el('code',raw());
   details.append(el('summary','Raw view'),rawText);row.append(details);list.append(row);
  }
  if(!script.terminated)list.append(el('li','The record pool ends before an end step.'));
 }
 function refresh(){
  const rows=scripts[level]||[];$('script-list').replaceChildren();
  $('cutscene-count').textContent=`${data.cutscenes[level]?.length||0} records / ${rows.length} scripts`;
  if(!rows.some(s=>s.entry===entry))entry=rows[0]?.entry??null;
  for(const script of rows){const b=el('button',`Record ${script.entry} / ${script.count} steps\n${script.objects.join(', ')}`);b.type='button';b.dataset.entry=script.entry;b.onclick=()=>{if(isBusy())return;entry=script.entry;showSteps();};$('script-list').append(b);}
  showSteps();
 }
 function tab(cutscene){
  $('dialogue-panel').hidden=cutscene;$('cutscenes-panel').hidden=!cutscene;
  for(const id of ['dialogue','cutscenes']){const active=(id==='cutscenes')===cutscene;$(id+'-tab').setAttribute('aria-selected',String(active));$(id+'-tab').tabIndex=active?0:-1;}
  if(cutscene)refresh();else onDialogue();
 }
 $('raw-edit').checked=false;$('raw-edit').onchange=showSteps;
 $('cutscene-level').replaceChildren();
 for(let lv=1;lv<=36;lv++){const o=el('option',`Level ${lv}${lv<=31&&data.banks[lv-1]?.title?' / '+data.banks[lv-1].title:''}`);o.value=lv;$('cutscene-level').append(o);}
 $('cutscene-level').disabled=false;$('cutscene-level').onchange=()=>{level=$('cutscene-level').value;entry=null;refresh();};
 $('dialogue-tab').onclick=()=>tab(false);$('cutscenes-tab').onclick=()=>tab(true);
 for(const id of ['dialogue','cutscenes'])$(id+'-tab').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const cutscene=event.key==='End'||event.key!=='Home'&&id==='dialogue';tab(cutscene);$(cutscene?'cutscenes-tab':'dialogue-tab').focus();}};
 tab(false);refresh();return {refresh};
};
})(globalThis);
