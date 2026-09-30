import {SAVE_KEY,NEEDS,WISHES,SHOP,initialState,readSave,objectsFor,pathTo,pathToObject,isBlocked,distanceTo,mood,advance,actionsFor,actionError,completeAction,buyUpgrade,formatTime,addJournal} from './model.js';
import {Renderer,drawPortrait,drawShopPreview} from './art.js';
import {Music} from './audio.js';

const $=id=>document.getElementById(id);
const paths={
  home:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5m6-2v16m6-14v16',bag:'M5 7h14l2 14H3L5 7m3 0V6a4 4 0 0 1 8 0v1',book:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3V4m9 2v15',pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM12 7v6m-3-3h6',sun:'M12 3V1m0 22v-2M3 12H1m22 0h-2M5 5 3 3m18 18-2-2M5 19l-2 2M21 3l-2 2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',sparkle:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',pause:'M8 5v14m8-14v14',play:'m7 4 13 8-13 8V4',mouse:'M6 9a6 6 0 1 1 12 0v6a6 6 0 0 1-12 0V9m6-6v6',coin:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-6-4h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-10v12',food:'M4 3v6a3 3 0 0 0 6 0V3M7 3v18m13-18c-5 0-5 10 0 10V3m0 10v8',energy:'m13 2-8 12h6l-1 8 9-13h-7l1-7',drop:'M12 2S5 10 5 15a7 7 0 1 0 14 0c0-5-7-13-7-13ZM8 15a4 4 0 0 0 4 4',bath:'M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3m2 0V5a2 2 0 0 1 4 0v1M5 20v2m14-2v2',game:'M7 7h10a4 4 0 0 1 4 4v6c0 3-3 3-5 0H8c-2 3-5 3-5 0v-6a4 4 0 0 1 4-4Zm0 3v5m-2-2h4m7-2h.01m2 3h.01',heart:'M12 21S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 13-10 13Z',save:'M4 3h13l4 4v14H3V3h1m3 0v6h9V3M7 21v-8h10v8',sound:'m3 9 5 0 5-5v16l-5-5H3V9m13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',muted:'m3 9 5 0 5-5v16l-5-5H3V9m14 0 5 6m0-6-5 6',leaf:'M20 3C9 1 2 8 5 16c6 8 17 0 15-13ZM5 20 16 8',coffee:'M4 5h12v11a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V5m12 2h2a4 4 0 0 1 0 8h-2M2 22h18M8 1v1m4-1v1',fish:'M17 12c-4-9-13-9-15 0 2 9 11 9 15 0Zm0 0 5-6v12l-5-6M7 10h.01',check:'m5 12 4 4L19 6',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-5v5l3 2'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.sparkle}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
