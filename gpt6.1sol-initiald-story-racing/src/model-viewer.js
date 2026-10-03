import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CARS } from './data.js';
import { VehicleModelFactory,animateVehicleModel,vehicleModelStats,vehicleBeamPositions,vehicleLightState } from './vehicle-model.js';
import './model-viewer.css';

document.title='秋名车库 · 车型鉴赏';
document.body.className='model-viewer';
document.body.innerHTML='<header class="model-header"><a href="./">← 回到秋名山</a><span>AKINA GARAGE / 2005</span><b>车型鉴赏</b></header><main class="model-layout"><aside class="model-info"><p class="model-eyebrow">一辆车，一段青春。</p><h1 id="model-name"></h1><p id="model-note"></p><div id="model-spec"></div><nav id="model-list" aria-label="选择车辆"></nav><p class="model-disclaimer">低多边形动画风格 · 自由查看全部车型<br>比赛解锁进度照常保留。</p></aside><section class="model-stage" aria-label="可旋转车辆模型"><div id="model-canvas"></div><span class="model-watermark">秋 名</span><div class="model-tools"><div class="model-views"><button data-view="hero">三分之四</button><button data-view="front">车头</button><button data-view="side">侧面</button><button data-view="rear">车尾</button></div><div><button id="model-light" aria-pressed="false">车灯 OFF</button><button id="model-turn" aria-pressed="false">自动旋转 OFF</button></div></div><p class="model-help">拖动旋转 · 滚轮缩放 · 手机双指缩放</p><span id="model-number"></span></section></main>';
const $=id=>document.getElementById(id),stage=$('model-canvas');
const scene=new T.Scene();scene.background=new T.Color('#152332');
const camera=new T.PerspectiveCamera(38,1,.05,60);
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;stage.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;
controls.minDistance=4;controls.maxDistance=13;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.8;
const hemi=new T.HemisphereLight('#c5ddec','#293340',2.15),key=new T.DirectionalLight('#fff0d2',2.10);
key.position.set(-4,6,5);scene.add(hemi,key);
const ground=new T.Mesh(new T.CircleGeometry(4.2,80),new T.MeshToonMaterial({color:'#263745'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.006;scene.add(ground);
const ring=new T.Mesh(new T.RingGeometry(3.88,3.90,80),new T.MeshBasicMaterial({color:'#8e7760',transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.y=-.002;scene.add(ring);
const factory=new VehicleModelFactory(),models=CARS.map(c=>factory.create(c));models.forEach(m=>{m.visible=false;scene.add(m);});
const featureNotes={
  ae86:'熊猫车身、翻灯、斜背尾门。门上那几个字，是每天凌晨四点的理由。',
  ae85:'固定式头灯、窄胎和钢制轮圈。阿木终于知道，差的不是一个数字。',
  gtr:'三厢双门、宽肩与四圆尾灯。黑色车身下，是六叔的四驱信仰。',
  fc:'低车头、长发动机盖、翻灯与短尾翼。陈老师把理论，写进每一个弯。',
  evo:'四门座舱、进气孔与高尾翼。刘教练热身之后，油门从来没轻过。',
  evo3:'更厚的前唇和尾翼端板。山鸡哥的车灯，照过一台86熄火的晚上。',
  wuling:'窄车身、高座舱、分段玻璃。专业防水补漏，兼职征服秋名山。',
  benz:'长轴距、镀铬格栅与立标。它只是驶过这里，根本不知道有人在追。'
};
const brakeButton=document.createElement('button');brakeButton.id='model-brake';brakeButton.textContent='刹车灯 OFF';brakeButton.setAttribute('aria-pressed','false');$('model-light').after(brakeButton);
const beams=[-1,1].map(side=>{const light=new T.SpotLight('#fff0cf',50,18,.40,.8,1),target=new T.Object3D();light.target=target;light.visible=false;scene.add(light,target);return {light,target};});
let active=0,lights=false,braking=false,last=performance.now(),view='hero';
const presets={hero:[6.1,2.7,6.6],front:[0,1.75,8.3],side:[8.3,1.9,0],rear:[5.8,2.7,-6.5]};
function setView(name='hero'){
  view=presets[name]?name:'hero';controls.enableDamping=false;controls.update();
  controls.target.set(0,models[active].userData.vehicle.height*.47,0);camera.position.set(...presets[view]);
  if(innerWidth<650)camera.position.multiplyScalar(1.14);
  controls.update();controls.enableDamping=true;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
}
function select(id){
  const i=CARS.findIndex(c=>c.id===id);if(i<0)return;active=i;
  models.forEach((m,n)=>m.visible=n===i);
  const c=CARS[i];
  $('model-name').textContent=c.name;$('model-note').textContent=featureNotes[c.id];
  $('model-spec').innerHTML='<span>'+c.driver+'</span><span>'+c.drive+' · '+c.power+' PS</span>';
  $('model-number').textContent=String(i+1).padStart(2,'0')+' / 08';
  document.querySelectorAll('[data-model]').forEach(b=>{b.classList.toggle('selected',b.dataset.model===id);b.setAttribute('aria-pressed',b.dataset.model===id);});
  animateVehicleModel(models[i],{lights,brake:braking},0);setView(view);return vehicleModelStats(models[i]);
}
function setLights(on){
  lights=!!on;$('model-light').textContent='车灯 '+(lights?'ON':'OFF');$('model-light').setAttribute('aria-pressed',String(lights));
  hemi.intensity=lights?1.25:2.15;key.intensity=lights?.85:2.10;scene.background.set(lights?'#0e1927':'#152332');
  animateVehicleModel(models[active],{lights,brake:braking},0);
}
function setBrakes(on){braking=!!on;brakeButton.textContent='刹车灯 '+(braking?'ON':'OFF');brakeButton.setAttribute('aria-pressed',String(braking));animateVehicleModel(models[active],{lights,brake:braking},0);}
$('model-list').innerHTML=CARS.map((c,i)=>'<button data-model="'+c.id+'"><small>'+String(i+1).padStart(2,'0')+'</small><span>'+c.name+'</span><b>↗</b></button>').join('');
document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>select(b.dataset.model));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('model-light').onclick=()=>setLights(!lights);
brakeButton.onclick=()=>setBrakes(!braking);
$('model-turn').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('model-turn').textContent='自动旋转 '+(controls.autoRotate?'ON':'OFF');$('model-turn').setAttribute('aria-pressed',String(controls.autoRotate));};
function resize(){
  const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
window.__models={select,setView,setLights,setBrakes,snapshot:()=>({car:CARS[active].id,three:T.REVISION,lights,braking,view,camera:camera.position.toArray(),lighting:vehicleLightState(models[active]),...vehicleModelStats(models[active]),render:{...renderer.info.render}})};
select(new URLSearchParams(location.search).get('car')||'ae86');resize();
function frame(now){
  const dt=Math.min((now-last)/1000,.05);last=now;animateVehicleModel(models[active],{lights,brake:braking},dt,now/1000);controls.update(dt);
  models[active].updateMatrixWorld(true);const positions=vehicleBeamPositions(models[active]);
  beams.forEach(({light,target},i)=>{light.visible=lights;if(positions[i]){light.position.copy(positions[i]);target.position.set(positions[i].x,0,positions[i].z+3.2);}});
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
