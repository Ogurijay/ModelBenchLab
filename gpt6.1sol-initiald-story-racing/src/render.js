import * as T from 'three';
import { carById,CARS } from './data.js';
import { ROAD_HALF,wrap } from './track.js';
import { VehicleModelFactory,animateVehicleModel,cloneVehicleModel,vehicleBeamPositions,vehicleLightState } from './vehicle-model.js';
import { DriftEffects } from './drift-effects.js';
import { buildCourse } from './course-render.js';
const palette={night:['#0d1225','#62667e','#dfae91','#202d43','#142338'],dawn:['#2b3a67','#c18d9f','#f3d3bd','#66748c','#354862'],dusk:['#392f63','#e59b76','#f8ce8b','#6e5064','#3c3c56'],day:['#4fb3ff','#d3e8ea','#f5eddc','#4c868e','#286372'],rain:['#334a54','#71838b','#a9adae','#53646c','#263e45']};
export class World {
  constructor(container,track){
    this.revision=T.REVISION;
    this.track=track;this.scene=new T.Scene();this.scene.fog=new T.Fog('#25374c',70,440);
    this.camera=new T.PerspectiveCamera(65,1,.1,1800);
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.setClearColor('#121b30');container.append(this.renderer.domElement);
    this.gradient=new T.DataTexture(new Uint8Array([65,155,255]),3,1,T.RedFormat);this.gradient.minFilter=T.NearestFilter;this.gradient.magFilter=T.NearestFilter;this.gradient.needsUpdate=true;
    this.materials=new Map();this.edges=new T.LineBasicMaterial({color:'#101521'});
    this.hemi=new T.HemisphereLight('#b4c9ff','#283845',2);this.sun=new T.DirectionalLight('#ffe6b8',2.4);this.sun.position.set(-100,120,30);this.scene.add(this.hemi,this.sun);
    this.sky=document.createElement('canvas');this.sky.width=2048;this.sky.height=1024;this.skyTexture=new T.CanvasTexture(this.sky);this.skyTexture.colorSpace=T.SRGBColorSpace;this.scene.background=this.skyTexture;
    this.course=new T.Group();this.scene.add(this.course);this.buildCourse();
    this.vehicleModels=new VehicleModelFactory(this.gradient);
    this.carGroups=CARS.map(c=>{const g=this.car(c);g.visible=false;this.scene.add(g);return g;});
    this.duplicateCars=new Map();
    this.headLight=new T.SpotLight('#fff0cf',160,70,.48,.8,1);this.headTarget=new T.Object3D();this.headLight.target=this.headTarget;this.scene.add(this.headLight,this.headTarget);
    this.headLight.intensity=100;this.headLight.distance=90;this.headLight.angle=.33;
    this.secondHeadLight=new T.SpotLight('#fff0cf',100,90,.33,.8,1);this.secondHeadTarget=new T.Object3D();this.secondHeadLight.target=this.secondHeadTarget;this.scene.add(this.secondHeadLight,this.secondHeadTarget);
    this.driftEffects=new DriftEffects(this.scene);this.lookTarget=new T.Vector3();this.cameraHeading=0;this.lastMode=null;
    this.trailData=new Float32Array(300*3);this.trailGeometry=new T.BufferGeometry();this.trailGeometry.setAttribute('position',new T.BufferAttribute(this.trailData,3));this.trailMaterial=new T.LineBasicMaterial({color:'#fff',transparent:true,opacity:.5});this.trail=new T.Line(this.trailGeometry,this.trailMaterial);this.scene.add(this.trail);this.trailPoints=[];
    this.resize();this.setMood('night');window.addEventListener('resize',()=>this.resize());
  }
  mat(color,basic=false){const key=color+basic;if(!this.materials.has(key))this.materials.set(key,basic?new T.MeshBasicMaterial({color}):new T.MeshToonMaterial({color,gradientMap:this.gradient}));return this.materials.get(key);}
  box(group,w,h,d,x,y,z,color,outline=false){const geo=new T.BoxGeometry(w,h,d),mesh=new T.Mesh(geo,this.mat(color));mesh.position.set(x,y,z);group.add(mesh);if(outline){const e=new T.LineSegments(new T.EdgesGeometry(geo),this.edges);mesh.add(e);}return mesh;}
  strip(samples,left,right,height,color){
    const v=[],ix=[];
    samples.forEach((p,i)=>{for(const offset of [left,right]){const x=p.x+p.tz*offset,z=p.z-p.tx*offset,y=typeof height==='function'?height(x,z,p,offset):p.y+height;v.push(x,y,z);}if(i<samples.length-1){const n=i*2;ix.push(n,n+2,n+1,n+1,n+2,n+3);}});
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();const mat=this.mat(color).clone();mat.side=T.DoubleSide;const mesh=new T.Mesh(geo,mat);this.course.add(mesh);return mesh;
  }
  buildCourse(){buildCourse(this);}
  car(c){return this.vehicleModels.create(c);}
  setMood(mood){
    this.mood=mood;const p=palette[mood]||palette.night,ctx=this.sky.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,900);gradient.addColorStop(0,p[0]);gradient.addColorStop(.58,p[1]);gradient.addColorStop(1,p[2]);ctx.fillStyle=gradient;ctx.fillRect(0,0,2048,1024);
    ctx.fillStyle=mood==='night'?'#e7e3d5':'#ffe3b4';ctx.beginPath();ctx.arc(1530,mood==='night'?210:640,mood==='night'?28:60,0,Math.PI*2);ctx.fill();
    if(mood==='night'){for(let i=0;i<110;i++){ctx.fillStyle=`rgba(240,240,229,${.2+i%5*.1})`;ctx.fillRect((i*677)%2048,(i*187)%520,2,2);}}
    for(let layer=0;layer<3;layer++){ctx.fillStyle=p[layer%2+3];ctx.beginPath();ctx.moveTo(0,1024);for(let x=0;x<=2048;x+=20){const y=770+layer*65-Math.sin(x*.008+layer*1.4)*90-Math.sin(x*.017+layer)*33;ctx.lineTo(x,y);}ctx.lineTo(2048,1024);ctx.fill();}
    this.skyTexture.needsUpdate=true;this.scene.fog.color.set(p[3]);this.hemi.intensity=mood==='night'?1.45:2.25;this.sun.intensity=mood==='night'?.70:2.1;this.headLight.visible=this.secondHeadLight.visible=mood!=='day';
  }
  setTrack(track){
    if(this.track===track){this.clearTrails();return;}
    const pooled=new Set(this.materials.values());this.scene.remove(this.course);this.course.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&!Array.isArray(o.material)&&!pooled.has(o.material))o.material.dispose();});
    this.track=track;this.course=new T.Group();this.scene.add(this.course);this.buildCourse();this.clearTrails();
  }
  clearTrails(){this.trailPoints=[];this.trailGeometry.setDrawRange(0,0);this.driftEffects.reset();}
  resize(){this.width=innerWidth;this.height=innerHeight;this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();}
  inspectSurface(s,offset=0){
    const p=this.track.at(s),x=p.x+p.tz*offset,z=p.z-p.tx*offset;
    this.course.updateMatrixWorld(true);
    const ray=new T.Raycaster(new T.Vector3(x,200,z),new T.Vector3(0,-1,0));
    const road=ray.intersectObject(this.road)[0],terrain=ray.intersectObject(this.terrain)[0];
    return {s:p.s,offset,x,z,expectedY:p.y,roadY:road?.point.y??null,normalY:road?.face.normal.y??null,
      terrainY:terrain?.point.y??null,groundY:this.courseData.terrain.heightAt(x,z)};
  }
  render(v,opponents=[],dt=.016,mode='race',time=0,effectsEnabled=true){
    if(this.inspectionView?.overview)mode='overview';
    this.carGroups.forEach(g=>g.visible=false);
    const player=this.carGroups[CARS.findIndex(c=>c.id===v.id)],roadFrame=this.track.at(v.s);player.visible=true;player.position.set(v.x,v.y+.03,v.z);player.rotation.set(-Math.atan(roadFrame.grade*Math.cos(v.yaw-Math.atan2(roadFrame.tx,roadFrame.tz))),v.yaw,0,'YXZ');
    animateVehicleModel(player,{...v,lights:this.headLight.visible},dt,time);
    this.duplicateCars.forEach(g=>g.visible=false);
    opponents.forEach((o,i)=>{
      let g=this.carGroups[CARS.findIndex(c=>c.id===o.id)];
      if(g.visible){const key=o.id+'-'+i;if(!this.duplicateCars.has(key)){const duplicate=cloneVehicleModel(g);this.duplicateCars.set(key,duplicate);this.scene.add(duplicate);}g=this.duplicateCars.get(key);}
      const p=this.track.at(o.s);g.visible=o.s<this.track.length+100;g.position.set(p.x+p.tz*o.offset,p.y+.03,p.z-p.tx*o.offset);g.rotation.set(-Math.atan(p.grade),Math.atan2(p.tx,p.tz),0,'YXZ');animateVehicleModel(g,{speed:o.speed||0,steering:Math.max(-1,Math.min(1,-p.k*(o.speed||0)*2)),lights:this.headLight.visible,brake:o.brake},dt,time);
    });
    const forward=new T.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
    player.updateMatrixWorld(true);const lamps=vehicleBeamPositions(player),aimY=this.track.at(v.s+28).y;
    for(const [i,light,target] of [[0,this.headLight,this.headTarget],[1,this.secondHeadLight,this.secondHeadTarget]]){
      const position=lamps[i]||new T.Vector3(v.x,v.y+.8,v.z);light.position.copy(position);
      target.position.set(position.x+forward.x*28,aimY+.03,position.z+forward.z*28);
    }
    const desired=new T.Vector3();const target=new T.Vector3(v.x,v.y+1,v.z);let fov;
    this.camera.up.set(0,1,0);
    if(mode==='overview'){
      const b=this.track.bounds,span=Math.max((b.maxX-b.minX+60)/this.camera.aspect,b.maxZ-b.minZ+60);
      fov=60;target.set((b.minX+b.maxX)/2,43,(b.minZ+b.maxZ)/2);
      desired.set(target.x,target.y+span/(2*Math.tan(Math.PI/6))*1.07,target.z);this.camera.up.set(0,0,1);
    } else if(mode==='menu'){
      desired.set(v.x+7+Math.sin(time*.12)*1.6,v.y+3.3,v.z+8.6);target.x-=innerWidth>700?3:0;target.y+=.25;
      fov=46;
    } else if(mode==='eye'){
      desired.set(v.x+8,v.y+2,v.z+2);fov=48;
    } else {
      const motion=v.speed>3?Math.atan2(v.vx,v.vz):v.yaw,aim=motion+wrap(v.yaw-motion)*.08;
      if(!this.cameraStarted||this.lastMode!==mode)this.cameraHeading=aim;
      else this.cameraHeading=wrap(this.cameraHeading+wrap(aim-this.cameraHeading)*(1-Math.exp(-dt*5)));
      const heading=this.cameraHeading,swing=-Math.max(-.7,Math.min(.7,v.angle))*2;
      desired.set(v.x-Math.sin(heading)*9.5+Math.cos(heading)*swing,v.y+3.5,v.z-Math.cos(heading)*9.5-Math.sin(heading)*swing);
      target.x+=Math.sin(heading)*8;target.z+=Math.cos(heading)*8;fov=64+Math.min(18,v.speed*.3);
    }
    if(!this.cameraStarted||this.lastMode!==mode){this.camera.position.copy(desired);this.lookTarget.copy(target);this.camera.fov=fov;this.cameraStarted=true;}
    else {this.camera.position.lerp(desired,1-Math.exp(-dt*(mode==='menu'?2:10)));this.lookTarget.lerp(target,1-Math.exp(-dt*12));this.camera.fov+=(fov-this.camera.fov)*(1-Math.exp(-dt*6));}
    this.camera.position.y=Math.max(this.camera.position.y,this.courseData.terrain.heightAt(this.camera.position.x,this.camera.position.z)+.75);
    this.lastMode=mode;this.camera.far=mode==='overview'?4000:1800;this.camera.lookAt(this.lookTarget);this.camera.updateProjectionMatrix();
    this.driftEffects.update(v,player.userData.vehicle,this.track,dt,this.camera,this.height*this.renderer.getPixelRatio(),effectsEnabled&&mode==='race');
    if(mode==='race'&&effectsEnabled&&v.speed>8&&dt>0){
      this.trailPoints.push([v.x-Math.sin(v.yaw)*player.userData.vehicle.length*.48,v.y+.65,v.z-Math.cos(v.yaw)*player.userData.vehicle.length*.48]);if(this.trailPoints.length>120)this.trailPoints.shift();
      this.trailPoints.forEach((p,i)=>this.trailData.set(p,i*3));this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.setDrawRange(0,this.trailPoints.length);this.trailMaterial.color.set(carById(v.id).trail);this.trail.visible=true;
    }else if(!effectsEnabled||mode!=='race')this.trail.visible=false;
    const fog=this.scene.fog;if(mode==='overview')this.scene.fog=null;
    this.renderer.render(this.scene,this.camera);this.scene.fog=fog;
    const center=new T.Vector3(v.x,v.y+.6,v.z).project(this.camera),nose=new T.Vector3(v.x+forward.x*2,v.y+.6,v.z+forward.z*2).project(this.camera);
    this.visualState={drift:this.driftEffects.snapshot(),bodyRoll:player.getObjectByName('vehicle-body').rotation.z,
      wheelSteering:player.getObjectByName('wheel:-1:front').rotation.y,noseScreenOffset:nose.x-center.x,
      lights:vehicleLightState(player),headlights:this.headLight.visible?2:0,
      cameraHeading:this.cameraHeading,drawCalls:this.renderer.info.render.calls,course:{...this.courseData.stats,layoutVersion:this.track.layoutVersion,
        cameraClearance:this.camera.position.y-this.courseData.terrain.heightAt(this.camera.position.x,this.camera.position.z)}};
  }
}