$('sound-button').innerHTML=icon('muted');
let loaded=null,storageAvailable=true;
try{loaded=readSave(localStorage.getItem(SAVE_KEY));}catch{storageAvailable=false;}
let state=loaded||initialState();
const renderer=new Renderer($('game')),music=new Music();
const keys=new Set(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let speed=1,paused=false,route=[],routeTarget=null,near=null,hover=null,activeAction=null,modal=null,elapsed=0,lastFrame=performance.now(),uiTimer=0,saveTimer=0,toastTimer,saveLabelTimer,moving=false;
const visual={time:0,moving:false,reducedMotion};

$('needs-list').innerHTML=NEEDS.map(n=>`<div class="need" style="--need-color:${n.color}"><span style="color:${n.color}">${icon(n.icon)}</span><span>${n.label}</span><div class="need-track" role="progressbar" aria-label="${n.label}" aria-valuemin="0" aria-valuemax="100" id="need-track-${n.id}"><div id="need-fill-${n.id}" class="need-fill"></div></div><span class="need-value" id="need-value-${n.id}"></span></div>`).join('');
$('wishes-list').innerHTML=WISHES.map(w=>`<button class="wish" data-wish="${w.id}"><span class="wish-check"></span><span>${w.label}</span></button>`).join('');
drawPortrait($('portrait'));
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function save(manual=false){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));storageAvailable=true;$('save-indicator').innerHTML='<span></span>进度已保存';clearTimeout(saveLabelTimer);saveLabelTimer=setTimeout(()=>$('save-indicator').innerHTML='<span></span>自动存档已开启',3000);if(manual)toast('这一刻的生活，已经好好保存。');return true;}
  catch{storageAvailable=false;$('save-indicator').textContent='浏览器未允许存档';if(manual)toast('浏览器未允许本地存储，本次进度暂时无法保存。');return false;}
}
function syncUI(){
  $('clock').textContent=formatTime(state.time);$('day-label').textContent=`春 · 第 ${state.day} 天`;$('money').textContent=state.money.toLocaleString('zh-CN');$('mobile-money').textContent='§ '+state.money.toLocaleString('zh-CN');
  const feeling=mood(state);$('mood-badge').textContent=feeling>65?'心情很棒':feeling>40?'平平淡淡':'需要关心';$('mood-label').textContent=feeling>65?'状态很棒，今天也要开心！':feeling>40?'慢慢来，也照顾一下自己。':'有点累了，先满足小需求吧。';
  for(const n of NEEDS){const value=Math.round(state.needs[n.id]);$('need-value-'+n.id).textContent=value;$('need-fill-'+n.id).style.width=value+'%';$('need-fill-'+n.id).style.background=value<25?'#ce8c77':n.color;$('need-track-'+n.id).setAttribute('aria-valuenow',value);}
  const lowest=NEEDS.reduce((a,b)=>state.needs[a.id]<state.needs[b.id]?a:b);$('needs-note').textContent=state.needs[lowest.id]<30?`${lowest.label}有点低了，先照顾一下自己。`:'吃饱睡好，快乐就会多一点。';
  $('wish-count').textContent=`${state.wishes.length} / 3`;document.querySelectorAll('[data-wish]').forEach(el=>{const done=state.wishes.includes(el.dataset.wish);el.classList.toggle('done',done);el.querySelector('.wish-check').textContent=done?'✓':'';el.setAttribute('aria-label',WISHES.find(w=>w.id===el.dataset.wish).label+(done?'，已完成':'，点击前往'));});
  $('location-label').textContent=state.scene==='home'?'梧桐巷 · 我的小屋':'晴日广场 · 镇中心';$('location-tag').textContent=state.scene==='home'?'HOME':'TOWN';$('scene-caption').textContent=state.scene==='home'?'属于你的小小天地':'转个弯，就遇见新的故事';
  near=objectsFor(state.scene).filter(o=>!o.decor&&distanceTo(o,state.player.x,state.player.y)<1.12).sort((a,b)=>distanceTo(a,state.player.x,state.player.y)-distanceTo(b,state.player.x,state.player.y))[0]||null;
  const focus=activeAction?objectsFor(state.scene).find(o=>o.id===activeAction.objectId):routeTarget||near;
  $('interaction-title').textContent=activeAction?activeAction.action.label:routeTarget?`去看看「${routeTarget.name}」`:focus?focus.name:'新生活，从一个小小的决定开始';
  $('interaction-description').textContent=activeAction?'享受当下，生活正在慢慢变好。':routeTarget?'正在走过去，按方向键或 Esc 可以取消。':focus?focus.description:'点击家具互动，或随意走走。';
  $('interaction-icon').innerHTML=icon(focus?.icon||'sparkle');$('interact-button').innerHTML=activeAction?'取消行动 <kbd>Esc</kbd>':routeTarget?'取消行走 <kbd>Esc</kbd>':near?'互动 <kbd>E</kbd>':'探索一下 <kbd>E</kbd>';
  if(!storageAvailable)$('save-indicator').textContent='浏览器未允许存档';
}
function closeDialog(){if($('dialog').open)$('dialog').close();modal=null;keys.clear();document.querySelectorAll('.nav-tab').forEach(el=>el.classList.toggle('active',el.id==='home-tab'));lastFrame=performance.now();}
function openDialog(title,eyebrow='POCKET DAYS',kind='interaction'){
  if(activeAction){toast('先完成当前行动，或按 Esc 取消。');return false;}
  route=[];routeTarget=null;keys.clear();modal=kind;$('dialog-title').textContent=title;$('dialog-eyebrow').textContent=eyebrow;$('dialog-body').replaceChildren();if(!$('dialog').open)$('dialog').showModal();music.click();return true;
}
function paragraph(text){const p=document.createElement('p');p.className='dialog-description';p.textContent=text;return p;}
function choice(label,detail,iconName,onClick,tail='→'){
  const button=document.createElement('button');button.className='choice';button.innerHTML=`<span class="choice-icon">${icon(iconName)}</span><span class="choice-body"><strong></strong><small></small></span><span class="choice-tail"></span>`;button.querySelector('strong').textContent=label;button.querySelector('small').textContent=detail;button.querySelector('.choice-tail').textContent=tail;button.onclick=onClick;return button;
}
function interact(o=near){
  if(activeAction){cancelAction();return;}if(routeTarget){route=[];routeTarget=null;syncUI();return;}if(paused){toast('先让时间继续，再开始新的行动吧。');return;}
  if(!o){const target=objectsFor(state.scene).find(o=>o.id===(state.scene==='home'?'fridge':'neighbor'));navigateTo(target);return;}
  if(o.decor)return;
  if(o.id==='exit'){changeScene('town');return;}if(o.id==='home'){changeScene('home');return;}if(o.id==='shop'){showShop();return;}
  if(!openDialog(o.name,o.id==='neighbor'?`NEIGHBORS / 好感 ${state.friendship} / 100`:'LITTLE MOMENTS'))return;
  const body=$('dialog-body');body.append(paragraph(o.id==='neighbor'?(state.friendship>=45?'「和你聊天总是很开心！下次我们一起去喝咖啡吧。」':o.description):o.description));
  for(const a of actionsFor(state,o.id)){
    const error=actionError(state,a),button=choice(a.label,error||a.detail,o.icon,()=>startAction(a,o.id),error?'暂不可用':`${a.minutes>=60?(a.minutes/60).toFixed(a.minutes%60?1:0)+'h':a.minutes+'m'}`);
    button.disabled=!!error;body.append(button);
  }
}
function navigateTo(o){
  if(paused||modal||activeAction)return;
  const p=pathToObject(state.scene,state.player,o);if(p===null){toast('暂时走不到这里，换个位置试试。');return;}
  if(p.length===0){interact(o);return;}route=p;routeTarget=o;syncUI();music.click();
}
function changeScene(scene){
  closeDialog();route=[];routeTarget=null;hover=null;state.scene=scene;state.player=scene==='town'?{x:15.5,y:16.5,dir:'up'}:{x:14.5,y:14.5,dir:'up'};near=null;renderer.cache='';$('arrival').classList.add('visible');setTimeout(()=>$('arrival').classList.remove('visible'),160);syncUI();save();toast(scene==='town'?'欢迎来到镇中心。去跟树下的小葵打个招呼吧。':'到家了。这里总有一个舒服的位置留给你。');
}
function startAction(action,objectId){
  const error=actionError(state,action);if(error){toast(error);return;}
  closeDialog();activeAction={action,objectId,progress:0};keys.clear();route=[];routeTarget=null;clearTimeout(toastTimer);$('toast').classList.remove('visible');$('action-progress').hidden=false;$('action-label').textContent=action.label;$('action-fill').style.width='0%';music.click();syncUI();
}
function cancelAction(){if(activeAction){activeAction=null;$('action-progress').hidden=true;toast('先放一放，时间和零钱都还在。');}route=[];routeTarget=null;syncUI();}
function finishAction(){const a=activeAction.action;activeAction=null;$('action-progress').hidden=true;const result=completeAction(state,a);if(result.error){toast(result.error);return;}music.success();syncUI();save();toast(result.wish?`小心愿完成！额外收到 §30。${state.wishes.length===3?' 三个心愿都实现啦！':''}`:a.sleep?`早安，第 ${state.day} 天。新的一天也要好好生活。`:`${a.label}，感觉好多了。${a.income?` + §${a.income}`:''}`);}
function showShop(){
  if(!openDialog('给小家添点喜欢','THE LITTLE GOODS / 家具送到家','shop'))return;
  $('home-tab').classList.remove('active');$('shop-tab').classList.add('active');const body=$('dialog-body');body.append(paragraph(`每件小东西，都让这里更像家。当前零钱 §${state.money}，购买后自动摆好。`));const grid=document.createElement('div');grid.className='dialog-grid';
  for(const p of SHOP){
    const owned=state.upgrades.includes(p.id),button=choice(p.name,p.desc,'bag',()=>{const result=buyUpgrade(state,p.id);if(result.error){toast(result.error);return;}music.success();save();syncUI();showShop();toast(`「${p.name}」已经送到家啦。`);},owned?'已经拥有':`§ ${p.cost}`);
    const canvas=document.createElement('canvas');canvas.width=48;canvas.height=40;canvas.className='shop-preview';button.querySelector('.choice-icon').replaceChildren(canvas);drawShopPreview(canvas,p.kind);button.classList.toggle('purchased',owned);button.disabled=owned||state.money<p.cost;grid.append(button);
  }body.append(grid);
}
function showMap(){
  if(!openDialog('晴日小镇，随便逛逛','SUNNY TOWN / WALK A LITTLE FURTHER','map'))return;
  $('home-tab').classList.remove('active');$('map-tab').classList.add('active');const body=$('dialog-body');body.append(paragraph('从小屋出发，过一条安静的小路，就到了镇中心。点击地点可以直接前往。'));
  const map=document.createElement('div');map.className='map-scene';const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;map.append(canvas);body.append(map);new Renderer(canvas).draw({...state,scene:'town',player:{x:15.5,y:16.5,dir:'up'}},{reducedMotion:true});
  body.append(choice('梧桐巷 · 我的小屋','料理、休息、阅读，把自己照顾好。','home',()=>changeScene('home'),state.scene==='home'?'你在这里':'前往 →'));
  body.append(choice('晴日广场 · 镇中心','晴日咖啡 · 邻居小葵 · 花圃与池塘','map',()=>changeScene('town'),state.scene==='town'?'你在这里':'前往 →'));
}
function showDiary(){
  if(!openDialog('把小日子，记下来','MY EVERYDAY JOURNAL','diary'))return;
  const body=$('dialog-body');body.append(paragraph(`第 ${state.day} 天 · 和小葵的好感 ${state.friendship}/100 · 已完成 ${state.wishes.length} 个搬家心愿。${state.wishes.length===3?'你已经在小镇站稳脚跟。接下来，攒齐喜欢的家具，继续过自己的生活。':''}`));
  for(const entry of state.journal){const div=document.createElement('div');div.className='journal-entry';const time=document.createElement('time');time.textContent=`DAY ${String(entry.day).padStart(2,'0')} · ${formatTime(entry.time)}`;div.append(time,document.createTextNode(entry.text));body.append(div);}
}
function showHelp(){
  if(!openDialog('欢迎搬来晴日小镇','HOW TO PLAY / 从容开始','help'))return;
  const body=$('dialog-body');body.append(paragraph('你是刚搬到梧桐巷的小满。照顾六项需求，去咖啡店做兼职、结识小葵，再为小屋添置喜欢的家具。没有截止日期，按自己的节奏来。'));
  for(const [key,desc]of [['W A S D / ↑ ↓ ← →','移动角色；也可以点击地面。'],['E / 空格 / A 按钮','靠近后互动；点击家具会自动走过去。'],['Esc','关闭菜单，取消行走或当前行动。'],['P / 暂停按钮','暂停或继续。菜单打开时也会暂停。'],['1× / 2× / 3×','调整游戏速度。后台标签页自动暂停。']]){const row=document.createElement('div');row.className='help-row';const a=document.createElement('span');a.textContent=key;const b=document.createElement('span');b.textContent=desc;row.append(a,b);body.append(row);}
  body.append(paragraph('咖啡店兼职每天一次，08:00—16:00 可以开始。照料花圃也能赚钱。饿了没钱就吃冰箱里的免费麦片。精力耗尽会就地休息；如厕值归零会弄脏衣服，记得洗澡。'));
  const footer=document.createElement('div');footer.className='dialog-footer';const span=document.createElement('span');span.textContent='每 15 秒及重要行动后自动存档于当前浏览器';const reset=document.createElement('button');reset.textContent='重新开始生活';reset.onclick=showReset;footer.append(span,reset);body.append(footer);
}
function showReset(){
  if(!openDialog('重新搬进小镇？','A FRESH START','reset'))return;const body=$('dialog-body');body.append(paragraph('这会用全新的第 1 天覆盖当前浏览器里的进度，包括零钱、家具和关系。'));
  body.append(choice('保留现在的生活','继续眼前的小日子。','heart',closeDialog));body.append(choice('确认重新开始','当前存档会被覆盖。','home',()=>{state=initialState();activeAction=null;route=[];routeTarget=null;paused=false;$('pause-overlay').hidden=true;$('pause-button').innerHTML=icon('pause');$('pause-button').setAttribute('aria-label','暂停游戏');closeDialog();renderer.cache='';save();syncUI();toast('阳光正好。让我们重新开始。');}));
}
function togglePause(){if(modal)return;paused=!paused;keys.clear();$('pause-overlay').hidden=!paused;$('pause-button').innerHTML=icon(paused?'play':'pause');$('pause-button').setAttribute('aria-label',paused?'继续游戏':'暂停游戏');lastFrame=performance.now();}
function setSpeed(n){speed=n;document.querySelectorAll('[data-speed]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.speed)===n);b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===n));});}

$('close-dialog').onclick=closeDialog;$('dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const rect=$('dialog').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeDialog();}});
$('home-tab').onclick=closeDialog;$('map-tab').onclick=showMap;$('shop-tab').onclick=showShop;$('diary-button').onclick=showDiary;$('help-button').onclick=showHelp;$('save-button').onclick=()=>save(true);
$('sound-button').onclick=async()=>{try{const on=await music.toggle();$('sound-button').innerHTML=icon(on?'sound':'muted');$('sound-button').setAttribute('aria-label',on?'关闭游戏音乐':'打开游戏音乐');$('sound-button').title=on?'关闭游戏音乐':'打开游戏音乐';toast(on?'小镇的音乐响起来了。':'音乐已关闭，安安静静也很好。');}catch{toast('当前浏览器暂时无法播放音乐。');}};
$('pause-button').onclick=togglePause;$('resume-button').onclick=togglePause;$('interact-button').onclick=()=>interact();$('mobile-action').onclick=()=>interact();
$('view-button').onclick=()=>{const expanded=document.body.classList.toggle('expanded');$('view-button').setAttribute('aria-label',expanded?'恢复默认画面':'展开游戏画面');$('view-button').title=expanded?'恢复默认画面':'展开游戏画面';};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.speed)));
document.querySelectorAll('[data-wish]').forEach(b=>b.onclick=()=>{const w=WISHES.find(w=>w.id===b.dataset.wish);if(state.wishes.includes(w.id)){toast('这个小心愿已经实现啦，真好。');return;}if(activeAction||paused)return;closeDialog();if(state.scene!==w.scene)changeScene(w.scene);toast(w.tip);navigateTo(objectsFor(w.scene).find(o=>o.id===w.target));});

