import './style.css';
import { CARS, PARTS, STAT_NAMES, VENUES, TRACKS, getStats, defaultBuild, normalizeBuild, getSetup, inspectCar, validateCustomCar } from './data.js';
import { Race } from './race.js';
import { Track } from './track.js';
import { View } from './view.js';

const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',tool:'<path d="m14 6 4 4 3-3a7 7 0 0 1-9 9l-6 6-4-4 6-6a7 7 0 0 1 9-9z"/>',car:'<path d="m5 7 2-4h10l2 4 2 3v7H3v-7zm-2 6h18M7 10h1m8 0h1M5 17v3m14-3v3"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',room:'<path d="M3 21V7l9-4 9 4v14H3zm9-18v18m-9-8 9 3 9-3"/>',layers:'<path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 17l10 5 10-5"/>',pause:'<path d="M8 4v16M16 4v16"/>',reset:'<path d="M4 9a8 8 0 1 1 0 8M4 3v6h6"/>',sound:'<path d="m3 9 5 0 5-5v16l-5-5H3zm14-2c4 3 4 7 0 10m3-13c6 5 6 11 0 16"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3l-1 2m0 3h.01"/>',plus:'<path d="M12 4v16M4 12h16"/>',close:'<path d="m5 5 14 14M5 19 19 5"/>',save:'<path d="M4 3h13l4 4v14H3V3zm3 0v6h9V3M7 21v-7h10v7"/>',eye:'<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',bolt:'<path d="M14 2 4 14h8l-2 8 10-12h-8z"/>',cup:'<path d="M7 3h10v6a5 5 0 0 1-10 0zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v6m-5 1h10"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',check:'<path d="m4 12 5 5L20 6"/>'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.car}</svg>`;
const STORAGE='mini4wd-club-v2';let storageIssue=false,saved={};
try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};if(!localStorage.getItem(STORAGE)){const legacy=JSON.parse(localStorage.getItem('mini4wd-club-v1')||'{}');saved={custom:legacy.custom,selected:legacy.selected};}}catch{storageIssue=true;}
let custom=[];
if(Array.isArray(saved.custom))for(const raw of saved.custom.slice(0,16)){try{const car=validateCustomCar(raw,custom);if(/^custom-[\w-]{1,80}$/.test(raw.id))car.id=raw.id;if(!custom.some(c=>c.id===car.id))custom.push(car);}catch{/* Invalid records are ignored, not executed. */}}
let cars=[...CARS,...custom],builds={};for(const car of cars)builds[car.id]=normalizeBuild(saved.builds?.[car.id]);
let selected=cars.some(c=>c.id===saved.selected)?saved.selected:'cyclone',venue=VENUES.find(v=>v.id===saved.venue)||VENUES[0],trackDef=TRACKS.find(t=>t.id===saved.track)||TRACKS[0];
let laneCount=[3,5,8].includes(saved.laneCount)?saved.laneCount:8;let count=Number.isInteger(saved.count)&&saved.count>=1&&saved.count<=laneCount?saved.count:laneCount,laps=[1,2,3].includes(saved.laps)?saved.laps:1,mode='auto',page='race',slot='motor',race,view,thumbnails={},lastUI=0,resultShown=false,sound=false;
let records=Array.isArray(saved.records)?saved.records.filter(r=>r&&typeof r.track==='string'&&Number.isFinite(r.time)&&r.time>0).slice(0,20):[];
const input={throttle:false,brake:false,boost:false};
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({custom,builds,selected,venue:venue.id,track:trackDef.id,count,laps,laneCount,records}));}catch{storageIssue=true;toast('浏览器未允许本地存档；本次仍可正常比赛。');}}
function car(){return cars.find(c=>c.id===selected);}
function formatTime(n){return n==null?'—':`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(2).padStart(5,'0')}`;}
function statsHTML(stats,delta){return `<div class="stats">${stats.map((v,i)=>`<div class="stat"><span>${STAT_NAMES[i]}</span><div class="stat-track"><i style="width:${v/125*100}%"></i></div><b>${v}</b>${delta?`<small class="${delta[i]<0?'negative':'positive'}">${delta[i]>0?'+':''}${delta[i]||'—'}</small>`:''}</div>`).join('')}</div>`;}
function setupHTML(c=car()){const p=getSetup(c,builds[c.id]);return '<div class="setup-values"><span>空载估算极速<b>'+ (p.topSpeed*3.6).toFixed(1)+' km/h</b></span><span>整车质量<b>'+p.mass+' g</b></span><span>固定齿比<b>'+p.ratio+':1</b></span><span>轮胎直径<b>'+p.diameter+' mm</b></span></div>';}
function miniMap(def=trackDef){const t=new Track(def,laneCount),points=[];for(let i=0;i<=320;i++){const p=t.point(i/320);points.push(((p.x+11)*8)+','+((p.z+7)*6.5));}return '<svg viewBox="0 0 176 92" class="track-map" aria-hidden="true"><polyline points="'+points.join(' ')+'" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+points.join(' ')+'" fill="none" stroke="#d7dfcf" stroke-width=".8"/></svg>';}


$('#app').innerHTML=`
  <header class="header">
    <a class="brand" href="./" aria-label="疾风俱乐部首页"><span class="brand-mark">${icon('bolt')}</span><div><strong>疾风俱乐部<span>®</span></strong><small>MINI 4WD CLUB</small></div></a>
    <nav class="main-nav" aria-label="主导航"><button class="active" data-action="page-race">${icon('flag')}赛道大厅<span>01</span></button><button data-action="page-garage">${icon('tool')}改装工坊<span>02</span></button><button data-action="collection">${icon('car')}我的车库<span>03</span></button></nav>
    <div class="header-actions"><span class="local-status"><i></i> 本地练习赛</span><button class="icon-btn" data-action="sound" aria-label="开启音效" aria-pressed="false">${icon('sound')}</button><button class="icon-btn" data-action="help" aria-label="操作说明">${icon('help')}</button><span class="avatar">GO</span></div>
  </header>
  <main class="workspace">
    <section class="stage" id="stage" aria-label="三维场景">
      <div class="scene-heading" id="scene-heading"><div class="eyebrow"><span class="tiny-line"></span> SMALL MACHINES. BIG DREAMS.</div><h1>小小赛车，<br>真正的四驱竞速。</h1><p>持续驱动 · 导轮循轨 · 发车前调校</p></div>
      <div class="scene-top-right"><span class="room-badge" id="room-badge">${icon('room')} ${venue.name}</span><span class="weather-badge" id="weather-badge">☀ &nbsp; 16:30</span></div>
      <div id="leaderboard" class="leaderboard" hidden></div>
      <div class="countdown" id="countdown" aria-live="polite" hidden></div>
      <div class="scene-caption" id="scene-caption"><span class="live-dot"></span><span id="scene-state">赛道已就绪</span><span class="caption-divider"></span><span id="track-caption">八车道自定义赛 / 8 台赛车</span></div>
      <div class="scene-bottom" id="scene-bottom"><div class="scene-label"><span>TRACK 01</span><strong id="stage-track-name">旋风环线</strong><small id="stage-track-desc">长程模块赛道 · 立体换道桥 · 双跳台</small></div><div class="camera-controls" aria-label="镜头控制"><button class="active" data-action="camera-orbit">${icon('room')}自由视角</button><button data-action="camera-top">${icon('layers')}俯瞰</button><button data-action="camera-follow">${icon('eye')}跟车</button></div></div>
      <div class="telemetry" id="telemetry" hidden><div><b id="speed-value">0</b><span>KM/H</span></div><section><span id="lap-value">LAP 01 / 03</span><strong id="time-value">00:00.00</strong><div class="energy"><i id="energy-bar"></i></div><small id="heat-value">电量 100% · 25°C</small></section></div>
      <svg id="part-connectors" class="part-connectors" hidden></svg><div id="part-labels" class="part-labels" hidden></div>
      <div class="garage-stage-toolbar" id="garage-toolbar" hidden><button class="outline-btn" id="explode-btn" data-action="explode" aria-pressed="false">${icon('layers')}展开赛车结构</button><div class="inspection-views"><button data-action="inspect-front">斜前</button><button data-action="inspect-top">俯视</button><button data-action="inspect-side">侧视</button></div><span>拖动旋转 · 滚轮缩放 · 点击零件查看</span></div>
      <div class="touch-controls manual-keys" id="touch-controls" hidden><span><kbd>W / ↑</kbd> 持续供电</span><span><kbd>S / ↓</kbd> 制动</span><small>动漫模式 · 非标准计时</small></div>
      <div class="loading" id="loading"><span class="loading-wheel"></span><strong>赛车正在就位…</strong><small>把小小的梦想，装进大大的房间。</small></div>
    </section>
    <aside class="sidebar" id="sidebar" aria-label="比赛设置"></aside>
  </main>
  <section class="fleet"><div class="fleet-heading"><div><span class="eyebrow">THE STARTING GRID</span><h2>选择你的搭档 <span id="fleet-count">08 MACHINES</span></h2></div><button class="text-btn" data-action="extension">${icon('plus')}拓展赛车</button></div><div class="car-strip" id="car-strip"></div></section>
  <footer><span>四驱的热爱，从一颗马达开始。</span><span><kbd>SPACE</kbd> 暂停 <i>·</i> <kbd>C</kbd> 切换镜头 <i>·</i> 拖动旋转 / 滚轮缩放</span><span>LET’S RACE. <span class="footer-star">✦</span></span></footer>
  <dialog id="modal"><div id="modal-content"></div></dialog><div class="toast" id="toast" role="status"></div>
`;

function renderSidebar(){
  const c=car(),stats=getStats(c,builds[c.id]);
  if(page==='garage'){
    const current=builds[c.id][slot],part=PARTS[slot];
    $('#sidebar').innerHTML=`<div class="panel-heading"><div><span class="eyebrow">TUNE YOUR MACHINE</span><h2>改装工坊</h2></div><span class="panel-number">02</span></div>
      <div class="garage-car-title"><span style="background:${c.color}"></span><h3>${esc(c.name)}</h3><small>${esc(c.en)}</small></div>
      <div class="part-tabs" role="group" aria-label="选择部件">${Object.keys(PARTS).map(s=>`<button class="${s===slot?'active':''}" data-slot="${s}">${PARTS[s].name}</button>`).join('')}</div>
      <div class="part-heading"><span class="eyebrow">${part.en}</span><h3>${part.name}</h3><p>${part.detail}</p></div>
      <div class="part-options">${part.options.map((opt,i)=>`<button class="part-option ${current===i?'installed':''}" data-install="${i}"><span class="part-level">${['S','R','PRO'][i]}</span><span><strong>${opt.name}</strong><small>${opt.hint}</small></span><i>${current===i?icon('check'):icon('plus')}</i></button>`).join('')}</div>
      <div class="panel-separator"></div><div class="section-row"><h3>当前调校</h3><span class="orange-text">${car().chassis}</span></div>${setupHTML(c)}<div class="tune-note">${race.state==='paused'?'比赛配置已锁定；返回赛道可继续或重新就位。':'车壳、马达与固定齿比一同参加车检。'}</div>
      <div class="garage-note">${icon('save')}已自动保存 · 所有练习配件免费装配</div><button class="primary-btn" data-action="page-race">返回赛道 ${icon('arrow')}</button><button class="text-btn reset-build" data-action="reset-build">恢复这辆车的原厂配置</button>`;
    return;
  }
  $('#sidebar').innerHTML=`<div class="panel-heading"><div><span class="eyebrow">RACE CONTROL</span><h2>准备，出发。</h2></div><span class="panel-number">01</span></div>
    <div class="section-row"><h3>赛道与场地</h3><button class="text-btn" data-action="tracks">切换 ${icon('chevron')}</button></div>
    <button class="track-preview" data-action="tracks" aria-label="选择赛道与场地">${miniMap()}<div><span>${trackDef.en}</span><strong>${trackDef.name}</strong><small>${venue.name} <i>↗</i></small></div></button>
    <div class="race-facts"><span><b>${race.track.length.toFixed(1)}</b> m 单环</span><span><b>${laneCount}</b> 车道</span><span><b>${(race.track.totalLength*laps).toFixed(0)}</b> m 赛程</span></div><p class="course-note">115 mm 车道 · 50 mm 护墙 · 固定换道桥<br>${laneCount===8?'八车俱乐部自定义赛，计时独立保存。':'三／五车道竞赛，每台车依次跑过所有车道。'}</p>
    <div class="panel-separator"></div><div class="section-row"><h3>我的赛车</h3><button class="text-btn" data-action="page-garage">改装 ${icon('tool')}</button></div>
    <div class="selected-machine"><img src="${thumbnails[c.id]||''}" alt="${esc(c.name)}赛车模型"><div><span style="color:${c.color}">${c.number} / ${esc(c.style)}</span><h3>${esc(c.name)}</h3><small>${esc(c.en)}</small></div></div>
    ${setupHTML(c)}<div class="panel-separator"></div>
    <div class="section-row"><h3>比赛模式</h3><span class="muted">发车前选择</span></div>
    <div class="segmented"><button data-mode="auto" class="${mode==='auto'?'active':''}">${icon('bolt')}标准竞赛</button><button data-mode="manual" class="${mode==='manual'?'active':''}">${icon('car')}动漫操控</button></div>
    <p class="mode-hint">${mode==='auto'?'马达持续运转，导轮被动转向。离轨、倾翻或串道立即退赛。':'幻想练习模式：W / ↑ 持续供电 · S / ↓ 制动；固定换道桥循轨。'}</p>
    <label class="lane-setting">赛道规格<select id="lane-select" aria-label="赛道规格">${[3,5,8].map(n=>`<option value="${n}" ${n===laneCount?'selected':''}>${n} 车道${n===8?' · 自定义八车赛':' · 标准规格'}</option>`).join('')}</select></label><div class="race-settings"><label>参赛车辆<select id="count-select" aria-label="参赛车辆">${Array.from({length:laneCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===count?'selected':''}>${n} 辆${n===8?' · 满场':''}</option>`).join('')}</select></label><label>完整轮次<select id="lap-select" aria-label="完整轮次">${[1,2,3].map(n=>`<option value="${n}" ${n===laps?'selected':''}>${n} 轮 · ${n*laneCount} 圈</option>`).join('')}</select></label></div>
    <button class="primary-btn" id="start-btn" data-action="start">${icon('flag')}开始比赛 ${icon('arrow')}</button><div class="race-secondary"><button data-action="pause" id="pause-btn">${icon('pause')}暂停</button><button data-action="reset">${icon('reset')}重新就位</button></div>
    <div class="panel-bottom"><i></i><span id="ready-label">${count} 台赛车准备就绪</span><span>GO!</span></div>`;
  const sidebar=$('#sidebar'),start=$('#start-btn'),scroll=document.createElement('div'),commands=document.createElement('div');
  scroll.className='settings-scroll';commands.className='sticky-race-controls';
  while(sidebar.firstChild&&sidebar.firstChild!==start)scroll.appendChild(sidebar.firstChild);
  while(sidebar.firstChild)commands.appendChild(sidebar.firstChild);
  sidebar.append(scroll,commands);updateControls();
}
function renderFleet(){
  $('#fleet-count').textContent=`${String(cars.length).padStart(2,'0')} MACHINES`;
  $('#car-strip').innerHTML=cars.map(c=>`<button class="car-card ${c.id===selected?'selected':''}" data-car="${c.id}" style="--car-color:${c.color}" aria-pressed="${c.id===selected}"><div class="car-card-top"><span>${c.number}</span><small>${c.id===selected?'我的赛车':c.custom?'CUSTOM':'FULL COWL'}</small><i>${c.id===selected?icon('check'):''}</i></div><img src="${thumbnails[c.id]}" alt="${esc(c.name)}"><strong>${esc(c.name)}</strong><span class="car-style">${esc(c.style)}<i>↗</i></span></button>`).join('');
}
function rebuildRace(){race=new Race({cars,builds,playerId:selected,track:trackDef,venue,count,laps,laneCount});race.mode=mode;resultShown=false;view.loadRace(race,builds);$('#app').classList.toggle('night',venue.id==='night');$('#room-badge').innerHTML=`${icon('room')} ${venue.name}`;$('#weather-badge').textContent=venue.id==='night'?'☾  22:45':venue.id==='club'?'☀  14:00':'☀  16:30';$('#stage-track-name').textContent=trackDef.name;$('#stage-track-desc').textContent=trackDef.desc;$('#scene-heading').classList.remove('racing');renderSidebar();updateHUD();persist();}
function setPage(next){
  if(next==='garage'&&page!=='garage'&&['running','countdown'].includes(race.state))race.pause();
  page=next;view.setMode(page);$('#app').classList.toggle('garage-open',page==='garage');
  $('.main-nav [data-action="page-race"]').classList.toggle('active',page==='race');$('.main-nav [data-action="page-garage"]').classList.toggle('active',page==='garage');
  $('#garage-toolbar').hidden=page!=='garage';$('#part-labels').hidden=page!=='garage';$('#part-connectors').toggleAttribute('hidden',page!=='garage'||!view.explode);$('#scene-bottom').hidden=page==='garage';$('#scene-caption').hidden=page==='garage';$('.scene-top-right').hidden=page==='garage';
  if(page==='garage'){view.loadGarage(car(),builds[selected]);renderPartLabels();}renderSidebar();updateHUD();
}
function chooseCar(id){if(['running','countdown','paused'].includes(race?.state)){view.followId=id;view.setCamera('follow');toast('比赛配置锁定，已切换到这辆赛车的跟随镜头。');return;}if(!cars.some(c=>c.id===id))return;if(selected===id)return;selected=id;rebuildRace();renderFleet();if(page==='garage')view.loadGarage(car(),builds[selected]);toast(`已选择 ${car().name}`);}
function selectPart(key){if(!PARTS[key])return;slot=key;view.selectPart(slot);renderSidebar();renderPartLabels();}
function renderPartLabels(){
  $('#part-labels').innerHTML=Object.entries(PARTS).map(([key,p])=>`<button data-slot="${key}" class="part-label ${slot===key?'active':''}" hidden><i></i>${p.name}</button>`).join('');
}
function install(index){if(['running','countdown','paused'].includes(race.state)){toast('发车后的调校已锁定，请结束比赛或重新就位。');return;}if(!PARTS[slot].options[index])return;builds[selected][slot]=index;thumbnails[selected]=view.thumbnail(car(),builds[selected]);view.loadGarage(car(),builds[selected]);rebuildRace();renderFleet();toast(`已装配「${PARTS[slot].options[index].name}」，新配置已就位。`);}
function updateControls(){if(page!=='race')return;const active=['running','countdown','paused'].includes(race.state);$('#count-select').disabled=active;$('#lap-select').disabled=active;$('#lane-select').disabled=active;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=active);$('#start-btn').disabled=['running','countdown'].includes(race.state);$('#start-btn').innerHTML=race.state==='paused'?`继续比赛 ${icon('arrow')}`:race.state==='finished'?`再赛一场 ${icon('arrow')}`:race.state==='running'?`正在竞速 ${icon('flag')}`:race.state==='countdown'?`准备发车… ${icon('flag')}`:`${icon('flag')}开始比赛 ${icon('arrow')}`;$('#pause-btn').disabled=!active;$('#pause-btn').innerHTML=`${icon('pause')}${race.state==='paused'?'继续':'暂停'}`;}
function updateHUD(){
  document.querySelectorAll('.camera-controls button').forEach(b=>b.classList.toggle('active',b.dataset.action===`camera-${view.cameraMode}`));
  const active=race.state!=='ready',inRace=page==='race',r=race.player;$('#leaderboard').hidden=!active||!inRace;$('#telemetry').hidden=!active||!inRace;$('#countdown').hidden=!['countdown','paused'].includes(race.state)||!inRace;
  $('#touch-controls').hidden=mode!=='manual'||race.state!=='running'||!inRace;
  $('#countdown').innerHTML=race.state==='paused'?'<strong class="paused-text">比赛已暂停</strong><span>空格继续 / 可进入改装工坊</span>':`<strong>${Math.max(1,Math.ceil(race.countdown))}</strong><span>READY TO RACE</span>`;
  $('#scene-heading').classList.toggle('racing',active);$('#scene-heading').hidden=!inRace;
  $('#scene-state').textContent=({ready:'赛道已就绪',countdown:'赛车正在发车',running:'比赛进行中',paused:'比赛暂停',finished:'比赛已结束'})[race.state];
  $('#track-caption').textContent=`${laneCount} 车道 / ${race.racers.length} 台 / ${race.laps} 圈（${laps} 轮）`;
  if(active&&inRace){
    $('#leaderboard').innerHTML=`<div class="leaderboard-title"><span><i class="live-dot"></i> LIVE TIMING</span><b>${race.state==='finished'?'FINAL':'RACE'}</b></div>${race.standings.map((o,i)=>`<div class="rank-row ${o.player?'mine':''}"><b>${i+1}</b><i style="background:${o.car.color}"></i><span>${esc(o.car.name)}${o.player?'<small>YOU</small>':''}</span><strong>${o.status==='dnf'?'DNF':o.finish!==null?formatTime(o.finish):`${Math.max(0,o.progress).toFixed(2)} 圈`}</strong></div>`).join('')}`;
    $('#speed-value').textContent=Math.round(r.speed*3.6);$('#lap-value').textContent=`LAP ${String(Math.min(race.laps,Math.max(1,r.completed+1))).padStart(2,'0')} / ${String(race.laps).padStart(2,'0')}`;$('#time-value').textContent=formatTime(r.finish??race.time);$('#energy-bar').style.width=`${r.battery}%`;$('#heat-value').textContent=`电量 ${Math.round(r.battery)}% · ${Math.round(r.heat)}°C · ${r.lane+1} 号车道${r.air?' · 腾空':r.status==='dnf'?' · '+r.reason:''}`;
  }
  updateControls();
}

let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3400);}
function showModal(title,subtitle,body,cls=''){
  if(['running','countdown'].includes(race.state))race.pause();
  const modal=$('#modal');modal.className=cls;$('#modal-content').innerHTML=`<div class="modal-heading"><div><span class="eyebrow">${subtitle}</span><h2>${title}</h2></div><button class="icon-btn" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div>${body}`;if(!modal.open)modal.showModal();updateHUD();
}
function showTracks(){showModal('下一站，在哪里开跑？','CHOOSE YOUR PLAYGROUND',`<h3 class="modal-section-title">01 <span>选择场地</span></h3><div class="venue-grid">${VENUES.map(v=>`<button data-venue="${v.id}" class="venue-card ${v.id===venue.id?'chosen':''}" style="--wall:${v.wall};--floor:${v.floor};--accent:${v.accent}"><div class="venue-art"><i class="art-window"></i><i class="art-floor"></i><i class="art-track"></i><span>${v.en}</span></div><strong>${v.name}${v.id===venue.id?icon('check'):''}</strong><small>${v.tag}</small></button>`).join('')}</div><h3 class="modal-section-title">02 <span>选择赛道</span></h3><div class="track-grid">${TRACKS.map(t=>`<button data-track="${t.id}" class="layout-card ${t.id===trackDef.id?'chosen':''}">${miniMap(t)}<span>${t.level}</span><h3>${t.name}</h3><p>${t.desc}</p></button>`).join('')}</div><div class="modal-foot"><span>赛道按米显示；每轮跑过所有车道。切换后赛车重新就位。</span><button class="primary-btn" data-action="close">就选这里 ${icon('arrow')}</button></div>`,'wide');}
function showCollection(){showModal('每一辆，都有自己的风。','MY GARAGE',`<div class="collection-grid">${cars.map(c=>`<button data-collection-car="${c.id}" style="--car-color:${c.color}"><img src="${thumbnails[c.id]}" alt="${esc(c.name)}"><span>${esc(c.en)}</span><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><small>${c.id===selected?'当前搭档':'选择这辆赛车'} ${icon('arrow')}</small></button>`).join('')}</div><div class="modal-foot"><span>赛车与改装记录保存在这台浏览器。</span><button class="outline-btn" data-action="extension">${icon('plus')}打造专属赛车</button></div>`,'wide');}
function showExtension(){showModal('打造你的第九辆赛车。','CUSTOM MACHINE LAB',`<p class="modal-intro">选择基础轮廓与涂装，新赛车会加入车库，并拥有完整的九槽改装能力。最多支持 16 辆拓展赛车。</p><form id="custom-form"><div class="form-grid"><label>赛车名称<input name="name" maxlength="18" placeholder="例如：流星冲锋" required></label><label>基础轮廓<select name="shape">${CARS.map(c=>`<option value="${c.shape}">${c.name}</option>`).join('')}</select></label><label class="color-label">主色<input type="color" name="color" value="#e47a36"></label><label class="color-label">强调色<input type="color" name="accent" value="#ffe496"></label></div><p class="form-note">性能由底盘、马达、固定齿比、轮组与电池决定，可在工坊调校。</p><p class="form-error" id="custom-error" role="alert"></p><button class="primary-btn" type="submit">${icon('plus')}加入我的车库 ${icon('arrow')}</button></form><div class="import-export"><button class="outline-btn" data-action="export">${icon('download')}导出当前赛车 JSON</button><label class="outline-btn upload-label">${icon('upload')}导入赛车 JSON<input type="file" id="import-car" accept=".json,application/json"></label></div><small class="muted">JSON 支持名称、基础轮廓与涂装。沿用配件配置，不通过虚拟点数制造性能。</small>`);}
function showResults(){
  resultShown=true;
  const standing=race.standings,rank=standing.indexOf(race.player)+1,r=race.player;
  if(r.finish!==null){records.unshift({track:trackDef.id,car:selected,laps:race.laps,laneCount,time:r.finish,bestLap:r.bestLap,mode});records=records.slice(0,20);persist();}
  showModal(r.finish===null?'下一次，跑得更远。':rank===1?'这一刻，你就是冠军。':'每一圈，都在向前。','RACE FINISHED',`<div class="result-hero">${icon('cup')}<div><span>YOUR POSITION</span><strong>${r.finish===null?'DNF':String(rank).padStart(2,'0')}<small> / ${count}</small></strong></div><div><span>总用时</span><b>${formatTime(r.finish)}</b><span>最快单圈</span><b>${formatTime(r.bestLap)}</b></div></div><div class="result-table"><div><span>名次 / 赛车</span><span>完赛用时</span><span>最快单圈</span></div>${standing.map((o,i)=>`<div class="${o.player?'my-result':''}"><span><b>${i+1}</b> ${esc(o.car.name)} ${o.player?'<em>YOU</em>':''}</span><strong>${o.status==='dnf'?'DNF':formatTime(o.finish)}</strong><span>${o.status==='dnf'?esc(o.reason):formatTime(o.bestLap)}</span></div>`).join('')}</div><p class="form-note">${trackDef.name} · ${venue.name} · ${race.laps} 圈 · ${laneCount} 车道 · ${mode==='manual'?'动漫操控（非标准计时）':'持续驱动竞赛'}${r.finish===null?' · '+esc(r.reason||'未完赛'):''}</p><div class="modal-foot"><button class="outline-btn" data-action="result-garage">${icon('tool')}回工坊调校</button><button class="primary-btn" data-action="again">再赛一场 ${icon('arrow')}</button></div>`);
}

let audioCtx,osc,gain;
function toggleSound(){sound=!sound;const b=$('[data-action="sound"]');b.setAttribute('aria-pressed',sound);b.setAttribute('aria-label',sound?'关闭音效':'开启音效');if(sound){try{audioCtx??=new AudioContext();audioCtx.resume();if(!osc){osc=audioCtx.createOscillator();gain=audioCtx.createGain();osc.type='sawtooth';gain.gain.value=0;osc.connect(gain);gain.connect(audioCtx.destination);osc.start();}}catch{sound=false;toast('当前浏览器无法开启音效。');}}if(gain&&!sound)gain.gain.setTargetAtTime(0,audioCtx.currentTime,.08);}
function handleAction(action){
  if(action.startsWith('inspect-'))view.setGarageCamera(action.slice(8));
  if(action==='page-race')setPage('race');if(action==='page-garage')setPage('garage');if(action==='tracks')showTracks();if(action==='collection')showCollection();if(action==='extension')showExtension();if(action==='close')$('#modal').close();
  if(action==='start'){if(race.state==='paused')race.pause();else {if(race.state==='finished')rebuildRace();race.start();view.setCamera('follow');}updateHUD();}
  if(action==='pause'){race.pause();updateHUD();}
  if(action==='reset'){rebuildRace();toast('赛车已重新就位。');}
  if(action==='again'){$('#modal').close();setPage('race');rebuildRace();race.start();}
  if(action==='result-garage'){$('#modal').close();setPage('garage');}
  if(action.startsWith('camera-')){const m=action.replace('camera-','');view.setCamera(m);document.querySelectorAll('.camera-controls button').forEach(b=>b.classList.toggle('active',b.dataset.action===action));}
  if(action==='explode'){view.explode=view.explode?0:1;$('#explode-btn').setAttribute('aria-pressed',!!view.explode);$('#explode-btn').innerHTML=`${icon('layers')}${view.explode?'收拢赛车结构':'展开赛车结构'}`;}
  if(action==='reset-build'){if(['running','countdown','paused'].includes(race.state)){toast('比赛配置已锁定。');return;}builds[selected]=defaultBuild();thumbnails[selected]=view.thumbnail(car(),builds[selected]);view.loadGarage(car(),builds[selected]);rebuildRace();renderFleet();toast('已恢复当前赛车的原厂配置。');}
  if(action==='sound')toggleSound();
  if(action==='help')showModal('先调校，再发车。','MINI 4WD / RACE GUIDE','<div class="help-body"><h3>持续驱动的轨道赛车</h3><p>迷你四驱车靠马达持续驱动，导轮贴着护墙转向。标准竞赛没有驾驶员油门、方向盘或冲刺按钮。选好配件，通过车检后同时垂直放车；落地越过护墙、串道、弯道倾翻都会退赛。</p><h3>跑过所有车道</h3><p>每次通过立体换道桥自动前进一个车道。三车道一轮三圈、五车道一轮五圈，自定义八车道一轮八圈；一轮结束后每台车跑过相同的所有车道，按完赛时间排名。</p><h3>调校的取舍</h3><p>高转速马达、大径轮胎和 3.5:1 齿比提高极速，5:1 增加扭矩。刹车海绵在上坡自动减速，低反弹胎与质量阻尼器减少落地弹跳。导轮轴承减少弯道摩擦。部件参数采用简化模拟估值，可以通过试跑比较结果。</p><h3>动漫操控</h3><p>这是独立幻想模式，W / ↑ 控制供电，S / ↓ 制动。依然遵循护墙与固定换道桥；比赛记录和标准竞赛分开。八车赛是俱乐部自定义规格。</p><h3>工坊与车库</h3><p>点击展开结构，观察九个部件，点击模型或标签查看并替换。比赛期间配置锁定。可创建、导入或导出自定义涂装赛车。</p><div class="key-guide"><span><kbd>SPACE</kbd>发车 / 暂停</span><span><kbd>C</kbd>切换镜头</span><span>拖动旋转 · 滚轮缩放</span></div><p><a href="https://www.tamiya.com/english/mini4wd/regulation.htm" target="_blank" rel="noopener">田宫竞赛规则 ↗</a>　<a href="https://www.tamiya.com/english/mini4wd/setupguide/setupguide.htm" target="_blank" rel="noopener">田宫调校指南 ↗</a></p></div>');

  if(action==='export'){const content={name:car().name,color:car().color,accent:car().accent,shape:car().shape};const blob=new Blob([JSON.stringify(content,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mini4wd-car.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('赛车拓展文件已导出。');}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.action)handleAction(b.dataset.action);
  if(b.dataset.car)chooseCar(b.dataset.car);
  if(b.dataset.collectionCar){chooseCar(b.dataset.collectionCar);$('#modal').close();}
  if(b.dataset.slot)selectPart(b.dataset.slot);
  if(b.dataset.install!==undefined)install(Number(b.dataset.install));
  if(b.dataset.mode){if(['running','countdown','paused'].includes(race.state))return;mode=b.dataset.mode;race.mode=mode;clearInput();renderSidebar();updateHUD();if(mode==='manual')toast('动漫操控：W 持续供电 · S 制动。计时与标准竞赛分开。');}
  if(b.dataset.venue){venue=VENUES.find(v=>v.id===b.dataset.venue);rebuildRace();showTracks();}
  if(b.dataset.track){trackDef=TRACKS.find(t=>t.id===b.dataset.track);rebuildRace();showTracks();}
});
document.addEventListener('change',async e=>{
  if(e.target.id==='lane-select'){laneCount=Number(e.target.value);count=Math.min(count,laneCount);rebuildRace();}
  if(e.target.id==='count-select'){count=Number(e.target.value);rebuildRace();}
  if(e.target.id==='lap-select'){laps=Number(e.target.value);rebuildRace();}
  if(e.target.id==='import-car'){
    try{const file=e.target.files[0];if(!file)return;if(file.size>16000)throw new Error('赛车 JSON 文件不能超过 16 KB。');addCustom(validateCustomCar(JSON.parse(await file.text()),custom));}catch(error){$('#custom-error').textContent=error instanceof SyntaxError?'JSON 格式不正确，请检查文件。':error.message;}
  }
});
document.addEventListener('submit',e=>{if(e.target.id==='custom-form'){e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{addCustom(validateCustomCar({...data,stats:[82,82,82,82]},custom));}catch(error){$('#custom-error').textContent=error.message;}}});
function addCustom(c){custom.push(c);cars=[...CARS,...custom];builds[c.id]=defaultBuild();thumbnails[c.id]=view.thumbnail(c);selected=c.id;rebuildRace();renderFleet();if(page==='garage')view.loadGarage(c,builds[c.id]);$('#modal').close();toast(`${c.name} 已加入车库，现在就能参赛与改装。`);}
function clearInput(){input.throttle=false;input.brake=false;input.boost=false;document.querySelectorAll('[data-drive]').forEach(b=>b.classList.remove('pressed'));}
let lastLaneToast=0;
function lane(direction){if(!race.changeLane(direction)&&performance.now()-lastLaneToast>1600){toast('请在起点后的箭头区换道，并留意相邻赛车。');lastLaneToast=performance.now();}}
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||$('#modal').open)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Space'&&!e.repeat){if(race.state==='ready')race.start();else race.pause();updateHUD();}
  if(e.code==='KeyC'&&!e.repeat)handleAction(`camera-${['orbit','top','follow'][(['orbit','top','follow'].indexOf(view.cameraMode)+1)%3]}`);
  if(page!=='race'||mode!=='manual')return;
  if(['KeyW','ArrowUp'].includes(e.code))input.throttle=true;if(['KeyS','ArrowDown'].includes(e.code))input.brake=true;if(e.code.startsWith('Shift'))input.boost=false;

});
document.addEventListener('keyup',e=>{if(['KeyW','ArrowUp'].includes(e.code))input.throttle=false;if(['KeyS','ArrowDown'].includes(e.code))input.brake=false;if(e.code.startsWith('Shift'))input.boost=false;});
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{clearInput();if(document.hidden&&['running','countdown'].includes(race?.state))race.pause();});
$('#modal').addEventListener('close',clearInput);
for(const button of document.querySelectorAll('[data-drive]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('pressed');const key=button.dataset.drive;if(key==='left')lane(-1);else if(key==='right')lane(1);else input[key]=true;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{button.classList.remove('pressed');if(button.dataset.drive in input)input[button.dataset.drive]=false;});
}

try{
  view=new View($('#stage'),{onPart:selectPart,onCar:chooseCar});
  for(const c of cars)thumbnails[c.id]=view.thumbnail(c,builds[c.id]);
  rebuildRace();renderFleet();$('#loading').remove();
  let previous=performance.now();
  function frame(now){
    const dt=Math.min(.08,(now-previous)/1000);previous=now;
    if(page==='race'&&!$('#modal').open)race.update(dt,input);view.render(dt);
    if(now-lastUI>95){updateHUD();lastUI=now;
      if(page==='garage'){
        const left=['shell','motor','tires','brake','chassis'],right=['battery','gears','rollers','dampers'],w=$('#stage').clientWidth,h=$('#stage').clientHeight,lines=[];
        $('#part-connectors').toggleAttribute('hidden',!view.explode);
        for(const b of $('#part-labels').children){const pos=view.projectPart(b.dataset.slot),isLeft=left.includes(b.dataset.slot),index=(isLeft?left:right).indexOf(b.dataset.slot),x=isLeft?108:w-108,y=h*.28+index*Math.min(59,h*.42/4);b.hidden=!view.explode;b.style.left=`${x}px`;b.style.top=`${y}px`;if(pos&&view.explode)lines.push(`<line x1="${x+(isLeft?52:-52)}" y1="${y}" x2="${pos.x}" y2="${pos.y}"/><circle cx="${pos.x}" cy="${pos.y}" r="2.5"/>`);}
        $('#part-connectors').innerHTML=lines.join('');
      }
    }
    for(const event of race.events.splice(0)){if(event.type==='warning')toast(event.text);if(event.type==='lap'&&event.lap<race.laps)toast(`第 ${event.lap} 圈完成 · ${formatTime(event.time)}`);}
    if(race.state==='finished'&&!resultShown)showResults();
    if(osc&&gain){const moving=sound&&page==='race'&&race.state==='running';osc.frequency.setTargetAtTime(75+race.player.speed*32,audioCtx.currentTime,.05);gain.gain.setTargetAtTime(moving?Math.min(.019,race.player.speed*.0016):0,audioCtx.currentTime,.08);}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);if(storageIssue)toast('本地存档不可用，当前以临时练习模式运行。');
  // Read-only diagnostics make runtime evidence inspectable without mutating race state.
  Object.defineProperty(window,'mini4wd',{value:Object.freeze({snapshot:()=>({page,mode,selected,venue:venue.id,track:trackDef.id,count,laps:race.laps,rounds:laps,laneCount,trackLength:race.track.length,totalDistance:race.track.totalLength*laps,state:race.state,time:race.time,carCount:cars.length,models:Object.values(view.catalogChecks),build:{...builds[selected]},stats:getStats(car(),builds[selected]),explode:view.explode,camera:view.cameraMode,render:{calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles},racers:race.racers.map(r=>({id:r.car.id,progress:r.progress,speed:r.speed,lane:r.lane,heat:r.heat,battery:r.battery,finish:r.finish,status:r.status,reason:r.reason,distance:r.distance,air:!!r.air})),storageIssue})})});
}catch(error){console.error(error);$('#loading').innerHTML=`<strong>三维场景未能启动</strong><p>${esc(error.message)}</p><small>请在支持 WebGL 2 的浏览器中打开，并开启硬件加速。</small><button class="primary-btn" onclick="location.reload()">重新加载</button>`;}
