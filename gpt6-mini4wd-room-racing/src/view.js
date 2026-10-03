import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createCar,animateAssembly,disposeObject,material,cylinder} from './models.js';
import {buildCircuit,buildRoom} from './world.js';
export class View{
 constructor(host,{onPart,onCar}){
  this.host=host;this.onPart=onPart;this.onCar=onCar;this.mode='race';this.cameraMode='orbit';this.explode=0;this.selectedPart='motor';this.models=[];
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  host.prepend(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','真实比例室内迷你四驱车赛道；拖动旋转，滚轮缩放');
  const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.env=pmrem.fromScene(room,.06);room.dispose();pmrem.dispose();
  this.scene=new THREE.Scene();this.scene.environment=this.env.texture;this.scene.environmentIntensity=.4;this.scene.background=new THREE.Color('#c1cacd');this.scene.add(new THREE.HemisphereLight('#edf2f5','#94785e',1.2));
  this.sun=new THREE.DirectionalLight('#fff0d3',2.3);this.sun.position.set(-8,13,6);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-14,right:14,top:13,bottom:-13,near:1,far:40});this.sun.shadow.normalBias=.002;this.sun.shadow.bias=-.00015;this.scene.add(this.sun);
  const fill=new THREE.DirectionalLight('#bfd7ee',.7);fill.position.set(8,7,-5);this.scene.add(fill);
  this.camera=new THREE.PerspectiveCamera(42,1,.005,100);this.camera.position.set(13,17,21);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2-.02;this.controls.minDistance=.22;this.controls.maxDistance=45;
  this.garage=new THREE.Scene();this.garage.background=new THREE.Color('#222b36');this.garage.environment=this.env.texture;this.garage.environmentIntensity=.6;this.garage.add(new THREE.HemisphereLight('#f0f2f7','#4a5360',.65));
  const key=new THREE.DirectionalLight('#fff3dd',1.65);key.position.set(.3,.6,.4);this.garage.add(key);const rim=new THREE.DirectionalLight('#b7daff',.85);rim.position.set(-.4,.3,-.3);this.garage.add(rim);
  cylinder(this.garage,.14,.006,0,-.004,0,material('#35414e',.73),80);const grid=new THREE.GridHelper(.6,30,'#516173','#35414e');grid.position.y=-.008;this.garage.add(grid);
  this.garageCamera=new THREE.PerspectiveCamera(35,1,.001,3);this.garageCamera.position.set(.21,.145,.275);
  this.garageControls=new OrbitControls(this.garageCamera,this.renderer.domElement);this.garageControls.target.set(0,.028,0);this.garageControls.enableDamping=true;this.garageControls.minDistance=.13;this.garageControls.maxDistance=.65;this.garageControls.maxPolarAngle=Math.PI/2;this.garageControls.enabled=false;
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
  this.renderer.domElement.addEventListener('pointerdown',e=>this.pointerStart=[e.clientX,e.clientY]);
  this.renderer.domElement.addEventListener('pointerup',e=>{
   if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>5)return;const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.mode==='garage'?this.garageCamera:this.camera);
   const hits=this.raycaster.intersectObjects(this.mode==='garage'?(this.garageCar?[this.garageCar]:[]):this.models,true);if(hits.length){if(this.mode==='garage')this.onPart(hits[0].object.userData.slot||'shell');else{let o=hits[0].object;while(o.parent&&!o.userData.car)o=o.parent;if(o.userData.car)this.onCar(o.userData.car.id);}}
  });
  this.controls.addEventListener('start',()=>{if(this.mode==='race')this.cameraMode='orbit';});this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
 }
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);for(const c of [this.camera,this.garageCamera]){c.aspect=w/h;c.updateProjectionMatrix();}}
 loadRace(race,builds){
  this.race=race;if(this.room)disposeObject(this.room);if(this.circuit)disposeObject(this.circuit);this.models.forEach(disposeObject);this.models=[];
  this.room=buildRoom(race.venue);this.circuit=buildCircuit(race.track);this.scene.add(this.room,this.circuit);
  const night=race.venue.id==='night';this.scene.background.set(night?'#435164':'#c1cacd');this.sun.color.set(race.venue.light);this.sun.intensity=night?1.4:2.3;
  this.models=race.racers.map(r=>{const m=createCar(r.car,builds[r.car.id]);m.scale.setScalar(.001);this.scene.add(m);return m;});
  if(this.focusRing)disposeObject(this.focusRing);this.focusRing=new THREE.Mesh(new THREE.RingGeometry(.078,.084,40),new THREE.MeshBasicMaterial({color:'#ffb347',side:THREE.DoubleSide,transparent:true,opacity:.8}));this.focusRing.rotation.x=-Math.PI/2;this.scene.add(this.focusRing);this.setCamera('orbit');this.render(0);
 }
 setMode(mode){this.mode=mode;this.controls.enabled=mode==='race'&&this.cameraMode==='orbit';this.garageControls.enabled=mode==='garage';this.resize();}
 setCamera(mode){
  this.cameraMode=mode;this.controls.enabled=this.mode==='race'&&mode==='orbit';
  if(mode==='orbit'){this.camera.position.set(12,15.5,19);this.controls.target.set(0,0,0);this.camera.fov=42;}
  if(mode==='top'){this.camera.position.set(0,25,.001);this.controls.target.set(0,0,0);this.camera.lookAt(0,0,0);this.camera.fov=44;}
  if(mode==='follow')this.camera.fov=48;this.camera.updateProjectionMatrix();this.controls.update();
 }
 loadGarage(car,build){
  if(this.garageCar)disposeObject(this.garageCar);this.garageCar=createCar(car,build);this.garageCar.scale.setScalar(.001);this.garage.add(this.garageCar);
  if(this.selection)disposeObject(this.selection);this.selection=new THREE.BoxHelper(this.garageCar.userData.parts[this.selectedPart],0xf7b96a);this.selection.material.transparent=true;this.selection.material.opacity=.55;this.garage.add(this.selection);animateAssembly(this.garageCar,this.explode,10);
 }
 selectPart(slot){this.selectedPart=slot;if(this.selection&&this.garageCar)this.selection.setFromObject(this.garageCar.userData.parts[slot]);}
 setGarageCamera(mode){const center=this.explode?.055:.028;this.garageControls.target.set(0,center,0);this.garageCamera.position.set(...(mode==='top'?[0,.38,.001]:mode==='side'?[.36,center+.025,0]:[.21,.145,.275]));this.garageCamera.lookAt(this.garageControls.target);this.garageControls.update();}
 thumbnail(car,build={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(28,2,.001,3),model=createCar(car,build);model.scale.setScalar(.001);scene.environment=this.env.texture;scene.environmentIntensity=.65;scene.add(model,new THREE.HemisphereLight('#f5f5f0','#697181',.8));const light=new THREE.DirectionalLight('#fff4e4',1.9);light.position.set(.3,.5,.5);scene.add(light);
  const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());this.catalogChecks??={};this.catalogChecks[car.id]={id:car.id,dimensions:size.toArray().map(n=>n*1000),parts:Object.keys(model.userData.parts),wheels:model.userData.wheels.length};
  camera.position.set(.15,.125,.21);camera.lookAt(0,.019,0);const old=this.renderer.getSize(new THREE.Vector2()),ratio=this.renderer.getPixelRatio();this.renderer.setPixelRatio(1);this.renderer.setSize(400,200,false);this.renderer.setClearColor(0,0);this.renderer.render(scene,camera);const url=this.renderer.domElement.toDataURL('image/png');disposeObject(model);this.renderer.setPixelRatio(ratio);this.renderer.setSize(old.x,old.y,false);return url;
 }
 projectPart(slot){if(!this.garageCar)return null;const bounds=new THREE.Box3().setFromObject(this.garageCar.userData.parts[slot]),p=bounds.getCenter(new THREE.Vector3());if(slot==='tires'){p.x=bounds.min.x;p.z=bounds.max.z;}if(slot==='chassis'){p.x=bounds.max.x;p.z=bounds.max.z;}p.project(this.garageCamera);return {x:(p.x+1)/2*this.host.clientWidth,y:(1-p.y)/2*this.host.clientHeight};}
 render(dt){
  if(this.mode==='garage'){
   if(this.garageCar){animateAssembly(this.garageCar,this.explode,dt);this.garageCar.updateMatrixWorld(true);this.selection.setFromObject(this.garageCar.userData.parts[this.selectedPart]);this.selection.visible=this.explode>.1;}
   this.garageControls.target.y=THREE.MathUtils.lerp(this.garageControls.target.y,this.explode?.055:.028,1-Math.exp(-dt*4));this.garageControls.update();this.renderer.render(this.garage,this.garageCamera);return;
  }
  if(this.race){
   this.race.racers.forEach((r,i)=>{
    const p=this.race.track.pose(r.progress,r.initialLane),m=this.models[i];m.position.copy(r.airPosition||p.p);m.rotation.set(r.air?-Math.atan((r.air.vy-9.81*r.air.time)/Math.max(.1,r.speed)):p.pitch,r.air?Math.atan2(r.air.heading.x,r.air.heading.z):p.yaw,r.status==='dnf'?Math.PI*.58:Math.sin(this.race.time*38)*r.wobble*.025,'YXZ');
    // Finished cars are caught beyond the line; no pile-up of eight stopped cars.
    if(r.status==='finished')m.position.addScaledVector(p.tangent,.18);for(const w of m.userData.wheels)w.rotation.x+=r.speed*dt/(r.setup.diameter/2000);
    if(r.player){this.focusRing.position.copy(m.position);this.focusRing.position.y+=.001;this.focusRing.visible=r.status!=='dnf';}
   });
   if(this.cameraMode==='follow'){
    const r=this.race.racers.find(x=>x.car.id===this.followId)||this.race.player,p=this.race.track.pose(r.progress,r.initialLane),pos=r.airPosition||p.p,target=pos.clone().addScaledVector(p.tangent,-.52);target.y+=.26;
    this.camera.position.lerp(target,dt?1-Math.exp(-dt*14):1);const look=pos.clone().addScaledVector(p.tangent,.18);look.y+=.024;this.camera.lookAt(look);
   }
  }
  if(this.cameraMode==='orbit')this.controls.update();this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.resizeObserver.disconnect();this.controls.dispose();this.garageControls.dispose();disposeObject(this.scene);disposeObject(this.garage);this.env.dispose();this.renderer.dispose();}
}
