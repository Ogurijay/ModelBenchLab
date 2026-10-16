import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as coords from './world/coords.js';
import { kit, materials, material, batch } from './world/kit.js';
import { buildTerrain, buildLandscape, buildRailway } from './world/terrain.js';
import { buildSky } from './world/sky.js';
import { build as asiaEurope } from './world/continents/asia-europe.js';
import { build as americas } from './world/continents/americas.js';
import { build as africaOceania,buildPolarLandscape } from './world/continents/africa-oceania.js';

const $=id=>document.getElementById(id);
const {layout,landmarks,byId,GROUND_Y,groundHeight,nearestWalkable,moveWalker,zoneAt}=coords;
const state={mode:'overview',night:false,selected:null,zone:null,time:0,captureMode:false,ready:false,frames:[],errors:[]};
window.addEventListener('error',e=>state.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason)));

async function start() {
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  $('scene').appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#dce7dc');scene.fog=new THREE.Fog('#dce7dc',650,1450);
  function responsiveFov(base){return THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(base)/2)*Math.max(1,1.38/(innerWidth/innerHeight))));}
  const camera=new THREE.PerspectiveCamera(responsiveFov(42),innerWidth/innerHeight,.15,2500);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=12;controls.maxDistance=2200;controls.maxPolarAngle=Math.PI*.48;
  function overviewPosition(){return [215,285,385];}
  controls.target.set(0,0,0);camera.position.set(...overviewPosition());controls.update();
  const hemi=new THREE.HemisphereLight('#cadff0','#9a9d67',1.8);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffd49a',3.8);sun.position.set(-180,135,100);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-290,right:290,top:250,bottom:-250,near:1,far:750});
  sun.shadow.mapSize.set(4096,4096);sun.shadow.bias=-.00015;sun.shadow.normalBias=.12;scene.add(sun,sun.target);
  const sky=buildSky(scene,sun);
  const terrain=buildTerrain(scene);
  function renderScene(){terrain.pool.visible=camera.position.distanceTo(terrain.pool.position)<135;renderer.render(scene,camera);}
  const ctx={THREE,kit,materials,coords};
  const models=[];
  for(const l of landmarks) {
    const build=['07','08','09','13','14','15'].includes(l.id)?asiaEurope:Number(l.id)<=6?americas:africaOceania;
    const raw=build(ctx,l);if(!raw)throw new Error(`地标 ${l.id} 未生成`);
    const model=batch(raw);model.name=l.name;model.position.set(l.x,GROUND_Y,l.z);model.userData={...raw.userData,landmarkId:l.id,grounded:true};
    model.traverse(m=>{if(m.isMesh)m.userData.landmarkId=l.id;});scene.add(model);models.push(model);
  }
  const landscape=buildLandscape(scene), railway=buildRailway(scene);
  const polarRaw=buildPolarLandscape(ctx);coords.addObstacles(polarRaw.userData.obstacles||[]);
  const polar=batch(polarRaw);polar.position.y=GROUND_Y;scene.add(polar);
  const fillLights=[];
  for(const id of ['07','14','16','01']) {
    const l=byId[id],light=new THREE.PointLight('#ffd6a1',0,75,2);light.position.set(l.x,l.height*.8,l.z+6);scene.add(light);fillLights.push(light);
  }
  const labelElements=layout.zones.map(zone=>{
    const el=document.createElement('span');el.className='continent-label';el.textContent=zone.name;$('world-labels').appendChild(el);return {zone,el};
  });
  const summaries={
    'north-america':'从自由女神的港湾出发，跨过红色悬索桥，走近层层叠起的玛雅金字塔。',
    'south-america':'沿山脊探访石城遗址，在张开的双臂下远眺，再听见峡谷里的瀑布。',
    europe:'钢铁格构、古老拱券与河上双塔，在一片修剪整齐的花园里相遇。',
    africa:'暖色沙地、雪顶高峰与平展的山脊，让广阔非洲浓缩为三种轮廓。',
    asia:'长城沿山脊延展，白色穹顶映入水池，吴哥塔群隐在绿意之间。',
    oceania:'从海港的白色贝壳，到内陆红岩，再到天空中的细长观景塔。',
    antarctica:'留一段安静给世界的南端：冰架、浮冰、企鹅，以及一座小小的科考站。'
  };
  const descriptions={
    '01':'举起的火炬、七道冠芒与铜绿色长袍，构成纽约港湾的熟悉轮廓。',
    '02':'红色双塔、弯曲主缆与细密吊索，在园区内浓缩出一段海湾风景。',
    '03':'四面阶梯汇向顶部神庙，层层台基呈现玛雅建筑的几何秩序。',
    '04':'张开的双臂立在岩山之上，山脚步道留出仰望雕像的空间。',
    '05':'石墙与梯田沿山势层层展开，微缩表现安第斯山地遗址的空间关系。',
    '06':'弧形峡谷与多段落水组成瀑布景观，可从外围步道观察。',
    '07':'四条塔腿、交叉格构和三层平台，保留铁塔轻盈而稳定的结构特征。',
    '08':'环形拱廊围绕开放内场，局部缺损外墙呈现古罗马遗址的轮廓。',
    '09':'双塔、上层连廊与桥面组成伦敦塔桥的标志性结构。',
    '10':'金字塔群与狮身人面像安放在暖色沙地上，沿外围步道寻找不同视角。',
    '11':'从草原基部到宽阔雪顶，以分层山体表现高峰的形态。',
    '12':'平坦山顶与近乎竖直的岩壁，是这片园区最清晰的一条水平线。',
    '13':'城墙、垛口与敌楼顺应山脊延伸，保留连续的起伏轮廓。',
    '14':'中央洋葱穹顶与四座独立宣礼塔，沿长水池展开对称的庭院轴线。',
    '15':'层叠台基、回廊与莲花形塔群，共同勾勒吴哥窟的建筑形象。',
    '16':'白色贝壳状屋顶落在滨水平台上，从海湾方向能读出屋顶的层次。',
    '17':'圆润的红砂岩体与纵向风化纹，在开阔地面上形成独立的自然地标。',
    '18':'纤细塔身、观景圆环与针状塔尖，共同构成奥克兰的天际线标记。',
    A:'冰架的层理与蓝色裂隙，构成极地步道旁的白色崖壁。',B:'带着水线的多面冰山漂在海湾里，悬浮是这组景观的有意设计。',C:'企鹅栖息地与一座通用设计的科考站，共同构成极地游览节点。'
  };

  let transition=null,tourDistance=0,toastTimer,down=null,walkYaw=0,walkPitch=0,last=performance.now(),frameCounter=0,fpsTime=0;
  const walker=new THREE.Vector3(...[layout.entrance[0],3.05,layout.entrance[1]]);
  const keys=new Set();
  const nav=$('continent-nav');
  layout.zones.forEach((zone,i)=>{
    const btn=document.createElement('button');btn.dataset.zone=zone.id;btn.innerHTML=`<span>0${i+1}</span><span>${zone.name}</span>`;btn.onclick=()=>focusZone(zone.id);nav.appendChild(btn);
  });
  const svgNS='http://www.w3.org/2000/svg';
  function svgEl(tag,attrs){const el=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
  layout.zones.forEach(zone=>{
    const polygon=svgEl('polygon',{points:zone.polygon.map(p=>p.join(',')).join(' '),fill:zone.color,stroke:'#779586','stroke-width':1.2,'data-zone':zone.id,tabindex:0,role:'button','aria-label':zone.name});
    polygon.style.cursor='pointer';polygon.onclick=()=>focusZone(zone.id);polygon.onkeydown=e=>{if(e.key==='Enter')focusZone(zone.id);};$('minimap').appendChild(polygon);
  });
  for(const l of landmarks) $('minimap').appendChild(svgEl('circle',{cx:l.x,cy:l.z,r:2,fill:'#496c5b','pointer-events':'none'}));
  const mapDot=svgEl('circle',{cx:0,cy:0,r:5,fill:'#b56b43',stroke:'#fff','stroke-width':1.8,'pointer-events':'none'});$('minimap').appendChild(mapDot);

  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
  function activeMode(mode) {
    state.mode=mode;controls.enabled=mode==='overview';document.body.classList.toggle('walking',mode==='walk'||mode==='tour');$('crosshair').hidden=mode!=='walk';
    for(const [id,value]of [['overview','overview'],['walk','walk'],['tour','tour']])$(id).classList.toggle('active',mode===value);
    $('controls-hint').textContent=mode==='overview'?'拖动旋转 · 滚轮缩放 · 右键平移':mode==='walk'?'WASD 移动 · 拖动转头 · Shift 加速 · Esc 释放鼠标':'沿步道慢慢游览 · Esc 停止';
    if(mode!=='walk'&&document.pointerLockElement)document.exitPointerLock();
  }
  function animateTo(pos,target,fov=42){state.captureMode=false;activeMode('overview');transition={from:camera.position.clone(),to:new THREE.Vector3(...pos),targetFrom:controls.target.clone(),targetTo:new THREE.Vector3(...target),start:performance.now(),fovFrom:camera.fov,fov:responsiveFov(fov)};}
  function overview(){state.selected=null;state.zone=null;animateTo(overviewPosition(),[0,0,0]);updateDetail();}
  function focusZone(id) {
    const zone=layout.zones.find(z=>z.id===id);state.zone=id;state.selected=null;
    const xs=zone.polygon.map(p=>p[0]),zs=zone.polygon.map(p=>p[1]);const x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
    animateTo([x+65,115,z+150],[x,6,z]);updateDetail();
  }
  function focusLandmark(id) {
    const l=byId[id];if(!l)return;state.selected=id;state.zone=l.zone;
    const dist=Math.max(l.width,l.depth,l.height)*1.55;
    animateTo([l.x+dist*.48,l.height*.74+dist*.48,l.z+dist],[l.x,l.height*.36,l.z],40);updateDetail();
  }
  function updateDetail() {
    document.body.classList.toggle('inspecting',Boolean(state.zone));
    const zone=layout.zones.find(z=>z.id===state.zone),l=byId[state.selected];
    $('detail-panel').hidden=false;
    $('detail-kicker').textContent=l?`${l.id} / ${l.zoneName}`:zone?zone.english:'YOUR WORLD GUIDE';
    $('detail-title').textContent=l?l.name:zone?`${zone.name} · 微缩花园`:'七洲之间，自在漫游';
    $('detail-copy').textContent=l?descriptions[l.id]:zone?summaries[zone.id]:'旋转沙盘发现世界，选择一个大洲，或沿着滨水步道亲自走一程。';
    $('landmark-list').replaceChildren();
    const entries=zone?landmarks.filter(l=>l.zone===zone.id):['13','07','16'].map(id=>byId[id]);
    for(const item of entries) {const btn=document.createElement('button');btn.dataset.landmark=item.id;btn.innerHTML=`<span>${item.id}</span><span>${item.name}</span><span>↗</span>`;btn.onclick=()=>focusLandmark(item.id);$('landmark-list').appendChild(btn);}
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.zone===state.zone));
    $('minimap').querySelectorAll('polygon').forEach(p=>p.setAttribute('stroke-width',p.dataset.zone===state.zone?3.5:1.2));
  }
  function startWalk() {
    transition=null;state.captureMode=false;
    const l=byId[state.selected],z=layout.zones.find(z=>z.id===state.zone);
    const p=l?l.id==='09'?nearestWalkable(l.x-l.width/2-5,l.z):nearestWalkable(l.x,l.z+l.depth/2+4):z?nearestWalkable(z.label[0],z.label[1]+12):{x:layout.entrance[0],y:coords.ROAD_Y+1.7,z:layout.entrance[1]};
    walker.set(p.x,p.y,p.z);walkYaw=l?Math.atan2(p.x-l.x,p.z-l.z):0;walkPitch=l?.12:-.04;camera.fov=68;camera.updateProjectionMatrix();activeMode('walk');toast('WASD 行走，拖动转头；点击画面可锁定鼠标');
  }
  // Walking tour uses the same polyline as the visible main path, never a spline that cuts corners.
  const tourSegments=layout.mainRoute.slice(1).map((b,i)=>({a:layout.mainRoute[i],b,length:Math.hypot(b[0]-layout.mainRoute[i][0],b[1]-layout.mainRoute[i][1])}));
  const tourLength=tourSegments.reduce((s,v)=>s+v.length,0);
  function routeAt(dist){let d=((dist%tourLength)+tourLength)%tourLength;for(const s of tourSegments){if(d<=s.length){const t=d/s.length;return new THREE.Vector3(s.a[0]+(s.b[0]-s.a[0])*t,coords.ROAD_Y+1.7,s.a[1]+(s.b[1]-s.a[1])*t);}d-=s.length;}return new THREE.Vector3();}
  function toggleTour(){if(state.mode==='tour'){overview();return;}state.captureMode=false;transition=null;tourDistance=0;camera.fov=64;camera.updateProjectionMatrix();activeMode('tour');toast('已开启步道导览，按 Esc 返回全园');}
  function setNight(night) {
    state.night=night;document.body.classList.toggle('night',night);
    sky.setNight(night);
    scene.background.set(night?'#193b45':'#dce7dc');scene.fog.color.copy(scene.background);
    hemi.color.set(night?'#8caac8':'#cadff0');hemi.intensity=night?1.65:1.8;
    sun.color.set(night?'#a1b5e0':'#ffd49a');sun.intensity=night?1.3:3.8;renderer.toneMappingExposure=night?1.15:1.13;
    fillLights.forEach(l=>l.intensity=night?110:0);landscape.lampsGlow.forEach(m=>m.emissiveIntensity=night?3.7:0);
    terrain.sea.material.uniforms.color.value.set(night?'#102e3b':'#0e6470');
    terrain.sea.material.uniforms.farColor.value.set(night?'#34525a':'#f4dcb6');
    $('daytime').innerHTML=night?'☾ <span>蓝调夜游</span>':'☀ <span>金色时刻</span>';
    renderer.shadowMap.needsUpdate=true;
  }
  $('overview').onclick=overview;$('walk').onclick=startWalk;$('tour').onclick=toggleTour;$('daytime').onclick=()=>setNight(!state.night);
  $('detail-close').onclick=()=>{$('detail-panel').hidden=true;};
  $('help-toggle').onclick=()=>$('help').showModal();$('help-close').onclick=()=>$('help').close();
  let photoUrl=null;
  $('photo').onclick=()=>{
    renderScene();
    renderer.domElement.toBlob(blob=>{
      if(!blob){toast('画面生成失败，请重试');return;}
      if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(blob);
      $('photo-preview').src=photoUrl;$('photo-save').href=photoUrl;$('photo-save').download=`世界一隅-${state.selected||state.zone||'全园'}.png`;
      $('photo-size').textContent=`${renderer.domElement.width} × ${renderer.domElement.height} · PNG`;
      window.__bench.lastPhoto={width:renderer.domElement.width,height:renderer.domElement.height,bytes:blob.size};
      $('photo-dialog').showModal();
    },'image/png');
  };
  $('photo-close').onclick=()=>$('photo-dialog').close();
  document.addEventListener('keydown',e=>{
    if($('help').open||$('photo-dialog').open)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.code==='KeyP')document.body.classList.toggle('photo-mode');if(e.code==='Escape'&&state.mode==='tour')overview();
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};});
  window.addEventListener('pointermove',e=>{
    if(state.mode!=='walk'||state.captureMode)return;
    if(document.pointerLockElement===renderer.domElement){walkYaw-=e.movementX*.002;walkPitch=THREE.MathUtils.clamp(walkPitch-e.movementY*.002,-1.2,1.2);}
    else if(down&&e.buttons){walkYaw-=(e.clientX-down.lastX)*.004;walkPitch=THREE.MathUtils.clamp(walkPitch-(e.clientY-down.lastY)*.004,-1.2,1.2);down.lastX=e.clientX;down.lastY=e.clientY;}
  });
  const raycaster=new THREE.Raycaster();
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>5)return;
    if(state.mode==='walk'){try{renderer.domElement.requestPointerLock?.()?.catch(()=>toast('可按住鼠标拖动转头'));}catch{toast('可按住鼠标拖动转头');}return;}
    if(state.mode==='tour')return;
    raycaster.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);
    const hit=raycaster.intersectObjects(models,true)[0];if(hit)focusLandmark(hit.object.userData.landmarkId);
  });
  window.addEventListener('pointerup',()=>{down=null;});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

  const viewDefs={overview:{pos:[215,285,385],target:[0,0,0],fov:42},closeup:{pos:[135,27,5],target:[110,11,-44],fov:45},asia:{pos:[145,57,32],target:[135,9,-60],fov:49},low:{pos:[110,3.1,-5],target:[110,6,-44],fov:55}};
  function setView(name){const view=viewDefs[name];if(!view)throw new Error(`Unknown view ${name}`);transition=null;activeMode('overview');state.captureMode=true;camera.position.set(...view.pos);controls.target.set(...view.target);camera.fov=view.fov;camera.updateProjectionMatrix();controls.update();renderScene();return true;}
  function grounding(){scene.updateMatrixWorld(true);return models.map(m=>{const b=new THREE.Box3().setFromObject(m),gap=b.min.y-GROUND_Y;return {id:m.userData.landmarkId,name:m.name,gap:Number(gap.toFixed(3)),intentionalFloating:Boolean(m.userData.intentionalFloating),ok:gap>=-.12&&gap<.6||Boolean(m.userData.intentionalFloating)};});}
  function getInfo(){return {ready:state.ready,revision:THREE.REVISION,mode:state.mode,night:state.night,selected:state.selected,zone:state.zone,continents:layout.zones.length,landmarks:models.length-3,polarExperiences:3,trees:landscape.trees,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:state.frames.length?Math.round(1000/(state.frames.reduce((a,b)=>a+b,0)/state.frames.length)):null,viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio(),camera:camera.position.toArray(),walker:walker.toArray(),errors:[...state.errors]};}
  window.__scene={get ready(){return state.ready;},get captureMode(){return state.captureMode;},setView,setWireframe(value){scene.traverse(m=>{if(m.isMesh){for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.wireframe=value;}});renderScene();},setUI(value){document.body.classList.toggle('photo-mode',!value);},renderNow(){renderScene();},checkGrounding:grounding,getInfo};
  window.__bench={...window.__scene,getInfo,setView,focusZone,focusLandmark,startWalk,setNight,toggleTour,walkable:coords.walkable,moveWalker:coords.moveWalker,teleport(x,z){const p=nearestWalkable(x,z);walker.set(p.x,p.y,p.z);return walker.toArray();},testStep(dx,dz){const p=moveWalker(walker,dx,dz);walker.set(p.x,p.y,p.z);return walker.toArray();},getLandmarks:()=>landmarks.map(l=>({...l})),getPaths:()=>coords.paths,getGrounding:grounding,scene,camera,renderer};
  Object.defineProperty(window.__bench,'ready',{get:()=>state.ready,configurable:true});
  if(new URLSearchParams(location.search).has('debug')) {
    const panel=document.createElement('div');panel.className='ui';panel.style.cssText='position:absolute;left:250px;top:90px;padding:15px;background:#f8f7ee;z-index:9;font-size:11px';
    panel.innerHTML='<label>曝光 <input id="exposure" type="range" min="0.5" max="2" step="0.01" value="1.13"></label><br><label>太阳强度 <input id="sunlight" type="range" min="0" max="6" step="0.1" value="3.4"></label><br><button id="copy-settings">复制设置</button>';
    document.body.appendChild(panel);$('exposure').oninput=e=>renderer.toneMappingExposure=Number(e.target.value);$('sunlight').oninput=e=>sun.intensity=Number(e.target.value);$('copy-settings').onclick=()=>navigator.clipboard.writeText(JSON.stringify({exposure:renderer.toneMappingExposure,sunIntensity:sun.intensity,sunPosition:sun.position.toArray()}));
  }
  function frame(now) {
    const elapsed=Math.max(.01,now-last),dt=Math.min(elapsed/1000,.05);last=now;state.time+=dt;state.frames.push(elapsed);if(state.frames.length>180)state.frames.shift();
    if(!state.captureMode) {
      if(transition){const t=Math.min((now-transition.start)/1400,1),e=1-Math.pow(1-t,3);camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,e);camera.fov=THREE.MathUtils.lerp(transition.fovFrom,transition.fov,e);camera.updateProjectionMatrix();if(t===1)transition=null;}
      if(state.mode==='overview')controls.update();
      if(state.mode==='walk') {
        let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
        const length=Math.hypot(forward,side)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?11:5)*dt/length;
        const p=moveWalker(walker,(-Math.sin(walkYaw)*forward+Math.cos(walkYaw)*side)*speed,(-Math.cos(walkYaw)*forward-Math.sin(walkYaw)*side)*speed);
        walker.set(p.x,p.y,p.z);camera.position.copy(walker);camera.rotation.set(walkPitch,walkYaw,0,'YXZ');
      }
      if(state.mode==='tour'){tourDistance+=dt*5;camera.position.copy(routeAt(tourDistance));const target=routeAt(tourDistance+12);target.y+=.6;camera.lookAt(target);}
    }
    railway.update(state.time);terrain.waves.position.x=Math.sin(state.time*.07)*1.5;terrain.sea.material.uniforms.time.value=state.time;
    labelElements.forEach(({zone,el})=>{const v=new THREE.Vector3(zone.label[0],6,zone.label[1]).project(camera);el.style.left=`${(v.x+1)/2*innerWidth}px`;el.style.top=`${(1-v.y)/2*innerHeight}px`;el.style.opacity=state.mode==='overview'&&v.z<1&&camera.position.y>65?'1':'0';});
    const point=state.mode==='walk'?walker:state.mode==='tour'?camera.position:controls.target;mapDot.setAttribute('cx',point.x);mapDot.setAttribute('cy',point.z);
    const zone=zoneAt(point.x,point.z);$('location-label').textContent=state.selected?byId[state.selected].name:zone?.name||'全园总览';
    renderScene();
    frameCounter++;fpsTime+=elapsed/1000;if(fpsTime>=1){$('fps').textContent=`${Math.round(frameCounter/fpsTime)} FPS`;frameCounter=0;fpsTime=0;}
    requestAnimationFrame(frame);
  }
  updateDetail();renderScene();renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;state.ready=true;
  requestAnimationFrame(frame);
}
start().catch(error=>{state.errors.push(error.message);$('fatal').hidden=false;$('fatal').textContent=`场景启动遇到问题：${error.message}。请使用支持 WebGL 2 的浏览器，并检查控制台。`;console.error(error);});
