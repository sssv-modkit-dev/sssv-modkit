/* scene-v1: the editors' neutral document. Scene.toRuntime turns it into the shape startLevelEditor reads. */
const Scene=(()=>{
  // scene-v1 level key -> runtime level key. Terrain keys live under level.terrain, object lists under level.objects.
  const LEVEL={id:'id',atlas:'tex',group:'zone',sub:'sub',bounds:'bb',vertexCount:'n',spawnCount:'nsp'};
  const TERRAIN={positions:'pos',colours:'col',uvs:'uv',slots:'sl',water:'wat',heights:'grid',tiles:'tile',tileTypes:'bt'};
  const OBJECTS={props:'sp',creatures:'an'};
  const RECORDS={props:'props',creatures:'animals'};
  const DOC={types:'TBL',meshes:'MODEL',creatures:'ANIM',atlases:'ATLAS'};
  function validate(doc){
    const errors=[];
    if(!doc||typeof doc!=='object')return ['not a scene-v1 document'];
    if(doc.format!=='scene-v1')errors.push('format must be "scene-v1", got '+JSON.stringify(doc.format));
    if(!Array.isArray(doc.levels)||!doc.levels.length){errors.push('levels must be a non-empty list');return errors;}
    const atlases=doc.atlases||{};
    doc.levels.forEach((level,i)=>{
      if(typeof level?.terrain?.positions!=='string')errors.push(`levels[${i}].terrain.positions must be a string`);
      if(!Number.isInteger(level?.vertexCount))errors.push(`levels[${i}].vertexCount must be an integer`);
      if(!(level?.atlas in atlases))errors.push(`levels[${i}].atlas ${JSON.stringify(level?.atlas)} not in atlases`);
    });
    return errors;
  }
  function rename(from,map){const out={};for(const [k,v] of Object.entries(map))if(from&&k in from)out[v]=from[k];return out;}
  function toRuntime(doc){
    const out=rename(doc,DOC),stock={};
    out.LEVELS=doc.levels.map(level=>{
      if(level.records)stock[String(level.id)]=rename(level.records,RECORDS);
      return {...rename(level,LEVEL),...rename(level.terrain,TERRAIN),...rename(level.objects,OBJECTS)};
    });
    out.EDITOR_STOCK=stock;out.EDITOR_SHA1=doc.source?.sha1;out.SOURCE_LABEL=doc.source?.label;
    return out;
  }
  return {validate,toRuntime,LEVEL,TERRAIN,OBJECTS,RECORDS,DOC};
})();
if(typeof module!=='undefined')module.exports=Scene;
