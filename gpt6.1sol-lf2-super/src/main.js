import './style.css';
import {manifest,assetURL,loadVersion} from './assets.js';
import {createEngineHost} from './engine-host.js';
import {renderRemotePanel} from './remote-play.js';

const $ = selector => document.querySelector(selector);
const escapeHTML = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editions = [
  {id:'ver1',num:'I',name:'初始大改版',subtitle:'ORIGINAL EDITION',copy:'从熟悉的香港体育馆出发。皮卡丘 Kate 加入战局，经典角色的连招与必杀全面强化。'},
  {id:'ver2',num:'II',name:'闯关进阶版',subtitle:'STAGE PLUS',copy:'新的战场，更强的敌人。Kate 的进阶形态与宝可梦召唤登场，挑战改版的完整闯关。'},
  {id:'ver3',num:'III',name:'最终小游戏版',subtitle:'2× PLUS GAME',copy:'探索最终版的特殊关卡、音乐盒与招式说明场景。三阶段内容均来自作者发布包。'}
];
let selected = localStorage.getItem('lf2-super-edition') || 'ver1';
if(!editions.some(v=>v.id===selected)) selected='ver1';
let host, loading=false, running=false, leaving=false;
const app = $('#app');
app.innerHTML = `
  <header class="topbar">
    <a href="./" class="brand" aria-label="LF2 首页"><span class="brand-monogram">LF<span>2</span></span><span class="brand-copy">LITTLE FIGHTER <b>超级大改版</b></span></a>
    <nav aria-label="游戏工具"><button data-panel="roster">人物图鉴</button><button data-panel="moves">招式手册</button><button data-panel="remote">远程同屏</button><button data-panel="controls">操作说明</button><button id="full" title="全屏游戏">全屏 <span>↗</span></button></nav>
  </header>
  <main>
    <section class="arcade" aria-label="游戏区">
      <div class="arcade-bar"><div><span class="live-dot"></span><span id="edition-label">KATE EDITION</span></div><span class="bar-right">小朋友齐打交 <b>Ⅱ</b></span></div>
      <div class="screen-wrap" id="screen-wrap">
        <canvas id="game" width="794" height="550" tabindex="0" aria-label="LF2 游戏画面"></canvas>
        <div id="launcher" class="launcher">
          <div class="arena-background"></div><div class="launcher-vignette"></div>
          <div class="launch-heading"><span class="eyebrow">THE FIGHT IS BACK</span><h1><span>LITTLE</span><span>FIGHTER <em>2</em></span></h1><div class="title-line"><span></span><b>超 级 大 改 版</b><span></span></div></div>
          <div class="featured-fighters" aria-label="改版角色"></div>
          <div class="launch-action"><button id="start" class="primary">进入游戏 <span>▶</span></button><span id="launch-caption">选择版本，重回那场热血乱斗。</span></div>
        </div>
        <div id="loading" class="loading-screen" hidden><span class="loader-mark">LF2</span><h2>准备开战</h2><p id="load-detail" role="status">载入角色与场景…</p><div class="progress"><span id="progress-bar"></span></div><small id="load-percent">0%</small></div>
        <div id="error" class="error-screen" hidden><h2>游戏载入遇到问题</h2><p id="error-detail"></p><button id="retry">重新载入</button></div>
      </div>
      <div class="cabinet-footer"><span id="runtime-status">READY TO FIGHT</span><div><button id="pause" disabled>暂停 <kbd>F1</kbd></button><button id="back" disabled>返回选人 <kbd>F4</kbd></button><button id="reset">切换版本</button></div></div>
    </section>
    <aside class="edition-panel" id="edition-panel"><div class="section-line"><span>CHOOSE YOUR EDITION</span><span>01 — 03</span></div><div class="editions" role="tablist" aria-label="选择改版阶段">${editions.map(e=>`<button class="edition" data-edition="${e.id}" role="tab"><span class="edition-number">${e.num}</span><span><b>${e.name}</b><small>${e.subtitle}</small></span><span class="edition-arrow">↗</span></button>`).join('')}</div><p id="edition-copy"></p><div class="edition-meta" id="edition-meta"></div></aside>
    <section class="play-hints"><div><span class="hint-label">P1 · 移动</span><div class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><div><span class="hint-label">攻击 / 跳跃 / 防御</span><div class="keys"><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd></div></div><p><b>L → 方向 → J / K</b><span>组合出招 · 双击方向奔跑 · J 拾取道具</span></p><button data-panel="controls" class="text-button">查看全部操作 ↗</button></section>
    <footer><span>原作 Marti Wong & Starsky Wong · 改版 Kate / Keaton</span><button data-panel="about">版本与制作说明</button></footer>
  </main>
  <dialog id="dialog"><div class="dialog-head"><div><span class="eyebrow" id="dialog-kicker"></span><h2 id="dialog-title"></h2></div><button id="close-dialog" aria-label="关闭">×</button></div><div id="dialog-body"></div></dialog>
  <dialog id="remote-modal"><div class="dialog-head"><div><span class="eyebrow">PLAY TOGETHER</span><h2>远程同屏</h2></div><button id="close-remote" aria-label="关闭远程同屏面板">×</button></div><div id="remote-body"></div></dialog>
`;

