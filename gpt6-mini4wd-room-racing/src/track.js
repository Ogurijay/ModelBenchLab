import {Vector3} from 'three';
export const LANE_WIDTH=.115,WALL_HEIGHT=.05;
const wrap=x=>((x%1)+1)%1,mix=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
// Tangent straight pieces and circular corners. World coordinates are metres.
export class Track{
 constructor(def,laneCount=8){
  if(![3,5,8].includes(laneCount))throw new Error('赛道支持三、五或八车道。');
  this.def=def;this.laneCount=laneCount;this.laneWidth=LANE_WIDTH;this.width=laneCount*LANE_WIDTH;this.segments=[];
  const p=def.points.map(([x,z])=>({x,z})),arcs=p.map((v,i)=>{
   const prev=p[(i+p.length-1)%p.length],next=p[(i+1)%p.length];
   const la=Math.hypot(v.x-prev.x,v.z-prev.z),lb=Math.hypot(next.x-v.x,next.z-v.z),a={x:(v.x-prev.x)/la,z:(v.z-prev.z)/la},b={x:(next.x-v.x)/lb,z:(next.z-v.z)/lb};
   const turn=Math.atan2(a.x*b.z-a.z*b.x,a.x*b.x+a.z*b.z),trim=Math.min(def.radius*Math.tan(Math.abs(turn)/2),la*.38,lb*.38),radius=trim/Math.tan(Math.abs(turn)/2);
   const entry={x:v.x-a.x*trim,z:v.z-a.z*trim},exit={x:v.x+b.x*trim,z:v.z+b.z*trim},sign=Math.sign(turn),center={x:entry.x-a.z*radius*sign,z:entry.z+a.x*radius*sign};
   return {entry,exit,center,radius,turn,angle:Math.atan2(entry.z-center.z,entry.x-center.x)};
  });
  let cursor=0;
  for(let i=0;i<p.length;i++){
   const from=arcs[i].exit,a=arcs[(i+1)%p.length],length=Math.hypot(a.entry.x-from.x,a.entry.z-from.z);
   this.segments.push({type:'line',from,to:a.entry,length,start:cursor,index:i});cursor+=length;
   const len=a.radius*Math.abs(a.turn);this.segments.push({...a,type:'arc',length:len,start:cursor,index:i});cursor+=len;
  }
  this.length=cursor;this.curve={getPointAt:q=>this.point(q)};
  const first=this.segments[0];this.change={start:.4,end:Math.min(first.length-.6,3.5),height:.18};
  this.jumps=[];
  if(def.jumps)for(const line of this.segments.filter(s=>s.type==='line'&&s.length>7).slice(1,3)){const launch=line.start+line.length-1;this.jumps.push({start:launch-.5,launch,end:launch+.35,height:def.crossover?.08:.04});}
  this.wave=this.segments.find(s=>s.type==='line'&&s.index===4);
  this.laneLengths=Array.from({length:laneCount},(_,l)=>this.measureLane(l));this.totalLength=this.laneLengths.reduce((a,b)=>a+b,0);
 }
 segmentAt(d){d=((d%this.length)+this.length)%this.length;return this.segments.find(s=>d<s.start+s.length)||this.segments.at(-1);}
 base(d){
  d=((d%this.length)+this.length)%this.length;const s=this.segmentAt(d),q=(d-s.start)/s.length;
  if(s.type==='line')return {x:mix(s.from.x,s.to.x,q),z:mix(s.from.z,s.to.z,q),tx:(s.to.x-s.from.x)/s.length,tz:(s.to.z-s.from.z)/s.length,curvature:0,segment:s};
  const a=s.angle+s.turn*q,dir=Math.sign(s.turn);return {x:s.center.x+Math.cos(a)*s.radius,z:s.center.z+Math.sin(a)*s.radius,tx:-Math.sin(a)*dir,tz:Math.cos(a)*dir,curvature:dir/s.radius,segment:s};
 }
 laneAt(progress,initialLane){const lap=Math.floor(Math.max(0,progress)),d=wrap(progress)*this.length,l=(initialLane+lap)%this.laneCount;return d>=this.change.end?(l+1)%this.laneCount:l;}
 height(d){
  let y=.018;
  for(const j of this.jumps){if(d>=j.start&&d<=j.launch)y+=j.height*(d-j.start)/(j.launch-j.start);else if(d>j.launch&&d<j.end)y+=j.height*(1-(d-j.launch)/(j.end-j.launch));}
  if(this.wave&&d>this.wave.start+2&&d<this.wave.start+5)y+=.012*Math.sin((d-this.wave.start-2)*Math.PI*2)**2;
  if(this.def.crossover){const s=this.segmentAt(d);if(s.type==='line'&&s.index===1){const q=(d-s.start)/s.length;y+=.28*Math.min(1,smooth(Math.min(1,q/.25)),smooth(Math.min(1,(1-q)/.25)));}}
  return y;
 }
 rawPoint(progress,initialLane=0){
  const d=wrap(progress)*this.length,b=this.base(d),lap=Math.floor(Math.max(0,progress)),l=(initialLane+lap)%this.laneCount;let offset=l-(this.laneCount-1)/2,y=this.height(d);
  if(d>=this.change.start&&d<this.change.end){const q=(d-this.change.start)/(this.change.end-this.change.start);let t=smooth(q);if(l===this.laneCount-1){t=smooth(Math.max(0,Math.min(1,(q-.25)/.5)));y+=this.change.height*(q<.25?smooth(q/.25):q>.75?smooth((1-q)/.25):1);}offset=mix(l,(l+1)%this.laneCount,t)-(this.laneCount-1)/2;}
  else if(d>=this.change.end)offset=(l+1)%this.laneCount-(this.laneCount-1)/2;
  return new Vector3(b.x-b.tz*offset*LANE_WIDTH,y,b.z+b.tx*offset*LANE_WIDTH);
 }
 point(q){const b=this.base(wrap(q)*this.length);return new Vector3(b.x,this.height(wrap(q)*this.length),b.z);}
 pose(progress,initialLane=0){
  const e=.012/this.length,p=this.rawPoint(progress,initialLane),prev=this.rawPoint(Math.max(0,progress-e),initialLane),next=this.rawPoint(progress+e,initialLane),tangent=next.clone().sub(prev).normalize(),d=wrap(progress)*this.length,b=this.base(d);
  const a=prev.clone().sub(p).setY(0).normalize(),c=next.clone().sub(p).setY(0).normalize(),curvature=Math.acos(Math.max(-1,Math.min(1,-a.dot(c))))/.012,lane=this.laneAt(progress,initialLane),offset=(lane-(this.laneCount-1)/2)*LANE_WIDTH;
  return {p,tangent,yaw:Math.atan2(tangent.x,tangent.z),pitch:-Math.asin(tangent.y),curvature:Math.min(15,Math.max(curvature,Math.abs(b.curvature/(1-offset*b.curvature)))),lane,scale:next.distanceTo(prev)/.024,slope:tangent.y/Math.max(.01,Math.hypot(tangent.x,tangent.z)),d};
 }
 measureLane(l){let n=0,last=this.rawPoint(0,l);for(let i=1;i<=5000;i++){const p=this.rawPoint(i/5000,l);n+=p.distanceTo(last);last=p;}return n;}
 canChange(){return false;}
}
