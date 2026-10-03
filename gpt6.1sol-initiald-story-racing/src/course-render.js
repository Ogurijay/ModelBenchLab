import * as T from 'three';
import { ROAD_HALF,RAIL_OFFSET,RAIL_HALF_WIDTH,SHOULDER_EDGE } from './track.js';
import { createCourseData } from './course-data.js';
export function buildCourse(world){
  const a=world.track.samples,data=createCourseData(world.track),ground=data.terrain;world.courseData=data;
  const terrainGeo=new T.BufferGeometry();terrainGeo.setAttribute('position',new T.BufferAttribute(ground.positions,3));terrainGeo.setIndex(ground.indices);terrainGeo.computeVertexNormals();
  const terrainMat=world.mat('#3b5148').clone();terrainMat.flatShading=true;
  world.terrain=new T.Mesh(terrainGeo,terrainMat);world.terrain.name='terrain';world.course.add(world.terrain);
  world.road=world.strip(a,-ROAD_HALF,ROAD_HALF,0,'#344150');world.road.name='road';
  const shoulder=(x,z,p,offset)=>Math.abs(offset)===ROAD_HALF?p.y-.02:Math.min(p.y-.2,ground.heightAt(x,z));
  world.strip(a,-SHOULDER_EDGE,-ROAD_HALF,shoulder,'#6e776d');world.strip(a,ROAD_HALF,SHOULDER_EDGE,shoulder,'#6e776d');
  world.strip(a,-6.85,-6.68,.026,'#f0e8c7');world.strip(a,6.68,6.85,.026,'#f0e8c7');
  world.gutterMeshes=[];
  for(const zone of world.track.gutterZones){const s=a.filter(p=>p.s>=zone.start&&p.s<=zone.end);if(s.length>1){const lo=Math.min(zone.side*5.6,zone.side*6.8),hi=Math.max(zone.side*5.6,zone.side*6.8);world.gutterMeshes.push(world.strip(s,lo,hi,.012,'#1f2a32'));}}
  const dummy=new T.Object3D(),railCount=Math.ceil((a.length-1)/2)*4;
  const beams=new T.InstancedMesh(new T.BoxGeometry(1,1,1),world.mat('#bac4c4'),railCount);
  let n=0;
  for(let i=0;i<a.length-1;i+=2){const p=a[i],q=a[Math.min(i+2,a.length-1)];
    for(const side of [-1,1]){
      const x=p.x+p.tz*side*RAIL_OFFSET,z=p.z-p.tx*side*RAIL_OFFSET,x2=q.x+q.tz*side*RAIL_OFFSET,z2=q.z-q.tx*side*RAIL_OFFSET;
      const dx=x2-x,dz=z2-z,d=Math.hypot(dx,dz),dy=q.y-p.y;
      for(const h of [.48,.94]){dummy.position.set((x+x2)/2,(p.y+q.y)/2+h,(z+z2)/2);dummy.rotation.set(-Math.atan2(dy,d),Math.atan2(dx,dz),0,'YXZ');dummy.scale.set(RAIL_HALF_WIDTH*2,.14,Math.hypot(d,dy)+.035);dummy.updateMatrix();beams.setMatrixAt(n++,dummy.matrix);}
    }
  }
  beams.count=n;beams.name='guardrails';world.guardrails=beams;world.course.add(beams);
  const posts=new T.InstancedMesh(new T.BoxGeometry(.16,1.25,.16),world.mat('#8e9b9a'),Math.ceil(a.length/4)*2);
  const dash=new T.InstancedMesh(new T.BoxGeometry(.13,.02,2.7),world.mat('#c3b781'),Math.ceil(a.length/8));
  let j=0,k=0;dummy.scale.set(1,1,1);
  for(let i=0;i<a.length;i++){
    const p=a[i];
    if(i%4===0)for(const side of [-1,1]){dummy.position.set(p.x+p.tz*side*RAIL_OFFSET,p.y+.43,p.z-p.tx*side*RAIL_OFFSET);dummy.rotation.set(0,0,0);dummy.updateMatrix();posts.setMatrixAt(j++,dummy.matrix);}
    if(i%8===0){dummy.position.set(p.x,p.y+.032,p.z);dummy.rotation.set(-Math.atan(p.grade),Math.atan2(p.tx,p.tz),0,'YXZ');dummy.updateMatrix();dash.setMatrixAt(k++,dummy.matrix);}
  }
  posts.count=j;dash.count=k;world.course.add(posts,dash);
  const trees=new T.InstancedMesh(new T.ConeGeometry(1,1,7),world.mat('#23433d'),data.trees.length);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.17,.26,2.8,5),world.mat('#4d5147'),data.trees.length);
  data.trees.forEach((p,i)=>{
    dummy.position.set(p.x,p.y+1.3+p.height/2,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(p.radius,p.height,p.radius);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);
    dummy.position.y=p.y+1.4;dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  });
  world.trees=trees;world.course.add(trees,trunks);
  for(const p of data.mountains){
    const geo=new T.ConeGeometry(p.radius,p.height,7),positions=geo.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<-p.height*.49){const x=positions.getX(i),z=positions.getZ(i),wx=p.x+x*Math.cos(p.rotation)+z*Math.sin(p.rotation),wz=p.z-x*Math.sin(p.rotation)+z*Math.cos(p.rotation);positions.setY(i,ground.heightAt(wx,wz)-p.y-p.height/2-2);}
    geo.computeVertexNormals();const mountain=new T.Mesh(geo,world.mat('#314b48'));mountain.position.set(p.x,p.y+p.height/2,p.z);mountain.rotation.y=p.rotation;world.course.add(mountain);
  }
  const finish=world.track.at(world.track.length),flags=new T.InstancedMesh(new T.BoxGeometry(1,.014,1),world.mat('#d7dfd9'),14);
  for(let i=0;i<14;i++){dummy.position.set(finish.x+i-6.5,finish.y+.022,finish.z+(i%2?-.5:.5));dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();flags.setMatrixAt(i,dummy.matrix);}world.course.add(flags);
  for(const side of [-1,1])world.box(world.course,.26,4.2,.26,finish.x+side*8.6,finish.y+2.1,finish.z,'#d1dad4');
  world.box(world.course,17.4,.32,.25,finish.x,finish.y+4.2,finish.z,'#cb775b');
}
