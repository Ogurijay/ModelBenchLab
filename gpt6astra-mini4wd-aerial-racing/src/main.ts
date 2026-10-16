import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CARS,PARTS,COURSES,VENUES,standardBuild,recommendedBuild,resolveBuild} from './catalog.js';
import {references} from './references';
import {createCarModel,explodeModel} from './models';
import {Course} from './track.js';
import {Race} from './physics.js';
import {buildRoom,buildTrack,makeEnvironment,disposeGroup,optimizeCar} from './world';

const $=(s)=>document.querySelector(s), el=(id)=>document.getElementById(id);
const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='astra-mini4wd-v1';
let saved:any={};try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch{}
const customCars=Array.isArray(saved.customCars)?saved.customCars.filter(c=>CARS.some(b=>b.id===c.baseId)&&typeof c.name==='string'&&/^#[0-9a-f]{6}$/i.test(c.customColor||'')).slice(0,12):[];
let cars=[...CARS,...customCars],selected=0,focus=0,mode='race',cameraMode='overview',courseId='aerial',venue='club',laneCount=8,laps=8,manual=false;
let builds=Object.fromEntries(cars.map(c=>[c.id,{...standardBuild(),...(saved.builds?.[c.id]||{})}]));
let course,physics,room,trackGroup,raceModels=[],garageModel,activePart='motor',explosion=0,timeScale=1,pausedFrom='running',lastUi=0,accumFps=0,frameCount=0,fps=60;
const keys=new Set(),followRotation=new THREE.Quaternion();let followDistance=.32,followInitialized=false;
const previews=import.meta.glob('../../shared/assets/mini4wd-astra/previews/*.png',{eager:true,query:'?url',import:'default'});
function thumb(car){return previews[`../../shared/assets/mini4wd-astra/previews/${car.baseId||car.id}.png`]||references[car.baseId||car.id];}
function save(){localStorage.setItem(STORAGE,JSON.stringify({builds,customCars:cars.filter(c=>c.baseId)}));}

el('app').innerHTML=`
 <header class="topbar"><a class="brand" href="#" aria-label="ASTRA 四驱实验室"><span class="brand-mark">A<span>4</span></span><span>ASTRA<b>四驱实验室</b></span></a>
 <nav class="main-nav" aria-label="主导航"><button class="active" data-view="race">01 <span>比赛场</span></button><button data-view="garage">02 <span>改装工房</span></button><button id="reference-open">03 <span>车型档案 ↗</span></button></nav>
 <div class="top-meta"><i></i> CLASSIC COLLECTION <span>GRAVITY LAB / 2026</span></div></header>
 <main class="workspace"><section class="stage" id="stage"><div id="webgl"></div>
   <div class="scene-heading"><div class="eyebrow" id="scene-eyebrow">INDOOR CIRCUIT / 01</div><h1 id="scene-title">天穹双环<span>SKYLINE DOUBLE LOOP</span></h1><p id="scene-note">把速度，带到重力之外。</p></div>
   <div class="scene-status"><span class="live-dot"></span><span id="scene-state">赛前准备</span><span id="fps">60 FPS</span></div>
   <div id="countdown" hidden></div><div id="toast" role="status" aria-live="polite"></div>
   <div class="map-panel" id="map-panel"><div><span>COURSE MAP</span><b id="course-length">111 M</b></div><canvas id="map" width="440" height="300"></canvas><small id="map-label">8 车道 / 双垂直环</small></div>
   <div class="telemetry" id="telemetry"><div class="focused-name" id="focused-name">01 / 旋风冲锋</div><div class="speed-number"><b id="speed">0.0</b><span>KM/H</span></div><div class="meter-row"><span>接地支撑</span><div class="meter"><i id="support-bar"></i></div><b id="support">1.00 G</b></div><div class="telemetry-bottom"><span id="lap-label">LAP 0 / 8</span><span id="section-label">发车直道</span></div></div>
   <div class="camera-tools" id="camera-tools"><span>CAMERA</span><button data-camera="chase">贴身跟随</button><button data-camera="nose">车头</button><button data-camera="overview" class="active">全景</button><button data-camera="orbit">自由</button><label>距离<input id="follow-distance" type="range" min="22" max="70" value="32" aria-label="跟随镜头距离"></label></div>
   <div class="garage-tools" id="garage-tools" hidden><button id="explode-toggle">展开结构</button><input id="explode" type="range" min="0" max="1.2" step=".01" value="0" aria-label="结构展开程度"><button id="garage-reset">重置视角</button><button id="compare-open">对照经典参考 ↗</button><span>拖动旋转 · 滚轮缩放 · 点击部件</span></div>
   <div class="reference-float" id="reference-float" hidden><span>CLASSIC REFERENCE</span><img id="reference-image" alt="经典原版车型参考"><a id="reference-link" target="_blank" rel="noreferrer">田宫原版资料 ↗</a><small id="reference-version"></small></div>
   <div class="key-hints" id="key-hints"><kbd>1–8</kbd> 跟随赛车 <kbd>V</kbd> 切换视角 <kbd>SPACE</kbd> 暂停</div>
 </section>
 <aside class="side-panel"><div id="race-panel">
   <div class="panel-kicker">RACE CONTROL <span>● LIVE</span></div><div class="timer" id="timer">00:00<span>.000</span></div>
   <div class="section-label">赛前设定 <span>SETUP</span></div>
   <label class="field">赛道<select id="course-select">${COURSES.map(c=>`<option value="${c.id}">${c.name} · ${c.tag}</option>`).join('')}</select></label>
   <div class="field-grid"><label class="field">房间<select id="venue-select">${VENUES.map(v=>`<option value="${v.id}">${v.name}</option>`).join('')}</select></label><label class="field">参赛车辆<select id="count-select"><option value="8">8 辆</option><option value="4">4 辆</option><option value="2">2 辆</option></select></label></div>
   <div class="field-grid"><label class="field">比赛圈数<select id="laps-select"><option value="8">8 圈 · 完整换道</option><option value="3">3 圈 · 短赛</option><option value="1">1 圈 · 试跑</option></select></label><label class="field">操控<select id="control-select"><option value="auto">自动四驱</option><option value="manual">手动调速</option></select></label></div>
   <p class="setup-note" id="setup-note">导轮沿槽壁行驶，每圈经过机械换道桥。八圈走遍全部车道。</p>
   <div class="race-actions"><button id="start" class="primary">开始比赛 <span>↗</span></button><button id="reset" class="icon-button" title="重新准备比赛" aria-label="重新准备比赛">↻</button></div>
   <div class="sub-actions"><button id="pause" disabled>暂停</button><button id="time-scale">1× 速度</button><button id="audio-toggle" aria-pressed="false">声音 关</button></div>
   <div class="section-label standing-label">实时排名 <span id="race-progress">READY / 08</span></div><div id="standings"></div>
   <div class="event-log" id="event-log"><span>●</span> 选择赛车，在改装工房检查配置。</div>
   <button id="rules-open" class="text-button">玩法与环道抓地力说明 ↗</button>
 </div>
 <div id="garage-panel" hidden><div class="panel-kicker">BUILD SHEET <span id="car-number">01 / 08</span></div><h2 id="garage-name">旋风冲锋</h2><p class="garage-en" id="garage-en">CYCLONE MAGNUM</p><div class="build-stats" id="build-stats"></div>
   <div class="section-label">选择部件 <span>8 SYSTEMS</span></div><div class="parts-grid" id="parts-grid"></div>
   <div class="part-editor" id="part-editor"></div><div class="build-actions"><button id="stable-build">立体稳定套件</button><button id="stock-build">恢复基础配置</button></div>
   <p class="adaptation-note" id="adaptation-note"></p><button id="add-car" class="text-button">＋ 基于此车拓展新赛车</button><div class="import-export"><button id="export-build">导出配置</button><button id="import-build">导入配置</button><input id="import-file" type="file" accept="application/json,.json" hidden></div>
   <button id="back-race" class="primary">配置已保存 · 返回比赛 ↗</button>
 </div></aside></main>
 <footer class="fleet"><div class="fleet-label"><b>THE ORIGINAL<br>EIGHT.</b><span>选择 / 跟随</span></div><div class="fleet-cards" id="fleet-cards"></div></footer>
 <dialog id="modal"><button id="modal-close" class="modal-close" aria-label="关闭">×</button><div id="modal-content"></div></dialog>`;

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;el('webgl').append(renderer.domElement);
const environment=makeEnvironment(renderer),scene=new THREE.Scene();scene.environment=environment;
const garage=new THREE.Scene();garage.environment=environment;garage.environmentIntensity=.72;garage.background=new THREE.Color('#e4e5de');
garage.add(new THREE.HemisphereLight(0xe3eeff,0x706954,.8));const garageKey=new THREE.DirectionalLight(0xfff2dc,2.3);garageKey.position.set(-.3,.6,.4);garageKey.castShadow=true;garageKey.shadow.mapSize.set(2048,2048);Object.assign(garageKey.shadow.camera,{left:-.23,right:.23,top:.23,bottom:-.23,near:.01,far:2});garageKey.shadow.bias=-.00006;garage.add(garageKey);
const plinth=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.005,80),new THREE.MeshStandardMaterial({color:'#bac4bc',roughness:.62,metalness:.1}));plinth.position.y=-.003;plinth.receiveShadow=true;garage.add(plinth);
const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.0004,6,100),new THREE.MeshBasicMaterial({color:0x6d8076}));ring.rotation.x=-Math.PI/2;ring.position.y=.0001;garage.add(ring);
const camera=new THREE.PerspectiveCamera(42,1,.008,150),garageCamera=new THREE.PerspectiveCamera(34,1,.002,5);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=.16;controls.maxDistance=53;controls.target.set(0,.6,-1);
const garageControls=new OrbitControls(garageCamera,renderer.domElement);garageControls.enableDamping=true;garageControls.minDistance=.15;garageControls.maxDistance=.6;garageControls.maxPolarAngle=Math.PI*.48;garageControls.target.set(0,.022,0);garageControls.enabled=false;
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let highlight:any;
const mapctx=el('map').getContext('2d'),clock=new THREE.Clock();
function resize(){const rect=el('webgl').getBoundingClientRect();renderer.setSize(rect.width,rect.height);camera.aspect=garageCamera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();garageCamera.updateProjectionMatrix();}new ResizeObserver(resize).observe(el('webgl'));

