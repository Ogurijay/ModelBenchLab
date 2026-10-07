import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCarModel,explodeModel} from './models';
import {CARS} from './catalog.js';
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeec');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.03).texture;
const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.001,10);camera.position.set(.18,.15,.235);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.017,0);controls.update();
scene.environmentIntensity=.65;scene.add(new THREE.HemisphereLight(0xeef5ff,0x676052,.7));
const key=new THREE.DirectionalLight(0xfff5e4,2);key.position.set(-.25,.4,.3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-.18;key.shadow.camera.right=.18;key.shadow.camera.top=.18;key.shadow.camera.bottom=-.18;key.shadow.camera.near=.01;key.shadow.camera.far=2;key.shadow.bias=-.00005;scene.add(key);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({color:0xeeeeec,roughness:.9}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.0005;scene.add(ground);
let model;
function show(id,angle='reference',painted=false,explode=0){
 if(model)scene.remove(model);model=createCarModel(CARS.find(c=>c.id===id)||CARS[0],{painted,detail:2});scene.add(model);explodeModel(model,explode);
 const views={reference:[.18,.15,.235],front:[0,.065,.29],right:[.29,.065,0],rear:[0,.065,-.29],left:[-.29,.065,0],top:[0,.32,.001]};
 camera.position.set(...(views[angle]||views.reference));camera.up.set(0,1,0);controls.target.set(0,.017,0);controls.update();renderer.render(scene,camera);
 document.getElementById('label').textContent=id+' / '+angle;return {triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
}
(window as any).astraReview={show,scene,renderer,camera,get model(){return model},parts:()=>Object.keys(model.userData.parts)};
const params=new URLSearchParams(location.search);show(params.get('car')||'cyclone',params.get('angle')||'reference',params.get('painted')==='1');
renderer.setAnimationLoop(()=>renderer.render(scene,camera));(window as any).__READY__=true;
