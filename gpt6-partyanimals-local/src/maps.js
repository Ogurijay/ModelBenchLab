import { byId, MAPS } from './catalog.js';

// The same colliders feed physics, rendering and AI navigation. No invisible arena walls.
export function mapLayout(id) {
  const map=byId(MAPS,id), pieces=[], nodes=[];
  const box=(x,y,z,w,h,d,color='#d8bea2',extra={})=>{ const o={id:pieces.length,x,y,z,w,h,d,color,shape:'box',solid:true,...extra};pieces.push(o);return o; };
  const floor=(w=map.w,d=map.d,color='#c7b18a')=>box(0,-.35,0,w,.7,d,color,{floor:true});
  const rail=(x,z,w,d)=>box(x,.75,z,w,1.5,d,'#e8bb69');
  const k=map.kind;
  if(['bridge','duel'].includes(k)){
    for(let i=0;i<10;i++)box((i-4.5)*2,-.25,0,1.94,.5,map.d,k==='duel'?'#517a85':'#b89163',{floor:true,dynamic:'break',index:i});
    if(k==='duel') for(let i=0;i<4;i++) box(i*5-7.5,-1.8,0,4.7,2.8,4.7,'#304a5a',{solid:false});
  }else if(['ice','collapse'].includes(k)){
    for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)box(x*2.38,-.35,z*2.02,2.3,.7,1.94,k==='ice'?'#c0e7ed':'#747990',{floor:true,dynamic:k,index:Math.max(Math.abs(x),Math.abs(z)),stress:0});
  }else if(k==='pirate'){
    for(const sign of [-1,1]){
      box(sign*7,-.4,0,7,.8,12,sign<0?'#688f9a':'#ab796b',{floor:true,dynamic:'ship',side:sign<0?0:1});
      box(sign*7,-1.4,0,6,1.5,11,'#554437',{solid:false});
      for(const z of [-4,0,4])nodes.push({type:'cannon',x:sign*4.5,z,team:sign<0?0:1});
      nodes.push({type:'repair',x:sign*9,z:0,team:sign<0?0:1});
    }
    box(0,-.3,0,7,.6,2,'#aa936f',{floor:true});
  }else if(k==='station'){
    floor(19,15,'#76949e');
    for(const x of [-5,5])for(const z of [-3.7,3.7])box(x,1.2,z,5,2.4,.5,'#465c72');
    for(const [x,z]of[[-7,-6],[7,-6],[-7,6],[7,6],[0,-6],[0,6]]) nodes.push({type:'terminal',x,z,index:nodes.length});
    nodes.push({type:'meeting',x:0,z:0});
  }else if(k==='cabin'){
    floor(20,16,id==='winter'?'#e5eff0':id==='autumn'?'#bfa17f':'#b0c897');
    box(0,.05,-3,12,.25,7,'#b29470',{floor:true});
    box(0,1.7,-6.8,12,3.4,.35,'#8a715f');
    box(-5.8,1.7,-3,.35,3.4,7,'#8a715f');box(5.8,1.7,-3,.35,3.4,7,'#8a715f');
    nodes.push({type:'cards',x:-2,z:-3},{type:'fish',x:7.8,z:4.5},{type:'shop',x:3,z:-5},{type:'radio',x:2,z:-.5});
    box(-2,.7,-3,3,1.4,2,'#c6a074');
    box(7.8,.15,4.5,3,.3,4,'#b99a77',{floor:true});
  }else if(k==='kart'){
    // Track surface built from the exact route points used for checkpoint validation.
    const path=kartPath(id);
    for(let i=0;i<path.length;i++){
      const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dz=b.z-a.z;
      box((a.x+b.x)/2,-.25,(a.z+b.z)/2,7,.5,Math.hypot(dx,dz)+.4,'#817f98',{floor:true,angle:Math.atan2(dx,dz)});
    }
    for(let i=0;i<path.length;i+=6)nodes.push({type:'item',...path[i],index:i});
  }else {
    const color={gas:'#dab97f',sink:'#739c9f',plane:'#c3ced5',cold:'#e2eced',wind:'#7fa6a8',blackhole:'#8a8bab',wave:'#97bfc3',belt:'#838d99',ring:'#ceba98',shark:'#8baab0',soccer:'#85af8b',hockey:'#cbe6e7',football:'#a2b289',basket:'#c99a73',candy:'#d9baa6',train:'#87989c',arcade:'#aaa0c2',trebuchet:'#a5b993',balloon:'#d0b6a9',gym:'#8fc4c2'}[k]||'#c5b293';
    floor(map.w,map.d,color);
    if(k==='sink'||k==='shark')pieces[0].dynamic='sink';
    if(k==='plane'){box(0,.2,-1,3,1.1,9,'#bdced0');box(0,1.1,-2.2,2.5,1.2,3,'#587587');}
    if(k==='gas')for(const x of[-4,4])for(const z of[-3,3])box(x,.55,z,1.3,1.1,1.3,'#b29368');
    if(k==='cold')for(const[x,z]of[[-3,-2],[3,-2],[-3,2],[3,2]])nodes.push({type:'fire',x,z,index:nodes.length});
    if(k==='wind'){for(const z of[-3,0,3])box(-2,.65,z,1.2,1.3,1.7,'#d9b268');nodes.push({type:'switch',x:-4,z:0});}
    if(k==='wave')box(0,.6,0,4,1.2,3,'#b7c8b4');
    if(['ring','gym'].includes(k))for(const[x,z]of[[-5,-4],[5,-4],[-5,4],[5,4]])box(x,.75,z,.25,1.5,.25,'#ce8767');
    if(['soccer','hockey','football','basket'].includes(k)){
      for(const z of[-map.d/2,map.d/2])rail(0,z,map.w,.35);
      for(const sign of[-1,1]){
        for(const z of[-4.8,4.8])rail(sign*map.w/2,z,.35,3.8);
        nodes.push({type:k==='basket'?'hoop':'goal',x:sign*(map.w/2-.5),z:0,team:sign<0?0:1});
      }
    }
    if(['candy','train','arcade','trebuchet'].includes(k))for(const sign of[-1,1])nodes.push({type:{candy:'basket',train:'furnace',arcade:'arcade',trebuchet:'catapult'}[k],x:sign*(map.w/2-2),z:0,team:sign<0?0:1});
    if(k==='balloon')nodes.push({type:'balloon',x:0,z:0});
    if(k==='gym'){box(-5,.6,0,2,1.2,4,'#e9c6a0');nodes.push({type:'rack',x:4,z:-3});}
  }
  return {map,pieces,nodes};
}

export function kartPath(id){
  const points=[];
  for(let i=0;i<48;i++){
    const a=i/48*Math.PI*2;
    let rx=id==='coast'?21:id==='city'?19:22,rz=id==='coast'?16:id==='city'?19:18;
    const wobble=id==='city'?Math.sin(a*3)*2.3:id==='candyroad'?Math.sin(a*2)*3.4:Math.sin(a*3)*1.1;
    points.push({x:Math.sin(a)*(rx+wobble),z:Math.cos(a)*(rz+wobble)});
  }
  return points;
}

export function spawnPosition(map,index,count=8,teams=false){
  if(map.kind==='pirate')return {x:index%2===0?-7:7,y:1.4,z:(Math.floor(index/2)-1.5)*2};
  if(map.kind==='cabin')return {x:(index%4-1.5)*1.5,y:1.4,z:1.5+Math.floor(index/4)*1.5};
  if(teams)return {x:(index%2===0?-1:1)*(map.w/2-3),y:1.4,z:(Math.floor(index/2)-1.5)*1.8};
  const a=index/count*Math.PI*2;
  return {x:Math.sin(a)*Math.min(map.w*.32,4),y:1.4,z:Math.cos(a)*Math.min(map.d*.30,3)};
}