function toast(message){el('toast').textContent=message;el('toast').classList.add('show');clearTimeout((toast as any).timer);(toast as any).timer=setTimeout(()=>el('toast').classList.remove('show'),3600);}
function raceLocked(){return ['running','countdown','paused'].includes(physics?.status);}
function resetView(){camera.position.set(22,23,27);controls.target.set(0,.3,-2);camera.up.set(0,1,0);camera.fov=42;camera.updateProjectionMatrix();controls.update();followInitialized=false;}
function resetGarageView(){garageCamera.position.set(.19,.155,.23);garageControls.target.set(0,.025+explosion*.022,0);garageCamera.up.set(0,1,0);garageControls.update();}
function entries(){const set=cars.slice(0,laneCount);if(selected>=laneCount)set[laneCount-1]=cars[selected];return set.map(car=>({car,build:builds[car.id]}));}
function rebuildRace(rebuildCourse=false){
 if(rebuildCourse||!course){course=new Course(courseId,laneCount);if(trackGroup)disposeGroup(trackGroup);trackGroup=buildTrack(scene,course);}
 for(const m of raceModels){disposeGroup(m);}raceModels=entries().map(e=>{const m=optimizeCar(createCarModel(e.car,{painted:true,detail:1,build:e.build}));scene.add(m);return m;});
 physics=new Race(course,entries(),{laps,manual,player:Math.min(selected,laneCount-1)});focus=Math.min(focus,laneCount-1);followInitialized=false;
 el('course-length').textContent=course.length.toFixed(0)+' M';el('map-label').textContent=`${laneCount} 车道 / ${course.loopCount?course.loopCount+' 个 360° 环道':'立体坡桥'} / ${(course.length*laps).toFixed(0)} M 全程`;
 el('scene-note').textContent=COURSES.find(c=>c.id===courseId).note;el('start').disabled=false;el('start').innerHTML='开始比赛 <span>↗</span>';el('pause').disabled=true;el('pause').textContent='暂停';updateLock();updateUi(true);drawMap();
}
function updateLock(){const locked=raceLocked();for(const id of ['course-select','count-select','laps-select','control-select'])el(id).disabled=locked;el('start').disabled=locked;}
function setCamera(next){cameraMode=next;document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-camera')===next));controls.enabled=mode==='race'&&(next==='orbit'||next==='overview');if(next==='overview')resetView();if(next==='orbit'){camera.up.set(0,1,0);controls.target.copy(physics.cars[focus].frame.p);camera.position.copy(controls.target).add(new THREE.Vector3(1.2,1.1,1.6));controls.update();}followInitialized=false;}
function setView(next){
 if(next==='garage'&&raceLocked()){if(physics.status!=='paused')pausedFrom=physics.status;physics.status='paused';toast('比赛已暂停，可查看结构；改装将在重新准备后生效。');}
 mode=next;el('race-panel').hidden=next!=='race';el('garage-panel').hidden=next!=='garage';el('camera-tools').hidden=next!=='race';el('garage-tools').hidden=next!=='garage';el('reference-float').hidden=next!=='garage';el('map-panel').hidden=next!=='race';el('telemetry').hidden=next!=='race';el('key-hints').hidden=next!=='race';
 $('.side-panel').scrollTop=0;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-view')===next));garageControls.enabled=next==='garage';controls.enabled=next==='race'&&(cameraMode==='overview'||cameraMode==='orbit');
 if(next==='garage'){showGarage();resetGarageView();}else{if(physics.status==='ready')rebuildRace();el('scene-eyebrow').textContent='INDOOR CIRCUIT / '+String(COURSES.findIndex(c=>c.id===courseId)+1).padStart(2,'0');el('scene-title').innerHTML=`${COURSES.find(c=>c.id===courseId).name}<span>${COURSES.find(c=>c.id===courseId).en}</span>`;el('scene-note').textContent=COURSES.find(c=>c.id===courseId).note;}
 updateFleet();
}
function updateFleet(){el('fleet-cards').innerHTML=cars.map((c,i)=>`<button class="car-card ${i===selected?'selected':''}" data-car="${i}" style="--car-color:${c.accent}"><span class="car-index">${String(i+1).padStart(2,'0')}</span><img src="${thumb(c)}" alt="${safe(c.name)}模型预览"><span class="car-card-title">${safe(c.name)}<small>${safe(c.driver||'CUSTOM')}</small></span></button>`).join('');}
function showGarage(){
 if(garageModel)disposeGroup(garageModel);garageModel=createCarModel(cars[selected],{painted:true,detail:2,build:builds[cars[selected].id]});garage.add(garageModel);explodeModel(garageModel,explosion);
 const c=cars[selected];el('scene-eyebrow').textContent='CLASSIC COLLECTION / '+String(selected+1).padStart(2,'0');el('scene-title').innerHTML=`${safe(c.name)}<span>${safe(c.en)}</span>`;el('scene-note').textContent=c.description;
 el('garage-name').textContent=c.name;el('garage-en').textContent=c.en;el('car-number').textContent=String(selected+1).padStart(2,'0')+' / '+cars.length;
 el('reference-image').src=references[c.baseId||c.id];el('reference-link').href=`https://www.tamiya.com/japan/products/${c.sourceSku||c.sku}/index.html`;el('reference-version').textContent=`经典 ${c.sku} / ${c.chassis}`;
 el('adaptation-note').textContent=c.adaptation?'原版为无动力展示模型。本作保留经典车壳与透明机械舱，并适配可运行底盘与导轮。':'外形按经典原版参考重建。毫米尺度为照片比例估算，部件性能为模拟参数。';renderBuild();
}
function renderBuild(){
 const c=cars[selected],b=resolveBuild(c,builds[c.id]);
 el('build-stats').innerHTML=`<div><b>${Math.round(b.mass*1000)}</b><span>G / 整车</span></div><div><b>${(b.vFree*3.6).toFixed(1)}</b><span>KM/H / 空载</span></div><div><b>${b.tire.grip.toFixed(2)}</b><span>轮胎摩擦系数</span></div>`;
 el('parts-grid').innerHTML=Object.entries(PARTS).map(([id,p]:any)=>`<button data-part="${id}" class="${activePart===id?'active':''}"><b>${p.name}</b><small>${p.options[builds[c.id][id]]?.name||p.options[0].name}</small></button>`).join('');
 const p=PARTS[activePart];el('part-editor').innerHTML=`<div class="part-editor-title"><b>${p.name}</b><span>${p.unit}</span></div>${p.options.map((o,i)=>`<button class="part-option ${builds[c.id][activePart]===i?'chosen':''}" data-option="${i}"><span class="radio"></span><span>${o.name}</span><b>${partValue(activePart,o)}</b></button>`).join('')}<p>${partExplanation(activePart)}</p>`;
 if(highlight)disposeGroup(highlight);const part=garageModel?.userData.parts[p.part==='wheels'?'wheel-0':p.part];if(part){highlight=new THREE.BoxHelper(part,0xe78b44);highlight.material.depthTest=false;highlight.renderOrder=20;garage.add(highlight);}
}
function partValue(id,o){return id==='motor'?o.rpm.toLocaleString():id==='gear'?o.ratio+':1':id==='tire'?o.grip.toFixed(2):id==='roller'?o.drag.toFixed(3):id==='brake'?o.force.toFixed(2)+' N':id==='battery'?o.voltage.toFixed(1)+' V':o.mass+' g';}
function partExplanation(id){return {motor:'高转速提高速度上限；扭力影响出弯与爬坡。马达温度过高会降低输出。',gear:'齿比越大，爬坡扭力越强，空载极速越低。',tire:'高抓地轮胎提升牵引力，也增加滚动阻力。',roller:'导轮承受弯道侧向力。轴承减小槽壁摩擦，双层导轮提升稳定性。',brake:'刹车片在坡度急变时接触路面；手动模式可额外施加制动。',battery:'电压影响马达转速，放电与温度会逐步影响动力。',chassis:'质量与刚度共同影响加速和弯道稳定性。',body:'轻量化降低质量，导流强化增加模拟下压力。'}[id];}
function changeBuild(fn){if(raceLocked()){toast('请先重新准备比赛，再修改配置。');return;}fn(builds[cars[selected].id]);save();showGarage();toast('配置已保存');}

function drawMap(){
 const ctx=mapctx,w=440,h=300;ctx.clearRect(0,0,w,h);const sx=x=>24+(x+12)/25*(w-48),sy=z=>h-20-(z+16)/29*(h-40);
 ctx.lineWidth=6;ctx.strokeStyle='#31464e';ctx.lineJoin='round';ctx.beginPath();course.base.forEach((f,i)=>i?ctx.lineTo(sx(f.p.x),sy(f.p.z)):ctx.moveTo(sx(f.p.x),sy(f.p.z)));ctx.closePath();ctx.stroke();
 ctx.strokeStyle='#cb944f';ctx.lineWidth=3;let drawing=false;for(const f of course.base){if(f.loop){if(!drawing){ctx.beginPath();ctx.moveTo(sx(f.p.x),sy(f.p.z));drawing=true;}else ctx.lineTo(sx(f.p.x),sy(f.p.z));}else if(drawing){ctx.stroke();drawing=false;}}if(drawing)ctx.stroke();
 physics?.cars.forEach((c,i)=>{ctx.beginPath();ctx.arc(sx(c.frame.p.x),sy(c.frame.p.z),i===focus?7:4.2,0,Math.PI*2);ctx.fillStyle=i===focus?'#f6b867':c.status==='dnf'?'#a35c4b':'#e4eae5';ctx.fill();if(i===focus){ctx.strokeStyle='#172932';ctx.lineWidth=2;ctx.stroke();}});
}
function updateUi(force=false){
 if(!physics)return;const c=physics.cars[focus];
 el('speed').textContent=(c.v*3.6).toFixed(1);el('focused-name').textContent=`${String(focus+1).padStart(2,'0')} / ${c.car.name}`;el('support').textContent=Math.max(0,c.support).toFixed(2)+' G';el('support-bar').style.width=Math.min(100,Math.max(0,c.support)*35)+'%';el('support-bar').classList.toggle('low',c.support<.3);
 el('lap-label').textContent=`LAP ${Math.min(laps,c.lap+1)} / ${laps}`;el('section-label').textContent=c.status==='dnf'?c.fault:c.frame.label;
 const ms=Math.floor(physics.elapsed*1000),secs=Math.floor(ms/1000);el('timer').innerHTML=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}<span>.${String(ms%1000).padStart(3,'0')}</span>`;
 el('race-progress').textContent=physics.status.toUpperCase()+' / '+String(laneCount).padStart(2,'0');el('scene-state').textContent=mode==='garage'?'结构检视':({ready:'赛前准备',countdown:'发车倒数',running:'比赛进行中',paused:'比赛暂停',finished:'比赛结束'}[physics.status]);
 const ranks=physics.standings();el('standings').innerHTML=ranks.map((r,i)=>`<button class="standing ${r===c?'focused':''} ${r.status==='dnf'?'retired':''}" data-focus="${physics.cars.indexOf(r)}"><span class="rank">${String(i+1).padStart(2,'0')}</span><i style="background:${r.car.accent}"></i><span>${safe(r.car.name)}<small>${r.status==='dnf'?safe(r.fault):r.status==='finished'?'FINISH / '+r.finishTime.toFixed(2)+' s':`L${Math.min(laps,r.lap+1)} · ${(r.v*3.6).toFixed(1)} km/h`}</small></span><b>${r.status==='dnf'?'OUT':r.status==='finished'?'✓':Math.round((r.lap+r.s/course.lanes[r.lane].length)/laps*100)+'%'}</b></button>`).join('');
 const latest=physics.events[0];if(latest)el('event-log').innerHTML=`<span class="${latest.kind}">●</span> ${safe(latest.text)}`;
 el('countdown').hidden=physics.status!=='countdown';if(physics.status==='countdown')el('countdown').textContent=Math.ceil(physics.countdown);
 el('pause').disabled=physics.status==='ready'||physics.status==='finished';el('pause').textContent=physics.status==='paused'?'继续':'暂停';if(physics.status==='finished'){el('start').textContent='再次比赛 ↗';updateLock();}
 drawMap();
}

let audioCtx:any,osc:any,gain:any,soundOn=false;
function toggleSound(){soundOn=!soundOn;el('audio-toggle').textContent='声音 '+(soundOn?'开':'关');el('audio-toggle').setAttribute('aria-pressed',String(soundOn));if(soundOn&&!audioCtx){audioCtx=new AudioContext();osc=audioCtx.createOscillator();gain=audioCtx.createGain();osc.type='sawtooth';gain.gain.value=0;osc.connect(gain);gain.connect(audioCtx.destination);osc.start();}if(audioCtx)soundOn?audioCtx.resume():gain.gain.setTargetAtTime(0,audioCtx.currentTime,.08);}
function modal(html){el('modal-content').innerHTML=html;el('modal').showModal();}
function referenceModal(){modal(`<div class="eyebrow">VERIFIED CLASSIC REFERENCES</div><h2>八辆车，八种结构。</h2><p>以经典原版／动画常见外形为基准。点击图片打开田宫资料；照片只用于参考对照。</p><div class="reference-grid">${CARS.map(c=>`<a target="_blank" rel="noreferrer" href="https://www.tamiya.com/japan/products/${c.sourceSku||c.sku}/index.html"><img src="${references[c.id]}" alt="${c.name}经典参考"><b>${c.name}</b><span>${c.en} / ${c.sku}</span><p>${c.features.slice(0,3).join('；')}。</p></a>`).join('')}</div><small>资料：Tamiya 产品页；CoroCoro 官方模型历史照片。原版进化者、极速眼镜蛇为展示模型，本作使用比赛底盘适配。</small>`);}
function pauseRace(){if(physics.status==='running'||physics.status==='countdown'){pausedFrom=physics.status;physics.status='paused';}else if(physics.status==='paused')physics.status=pausedFrom;updateUi(true);}
el('fleet-cards').addEventListener('click',e=>{const b=e.target.closest('[data-car]');if(!b)return;selected=Number(b.dataset.car);focus=Math.max(0,physics.cars.findIndex(c=>c.car.id===cars[selected].id));followInitialized=false;updateFleet();if(mode==='garage')showGarage();else if(!raceLocked())rebuildRace();else toast(`正在跟随 ${physics.cars[focus].car.name}`);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.getAttribute('data-view'))));el('back-race').onclick=()=>setView('race');
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>setCamera(b.getAttribute('data-camera'))));
el('follow-distance').oninput=e=>followDistance=Number(e.target.value)/100;
el('start').onclick=()=>{if(physics.status==='finished')rebuildRace();if(physics.status==='ready'){physics.start();setCamera('chase');updateLock();}};
el('reset').onclick=()=>{rebuildRace();toast('已重新准备，配置现在可以修改。');};el('pause').onclick=pauseRace;
el('time-scale').onclick=()=>{timeScale=timeScale===1?2:1;el('time-scale').textContent=timeScale+'× 速度';};el('audio-toggle').onclick=toggleSound;
el('course-select').onchange=e=>{courseId=e.target.value;rebuildRace(true);resetView();setView('race');};
el('count-select').onchange=e=>{laneCount=Number(e.target.value);rebuildRace(true);};el('laps-select').onchange=e=>{laps=Number(e.target.value);rebuildRace();};
el('venue-select').onchange=e=>{venue=e.target.value;if(room)disposeGroup(room);room=buildRoom(scene,venue);};
el('control-select').onchange=e=>{manual=e.target.value==='manual';el('setup-note').textContent=manual?'手动调速为架空改装：按住 W / ↑ 加电，S / ↓ 制动。方向仍由导槽决定。':'导轮沿槽壁行驶，每圈经过机械换道桥。八圈走遍全部车道。';el('key-hints').innerHTML=manual?'<kbd>W / ↑</kbd> 加电 <kbd>S / ↓</kbd> 制动 <kbd>SPACE</kbd> 暂停':'<kbd>1–8</kbd> 跟随赛车 <kbd>V</kbd> 切换视角 <kbd>SPACE</kbd> 暂停';rebuildRace();};
el('parts-grid').onclick=e=>{const b=e.target.closest('[data-part]');if(b){activePart=b.dataset.part;renderBuild();}};
el('part-editor').onclick=e=>{const b=e.target.closest('[data-option]');if(b)changeBuild(build=>build[activePart]=Number(b.dataset.option));};
el('stable-build').onclick=()=>changeBuild(build=>Object.assign(build,recommendedBuild()));el('stock-build').onclick=()=>changeBuild(build=>Object.assign(build,standardBuild()));
el('explode').oninput=e=>{explosion=Number(e.target.value);explodeModel(garageModel,explosion);if(highlight)highlight.update();garageControls.target.y=.025+explosion*.022;};
el('explode-toggle').onclick=()=>{explosion=explosion>.1?0:1;el('explode').value=String(explosion);el('explode-toggle').textContent=explosion?'收起结构':'展开结构';explodeModel(garageModel,explosion);if(highlight)highlight.update();};el('garage-reset').onclick=resetGarageView;
el('reference-open').onclick=referenceModal;el('compare-open').onclick=()=>{const c=cars[selected];modal(`<div class="eyebrow">CLASSIC / ${safe(c.sku)}</div><h2>${safe(c.name)} · 参考对照</h2><div class="compare-images"><figure><img src="${references[c.baseId||c.id]}" alt="官方经典参考"><figcaption>田宫经典原版参考</figcaption></figure><figure><img src="${thumb(c)}" alt="模拟器模型"><figcaption>本作程序模型 · 局部细节近似</figcaption></figure></div><p>${c.features.map(safe).join('；')}。</p><p>${c.adaptation?'原版展示车的导轮与动力底盘为本作适配。':'原版车壳的隐蔽底面与内部固定结构根据装配关系推断。'}</p>`);};
el('modal-close').onclick=()=>el('modal').close();el('modal').addEventListener('click',e=>{if(e.target===el('modal'))el('modal').close();});
el('standings').onclick=e=>{const b=e.target.closest('[data-focus]');if(b){focus=Number(b.dataset.focus);selected=cars.findIndex(c=>c.id===physics.cars[focus].car.id);followInitialized=false;updateFleet();}};
el('rules-open').onclick=()=>modal(`<div class="eyebrow">RACING NOTES</div><h2>让赛车自己跑起来。</h2><div class="rules-columns"><div><h3>自动四驱</h3><p>马达持续供电，四轮传动。导轮与槽壁决定路线，赛车不会自由转向。每圈通过实体换道桥前进一个车道，八圈遍历全部路线。</p><h3>360° 环道</h3><p>路面支撑力取决于速度、曲率和重力方向。环道顶部速度不足时支撑力会降到零，赛车会脱离路面并落下。普通弯道过快也可能侧翻。</p></div><div><h3>手动调速</h3><p>这是架空的可控马达改装模式。W / ↑ 加电，S / ↓ 制动；松开按键会滑行。它不代表真实迷你四驱车自带遥控功能。</p><h3>改装与镜头</h3><p>在工房展开车体，点击部件替换。比赛期间配置锁定。1–8 切换跟随对象，V 切换镜头，空格暂停；贴身镜头会随车翻转穿过环道。</p></div></div><p class="fine-print">这是有重力、牵引力、马达负载、导轮损耗、接地判定和离轨弹道的简化比赛模型；未模拟柔性车壳、全轮胎接触与高精度碰撞。</p>`);
el('add-car').onclick=()=>{if(raceLocked()){toast('重新准备比赛后可以拓展赛车。');return;}const c=cars[selected];modal(`<div class="eyebrow">CUSTOM MACHINE</div><h2>拓展你的赛车</h2><p>以 ${safe(c.name)} 的车壳结构为基础，保存独立的名称、颜色与改装配置。</p><form id="custom-form"><label class="field">赛车名称<input name="name" maxlength="18" value="${safe(c.name)} · 改" required></label><label class="field">车壳颜色<input name="color" type="color" value="${c.body}"></label><button class="primary" type="submit">加入车库</button></form>`);el('custom-form').onsubmit=e=>{e.preventDefault();if(cars.length>=20){toast('车库最多保存 12 辆拓展车');return;}const data=new FormData(e.target),id='custom-'+Date.now();const added={...c,id,baseId:c.baseId||c.id,name:String(data.get('name')).trim().slice(0,18),customColor:String(data.get('color')),en:'CUSTOM / '+c.en,driver:'CUSTOM'};cars.push(added);builds[id]={...builds[c.id]};selected=cars.length-1;save();el('modal').close();showGarage();updateFleet();};};
el('export-build').onclick=()=>{const c=cars[selected],blob=new Blob([JSON.stringify({schema:'astra-mini4wd/1',baseId:c.baseId||c.id,name:c.name,color:c.customColor||c.body,build:builds[c.id]},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='astra-'+c.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};
el('import-build').onclick=()=>{if(raceLocked())return toast('比赛结束或重新准备后可以导入。');el('import-file').click();};
el('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000)throw Error('文件过大');const d=JSON.parse(await file.text()),base=CARS.find(c=>c.id===d.baseId);if(d.schema!=='astra-mini4wd/1'||!base||typeof d.name!=='string'||!/^#[0-9a-f]{6}$/i.test(d.color))throw Error('配置格式不正确');const build={};for(const [key,p] of Object.entries(PARTS) as any){if(!Number.isInteger(d.build?.[key])||!p.options[d.build[key]])throw Error('部件选项无效');build[key]=d.build[key];}if(cars.length>=20)throw Error('车库已满');const id='custom-'+Date.now();cars.push({...base,id,baseId:base.id,name:d.name.slice(0,18),customColor:d.color,en:'CUSTOM / '+base.en,driver:'CUSTOM'});builds[id]=build;selected=cars.length-1;save();showGarage();updateFleet();toast('已导入独立赛车');}catch(error){toast('无法导入：'+error.message);}e.target.value='';};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement).tagName)||el('modal').open)return;keys.add(e.code);if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Space')pauseRace();if(e.code==='KeyV'){const modes=['chase','nose','overview','orbit'];setCamera(modes[(modes.indexOf(cameraMode)+1)%modes.length]);}if(/^Digit[1-8]$/.test(e.code)){focus=Math.min(laneCount-1,Number(e.code.slice(5))-1);followInitialized=false;}if(e.code==='KeyR')rebuildRace();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
let down:any;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(mode!=='garage'||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);raycaster.setFromCamera(mouse,garageCamera);const hit=raycaster.intersectObject(garageModel,true).find(h=>h.object.userData.part);if(hit){const id=hit.object.userData.part,match=Object.entries(PARTS).find(([key,p]:any)=>p.part===id||(p.part==='wheels'&&id.startsWith('wheel')));if(match){activePart=match[0];renderBuild();toast('已选择 '+PARTS[activePart].name);}else toast('结构：'+({wing:'尾翼',canopy:'座舱'}[id]||id));}});

room=buildRoom(scene,venue);rebuildRace(true);resetView();updateFleet();resize();
function animate(){
 const dt=Math.min(.05,clock.getDelta());if(mode==='race')physics.update(dt*timeScale,{throttle:keys.has('KeyW')||keys.has('ArrowUp')?1:0,brake:keys.has('KeyS')||keys.has('ArrowDown')?1:0});
 physics.cars.forEach((c,i)=>{const model=raceModels[i];model.position.copy(c.frame.p);model.quaternion.copy(c.frame.q);if(c.status==='dnf')model.rotateZ(c.spin);for(const w of model.userData.wheels)w.rotation.x+=c.v*dt*timeScale/.013;});
 if(mode==='race'){
   if(cameraMode==='chase'||cameraMode==='nose'){
     const c=physics.cars[focus],q=c.frame.q;if(!followInitialized){followRotation.copy(q);followInitialized=true;}else followRotation.slerp(q,1-Math.exp(-26*dt));
     const offset=cameraMode==='nose'?new THREE.Vector3(0,.028,.05):new THREE.Vector3(.035,followDistance*.4,-followDistance);
     camera.position.copy(c.frame.p).add(offset.applyQuaternion(followRotation));camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(followRotation));
     camera.lookAt(c.frame.p.clone().add(new THREE.Vector3(0,.012,cameraMode==='nose'?.6:.12).applyQuaternion(followRotation)));camera.fov=cameraMode==='nose'?72:56;camera.updateProjectionMatrix();
   }else controls.update();renderer.render(scene,camera);
 }else{garageControls.update();if(highlight)highlight.update();renderer.render(garage,garageCamera);}
 accumFps+=dt;frameCount++;lastUi+=dt;if(accumFps>1){fps=frameCount/accumFps;el('fps').textContent=Math.round(fps)+' FPS';accumFps=0;frameCount=0;}if(lastUi>.1){updateUi();lastUi=0;}
 if(soundOn&&audioCtx){const c=physics.cars[focus];osc.frequency.setTargetAtTime(80+c.v*52,audioCtx.currentTime,.05);gain.gain.setTargetAtTime(physics.status==='running'?.008+Math.min(c.v/10,.01):0,audioCtx.currentTime,.1);}
 requestAnimationFrame(animate);
}
animate();
(window as any).astra={get course(){return course},get race(){return physics},get models(){return raceModels},get garageModel(){return garageModel},get camera(){return mode==='race'?camera:garageCamera},get renderer(){return renderer},get state(){return {mode,cameraMode,selected,focus,courseId,laneCount,laps,manual,explosion,builds,fps}},setView,setCamera,rebuildRace,select:(i)=>{selected=i;focus=Math.min(i,laneCount-1);if(mode==='garage')showGarage();updateFleet();},seek:(s)=>{physics.cars[focus].s=s;physics.cars[focus].frame=course.sample(physics.cars[focus].lane,s);followInitialized=false;},step:(seconds)=>{for(let s=0;s<seconds;s+=1/120)physics.update(1/120,{throttle:1,brake:0});updateUi(true);},ready:true};
