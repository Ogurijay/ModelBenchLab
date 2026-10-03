import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSpectrum, updateSpectrum, sampleWorld, maximumElevation, stepSpring } from './spectrum.js';
import { skyVertex, skyFragment, waterVertex, waterFragment } from './shaders.js';
import { createVessel, createBuoy, createCrate, createRing } from './objects.js';

export const QUALITY = {
  low: { rings: 160, sectors: 240, ratio: 0.8 },
  medium: { rings: 256, sectors: 360, ratio: 1.1 },
  high: { rings: 360, sectors: 480, ratio: 1.6 },
};
function oceanGeometry({ rings,sectors }) {
  const vertices=new Float32Array((rings+1)*(sectors+1)*3), indices=new Uint32Array(rings*sectors*6);
  for(let r=0;r<=rings;r++) {
    const radius=1.8*Math.expm1(r/rings*8.6);
    for(let s=0;s<=sectors;s++){const a=s/sectors*Math.PI*2,n=(r*(sectors+1)+s)*3;vertices[n]=Math.sin(a)*radius;vertices[n+2]=Math.cos(a)*radius;}
  }
  let n=0;for(let r=0;r<rings;r++)for(let s=0;s<sectors;s++){const a=r*(sectors+1)+s,b=a+sectors+1;indices.set([a,b,a+1,a+1,b,b+1],n);n+=6;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(vertices,3));geo.setIndex(new THREE.BufferAttribute(indices,1));return geo;
}
export class Ocean {
  constructor(canvas, { seed=61, time=0, quality='medium', parameters }) {
    this.canvas=canvas;this.seed=seed;this.time=time;this.quality=quality;this.view='horizon';this.parameters={...parameters};
    this.waves=createSpectrum(seed);this.chop=updateSpectrum(this.waves,parameters);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(50,1,0.15,15000);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=0.075;this.controls.enablePan=false;
    this.controls.minDistance=14;this.controls.maxDistance=240;this.controls.maxPolarAngle=Math.PI/2-0.025;this.controls.minPolarAngle=0.12;
    this.controls.rotateSpeed=0.45;this.controls.zoomSpeed=0.7;
    this.uniforms={uTime:{value:time},uSun:{value:new THREE.Vector3()},uCloud:{value:parameters.cloud},uWind:{value:parameters.wind},uHeight:{value:parameters.height},uChop:{value:this.chop},uCenter:{value:new THREE.Vector2()},uWaves:{value:this.waves.map(w=>new THREE.Vector4(w.dx,w.dz,w.k,w.amplitude))},uPhase:{value:this.waves.map(w=>new THREE.Vector2(w.omega,w.phase))},uBoat:{value:new THREE.Vector4()},uObjects:{value:1}};
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:skyVertex,fragmentShader:skyFragment,side:THREE.BackSide,depthWrite:false}));
    this.sky.frustumCulled=false;this.sky.renderOrder=-10;this.scene.add(this.sky);
    this.water=new THREE.Mesh(oceanGeometry(QUALITY[quality]),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:waterVertex,fragmentShader:waterFragment,side:THREE.DoubleSide}));this.water.frustumCulled=false;this.scene.add(this.water);
    this.sun=new THREE.DirectionalLight('#fff1d6',2.5);this.hemi=new THREE.HemisphereLight('#c2d6dd','#163944',1.5);this.scene.add(this.sun,this.hemi);
    this.floats=[];this.dropped=0;
    this.boat=this.addFloat(createVessel(),-14,-34,{kind:'vessel',width:3.5,length:8.5,yaw:0.75,offset:0.05});
    this.buoy=this.addFloat(createBuoy(),15,-15,{kind:'buoy',width:1.7,length:1.7,yaw:0,offset:0.02});
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.setView('horizon');
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();this.render(0,parameters,true);
  }
  addFloat(group,x,z,options) {
    const sample=sampleWorld(x,z,this.time,this.waves,this.chop);
    const body={group,x,z,velocity:0,height:sample.y+options.offset,pitch:0,roll:0,...options};
    group.position.set(x,body.height,z);group.userData.body=body;this.floats.push(body);this.scene.add(group);return body;
  }
  drop(kind) {
    if(this.dropped>=16)return false;
    this.camera.getWorldDirection(this.tempDirection??=new THREE.Vector3());
    const dir=this.tempDirection,side=(this.dropped%5-2)*2.2;
    const x=this.camera.position.x+dir.x*26+dir.z*side,z=this.camera.position.z+dir.z*26-dir.x*side;
    const body=this.addFloat(kind==='ring'?createRing():createCrate(),x,z,{kind,width:kind==='ring'?1.1:1.3,length:kind==='ring'?1.1:1.3,yaw:this.dropped*1.37,offset:kind==='ring'?0.13:0.16});
    body.height+=2.5;body.initialized=true;this.dropped++;return true;
  }
  clearDropped() {
    for(const body of this.floats.filter(b=>b.kind!=='vessel'&&b.kind!=='buoy')){this.scene.remove(body.group);body.group.traverse(m=>m.geometry?.dispose());}
    this.floats=this.floats.filter(b=>b.kind==='vessel'||b.kind==='buoy');this.dropped=0;
  }
  setQuality(q) {
    if(!QUALITY[q]||q===this.quality)return;
    const old=this.water.geometry;this.water.geometry=oceanGeometry(QUALITY[q]);old.dispose();this.quality=q;this.resize();
  }
  setView(view) {
    this.view=view;
    const mobile=innerWidth<760;
    if(view==='aerial'){this.controls.target.set(0,0,-16);this.camera.position.set(32,94,65);}
    else if(view==='vessel'){this.controls.target.set(this.boat.x,2,this.boat.z);this.camera.position.set(this.boat.x+15,7.5,this.boat.z+25);}
    else {this.controls.target.set(0,1,-28);this.camera.position.set(0,8.0,mobile?54:28);}
    this.controls.update();
  }
  resize() {
    const {width,height}=this.canvas.parentElement.getBoundingClientRect();this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,QUALITY[this.quality].ratio));this.renderer.setSize(width,height,false);
  }
  pick(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.floats.map(b=>b.group),true);if(!hits.length)return null;
    let object=hits[0].object;while(object&&!object.userData.body)object=object.parent;return object?.userData.body??null;
  }
  render(delta,target,paused=false) {
    const shapeChanged=['wind','height','direction'].some(key=>Math.abs(target[key]-this.parameters[key])>1e-5);
    this.time+=delta;const blend=paused?1:1-Math.exp(-delta*2.5);
    for(const key of ['wind','height','direction','sun','cloud','azimuth'])this.parameters[key]+=(target[key]-this.parameters[key])*blend;
    const p=this.parameters,u=this.uniforms;this.chop=updateSpectrum(this.waves,p);
    u.uTime.value=this.time;u.uChop.value=this.chop;u.uWind.value=p.wind;u.uHeight.value=p.height;u.uCloud.value=p.cloud;
    this.waves.forEach((w,i)=>u.uWaves.value[i].set(w.dx,w.dz,w.k,w.amplitude));
    const elev=p.sun*Math.PI/180,az=p.azimuth*Math.PI/180;u.uSun.value.set(Math.sin(az)*Math.cos(elev),Math.sin(elev),-Math.cos(az)*Math.cos(elev));
    this.sun.position.copy(u.uSun.value).multiplyScalar(200);this.sun.intensity=3.0*(1-p.cloud*0.9);this.sun.color.setHSL(0.105,0.18+(1-Math.sin(elev))*0.42,0.8);
    this.hemi.intensity=1.5-p.cloud*0.9;this.hemi.color.setHSL(0.55,0.18,0.7-p.cloud*0.18);
    this.controls.update();
    this.minimumCameraY=maximumElevation(this.waves)+1.6;this.camera.position.y=Math.max(this.camera.position.y,this.minimumCameraY);this.camera.lookAt(this.controls.target);
    u.uCenter.value.set(this.camera.position.x,this.camera.position.z);
    for(const b of this.floats) {
      b.group.visible=target.objects;
      const dx=Math.sin(b.yaw),dz=Math.cos(b.yaw),hx=Math.cos(b.yaw),hz=-Math.sin(b.yaw);
      const sample=(x,z)=>sampleWorld(x,z,this.time,this.waves,this.chop).y;
      const center=sample(b.x,b.z)+b.offset;
      const fore=sample(b.x+dx*b.length/2,b.z+dz*b.length/2),aft=sample(b.x-dx*b.length/2,b.z-dz*b.length/2);
      const right=sample(b.x+hx*b.width/2,b.z+hz*b.width/2),left=sample(b.x-hx*b.width/2,b.z-hz*b.width/2);
      if(!b.initialized||(paused&&shapeChanged)){b.height=center;b.velocity=0;b.pitch=Math.atan2(aft-fore,b.length);b.roll=Math.atan2(right-left,b.width);b.initialized=true;}
      else if(delta>0){const spring=stepSpring(b.height,b.velocity,center,delta,b.kind==='vessel'?3.1:5);b.height=spring.position;b.velocity=spring.velocity;const a=1-Math.exp(-delta*3.5);b.pitch+=(Math.atan2(aft-fore,b.length)-b.pitch)*a;b.roll+=(Math.atan2(right-left,b.width)-b.roll)*a;}
      b.group.position.set(b.x,b.height,b.z);b.group.rotation.set(b.pitch,b.yaw,b.roll,'YXZ');
    }
    this.buoy.group.userData.beacon.emissiveIntensity=0.8+Math.pow(Math.max(0,Math.sin(this.time*1.8)),24)*3;
    u.uBoat.value.set(this.boat.x,this.boat.z,this.boat.yaw,1);u.uObjects.value=target.objects?1:0;
    this.surfaceHeight=sampleWorld(this.buoy.x,this.buoy.z,this.time,this.waves,this.chop).y;
    this.renderer.render(this.scene,this.camera);
  }
  capture() {this.renderer.render(this.scene,this.camera);return new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'));}
  snapshot() {
    const gl=this.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {revision:THREE.REVISION,seed:this.seed,time:this.time,quality:this.quality,view:this.view,parameters:{...this.parameters},camera:this.camera.position.toArray(),minimumCameraY:this.minimumCameraY,surfaceHeight:this.surfaceHeight,floatCount:this.floats.length,dropped:this.dropped,objectsVisible:this.boat.group.visible,boat:{height:this.boat.height,pitch:this.boat.pitch,roll:this.boat.roll},triangles:this.renderer.info.render.triangles,drawCalls:this.renderer.info.render.calls,resolution:[this.canvas.width,this.canvas.height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),shaderErrors:this.renderer.info.programs.filter(p=>p.diagnostics&&!p.diagnostics.runnable).length};
  }
  dispose() {
    this.resizeObserver.disconnect();this.controls.dispose();const geos=new Set(),mats=new Set();this.scene.traverse(m=>{if(m.geometry)geos.add(m.geometry);if(m.material)mats.add(m.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());this.renderer.dispose();
  }
}
