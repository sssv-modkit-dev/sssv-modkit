/* Converts the editor's neutral edits (scene-edits-v1, scene-project-v1) to and from the builders' diff format. */
const EditsExport=(()=>{
  const relabel=(levels,map)=>Object.fromEntries(Object.entries(levels||{}).map(([lv,lists])=>[lv,Object.fromEntries(Object.entries(lists).map(([k,v])=>[map[k]||k,v]))]));
  const toBuilderDiff=e=>({format:'sssv-editor-diff',version:1,rom_sha1:e.source_sha1,levels:relabel(e.levels,{creatures:'animals'})});
  const fromBuilderDiff=d=>({format:'scene-edits-v1',version:1,source_sha1:d.rom_sha1,levels:relabel(d.levels,{animals:'creatures'})});
  const toBuilderProject=p=>({format:'sssv-workspace-project',version:1,rom_sha1:p.source_sha1,parts:p.parts,level_diff:toBuilderDiff(p.edits)});
  const fromBuilderProject=p=>({format:'scene-project-v1',version:1,source_sha1:p.rom_sha1,parts:p.parts,edits:p.level_diff&&fromBuilderDiff(p.level_diff)});
  /* Files saved before the split still open: legacy formats are converted, anything else passes through unchanged. */
  function normalize(v){if(v?.format==='sssv-editor-diff')return fromBuilderDiff(v);if(v?.format==='sssv-workspace-project')return fromBuilderProject(v);return v;}
  return {toBuilderDiff,fromBuilderDiff,toBuilderProject,fromBuilderProject,normalize};
})();
if(typeof module!=='undefined')module.exports=EditsExport;
