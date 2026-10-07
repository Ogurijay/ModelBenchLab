import {Vector3,Quaternion,Matrix4} from 'three';

const V=(a)=>new Vector3(...a), UP=new Vector3(0,1,0), TAU=Math.PI*2;
const smooth=(x)=>x*x*x*(10+x*(-15+6*x));

class Route {
  constructor(start){this.p=V(start);this.points=[];this.segments=[];this.heading=new Vector3(0,0,1);}
  add(fn,steps,label,loop=false){
    const start=this.points.length;
    for(let j=0;j<steps;j++){
      const t=j/steps, f=fn(t);
      this.points.push({p:f.p,u:f.u||UP.clone(),label,loop});
    }
    const end=fn(1);this.p=end.p;this.heading=end.t||fn(.9999).p.sub(end.p).negate().normalize();
    this.segments.push({start,end:this.points.length,label,loop});return this;
  }
  curve(end,c1,c2,label='高速直道',bank=0){
    const a=this.p.clone(),b=a.clone().addScaledVector(this.heading,a.distanceTo(V(c1))),c=V(c2),d=V(end);
    const length=a.distanceTo(b)+b.distanceTo(c)+c.distanceTo(d);
    return this.add(t=>{
      const q=1-t;
      const p=a.clone().multiplyScalar(q*q*q).addScaledVector(b,3*q*q*t).addScaledVector(c,3*q*t*t).addScaledVector(d,t*t*t);
      const derivative=b.clone().sub(a).multiplyScalar(3*q*q).addScaledVector(c.clone().sub(b),6*q*t).addScaledVector(d.clone().sub(c),3*t*t);
      const tangent=derivative.clone().normalize();
      const second=c.clone().addScaledVector(b,-2).add(a).multiplyScalar(6*q).addScaledVector(d.clone().addScaledVector(c,-2).add(b),6*t);
      const lateral=new Vector3().crossVectors(UP,tangent).normalize();
      const signedCurvature=second.dot(lateral)/Math.max(.001,derivative.lengthSq());
      const angle=Math.min(.055,Math.abs(bank)*.13)*Math.tanh(signedCurvature*2)*Math.sin(Math.PI*t)**4;
      const up=UP.clone().applyAxisAngle(tangent,-angle);
      return {p,u:up,t:tangent};
    },Math.ceil(length/.025),label);
  }
  straight(end,label='发车直道'){
    const a=this.p.clone(),d=V(end);return this.curve(end,a.clone().lerp(d,1/3).toArray(),a.clone().lerp(d,2/3).toArray(),label);
  }
  loop(radius,heading,shift,label){
    const a=this.p.clone(),forward=V(heading).normalize(),right=new Vector3().crossVectors(UP,forward);
    return this.add(t=>{
      const theta=t*TAU, up=UP.clone().multiplyScalar(Math.cos(theta)).addScaledVector(forward,-Math.sin(theta));
      const p=a.clone().addScaledVector(right,shift*smooth(t)).addScaledVector(UP,radius*(1-Math.cos(theta))).addScaledVector(forward,radius*Math.sin(theta));
      const tangent=right.clone().multiplyScalar(shift*30*t*t*(1-t)*(1-t)).addScaledVector(UP,radius*TAU*Math.sin(theta)).addScaledVector(forward,radius*TAU*Math.cos(theta)).normalize();
      return {p,u:up,t:tangent};
    },Math.ceil(Math.hypot(radius*TAU,shift)/.013),label,true);
  }
}

function routeFor(id){
  const y=.24;
  const r=new Route([-9,y,-10]);
  r.straight([-9,y,1]);
  if(id==='aerial'){
    r.loop(.86,[0,0,1],1.65,'01 · 天穹垂直环');
    r.curve([-6.5,.65,7],[-6.8,y,2.9],[-6.5,.5,5],'环道出弯');
  }else if(id==='helix'){
    r.curve([-5,1.5,6],[-9,.5,4],[-8,1.1,6],'螺旋入口',.28);
    r.curve([-1,2.35,2],[-2,1.8,6],[-1,2.15,5],'上层回旋',.5);
    r.curve([-5,2.8,-2],[-1,2.5,-1],[-2,2.8,-2],'螺旋登峰',.3);
    r.curve([-7,2.8,5],[-8,2.8,-2],[-7,2.8,1],'高空长桥',.22);
    r.curve([-6.5,2.8,7],[-7,2.8,6],[-6.5,2.8,6.5],'峰顶弯',.1);
  }else{
    r.curve([-6.5,.45,7],[-9,y,4],[-6.5,.35,4],'技术入口',.18);
  }
  r.curve([-1,id==='helix'?2.1:1.2,11],[-6.5,id==='helix'?2.8:.8,11],[-4,id==='helix'?2.3:1.2,12],'S1 · 左弯',.28);
  r.curve([2,1.25,5],[3,1.2,10],[-1,1.25,6],'S2 · 反向连弯',-.38);
  r.curve([7,1.6,10],[5,1.25,4],[4,1.6,10],'S3 · 银桥弯',.32);
  r.curve([10,y,3],[12,1.6,12],[10,.5,6],'高架下坡',.28);
  if(id==='aerial'){
    r.loop(.96,[0,0,-1],1.75,'02 · 天穹垂直环');
    r.curve([8,y,-4],[7.75,y,1.2],[8,y,-1],'双环连接');
  }else{
    r.curve([8,y,-4],[10,y,0],[8,y,-1],'外侧长直道');
  }
  r.curve([4,.35,-10],[8,y,-9],[7,.35,-12],'高速发夹',.44);
  r.curve([1,.9,-3],[0,.35,-10],[4,.7,-4],'S4 · 反向弯',-.4);
  r.curve([-3,1.25,-8],[-2,1,-2],[-1,1.25,-7],'S5 · 登桥弯',.4);
  r.curve([-7,.35,-15],[-6,1.25,-9],[-4,.35,-15],'S6 · 桥下折返',-.32);
  r.curve([-9,y,-10],[-12,.35,-15],[-9,y,-13],'返回直道',.12);
  return r;
}

