import { ROAD_HALF,SHOULDER_EDGE } from './track.js';
const cache=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createCourseData(track){
  if(cache.has(track))return cache.get(track);
  const b=track.bounds,step=12,minX=Math.floor((b.minX-340)/step)*step,minZ=-180;
  const columns=Math.ceil((b.maxX+340-minX)/step)+1,rows=Math.ceil((b.maxZ+200-minZ)/step)+1;
  const positions=new Float32Array(columns*rows*3),heights=new Float32Array(columns*rows),indices=[];
  for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
    const px=minX+x*step,pz=minZ+z*step,p=track.nearest(px,pz),d=p.distance;
    const noise=Math.sin(px*.018)*Math.sin(pz*.013),hill=Math.min(8,Math.max(0,d-15)*.075)*noise;
    const y=p.y-.6-Math.min(d,220)*.055+hill,i=z*columns+x;
    heights[i]=y;positions.set([px,y,pz],i*3);
    if(x<columns-1&&z<rows-1)indices.push(i,i+columns,i+1,i+1,i+columns,i+columns+1);
  }
  function heightAt(x,z){
    const u=clamp((x-minX)/step,0,columns-1.000001),v=clamp((z-minZ)/step,0,rows-1.000001),cx=Math.floor(u),cz=Math.floor(v),fx=u-cx,fz=v-cz,i=cz*columns+cx;
    const a=heights[i],b=heights[i+1],c=heights[i+columns],d=heights[i+columns+1];
    return fx+fz<=1?a+fx*(b-a)+fz*(c-a):d+(1-fx)*(c-d)+(1-fz)*(b-d);
  }
  const terrain={positions,indices,columns,rows,minX,minZ,step,heightAt};
  let seed=142;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const trees=[];
  for(let attempt=0;attempt<6000&&trees.length<740;attempt++){
    const p=track.at(random()*track.surfaceLength),side=random()<.5?-1:1,offset=side*(16+random()*85),height=6+random()*6;
    const x=p.x+p.tz*offset,z=p.z-p.tx*offset,radius=2+random()*.7;
    if(track.nearest(x,z).distance<SHOULDER_EDGE+radius+3)continue;
    trees.push({x,z,y:heightAt(x,z),height,radius,rotation:random()*6});
  }
  const mountains=[];
  for(let i=0;i<14;i++){
    const radius=65+(i%3)*12,x=i%2?b.minX-235-(i%3)*26:b.maxX+235+(i%3)*26,z=-60+i/13*(b.maxZ+130);
    if(track.nearest(x,z).distance<radius+ROAD_HALF+30)continue;
    mountains.push({x,z,y:heightAt(x,z)-.8,radius,height:130+(i%4)*26,rotation:i});
  }
  const data={terrain,trees,mountains,stats:{trees:trees.length,mountains:mountains.length,terrainTriangles:indices.length/3,
    minTreeClearance:Math.min(...trees.map(p=>track.nearest(p.x,p.z).distance-p.radius)),
    minMountainClearance:Math.min(...mountains.map(p=>track.nearest(p.x,p.z).distance-p.radius))}};
  cache.set(track,data);return data;
}
