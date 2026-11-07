/* Converts the decoder's level bundle into a scene-v1 document. Every bundle field must be mapped; unknown fields are errors. */
const SceneImport=(()=>{
  const S=typeof Scene!=='undefined'?Scene:require('../../core/src/levels/scene.js');
  const invert=map=>Object.fromEntries(Object.entries(map).map(([k,v])=>[v,k]));
  const LEVEL=invert(S.LEVEL),TERRAIN=invert(S.TERRAIN),OBJECTS=invert(S.OBJECTS),RECORDS=invert(S.RECORDS),DOC=invert(S.DOC);
  const TOP=new Set([...Object.keys(DOC),'LEVELS','EDITOR_STOCK','EDITOR_SHA1','SOURCE_LABEL','format']);
  function fromBundle(bundle){
    for(const k of Object.keys(bundle))if(!TOP.has(k))throw Error('unmapped field '+k);
    const doc={format:'scene-v1',title:bundle.SOURCE_LABEL,source:{label:bundle.SOURCE_LABEL,sha1:bundle.EDITOR_SHA1}};
    for(const [k,v] of Object.entries(DOC))if(k in bundle)doc[v]=bundle[k];
    const stock=bundle.EDITOR_STOCK||{};
    doc.levels=bundle.LEVELS.map(L=>{
      const level={terrain:{},objects:{}};
      for(const [k,v] of Object.entries(L)){
        if(k in LEVEL)level[LEVEL[k]]=v;else if(k in TERRAIN)level.terrain[TERRAIN[k]]=v;else if(k in OBJECTS)level.objects[OBJECTS[k]]=v;
        else throw Error('unmapped field '+k);
      }
      const records=stock[String(L.id)];
      if(records){level.records={};for(const [k,v] of Object.entries(records)){if(!(k in RECORDS))throw Error('unmapped field '+k);level.records[RECORDS[k]]=v;}}
      return level;
    });
    return doc;
  }
  return {fromBundle};
})();
if(typeof module!=='undefined')module.exports=SceneImport;
