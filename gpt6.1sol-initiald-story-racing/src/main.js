import { CARS,TRACKS,MODES,CHAPTERS,DANMAKU,carById } from './data.js';
import { createTrack,wrap } from './track.js';
import { STEP,clamp,createVehicle,stepVehicle,createOpponent,stepOpponent,makeSave,completeChapter,resultFor,wulingBoost } from './physics.js';
import { World } from './render.js';
import { interpolateVehicle,interpolateOpponents } from './motion.js';
import { createMinimap } from './minimap.js';
import { Audio } from './audio.js';
import { portrait,eyeArt,sceneArt } from './art.js';
const $=id=>document.getElementById(id), show=(id,yes)=>$(id).hidden=!yes;
const SAVE_KEY='modelbenchlab:initiald:gpt6.1sol:v1';
let save=loadSave(),track=createTrack(),world;
const audio=new Audio(),keys=new Set(),touch={};
const state={screen:'menu',race:null,chapter:null,trial:false,quiet:false,paused:false,previousScreen:null,timer:0,slow:0,notice:0,danmaku:true,assist:true,seed:71,sceneMode:'silent',storageOK:true};
let menuVehicle=createVehicle(track,'ae86',35),last=performance.now(),accumulator=0,previousFrame=null,sceneLines=[],lineIndex=0,sceneDone=null;
function loadSave(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY));if(v?.version===1&&Array.isArray(v.completed)&&Array.isArray(v.unlocked)&&Number.isInteger(v.next)){return {...makeSave(),...v,next:clamp(v.next,0,14),unlocked:v.unlocked.filter(id=>CARS.some(c=>c.id===id)),completed:v.completed.filter(id=>Number.isInteger(id)&&id>=0&&id<=13)};}}catch{}return makeSave();}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{state.storageOK=false;notify('浏览器无法保存进度，本次仍可继续游玩。');}}
function random(){state.seed=(state.seed*1664525+1013904223)>>>0;return state.seed/4294967296;}
function clearInputs(){keys.clear();for(const k of Object.keys(touch))delete touch[k];document.querySelectorAll('#touch button').forEach(b=>b.classList.remove('held'));}
function input(){return {throttle:keys.has('KeyW')||keys.has('ArrowUp')||!!touch.throttle,brake:keys.has('KeyS')||keys.has('ArrowDown')||!!touch.brake,steer:Number(keys.has('KeyD')||keys.has('ArrowRight')||!!touch.right)-Number(keys.has('KeyA')||keys.has('ArrowLeft')||!!touch.left),handbrake:keys.has('Space')||!!touch.handbrake};}
function silence(yes){state.quiet=yes;document.body.classList.toggle('quiet',yes);if(yes)$('danmaku').replaceChildren();}
function hideLayers(){['menu','hud','panel','dialogue','cinematic','result'].forEach(id=>show(id,false));clearInputs();}
function menu(){hideLayers();state.screen='menu';state.race=null;state.paused=false;document.body.classList.remove('paused','racing','emotional');silence(false);world.setMood('night');track=createTrack();world.setTrack(track);menuVehicle=createVehicle(track,'ae86',35);world.cameraStarted=false;show('menu',true);show('masthead',true);$('story').innerHTML=save.next===0?'开始这趟旅程 <span>↗</span>':save.next>=14?'再看一次结局 <span>↗</span>':`继续 · ${CHAPTERS[save.next].title} <span>↗</span>`;}
function notify(text){$('toast').textContent=text;state.notice=2.4;}
function emit(pool='normal',count=1,force=false){
  if((state.quiet||!state.danmaku)&&!force)return;
  const lines=DANMAKU[pool]||[pool];
  for(let i=0;i<count;i++){if($('danmaku').children.length>22)$('danmaku').firstChild.remove();const node=document.createElement('span');node.textContent=lines[Math.floor(random()*lines.length)];node.style.top=`${10+Math.floor(random()*48)}%`;node.style.animationDuration=`${7+random()*3}s`;node.style.animationDelay=`${i*.17}s`;if(count>4)node.className='big';node.addEventListener('animationend',()=>node.remove());$('danmaku').append(node);}
}
function panel(html){hideLayers();state.screen='panel';silence(false);show('panel',true);$('panel').innerHTML=html;$('panel').querySelectorAll('[data-home]').forEach(b=>b.onclick=menu);}
function chapterMenu(){panel(`<div class="panel-heading"><span>CHAPTER SELECT / 14 段</span><button data-home>关闭 ×</button></div><h2>一座山。<br>一整个夏天。</h2><p>章节试驾可直接体验任何一段；通关、解锁与正式主线分别保存。试驾不写入主线进度。</p><div class="chapter-grid">${CHAPTERS.map(c=>`<button data-chapter="${c.id}" class="chapter-card ${save.completed.includes(c.id)?'done':''}"><small>${c.id===0?'序章':c.id===12?'终章':c.id===13?'尾声':String(c.id).padStart(2,'0')} / ${c.type==='scene'?'剧情':'驾驶'}</small><b>${c.title}</b><span>${c.motive}</span></button>`).join('')}</div>`);$('panel').querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>startChapter(+b.dataset.chapter,true));}
function freeMenu(){
  panel(`<div class="panel-heading"><span>FREE RACE / 秋名山车库</span><button data-home>关闭 ×</button></div><h2>今晚，<br>为自己开一次。</h2><p>已解锁 ${save.unlocked.length} / 8 辆 · 星级为本作平衡设定，每列最高5星。 <a class="garage-view-link" href="?models=1">360° 赏车 ↗</a></p><form id="race-form"><div class="car-grid">${CARS.map(c=>`<label class="car-card ${save.unlocked.includes(c.id)?'':'locked'}"><input type="radio" name="car" value="${c.id}" ${c.id==='ae86'?'checked':''} ${!save.unlocked.includes(c.id)?'disabled':''}><small>${c.drive} / ${c.driver}</small><strong>${c.name}</strong><span>${c.note}</span><div>${['直线','弯道','漂移'].map((s,i)=>`${s} ${'★'.repeat(c.stars[i])}`).join('<br>')}</div><em>${save.unlocked.includes(c.id)?'可出战':`第${c.unlock===12?'终':c.unlock}章${[9,12].includes(c.unlock)?'完成':'胜利'}解锁`}</em></label>`).join('')}</div><div class="form-grid"><label>赛道<select name="track">${TRACKS.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></label><label>赛制<select name="mode">${MODES.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>对手<select name="opponent">${CARS.map(c=>`<option value="${c.id}" ${c.id==='gtr'?'selected':''}>${c.name} / ${c.driver}</option>`).join('')}</select></label><label>五菱后排<select name="passengers"><option value="0">不载人</option><option value="1">阿木</option><option value="2">阿木 + 山鸡哥</option></select></label></div><div class="form-options"><label><input name="assist" type="checkbox" checked> 方向辅助（可关闭）</label><label><input name="charm" type="checkbox"> 贴五菱标 · 运气 +1%</label></div><p id="free-best">计时赛记录本地最佳；豆腐挑战同时看时间与剩水。追逐赛超出5米胜，落后100米败。混战共8辆。</p><button class="primary" type="submit">开车，上山 ↗</button></form><div class="easter"><button id="wuling-benz">彩蛋 · 宏光 vs 奔驰</button><button id="ae86-benz">彩蛋 · 这一次，追上了</button></div>`);
  $('race-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),car=f.get('car');startRace({car,track:f.get('track'),mode:f.get('mode'),opponent:f.get('opponent'),assist:f.has('assist'),charm:f.has('charm'),passengers:car==='wuling'?+f.get('passengers'):0,weather:TRACKS.find(t=>t.id===f.get('track')).weather,title:MODES.find(m=>m.id===f.get('mode')).name,free:true});};
  $('wuling-benz').onclick=()=>startRace({car:'wuling',opponent:'benz',track:'downhill',mode:'duel',weather:'dusk',title:'人民的车，对钞能力',assist:true,passengers:2,free:true,easter:'wuling'});
  $('ae86-benz').onclick=()=>startRace({car:'ae86',opponent:'benz',track:'downhill',mode:'duel',weather:'night',title:'这一次，追上了',assist:true,free:true,easter:'reunion'});
}
function scene(lines,done,art='',quiet=false,mode='piano'){
  hideLayers();state.screen='dialogue';state.sceneMode=mode;state.timer=0;state.foreshadowTimer=0;$('next').disabled=false;silence(quiet);document.body.classList.toggle('emotional',quiet);show('dialogue',true);show('masthead',false);$('scene-art').innerHTML=sceneArt(art);sceneLines=lines;lineIndex=0;sceneDone=done;renderLine();
}
function renderLine(){const l=sceneLines[lineIndex];$('speaker').textContent=l.who;$('line').textContent=l.text;$('portrait').innerHTML=l.who==='旁白'?'':portrait(l.who,l.mood);$('next').innerHTML=lineIndex===sceneLines.length-1?'往前走 <span>↵</span>':'继续 <span>↵</span>';if(state.chapter===2&&lineIndex===sceneLines.length-1){$('scene-art').innerHTML=sceneArt('school');state.foreshadowTimer=2;$('next').disabled=true;}}
function nextLine(){if(state.screen!=='dialogue'||state.paused||$('next').disabled)return;lineIndex++;if(lineIndex<sceneLines.length)renderLine();else{const callback=sceneDone;sceneDone=null;callback?.();}}
function startChapter(id,trial=false){
  const c=CHAPTERS[id];if(!c)return;state.chapter=id;state.trial=trial;state.race=null;world.setMood(c.weather);menuVehicle=createVehicle(track,'ae86',35);
  scene(c.lines,()=>{
    if(c.type==='scene'){if(c.id===7){timedScene('海浪一遍遍地上岸。',4,()=>finishScene(c),true,'beach');}else if(c.id===10){timedScene('灯亮了一整夜。',3,()=>finishScene(c),true,'rain');}else finishScene(c);}
    else if(c.qte)qte(()=>chapterRace(c));else chapterRace(c);
  },c.art,c.quiet,c.id===7?'beach':c.id===10?'rain':c.quiet?'silent':'piano');
}
function finishScene(c){if(!state.trial){completeChapter(save,c.id);persist();}if(c.id===13){endCard('Project D','明天，又是凌晨四点。',()=>menu(),'回到首页');}else if(state.trial)chapterMenu();else startChapter(c.id+1,false);}
function timedScene(text,seconds,done,quiet=true,mode='silent'){hideLayers();state.screen='timed';state.timer=seconds;state.timedDone=done;state.sceneMode=mode;silence(quiet);show('cinematic',true);$('cinematic').innerHTML=`<p class="silence-line">${text}</p>`;}
function qte(done){hideLayers();state.screen='qte';state.timer=4;state.qte=0;state.qteDone=done;state.qteTarget=['KeyA','KeyD','KeyA','KeyD'];show('panel',true);$('panel').innerHTML='<div class="qte-art">'+portrait('刘教练','smile')+'</div><p class="eyebrow">赛前热身 / 刘教练</p><h2>跟我踢！</h2><p>依次按 A → D → A → D（或点下方按钮）。<br>成功获得起步加成，失败也能继续比赛。</p><b id="qte-status">A · D · A · D</b><div class="easter"><button data-qte="KeyA">A / 左</button><button data-qte="KeyD">D / 右</button></div>';$('panel').querySelectorAll('[data-qte]').forEach(b=>b.onclick=()=>qteInput(b.dataset.qte));}
function qteInput(code){if(state.screen!=='qte')return;if(code===state.qteTarget[state.qte])state.qte++;else state.qte=0;$('qte-status').textContent=`${state.qte}/4 · ${Math.ceil(state.timer)}秒`;if(state.qte===4){state.qteBonus=true;state.qteDone();}}
function chapterRace(c){startRace({car:c.car,opponent:c.opponent,track:c.type==='finale'?'highway':c.weather==='rain'?'rain':'downhill',mode:c.id===4?'chase':c.type==='tofu'?'tofu':'duel',weather:c.weather,chapter:c.id,trial:state.trial,title:c.title,motive:c.motive,cup:c.type==='tofu',gutter:!!c.gutter,forced:c.forced,finale:c.type==='finale',assist:c.id!==11,qteBonus:!!state.qteBonus});state.qteBonus=false;}
function startRace(config){
  hideLayers();state.screen='race';state.race={config,player:null,opponents:[],elapsed:0,countdown:2.8,phase:'countdown',phaseTime:0,danmakuTime:0,perfect:0,passes:new Set(),outcome:null,eyeSeen:false,overheat:false};state.slow=0;state.paused=false;state.notice=0;document.body.classList.remove('paused','emotional');document.body.classList.add('racing');silence(false);show('hud',true);show('masthead',false);state.chapter=config.chapter??null;
  $('danmaku').replaceChildren();previousFrame=null;
  world.inspectionView=null;
  track=createTrack(config.track);world.setTrack(track);world.setMood(config.weather||'night');world.cameraStarted=false;
  const race=state.race;race.player=createVehicle(track,config.car,3,-1.5);race.player.charm=!!config.charm;race.player.passengers=config.passengers||0;
  if(config.mode==='battle')race.opponents=CARS.filter(c=>c.id!==config.car).map((c,i)=>createOpponent(track,c.id,8+i*5,(i%3-1)*3));
  else if(!['time','tofu'].includes(config.mode)&&!config.practice)race.opponents=[createOpponent(track,config.opponent||'gtr',config.mode==='chase'||config.finale?25:4.5,1.7)];
  $('race-kicker').textContent=config.practice?'PRACTICE / 手感先行':config.chapter!=null?`${config.trial?'章节试驾 · ':''}${config.chapter===12?'终章':`第${config.chapter}章`} / AKINA`:'FREE RACE / 自由赛';
  $('race-title').textContent=config.title||'秋名山下坡';$('race-objective').textContent=config.motive||'手刹起漂，反打稳住，松开让抓地回来。';$('cup').hidden=!config.cup&&config.mode!=='tofu';
  buildMap();updateHUD();
  if(config.car==='wuling')notify(`遇强则强 ×${wulingBoost(config.opponent||'ae86').toFixed(2)} · ${config.passengers||0}位乘客`);
}
function buildMap(){const m=createMinimap(track);state.mapPoint=m.project;$('map').innerHTML=`<path d="${m.route}" fill="none" stroke="#a4b1b9" stroke-width="2"/><circle cx="${m.start.x}" cy="${m.start.y}" r="2.5" fill="#c3cbd1"/><rect x="${m.finish.x-3}" y="${m.finish.y-3}" width="6" height="6" fill="#efe5bb"/><path id="map-player" d="M0 -5 L3.4 3 L0 1.5 L-3.4 3Z" fill="#ef6951"/>`;}
function updateHUD(){
  const r=state.race;if(!r)return;const v=r.player,speed=state.speedGlitch>0?518:Math.round(v.speed*3.6),progress=clamp(v.s/track.length,0,1),elapsed=r.elapsed;
  $('speed').textContent=String(speed).padStart(3,'0');$('gear').textContent=clamp(Math.floor(v.speed/9)+1,1,5);$('rpm').firstChild.style.width=`${(v.speed%9/9)*80+20}%`;
  $('time').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${(elapsed%60).toFixed(3).padStart(6,'0')}`;$('angle').textContent=`${String(Math.round(Math.abs(v.angle)*180/Math.PI)).padStart(2,'0')}°`;
  $('drift-label').textContent=v.gutter?'GUTTER':Math.abs(v.angle)>.15?'DRIFT':'GRIP';$('score').textContent=`DRIFT ${Math.floor(v.score).toString().padStart(4,'0')}`;$('mechanic').textContent=v.gutter?'内侧轮已入沟':r.config.assist?'方向辅助 ON · 可在自由赛关闭':'手刹起漂 · 反打稳住';
  $('water').style.height=`${v.water}%`;$('water').style.transform=`rotate(${v.waterTilt*28}deg)`;$('water-value').textContent=`${Math.round(v.water)}%`;$('progress').style.width=`${progress*100}%`;
  const p=track.at(v.s+35);$('turn-sign').textContent=p.s>track.straightStart?'直道':Math.abs(p.k)>.035?(p.k<0?'右急弯 ↱':'↰ 左急弯'):Math.abs(p.k)>.008?(p.k<0?'右弯 ↗':'↖ 左弯'):'前方直道';
  if(r.opponents.length){const ahead=r.opponents.filter(o=>o.s>v.s).length,gap=r.opponents[0].s-v.s;$('gap').textContent=r.config.finale?`距离 ${Math.abs(gap).toFixed(0)}m`:`${ahead+1} / ${r.opponents.length+1} · ${gap>0?'落后':'领先'} ${Math.abs(gap).toFixed(0)}m`;}
  else $('gap').textContent=`${Math.round(progress*100)}% / ${r.config.cup?'水杯挑战':'个人节奏'}`;
  const mp=state.mapPoint(v);$('map-player').setAttribute('transform',`translate(${mp.x} ${mp.y}) rotate(${-v.yaw*180/Math.PI})`);
  $('speed-lines').style.opacity=v.speed>29?String((v.speed-29)/35):'0';document.body.classList.toggle('drifting',Math.abs(v.angle)>.2&&v.speed>10);
}
function startEye(){
  const r=state.race;r.eyeSeen=true;r.phase='eye';r.phaseTime=0;silence(true);document.body.classList.add('emotional');show('hud',false);show('cinematic',true);$('cinematic').innerHTML=eyeArt();audio.note(64,.6,'sine',.03);
}
function update(dt,override){
  if(state.paused)return;
  if(state.notice>0){state.notice-=dt;if(state.notice<=0)$('toast').textContent='';}
  if(state.speedGlitch>0)state.speedGlitch-=dt;
  if(state.screen==='dialogue'&&state.foreshadowTimer>0){state.foreshadowTimer-=dt;if(state.foreshadowTimer<=0){$('next').disabled=false;nextLine();}return;}
  if(state.screen==='timed'){state.timer-=dt;if(state.timer<=0){const done=state.timedDone;state.timedDone=null;done?.();}return;}
  if(state.screen==='qte'){state.timer-=dt;if(state.timer<=0){state.qteBonus=false;state.qteDone();}return;}
  if(state.screen!=='race')return;
  const r=state.race,v=r.player,config=r.config;let i=override||input();
  if(r.phase==='countdown'){r.countdown-=dt;$('toast').textContent=r.countdown>0?String(Math.ceil(r.countdown)):'走！';if(r.countdown<=0){r.phase='driving';state.notice=.6;if(config.qteBonus){v.vz=8;v.speed=8;}emit(config.car==='wuling'?'wuling':'normal',3);}return;}
  if(r.phase==='eye'){
    r.phaseTime+=dt;
    if(r.phaseTime>=1.8){
      // A fixed cinematic checkpoint, not adaptive racing AI. Both actors enter the authored straight segment.
      r.player=createVehicle(track,config.car,track.straightStart,-1.6);r.player.vx=0;r.player.vz=34;r.player.speed=34;r.opponents[0].s=track.straightStart+3;r.phase='straight';r.phaseTime=0;$('cinematic').innerHTML='<p class="straight-caption">弯道，没了。</p>';
    }return;
  }
  if(r.phase==='silence'){
    r.phaseTime+=dt;
    if(r.phaseTime>=5.5&&!r.firstLine){r.firstLine=true;emit('再快的86也追不上奔驰',1,true);}
    if(r.phaseTime>=8.5&&!r.finalFlood){r.finalFlood=true;emit('再快的86也追不上奔驰',12,true);}
    if(r.phaseTime>=12){silence(true);finishRace('scripted-loss');}return;
  }
  const timeScale=state.slow>0?.38:1;state.slow=Math.max(0,state.slow-dt);const simDt=dt*timeScale;r.elapsed+=simDt;
  stepVehicle(v,i,track,simDt,{assist:config.assist,gutter:config.gutter||save.gutter&&config.free,cup:config.cup||config.mode==='tofu',opponent:config.opponent,passengers:config.passengers,charm:config.charm});
  for(const o of r.opponents)stepOpponent(o,track,simDt,r.elapsed,{finalBoss:config.finale,easy:config.chapter===4,technical:config.chapter===11});
  // Physical contact is limited to side-by-side racers; the unaware story Benz never responds.
  if(!config.finale)for(const o of r.opponents){if(Math.abs(o.s-v.s)<3.6&&Math.abs(o.offset-v.offset)<1.7){if(!v.cooldown){v.collisions++;v.cooldown=.6;v.vx*=.82;v.vz*=.82;notify('擦碰 · 稳住方向');}v.x+=track.at(v.s).tz*(v.offset<o.offset?-1:1)*dt*5;}}
  if(config.forced==='engine'&&v.s>=track.eyeTrigger-5&&!r.overheat){r.overheat=true;v.engineBroken=true;r.breakTime=0;silence(true);document.body.classList.add('emotional');notify('引擎的声音，停了。');}
  if(r.overheat){r.breakTime+=dt;if(r.breakTime>3){finishRace('scripted-loss');return;}}
  if(config.finale&&r.phase==='driving'&&v.s>=track.eyeTrigger){startEye();return;}
  if(r.phase==='straight'){
    r.phaseTime+=dt;if(r.phaseTime>=9){r.phase='silence';r.phaseTime=0;v.vx=0;v.vz=0;v.speed=0;$('cinematic').innerHTML='';}return;
  }
  if(v.perfect>r.perfect){r.perfect=v.perfect;state.slow=.5;notify('PERFECT DRIFT / 完美漂移');audio.note(88,.2,'triangle',.14);emit('drift',6);document.body.classList.add('perfect');setTimeout(()=>document.body.classList.remove('perfect'),450);}
  for(const [index,o] of r.opponents.entries()){if(v.s>o.s+3&&!r.passes.has(index)){r.passes.add(index);emit(config.car==='wuling'?'wuling':'pass',5);notify(`${carById(o.id).driver}：……？！`);}}
  r.danmakuTime+=dt;
  if(r.danmakuTime>4.5){r.danmakuTime=0;emit(config.car==='wuling'?'wuling':'normal');if(config.car==='wuling'&&config.passengers)emit('阿木：七座满载！ / 山鸡哥：稳住！');if(config.car==='wuling'&&random()<.003*(config.charm?1.01:1)){state.speedGlitch=.65;notify('518 km/h？仪表坏了，车没坏。');}}
  if((config.cup||config.mode==='tofu')&&v.water<=0){finishRace('spill');return;}
  if(v.s>=track.length-3||config.mode==='chase'){
    const outcome=resultFor(r,track);
    if(outcome){if(config.forced==='ae85'&&v.s<track.length-3)return;finishRace(outcome);}
  }
}
function finishRace(outcome){
  const r=state.race;if(!r||state.screen!=='race')return;r.outcome=outcome;state.screen='result';show('hud',false);show('cinematic',false);show('result',true);clearInputs();document.body.classList.remove('racing','drifting');$('speed-lines').style.opacity=0;
  const c=r.config,win=outcome==='win',scripted=outcome==='scripted-loss';
  if(c.chapter!=null&&(win||scripted)&&!c.trial){completeChapter(save,c.chapter);persist();}
  if(win&&c.free){const key=`${c.car}:${c.track}:v${track.layoutVersion}:${c.mode}`;if(!save.best[key]||r.elapsed<save.best[key].time)save.best[key]={time:r.elapsed,water:r.player.water,score:Math.floor(r.player.score)};persist();}
  if(win&&c.chapter===11){silence(false);emit('crowned',12);}else if(c.finale)silence(true);
  if(win&&c.easter==='reunion')emit('这一次，追上了',1);
  const title=c.finale?'再快的86<br>也追不上奔驰':win?(c.chapter===11?'秋名山车神':'哎哟，不错哦'):outcome==='spill'?'豆腐，碎了。':c.forced==='engine'?'引擎停了。':'这一回，输了。';
  const text=c.finale?'他没有闪过灯，也没有看过后视镜。':scripted?(c.forced==='engine'?'不是所有东西，都能用油门留住。':'是85，不是86。阿木终于信了。'):win&&c.easter==='reunion'?'这一次，追上了。':win?'山路还在。明天见。':'松一点油门，提前刹车。你可以再来一次。';
  const ranks=[{id:r.player.id,s:r.player.s,time:r.elapsed},...r.opponents.map(o=>({id:o.id,s:o.s,time:o.finishedAt??Infinity}))].sort((a,b)=>Number.isFinite(a.time)&&Number.isFinite(b.time)?a.time-b.time:b.s-a.s);
  $('result').innerHTML=`<span class="eyebrow">${c.trial?'章节试驾 · 不记录主线进度':c.finale?'终章 / 清晨':win?'FINISH / 山路记录':'FINISH / 再走一次'}</span><h2>${title}</h2><p>${text}</p>${c.finale?'':`<div class="result-stats"><span>用时 <b>${r.elapsed.toFixed(2)}s</b></span><span>漂移 <b>${Math.floor(r.player.score)}</b></span><span>剩水 <b>${r.player.water.toFixed(1)}%</b></span></div>`}${c.mode==='battle'?`<ol class="rank-list">${ranks.map(v=>`<li>${carById(v.id).name} ${v.id===r.player.id?' / 你':''}</li>`).join('')}</ol>`:''}<div class="result-actions"><button class="primary" id="result-next">${c.finale?'你考虑一下 ↗':c.chapter!=null&&(win||scripted)?'下一幕 ↗':'再跑一次 ↗'}</button><button id="result-home">${c.trial?'章节选择':'回到首页'}</button></div>`;
  $('result-next').onclick=()=>{
    if(c.chapter!=null&&(win||scripted)){
      const chapter=CHAPTERS[c.chapter];if(chapter.after){scene(chapter.after,()=>c.trial?chapterMenu():startChapter(c.chapter+1,false),'',true,'silent');}
      else if(c.trial&&c.finale)startChapter(13,true);else if(c.trial)chapterMenu();else startChapter(c.chapter+1,false);
    }else startRace(c);
  };
  $('result-home').onclick=c.trial?chapterMenu:menu;
}
function endCard(title,text,done,label){hideLayers();state.screen='result';silence(true);show('result',true);$('result').innerHTML=`<p class="eyebrow">EPILOGUE / 下一座山</p><h2>${title}</h2><p>${text}</p><button class="primary" id="end-home">${label} ↗</button>`;$('end-home').onclick=done;}
function pause(){
  if(!['race','dialogue','timed','qte'].includes(state.screen))return;
  if(state.paused)return resume();state.paused=true;clearInputs();document.body.classList.add('paused');show('panel',true);$('panel').innerHTML='<p class="eyebrow">PAUSE / 先歇一会儿</p><h2>山不会跑。</h2><p>车和时间都停在这里。</p><div class="result-actions"><button id="resume" class="primary">继续 ↗</button><button id="pause-home">回到首页</button></div>';$('resume').onclick=resume;$('pause-home').onclick=menu;
}
function resume(){state.paused=false;document.body.classList.remove('paused');show('panel',false);clearInputs();last=performance.now();accumulator=0;}
function inspectCourse({track:id='downhill',s=0,offset=0,overview=false,weather='day',car='ae86'}={}){
  startRace({car,track:id,mode:'time',weather,practice:true,assist:false,title:'赛道检查'});
  state.race.player=createVehicle(track,car,s,offset);state.race.countdown=0;state.race.phase='driving';state.paused=true;
  world.inspectionView={overview};world.cameraStarted=false;show('hud',!overview);$('toast').textContent='';updateHUD();return snapshot();
}
function snapshot(){const r=state.race;return {screen:state.screen,paused:state.paused,chapter:state.chapter,trial:state.trial,quiet:state.quiet,save:structuredClone(save),storageOK:state.storageOK,dialogue:state.screen==='dialogue'?{line:lineIndex,text:sceneLines[lineIndex]?.text}:null,three:'0.186.1',threeRevision:world.revision,fixedStep:STEP,visual:structuredClone(world.visualState),track:{id:track.id,layoutVersion:track.layoutVersion,length:track.length,surfaceLength:track.surfaceLength,bounds:track.bounds,eyeTrigger:track.eyeTrigger,straightStart:track.straightStart,gutterZones:track.gutterZones},race:r?{phase:r.phase,time:r.elapsed,phaseTime:r.phaseTime,outcome:r.outcome,eyeSeen:r.eyeSeen,config:structuredClone(r.config),player:structuredClone(r.player),opponents:structuredClone(r.opponents)}:null,danmaku:$('danmaku').children.length};}
function frame(now){
  const dt=Math.min((now-last)/1000,.08);last=now;accumulator+=dt;
  while(accumulator>=STEP){
    const r=state.race;if(r)previousFrame={race:r,reference:r.player,player:{...r.player},opponents:r.opponents.map(o=>({...o}))};
    update(STEP);accumulator-=STEP;
  }
  const r=state.race;let v=r?r.player:menuVehicle,opponents=r?r.opponents:[],mode=state.screen==='menu'||state.screen==='panel'&&!r?'menu':'race';
  if(r&&!state.paused&&previousFrame?.race===r&&previousFrame.reference===r.player){v=interpolateVehicle(previousFrame.player,r.player,accumulator/STEP);opponents=interpolateOpponents(previousFrame.opponents,r.opponents,accumulator/STEP);}
  if(r?.phase==='eye'){const p=track.at(track.eyeTrigger);v={...r.player,x:p.x-p.tz*1.7,y:p.y,z:p.z+p.tx*1.7,yaw:Math.atan2(p.tx,p.tz)};opponents=[{id:'benz',s:track.eyeTrigger,offset:1.7}];mode='eye';}
  if(state.screen==='dialogue'||state.screen==='timed')mode='menu';
  world.render(v,opponents,state.paused?0:dt,mode,now/1000,state.screen==='race'&&!state.quiet&&r.phase==='driving');if(r&&!state.paused)updateHUD();
  const soundMode=state.paused?'silent':state.screen==='race'?(r.phase==='eye'||r.phase==='silence'?'engine':r.phase==='straight'?'engine':'race'):['dialogue','timed'].includes(state.screen)?state.sceneMode:'silent';audio.update(r?.player.speed||0,soundMode,r?.player.combo||0,(r?.opponents.filter(o=>o.s>r.player.s).length||0)+1,state.quiet?0:r?.player.driftIntensity||0);
  requestAnimationFrame(frame);
}
try{
  world=new World($('world'),track);
  $('story').onclick=()=>startChapter(save.next>=14?13:save.next,false);$('practice').onclick=()=>startRace({car:'ae86',track:'downhill',mode:'time',weather:'dawn',title:'先练一段漂移',motive:'漂移，是所有故事的地基。',practice:true,assist:true});$('free').onclick=freeMenu;$('chapters').onclick=chapterMenu;$('next').onclick=nextLine;$('pause').onclick=pause;
  $('sound').onclick=async()=>{$('sound').textContent=(await audio.toggle())?'声音 ON':'声音 OFF';};
  $('comments').onclick=()=>{state.danmaku=!state.danmaku;$('comments').textContent=state.danmaku?'弹幕 ON':'弹幕 OFF';if(!state.danmaku)$('danmaku').replaceChildren();};
  $('reset').onclick=()=>{panel('<p class="eyebrow">NEW GAME / 重新走一遍</p><h2>回到那个夏天。</h2><p>会清除本版本的主线进度、车库解锁与个人成绩。</p><div class="result-actions"><button id="confirm-reset" class="primary">清除进度，重新开始</button><button data-home>保留进度</button></div>');$('confirm-reset').onclick=()=>{save=makeSave();persist();menu();};};
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(!e.repeat){if(e.code==='KeyP'||e.code==='Escape'){pause();return;}if(e.code==='Enter'&&state.screen==='dialogue'){nextLine();return;}if(state.screen==='qte'){qteInput(e.code);return;}if(e.code==='KeyR'&&state.screen==='race'){startRace(state.race.config);return;}}keys.add(e.code);});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{clearInputs();if(!state.paused)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(!state.paused)pause();}});
  document.querySelectorAll('[data-control]').forEach(b=>{const release=()=>{touch[b.dataset.control]=false;b.classList.remove('held');};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch[b.dataset.control]=true;b.classList.add('held');});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
  window.__bench={getState:snapshot};
  if(new URLSearchParams(location.search).has('bench'))Object.assign(window.__bench,{startChapter:(id)=>startChapter(id,true),next:nextLine,startRace,inspectCourse,inspectSurface:(s,offset=0)=>world.inspectSurface(s,offset),advance:(seconds,i={throttle:true,steer:0,brake:false,handbrake:false})=>{for(let n=0;n<Math.round(seconds/STEP);n++)update(STEP,i);previousFrame=null;updateHUD();return snapshot();}});
  menu();requestAnimationFrame(frame);
}catch(e){show('fatal',true);$('fatal').textContent=`赛车画面无法启动：${e.message}。请使用支持 WebGL 2 的浏览器。`;console.error(e);}
