/* Object naming hook and selection math; no geometry, extracted records or names. */
const LevelSelection = (() => {
  /* Names and groups come from the loaded pack (LevelSelection.define); the core only knows type numbers. */
  const animalNames = [], propNames = {}, groups = {portals: new Set(), collectibles: new Set(), switches: new Set()};
  const categories = [['all','All objects'],['animals','Animals'],['portals','Portals & player starts'],['collectibles','Collectibles'],['switches','Switches & machinery'],['scenery','Scenery & structures'],['other','Other props']];
  function define(table){if(table.animals){animalNames.length=0;for(const [k,v] of Object.entries(table.animals))animalNames[+k]=v;}if(table.props){for(const k of Object.keys(propNames))delete propNames[k];Object.assign(propNames,table.props);}for(const g of Object.keys(groups))if(table[g])groups[g]=new Set(table[g]);}
  function name(kind,type){return kind==='animals'?(animalNames[type]||`Animal ${type}`):(propNames[type]||`Prop ${type}`);}
  function category(kind,type){if(kind==='animals')return 'animals';for(const g of ['portals','collectibles','switches'])if(groups[g].has(type))return g;return propNames[type]?'scenery':'other';}
  function project(position,m,width,height){const [x,y,z]=position,w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=0)return null;const depth=(m[2]*x+m[6]*y+m[10]*z+m[14])/w;if(depth < -1||depth > 1)return null;return [( (m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*width,(1-((m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5+.5))*height];}
  function inRectangle(point,start,end){return point&&point[0]>=Math.min(start[0],end[0])&&point[0]<=Math.max(start[0],end[0])&&point[1]>=Math.min(start[1],end[1])&&point[1]<=Math.max(start[1],end[1]);}
  function translate(values,delta){return values.map(value=>{const next=value.slice();for(let i=0;i<3;i++){next[i+1]+=delta[i];if(!Number.isInteger(next[i+1])||next[i+1]<-32768||next[i+1]>32767)throw Error('Group move exceeds the coordinate range; nothing was moved.');}return next;});}
  /* Footprints match the drawn prop boxes: width/depth centred on the origin, height upward, yaw in degrees, 8-unit minimum. */
  function corners(values,dims,min=8){const [,x,y,z,yaw]=values,w=Math.max(dims[0]||0,min)/2,d=Math.max(dims[1]||0,min)/2,h=Math.max(dims[2]||0,min),a=(yaw||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),out=[];for(const zz of [0,h])for(const [qx,qy] of [[-w,-d],[w,-d],[w,d],[-w,d]])out.push([x+qx*ca-qy*sa,y+qx*sa+qy*ca,z+zz]);return out;}
  function screenRect(points,m,width,height){let r=null;for(const point of points){const s=project(point,m,width,height);if(!s)continue;if(!r)r=[s[0],s[1],s[0],s[1]];else{r[0]=Math.min(r[0],s[0]);r[1]=Math.min(r[1],s[1]);r[2]=Math.max(r[2],s[0]);r[3]=Math.max(r[3],s[1]);}}return r;}
  /* Items are {origin:[x,y]|null, rect:[x0,y0,x1,y1]|null}. The smallest footprint under the point wins; otherwise the nearest origin within the radius. */
  function pickAt(items,point,radius=12){let best=null,area=Infinity;for(const item of items){const r=item.rect;if(r&&point[0]>=r[0]&&point[0]<=r[2]&&point[1]>=r[1]&&point[1]<=r[3]){const a=(r[2]-r[0])*(r[3]-r[1]);if(a<area){best=item;area=a;}}}if(best)return best;let distance=radius*radius;for(const item of items){if(!item.origin)continue;const d=(item.origin[0]-point[0])**2+(item.origin[1]-point[1])**2;if(d<distance){best=item;distance=d;}}return best;}
  function hitsRect(item,start,end){const r=item.rect;if(!r)return inRectangle(item.origin,start,end);return r[0]<=Math.max(start[0],end[0])&&r[2]>=Math.min(start[0],end[0])&&r[1]<=Math.max(start[1],end[1])&&r[3]>=Math.min(start[1],end[1]);}
  // Arrow keys move along the world axis nearest the camera's view (up = away from camera); PageUp/PageDown move height.
  function nudge(key,yaw,step){const f=[Math.cos(yaw),Math.sin(yaw)],axis=v=>Math.abs(v[0])>=Math.abs(v[1])?[Math.sign(v[0]),0]:[0,Math.sign(v[1])],up=axis(f),right=axis([f[1],-f[0]]);const d={ArrowUp:[...up,0],ArrowDown:[-up[0],-up[1],0],ArrowRight:[...right,0],ArrowLeft:[-right[0],-right[1],0],PageUp:[0,0,1],PageDown:[0,0,-1]}[key];return d?d.map(v=>v*step+0):null;}
  /* Inverse of a column-major 4x4 matrix (same layout as project), or null when singular. */
  function invert(m){const a=Array.from(m),inv=new Array(16);
    inv[0]=a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
    inv[4]=-a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
    inv[8]=a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
    inv[12]=-a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
    inv[1]=-a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
    inv[5]=a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
    inv[9]=-a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
    inv[13]=a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
    inv[2]=a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
    inv[6]=-a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
    inv[10]=a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
    inv[14]=-a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
    inv[3]=-a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
    inv[7]=a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
    inv[11]=-a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
    inv[15]=a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
    const det=a[0]*inv[0]+a[1]*inv[4]+a[2]*inv[8]+a[3]*inv[12];if(!det||!Number.isFinite(det))return null;return inv.map(v=>v/det);}
  /* World X/Y where the ray under a screen point meets the horizontal plane at height z, or null if it misses (sky, behind the camera, near-parallel). */
  function groundPoint(m,width,height,point,z){const inv=invert(m);if(!inv)return null;const nx=point[0]/width*2-1,ny=1-point[1]/height*2;
    const un=nz=>{const w=inv[3]*nx+inv[7]*ny+inv[11]*nz+inv[15];if(!w)return null;return [0,1,2].map(i=>(inv[i]*nx+inv[4+i]*ny+inv[8+i]*nz+inv[12+i])/w);};
    const a=un(-1),b=un(1);if(!a||!b)return null;const dz=b[2]-a[2];if(Math.abs(dz)<1e-9)return null;const t=(z-a[2])/dz;if(t<0||t>1)return null;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
  /* Object drag: the X/Y offset that keeps the grabbed ground point under the cursor (null: caller falls back to screen scaling). */
  function dragDelta(m,width,height,start,now,z){const a=groundPoint(m,width,height,start,z),b=groundPoint(m,width,height,now,z);return a&&b?[b[0]-a[0],b[1]-a[1]]:null;}
  /* Fallback when the ray misses the plane: screen right is (-sin yaw, cos yaw), screen down is towards the camera (cos yaw, sin yaw). */
  function screenDelta(dx,dy,yaw,scale){const c=Math.cos(yaw),s=Math.sin(yaw);return [(-dx*s+dy*c)*scale,(dx*c+dy*s)*scale];}
  function removeAppended(records,stock,keys){for(const key of keys){const [kind,index]=key.split(':');if(!stock[kind]||!Number.isInteger(+index)||+index<stock[kind].length||+index>=records[kind].length)throw Error('Only appended spawns can be deleted');}for(const kind of ['props','animals']){const indices=keys.filter(k=>k.startsWith(kind+':')).map(k=>+k.split(':')[1]).sort((a,b)=>b-a);for(const index of new Set(indices))records[kind].splice(index,1);}}
  return {define,removeAppended,animalNames,propNames,categories,name,category,project,inRectangle,translate,corners,screenRect,pickAt,hitsRect,nudge,invert,groundPoint,dragDelta,screenDelta};
})();
if(typeof module!=='undefined')module.exports=LevelSelection;