const moves={ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(e.code==='Escape'){if(modal)closeDialog();else cancelAction();return;}
  if(modal)return;
  // Preserve keyboard activation of focused UI buttons and links.
  if((e.code==='Space'||e.code==='Enter')&&e.target.closest('button,a'))return;
  if(moves[e.code]){e.preventDefault();if(!paused&&!activeAction){keys.add(e.code);route=[];routeTarget=null;}return;}
  if(['Space','KeyE','KeyZ','KeyJ'].includes(e.code)){e.preventDefault();if(!e.repeat)interact();}
  if(e.code==='KeyP'&&!e.repeat)togglePause();
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();});document.addEventListener('visibilitychange',()=>{keys.clear();lastFrame=performance.now();if(document.hidden)save();});window.addEventListener('pagehide',()=>save());
document.querySelectorAll('[data-key]').forEach(b=>{const clear=()=>keys.delete(b.dataset.key);b.addEventListener('pointerdown',e=>{e.preventDefault();if(paused||modal||activeAction)return;b.setPointerCapture(e.pointerId);route=[];routeTarget=null;keys.add(b.dataset.key);});b.addEventListener('pointerup',clear);b.addEventListener('pointercancel',clear);b.addEventListener('lostpointercapture',clear);});
function pointerLocation(e){const b=$('game').getBoundingClientRect();return{x:(e.clientX-b.left)/b.width*30,y:(e.clientY-b.top)/b.height*20};}
function objectAt(p){return objectsFor(state.scene).filter(o=>!o.decor&&p.x>=o.x&&p.x<o.x+o.w&&p.y>=o.y-.45&&p.y<o.y+o.h).sort((a,b)=>(b.y+b.h)-(a.y+a.h))[0]||null;}
$('game').addEventListener('pointermove',e=>{hover=objectAt(pointerLocation(e));$('game').style.cursor=hover?'pointer':'crosshair';});$('game').addEventListener('pointerleave',()=>hover=null);
$('game').addEventListener('pointerdown',e=>{
  if(e.button!==0||paused||modal||activeAction)return;e.preventDefault();$('game').focus({preventScroll:true});const p=pointerLocation(e),o=objectAt(p);if(o){navigateTo(o);return;}
  const path=pathTo(state.scene,state.player,p);if(path!==null){route=path;routeTarget=null;music.click();}else toast('这里有东西挡着，换块空地试试。');
});

