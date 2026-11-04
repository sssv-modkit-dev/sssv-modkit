let editorSession=null;
document.getElementById('level-rom').addEventListener('change',async event=>{
  const input=event.target,file=input.files[0],status=document.getElementById('load-status');
  if(!file)return;input.disabled=true;
  try{
    status.textContent='Checking your local ROM…';
    const data=await LevelRom.decode(await file.arrayBuffer(),message=>status.textContent=message);
    editorSession=startLevelEditor(data);
    document.getElementById('setup').hidden=true;
  }catch(error){status.textContent=error.message;input.disabled=false;input.value='';}
});
