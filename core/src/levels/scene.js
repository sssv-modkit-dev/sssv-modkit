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
    const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v),strings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string');
    if(doc.format!=='scene-v1')errors.push('format must be "scene-v1", got '+JSON.stringify(doc.format));
    // source.sha1 identifies the scene; edits files are matched against it, so it must exist.
    if(typeof doc.source?.sha1!=='string'||!doc.source.sha1)errors.push('source.sha1 must be a non-empty string');
    if(!Array.isArray(doc.types))errors.push('types must be a list');
    if(!isObject(doc.meshes))errors.push('meshes must be an object');
    if(!isObject(doc.creatures)||!isObject(doc.creatures.models)||!isObject(doc.creatures.species))errors.push('creatures must have models and species objects');
    if(!isObject(doc.atlases))errors.push('atlases must be an object');
    if(!Array.isArray(doc.levels)||!doc.levels.length){errors.push('levels must be a non-empty list');return errors;}
    const atlases=isObject(doc.atlases)?doc.atlases:{};
    doc.levels.forEach((level,i)=>{
      for(const key of Object.keys(TERRAIN))if(typeof level?.terrain?.[key]!=='string')errors.push(`levels[${i}].terrain.${key} must be a string`);
      if(!Number.isInteger(level?.vertexCount))errors.push(`levels[${i}].vertexCount must be an integer`);
      if(!Array.isArray(level?.bounds)||level.bounds.length!==6)errors.push(`levels[${i}].bounds must be a list of 6 numbers`);
      if(!(level?.atlas in atlases))errors.push(`levels[${i}].atlas ${JSON.stringify(level?.atlas)} not in atlases`);
      if(typeof level?.objects?.props!=='string'||!Array.isArray(level?.objects?.creatures))errors.push(`levels[${i}].objects needs props (string) and creatures (list)`);
      if(!strings(level?.records?.props)||!strings(level?.records?.creatures))errors.push(`levels[${i}].records.props and records.creatures must be lists of hex strings`);
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