function movePlayer(dx,dy,dt){
  const p=state.player,velocity=3.5*dt,length=Math.hypot(dx,dy);if(!length)return false;dx=dx/length*velocity;dy=dy/length*velocity;
  p.dir=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  const can=(x,y)=>![[x-.19,y-.14],[x+.19,y-.14],[x-.19,y+.14],[x+.19,y+.14]].some(([a,b])=>isBlocked(state.scene,a,b));
  const oldX=p.x,oldY=p.y;if(can(p.x+dx,p.y))p.x+=dx;if(can(p.x,p.y+dy))p.y+=dy;return Math.abs(p.x-oldX)+Math.abs(p.y-oldY)>.0001;
}
function update(dt){
  if(document.hidden||paused||modal){moving=false;return;}
  const delta=dt*speed;moving=false;
  if(activeAction){activeAction.progress+=delta;$('action-fill').style.width=Math.min(100,activeAction.progress/activeAction.action.seconds*100)+'%';if(activeAction.progress>=activeAction.action.seconds)finishAction();return;}
  advance(state,delta*3);
  if(state.needs.energy===0){toast('太困了，小满就地打了个盹。');startAction({label:'太困了，休息一会儿',detail:'',minutes:180,effect:{energy:45},seconds:5,cost:0},'bed');return;}
  if(state.needs.bladder===0){state.needs.bladder=55;state.needs.hygiene=Math.max(0,state.needs.hygiene-25);addJournal(state,'没来得及去洗手间，衣服弄脏了。下次记得早点去。');toast('衣服弄脏了，去淋浴间洗个澡吧。');}
  let dx=0,dy=0;for(const key of keys){const v=moves[key];if(v){dx+=v[0];dy+=v[1];}}
  if(dx||dy)moving=movePlayer(dx,dy,delta);
  else if(route.length){
    const p=route[0],x=p.x-state.player.x,y=p.y-state.player.y,d=Math.hypot(x,y);
    if(d<.06){state.player.x=p.x;state.player.y=p.y;route.shift();}
    else moving=movePlayer(x,y,Math.min(delta,d/3.5));
    if(!route.length&&routeTarget){const target=routeTarget;routeTarget=null;interact(target);}
  }
}
function frame(now){const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;elapsed+=dt;update(dt);uiTimer+=dt;saveTimer+=dt;if(uiTimer>.12){syncUI();uiTimer=0;}if(saveTimer>15&&!activeAction&&!document.hidden){save();saveTimer=0;}visual.time=reducedMotion?0:elapsed;visual.moving=moving;visual.near=modal||paused?null:near;visual.hover=modal?null:hover;visual.action=activeAction;visual.destination=route.length?route[route.length-1]:null;renderer.draw(state,visual);requestAnimationFrame(frame);}
syncUI();renderer.draw(state,visual);requestAnimationFrame(frame);
// Read-only state plus normal input surfaces for reproducible local QA.
window.__bench={ready:true,getState:()=>({ ...structuredClone(state),paused,speed,modal,moving,routeLength:route.length,activeAction:activeAction?.action.label||null,mood:mood(state)}),shot:()=>$('game').toDataURL('image/png')};
if(loaded)toast(`欢迎回来，小满。你的第 ${state.day} 天还在继续。`);
