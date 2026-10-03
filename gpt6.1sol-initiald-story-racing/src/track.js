import { CatmullRomCurve3, Vector3 } from 'three';
export const ROAD_HALF=7;
export const RAIL_OFFSET=7.7;
export const RAIL_HALF_WIDTH=.09;
export const SHOULDER_EDGE=9;
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Separated switchbacks: no crossings, overpasses or hidden adjacent driving surfaces.
const bases=[[0,0],[0,130],[70,175],[200,175],[232,195],[235,230],[208,252],
  [55,252],[20,272],[18,305],[45,327],[210,327],[242,349],[244,382],[217,404],
  [65,404],[31,426],[29,459],[58,481],[205,481],[239,504],[240,538],[207,559],
  [112,559],[83,581],[82,614],[111,636],[154,640],[170,675],[170,720]];
const cache=new Map();
const cellSize=32,key=(x,z)=>x+':'+z;
export function createTrack(id='downhill'){
  if(cache.has(id))return cache.get(id);
  const uphill=id==='uphill',plan=new CatmullRomCurve3(bases.map(([x,z])=>new Vector3(x,0,z)),false,'centripetal');
  plan.arcLengthDivisions=4096;
  const p=plan.getSpacedPoints(Math.ceil(plan.getLength()));
  let mountainLength=0;for(let i=1;i<p.length;i++)mountainLength+=p[i].distanceTo(p[i-1]);
  const last=p.at(-1),straightLength=id==='highway'?840:280;
  for(let i=1;i<=straightLength+160;i++)p.push(new Vector3(last.x,0,last.z+i));
  let distance=0;
  const samples=p.map((v,i)=>{
    if(i)distance+=Math.hypot(v.x-p[i-1].x,v.z-p[i-1].z);
    const t=clamp(distance/mountainLength,0,1),rise=50*t*t*(3-2*t),sign=uphill?1:-1;
    const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1;
    return {x:v.x,z:v.z,y:(uphill?18:68)+sign*rise,tx:(b.x-a.x)/n,tz:(b.z-a.z)/n,
      s:distance,index:i,k:0,grade:sign*300*t*(1-t)/mountainLength};
  });
  for(let i=2;i<samples.length-2;i++){
    const a=samples[i-2],b=samples[i+2];samples[i].k=wrap(Math.atan2(b.tx,b.tz)-Math.atan2(a.tx,a.tz))/(b.s-a.s);
  }
  const length=mountainLength+straightLength,surfaceLength=samples.at(-1).s,straightStart=mountainLength,gutterZones=[];
  for(const v of samples){
    const valid=Math.abs(v.k)>.022&&v.s<straightStart-20&&v.s>150,side=Math.sign(v.k),zone=gutterZones.at(-1);
    if(valid){if(zone&&zone.side===side&&v.s-zone.end<2)zone.end=v.s;else gutterZones.push({start:v.s,end:v.s,side});}
  }
  const bins=new Map();
  for(let i=0;i<samples.length-1;i++){
    const a=samples[i],b=samples[i+1];
    for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
      for(let z=Math.floor(Math.min(a.z,b.z)/cellSize);z<=Math.floor(Math.max(a.z,b.z)/cellSize);z++){
        const k=key(x,z);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);
      }
  }
  function frame(index,t,s){
    const a=samples[index],b=samples[index+1],tx=a.tx+(b.tx-a.tx)*t,tz=a.tz+(b.tz-a.tz)*t,n=Math.hypot(tx,tz)||1;
    return {...a,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,
      tx:tx/n,tz:tz/n,k:a.k+(b.k-a.k)*t,grade:a.grade+(b.grade-a.grade)*t,s,index};
  }
  function at(s){
    s=clamp(s,0,surfaceLength);let lo=0,hi=samples.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].s<=s)lo=mid;else hi=mid;}
    const a=samples[lo],b=samples[lo+1];return frame(lo,(s-a.s)/(b.s-a.s),s);
  }
  function nearest(x,z,hint){
    let best=Infinity,index=0,fraction=0,px=0,pz=0;
    const visit=i=>{
      const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),qx=a.x+t*dx,qz=a.z+t*dz,d=(x-qx)**2+(z-qz)**2;
      if(d<best){best=d;index=i;fraction=t;px=qx;pz=qz;}
    };
    if(Number.isInteger(hint)){
      const center=clamp(hint,0,samples.length-2);
      for(let i=Math.max(0,center-12);i<=Math.min(samples.length-2,center+12);i++)visit(i);
    }else{
      const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize);
      for(let r=0;r<40;r++){
        for(let gx=cx-r;gx<=cx+r;gx++)for(let gz=cz-r;gz<=cz+r;gz++){
          if(r&&gx!==cx-r&&gx!==cx+r&&gz!==cz-r&&gz!==cz+r)continue;
          for(const i of bins.get(key(gx,gz))||[])visit(i);
        }
        const bound=Math.min(x-(cx-r)*cellSize,(cx+r+1)*cellSize-x,z-(cz-r)*cellSize,(cz+r+1)*cellSize-z);
        if(best<bound*bound)break;
      }
      if(best===Infinity)for(let i=0;i<samples.length-1;i++)visit(i);
    }
    const a=samples[index],b=samples[index+1],s=a.s+fraction*(b.s-a.s),v=frame(index,fraction,s);
    return {...v,px,pz,offset:(x-px)*v.tz-(z-pz)*v.tx,distance:Math.sqrt(best)};
  }
  const bounds={minX:Math.min(...samples.map(v=>v.x)),maxX:Math.max(...samples.map(v=>v.x)),
    minZ:samples[0].z,maxZ:samples.at(-1).z};
  const track={id,layoutVersion:2,samples,bounds,length,surfaceLength,straightStart,eyeTrigger:straightStart-48,gutterZones,at,nearest,
    curve:new CatmullRomCurve3(samples.map(v=>new Vector3(v.x,v.y,v.z)),false,'centripetal'),grip:id==='rain'?.64:1,slope:uphill?-1:1};
  cache.set(id,track);return track;
}
