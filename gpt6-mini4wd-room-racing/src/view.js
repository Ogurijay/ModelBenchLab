import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCar, animateAssembly, disposeObject, material, cylinder } from './models.js';
import { buildCircuit, buildRoom } from './world.js';

export class View {
  constructor(host,{onPart,onCar}) {
    this.host=host;this.onPart=onPart;this.onCar=onCar;this.mode='race';this.cameraMode='orbit';this.explode=0;this.selectedPart='motor';this.models=[];
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
    host.prepend(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','可拖动旋转、滚轮缩放的三维赛车与房间赛道');
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#a3b0ac');
    this.scene.add(new THREE.HemisphereLight('#e6f0ef','#aa8764',2.1));
    this.sun=new THREE.DirectionalLight('#fff0d3',3.1);this.sun.position.set(-10,23,6);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);
    Object.assign(this.sun.shadow.camera,{left:-29,right:29,top:24,bottom:-24,near:1,far:85});this.sun.shadow.normalBias=.045;this.sun.shadow.bias=-.00015;this.scene.add(this.sun);
    const fill=new THREE.DirectionalLight('#c2e4ed',1.05);fill.position.set(18,13,-12);this.scene.add(fill);
    this.camera=new THREE.PerspectiveCamera(39,1,.1,200);this.camera.position.set(25,31,36);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2-.08;this.controls.minDistance=15;this.controls.maxDistance=85;
    this.garage=new THREE.Scene();this.garage.background=new THREE.Color('#263435');
    this.garage.add(new THREE.HemisphereLight('#e0ece6','#31453b',2.6));
    const key=new THREE.DirectionalLight('#ffe5be',4);key.position.set(3,6,4);this.garage.add(key);
    const rim=new THREE.DirectionalLight('#8cd8e6',2.6);rim.position.set(-4,3,-3);this.garage.add(rim);
    cylinder(this.garage,2.28,.17,0,-.19,0,material('#3b4a48',.75),80);
    const grid=new THREE.GridHelper(18,36,'#5c6e64','#3a4b46');grid.position.y=-.285;this.garage.add(grid);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.07,2.09,90),new THREE.MeshBasicMaterial({color:'#e6b872',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.09;this.garage.add(ring);
    this.garageCamera=new THREE.PerspectiveCamera(38,1,.1,100);this.garageCamera.position.set(5.9,4.5,6.8);
    this.garageControls=new OrbitControls(this.garageCamera,this.renderer.domElement);this.garageControls.target.set(0,.8,0);this.garageControls.enableDamping=true;this.garageControls.minDistance=4;this.garageControls.maxDistance=17;this.garageControls.maxPolarAngle=Math.PI/2;this.garageControls.enabled=false;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.pointerStart=[e.clientX,e.clientY];});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>5)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.mode==='garage'?this.garageCamera:this.camera);
      const hits=this.raycaster.intersectObjects(this.mode==='garage'?(this.garageCar?[this.garageCar]:[]):this.models,true);
      if(hits.length){if(this.mode==='garage')this.onPart(hits[0].object.userData.slot||'shell');else{let o=hits[0].object;while(o.parent&&!o.userData.car)o=o.parent;if(o.userData.car)this.onCar(o.userData.car.id);}}
    });
    this.controls.addEventListener('start',()=>{if(this.mode==='race')this.cameraMode='orbit';});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
  }
  resize() {
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h,false);for(const camera of [this.camera,this.garageCamera]){camera.aspect=w/h;camera.updateProjectionMatrix();}
  }
  loadRace(race,builds) {
    this.race=race;
    if(this.room)disposeObject(this.room);if(this.circuit)disposeObject(this.circuit);
    this.models.forEach(disposeObject);this.models=[];
    this.room=buildRoom(race.venue);this.circuit=buildCircuit(race.track);this.scene.add(this.room,this.circuit);
    const night=race.venue.id==='night';this.scene.background.set(night?'#344853':'#a3b0ac');this.sun.color.set(race.venue.light);this.sun.intensity=night?1.55:3.1;
    this.models=race.racers.map(r=>{const model=createCar(r.car,builds[r.car.id]);model.scale.setScalar(.39);this.scene.add(model);return model;});
    if(this.focusRing)disposeObject(this.focusRing);this.focusRing=new THREE.Mesh(new THREE.RingGeometry(.61,.65,40),new THREE.MeshBasicMaterial({color:'#ffc26a',side:THREE.DoubleSide,transparent:true,opacity:.9}));this.focusRing.rotation.x=-Math.PI/2;this.scene.add(this.focusRing);
    this.render(0);this.setCamera('orbit');
  }
  setMode(mode) { this.mode=mode;this.controls.enabled=mode==='race'&&this.cameraMode==='orbit';this.garageControls.enabled=mode==='garage';this.resize(); }
  setCamera(mode) {
    this.cameraMode=mode;this.controls.enabled=this.mode==='race'&&mode==='orbit';
    if(mode==='orbit'){this.camera.position.set(25,31,36);this.controls.target.set(0,0,0);this.camera.fov=39;}
    if(mode==='top'){this.camera.position.set(0,48,.05);this.controls.target.set(0,0,0);this.camera.lookAt(0,0,0);this.camera.fov=46;}
    if(mode==='follow')this.camera.fov=52;
    this.camera.updateProjectionMatrix();this.controls.update();
  }
  loadGarage(car,build) {
    if(this.garageCar)disposeObject(this.garageCar);
    this.garageCar=createCar(car,build);this.garage.add(this.garageCar);
    if(this.selection){this.selection.geometry.dispose();this.selection.material.dispose();this.selection.removeFromParent();}
    this.selection=new THREE.BoxHelper(this.garageCar.userData.parts[this.selectedPart],0xf7b96a);this.selection.material.transparent=true;this.selection.material.opacity=.65;this.garage.add(this.selection);
    animateAssembly(this.garageCar,this.explode,10);
  }
  selectPart(slot) { this.selectedPart=slot;if(this.selection&&this.garageCar)this.selection.setFromObject(this.garageCar.userData.parts[slot]); }
  thumbnail(car,build={}) {
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(29,2,.1,30),model=createCar(car,build);
    scene.add(model,new THREE.HemisphereLight('#f0f3ee','#45585b',3));const light=new THREE.DirectionalLight('#fff0d3',4);light.position.set(3,5,5);scene.add(light);
    camera.position.set(4.6,3.65,6);camera.lookAt(0,.3,0);
    const old=this.renderer.getSize(new THREE.Vector2()),ratio=this.renderer.getPixelRatio();this.renderer.setPixelRatio(1);this.renderer.setSize(320,160,false);this.renderer.setClearColor(0x000000,0);
    this.renderer.render(scene,camera);const url=this.renderer.domElement.toDataURL('image/png');
    disposeObject(model);this.renderer.setPixelRatio(ratio);this.renderer.setSize(old.x,old.y,false);return url;
  }
  projectPart(slot) {
    if(!this.garageCar)return null;
    const bounds=new THREE.Box3().setFromObject(this.garageCar.userData.parts[slot]),p=bounds.getCenter(new THREE.Vector3());
    if(slot==='tires'){p.x=bounds.min.x;p.z=bounds.max.z;}
    if(slot==='chassis'){p.x=bounds.max.x;p.z=bounds.max.z;}
    if(slot==='rollers'){p.x=bounds.min.x;p.z=bounds.min.z;}
    p.project(this.garageCamera);return {x:(p.x+1)/2*this.host.clientWidth,y:(1-p.y)/2*this.host.clientHeight};
  }
  render(dt) {
    if(this.mode==='garage') {
      if(this.garageCar){animateAssembly(this.garageCar,this.explode,dt);this.garageCar.updateMatrixWorld(true);this.selection.setFromObject(this.garageCar.userData.parts[this.selectedPart]);this.selection.visible=this.explode>.1;}
      const desired=this.explode?1.65:.72;this.garageControls.target.y=THREE.MathUtils.lerp(this.garageControls.target.y,desired,1-Math.exp(-dt*4));this.garageControls.update();
      this.renderer.render(this.garage,this.garageCamera);return;
    }
    if(this.race) {
      this.race.racers.forEach((r,i)=>{
        const pose=this.race.track.pose(r.progress,r.lane),m=this.models[i];m.position.copy(pose.p);m.rotation.set(pose.pitch,pose.yaw,Math.sin(this.race.time*38)*r.wobble*.11,'YXZ');
        for(const wheel of m.userData.wheels)wheel.rotation.x+=r.speed*dt/.125;
        if(r.player){this.focusRing.position.copy(pose.p);this.focusRing.position.y+=.015;}
      });
      if(this.cameraMode==='follow') {
        const p=this.race.track.pose(this.race.player.progress,this.race.player.lane),target=p.p.clone().addScaledVector(p.tangent,-4.7);target.y+=2.5;
        this.camera.position.lerp(target,dt?1-Math.exp(-dt*7):1);const look=p.p.clone().addScaledVector(p.tangent,3);look.y+=.4;this.camera.lookAt(look);
      }
    }
    if(this.cameraMode==='orbit')this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  dispose() {this.resizeObserver.disconnect();this.controls.dispose();this.garageControls.dispose();disposeObject(this.scene);disposeObject(this.garage);this.renderer.dispose();}
}