function currentVersion(){return manifest.versions.find(v=>v.id===selected);}
function renderEdition() {
  const edition=editions.find(e=>e.id===selected), version=currentVersion();
  for(const el of document.querySelectorAll('[data-edition]')) { const active=el.dataset.edition===selected;el.classList.toggle('selected',active);el.setAttribute('aria-selected',String(active)); }
  $('#edition-label').textContent=`KATE EDITION ${edition.num} · ${edition.name}`;
  $('#edition-copy').textContent=edition.copy;
  $('#edition-meta').innerHTML=`<span><b>${version.characters.length}</b> 角色对象</span><span><b>${version.backgrounds.length}</b> 场景</span><span>原版精灵 · 原始招式帧</span>`;
  const roster=version.characters.filter(c=>['Davis','Freeze','Kate','Firen','Woody'].includes(c.name));
  const order=['Woody','Freeze','Kate','Firen','Davis'];
  roster.sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name));
  $('.featured-fighters').innerHTML=roster.map(c=>`<div class="fighter-portrait ${c.name==='Kate'?'hero-portrait':''}"><img src="${assetURL(c.head_preview)}" alt="${c.name}"/><span>${c.name==='Kate'?'KATE · 皮卡丘':c.name}</span></div>`).join('');
  const bg=version.backgrounds.find(b=>b.name.includes('Coliseum'));
  if(bg?.preview) $('.arena-background').style.backgroundImage=`url("${assetURL(bg.preview)}")`;
}
renderEdition();
document.querySelectorAll('[data-edition]').forEach(button=>button.addEventListener('click',()=>{
  if(loading||running)return;
  selected=button.dataset.edition;localStorage.setItem('lf2-super-edition',selected);renderEdition();
}));
function setStatus(detail,percent){$('#load-detail').textContent=detail;if(percent!=null){$('#progress-bar').style.width=`${percent}%`;$('#load-percent').textContent=`${Math.round(percent)}%`;}}
function fail(error){loading=false;$('#loading').hidden=true;$('#error').hidden=false;$('#error-detail').textContent=error.message||String(error);$('#runtime-status').textContent='LOAD FAILED';console.error(error);}
function download(bytes,name,type='application/octet-stream') {const url=URL.createObjectURL(new Blob([bytes],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('#start').addEventListener('click',async()=>{
  if(loading||running)return;
  loading=true;$('#launcher').hidden=true;$('#loading').hidden=false;$('#runtime-status').textContent='LOADING';
  document.querySelectorAll('[data-edition]').forEach(e=>e.disabled=true);
  try {
    const {files}=await loadVersion(selected,p=>setStatus('正在载入原始人物、场景与音效…',p*74));
    setStatus('正在准备游戏运行环境…',78);
    const installerResponse=await fetch(assetURL('runtime/lf2-resources.bin'));
    if(!installerResponse.ok)throw Error('基础资源包读取失败');
    const installerBytes=new Uint8Array(await installerResponse.arrayBuffer());
    const phases={verifying:'校验基础游戏资源…',runtime:'载入游戏引擎…',mounting:'准备角色与场景…',starting:'启动游戏…',ready:'准备完成'};
    host=createEngineHost({canvas:$('#game'),onStatus:s=>setStatus(phases[s.phase]||'正在启动游戏…',s.phase==='ready'?100:90),onError:fail,onLog:line=>{
      if(line==='KATE_HOST_ACTION:remote')openPanel('remote');
      else if(line==='KATE_HOST_ACTION:recordings')openPanel('recordings');
      else if(line==='KATE_HOST_ACTION:exit')returnToLauncher();
      else console.debug('[LF2]',line);
    },onReady:()=>{
      loading=false;running=true;document.title='LF2 超级大改版 · Kate';$('#loading').hidden=true;$('#runtime-status').textContent='GAME ON · 30 FPS';$('#pause').disabled=false;$('#back').disabled=false;$('#game').focus({preventScroll:true});
    }});
    await host.load({engineUrls:{js:assetURL('runtime/openlf2.js'),wasm:assetURL('runtime/openlf2.wasm'),data:assetURL('runtime/openlf2.data')},installerBytes,files,version:selected});
  }catch(error){fail(error);}
});
function sendKey(key,code,keyCode) {
  $('#game').focus({preventScroll:true});
  host?.sendKey(code,true);
  setTimeout(()=>host?.sendKey(code,false),80);
}
$('#pause').addEventListener('click',()=>sendKey('F1','F1',112));
$('#back').addEventListener('click',()=>sendKey('F4','F4',115));
$('#retry').addEventListener('click',()=>location.reload());
async function returnToLauncher(){
  if(leaving)return;
  leaving=true;
  await host?.persistRecordings?.().catch(console.warn);
  location.reload();
}
$('#reset').addEventListener('click',()=>{if(running||loading)returnToLauncher();else $('#edition-panel').scrollIntoView({behavior:'smooth',block:'center'});});
$('#full').addEventListener('click',()=>{
  if(document.fullscreenElement){document.exitFullscreen().catch(console.warn);return;}
  if(running&&typeof window.Module?.requestFullscreen==='function')window.Module.requestFullscreen();
  else document.body.classList.toggle('expanded');
});
document.addEventListener('keydown',event=>{if(event.code==='Escape'&&document.fullscreenElement)document.exitFullscreen().catch(console.warn);},true);
const dialog=$('#dialog');
let remotePanel;
$('#close-remote').onclick=()=>$('#remote-modal').close();
$('#remote-modal').addEventListener('close',()=>{remotePanel?.getSession()?.release();if(running)$('#game').focus({preventScroll:true});});
$('#close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{if(running)$('#game').focus({preventScroll:true});});

function openPanel(panel){
  if(panel==='remote'){
    if(!remotePanel)remotePanel=renderRemotePanel($('#remote-body'),{host:{getState:()=>host?.getState(),sendKey:(...args)=>host?.sendKey(...args)},canvas:$('#game')});
    $('#remote-modal').showModal();return;
  }
  const body=$('#dialog-body'), version=currentVersion();
  const titles={roster:['FIGHTER SELECT','人物图鉴'],moves:['MOVE LIST','原版招式手册'],controls:['HOW TO PLAY','操作说明'],about:['KATE / KEATON','版本与制作说明'],recordings:['REPLAY THE FIGHT','录像档案']};
  const [kicker,title]=titles[panel]||titles.about;$('#dialog-kicker').textContent=kicker;$('#dialog-title').textContent=title;
  if(panel==='roster'){
    body.innerHTML=`<p class="dialog-intro">${editions.find(e=>e.id===selected).name} · 以下头像与名称均来自该版本原始角色数据。Template 与 Pkmnt 也按原包保留。</p><div class="roster-grid">${version.characters.map(c=>`<div class="roster-character"><img src="${assetURL(c.head_preview)}" alt="${escapeHTML(c.name)}"/><b>${escapeHTML(c.name)}</b>${c.name==='Kate'?'<small>皮卡丘</small>':''}</div>`).join('')}</div>`;
  }else if(panel==='moves'){
    const moves=manifest.move_reference?.path||manifest.move_reference;
    const movePath=typeof moves==='string'?moves:manifest.move_reference?.preview;
    body.innerHTML=`<p class="dialog-intro">D = 防御（L） · A = 攻击（J） · J = 跳跃（K）。下图是作者包内原招式表，可横向滚动或打开原图放大。</p><a class="download-link" href="${assetURL(movePath)}" target="_blank" rel="noopener">打开完整招式表 ↗</a><div class="move-sheet"><img src="${assetURL(movePath)}" alt="Kate 大改版完整角色出招表" /></div><div class="move-legend"><span>→ / ← 面向方向</span><span>↑ / ↓ 上 / 下</span><span>抓人状态下的出招以手册为准</span></div>`;
  }else if(panel==='controls'){
    body.innerHTML=`<p class="dialog-intro">键盘最多 4 人同屏，战局最多 8 个参战槽。游戏内 Control Settings 可调整键位。选择人物后继续确认队伍；加入电脑后选择模式与场景。</p><table><thead><tr><th>动作</th><th>玩家 1</th><th>玩家 2</th><th>玩家 3</th><th>玩家 4</th></tr></thead><tbody><tr><td>移动</td><td>W A S D</td><td>方向键</td><td>T F G H</td><td>小键盘 8 4 5 6</td></tr><tr><td>攻击</td><td>J</td><td>1</td><td>Z</td><td>小键盘 1</td></tr><tr><td>跳跃</td><td>K</td><td>2</td><td>X</td><td>小键盘 2</td></tr><tr><td>防御</td><td>L</td><td>3</td><td>C</td><td>小键盘 3</td></tr></tbody></table><div class="control-notes"><p><b>菜单操作</b>开始界面点击 Game Start；模式菜单用 W / S 选择，J 确认，K 返回。选人时 J 加入，A / D 切换人物，J 确认人物和队伍。</p><p><b>基础操作</b>双击左右奔跑，跑步中攻击 / 跳跃 / 防御；站在道具旁攻击拾取；晕眩时贴近抓人，方向 + 攻击投掷。</p><p><b>必杀输入</b>依次按防御、方向、攻击或跳跃。比如皮卡丘电磁炮：L → 前 → J。面朝右时前为 D，面朝左时前为 A。</p><p><b>功能键</b>F1 暂停 · F2 单帧前进 · F4 返回选人 · F5 加速 · F6 无限 MP · F7 恢复 · F8 道具 · F9 清除道具。</p></div><button class="secondary" id="show-replays">录像档案</button>`;
    $('#show-replays').onclick=()=>openPanel('recordings');
  }else if(panel==='recordings'){
    const records=host?.exportRecordings?.()||[];
    body.innerHTML=`<p class="dialog-intro">游戏内开启 Recording 后，正常结束一场比赛才会生成录像；F4 中断比赛不会保存。录像自动保存在此浏览器，也可下载备份，须使用同一改版阶段回放。</p><div id="record-list">${records.length?records.map((r,i)=>`<div class="record-row"><span>${escapeHTML(r.name)}</span><button class="secondary" data-play-record="${i}">播放</button><button class="secondary" data-record="${i}">下载 ↓</button></div>`).join(''):'<p class="empty-state">还没有完成的录像。</p>'}</div><label class="secondary file-label">导入 .lfr 录像<input id="replay-file" type="file" accept=".lfr" ${running?'':'disabled'}/></label><p id="replay-status" role="status">${running?'':'请先进入游戏，再导入录像。'}</p>`;
    document.querySelectorAll('[data-record]').forEach(el=>el.onclick=()=>{const r=records[+el.dataset.record];download(r.bytes,r.name);});
    document.querySelectorAll('[data-play-record]').forEach(el=>el.onclick=async()=>{try{await host.importReplay(records[+el.dataset.playRecord].bytes);dialog.close();}catch(e){$('#replay-status').textContent=e.message;}});
    $('#replay-file').onchange=async(event)=>{try{const file=event.target.files[0];if(!file)return;await host.importReplay(new Uint8Array(await file.arrayBuffer()));dialog.close();}catch(e){$('#replay-status').textContent=e.message;}};
  }else{
    body.innerHTML=`<p class="dialog-intro">以作者 Kate / Keaton 发布的 LF2_Kate V1.00 为内容来源，保留三个阶段的角色、帧数据、音效和场景。网页运行采用 MIT 许可的 OpenLF2 引擎，并增加改版资源适配与浏览器界面。</p><div class="about-list"><p><b>I · 初始大改版</b>29 个角色对象 / 11 个场景</p><p><b>II · 闯关进阶版</b>31 个角色对象 / 16 个场景</p><p><b>III · 最终小游戏版</b>31 个角色对象 / 18 个场景（含音乐盒、说明图场景）</p></div><p>本移植保留原素材版权及署名。当前本地版本的运行验证与功能差异见项目交接文档；原包不含生存关卡数据。</p><a class="download-link" href="https://hcyang1227.blogspot.com/2019/11/lf2-kate.html" target="_blank" rel="noopener">改版作者发布页 ↗</a>`;
  }
  if(!dialog.open)dialog.showModal();
}
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>openPanel(button.dataset.panel)));
window.__bench={getState:()=>({selected,loading,running,engine:host?.getState?.()||null,assetCounts:{characters:currentVersion().characters.length,backgrounds:currentVersion().backgrounds.length}}),shot:()=>$('#game').toDataURL('image/png')};