export class Course {
  constructor(id='aerial',laneCount=8){
    this.id=id;this.laneCount=laneCount;this.width=.115;this.wallHeight=.048;
    const route=routeFor(id);this.base=route.points;const n=this.base.length;
    let total=0;
    for(let i=0;i<n;i++){
      const v=this.base[i], prev=this.base[(i+n-1)%n],next=this.base[(i+1)%n];
      v.t=next.p.clone().sub(prev.p).normalize();
      v.r=new Vector3().crossVectors(v.u,v.t).normalize();v.u.crossVectors(v.t,v.r).normalize();
      v.s=total;total+=v.p.distanceTo(next.p);
    }
    this.baseLength=total;this.lanes=[];
    for(let lane=0;lane<laneCount;lane++){
      const path=[];let length=0;
      for(const b of this.base){
        const progress=Math.max(0,Math.min(1,(b.s-1.6)/6.8)),fraction=smooth(progress),next=(lane+1)%laneCount;
        const offset=((lane+(next-lane)*fraction)-(laneCount-1)/2)*this.width;
        // The wrap lane crosses above the other lanes; the guide channel remains continuous.
        const lift=lane===laneCount-1 && progress>0 && progress<1 ? .48*Math.sin(Math.PI*progress)**2 : 0;
        path.push({p:b.p.clone().addScaledVector(b.r,offset).addScaledVector(b.u,lift),u:b.u.clone(),label:progress>0&&progress<1?'机械换道桥':b.label,loop:b.loop,baseS:b.s});
      }
      for(let i=0;i<n;i++){
        const f=path[i],prev=path[(i+n-1)%n],next=path[(i+1)%n];
        // At a lap seam, this lane continues into the next lane's starting channel.
        const nextPos=i===n-1 ? this.base[0].p.clone().addScaledVector(this.base[0].r,(((lane+1)%laneCount)-(laneCount-1)/2)*this.width):next.p;
        const prevPos=i===0 ? this.base[n-1].p.clone().addScaledVector(this.base[n-1].r,(lane-(laneCount-1)/2)*this.width):prev.p;
        f.t=nextPos.clone().sub(prevPos).normalize();f.r=new Vector3().crossVectors(f.u,f.t).normalize();f.u.crossVectors(f.t,f.r).normalize();
        f.q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(f.r,f.u,f.t));
        f.s=length;length+=f.p.distanceTo(nextPos);
      }
      for(let i=0;i<n;i++){
        const f=path[i],a=path[(i+n-1)%n],b=path[(i+1)%n];
        const ds=a.p.distanceTo(f.p)+b.p.distanceTo(f.p);
        f.curvature=b.t.clone().sub(a.t).divideScalar(Math.max(.0001,ds));
        if(i<2||i>n-3)f.curvature.set(0,0,0);
      }
      this.lanes.push({path,length});
    }
    this.length=this.lanes.reduce((s,l)=>s+l.length,0)/laneCount;
    this.loopCount=id==='aerial'?2:0;
    this.maxHeight=Math.max(...this.base.map(p=>p.p.y));
  }
  sample(lane,s){
    const data=this.lanes[((lane%this.laneCount)+this.laneCount)%this.laneCount],path=data.path;
    s=Math.max(0,Math.min(data.length-.000001,s));
    let lo=0,hi=path.length-1;
    while(lo<hi){const m=Math.ceil((lo+hi)/2);if(path[m].s<=s)lo=m;else hi=m-1;}
    const a=path[lo],b=path[(lo+1)%path.length],den=(lo===path.length-1?data.length:b.s)-a.s,t=(s-a.s)/den;
    if(lo===path.length-1)return {...a,p:a.p.clone(),q:a.q.clone(),index:lo};
    return {p:a.p.clone().lerp(b.p,t),t:a.t.clone().lerp(b.t,t).normalize(),u:a.u.clone().lerp(b.u,t).normalize(),r:a.r.clone().lerp(b.r,t).normalize(),q:a.q.clone().slerp(b.q,t),curvature:a.curvature.clone().lerp(b.curvature,t),label:a.label,loop:a.loop,index:lo,baseS:a.baseS};
  }
}
