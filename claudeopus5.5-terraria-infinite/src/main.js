// 入口:贴图生成、标题界面(背景为实时生成的演示世界)、世界创建/列表、暂停/设置/说明/死亡界面、主循环与评测钩子。
import { STEP, DAY_TICKS } from './const.js';
import { buildAtlas } from './art.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { ChunkStore, listWorlds, getWorld, putWorld, deleteWorld } from './storage.js';
import { input, bindInput, endFrame, press, mouseButton } from './input.js';
import { initAudio, setVolumes, audioSettings, play } from './audio.js';
import { seedFromString } from './rng.js';
import { BIOME_NAMES } from './worldgen.js';
import { RACES, RACE_ORDER, CLASSES, FACTIONS, HAIR_STYLES, HAIR_COLORS, OUTFIT_COLORS, BEARDS, randomName } from './wow.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const canvas = $('game');
let renderer, ui, game = null, demo = null, menu = null;

// —— 设置
const settings = Object.assign({ scale: 0, smooth: true, sfx: 0.7, music: 0.35, minimap: true, fps: false, musicOn: true }, JSON.parse(localStorage.getItem('boundless:settings') || '{}'));
function applySettings() {
  renderer.userScale = settings.scale; renderer.smoothLight = settings.smooth; renderer.resize();
  setVolumes(settings.sfx, settings.music); audioSettings().musicOn = settings.musicOn;
  ui.showMinimap = settings.minimap; ui.showFps = settings.fps;
  localStorage.setItem('boundless:settings', JSON.stringify(settings));
}

// ———————————————————————— 菜单
function setMenu(html, dim = true) {
  const m = $('menu');
  if (!html) { m.classList.add('hidden'); m.innerHTML = ''; ui.menuOpen = false; return; }
  m.innerHTML = html; m.classList.remove('hidden'); m.classList.toggle('dim', dim); ui.menuOpen = true;
  m.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { play('ui'); ACTIONS[b.dataset.go]?.(b.dataset.arg); }));
  m.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('span').forEach(s => s.addEventListener('click', () => {
    seg.querySelectorAll('span').forEach(x => x.classList.remove('on')); s.classList.add('on'); play('ui');
  })));
}
const segVal = name => document.querySelector(`.seg[data-name="${name}"] span.on`)?.dataset.v;

function titleMenu() {
  menu = 'title';
  ui.showHud(false);
  setMenu(`<div class="mbox" style="min-width:420px">
    <div class="mtitle"><div class="logo">无垠拓荒</div><div class="logo-sub">BOUNDLESS FRONTIER · 2D 无限世界沙盒</div></div>
    <button class="mbtn" data-go="continue" id="btnCont" style="display:none">继续上次的世界</button>
    <button class="mbtn" data-go="newWorld">新建世界</button>
    <button class="mbtn" data-go="worlds">世界列表</button>
    <button class="mbtn" data-go="settings">设置</button>
    <button class="mbtn" data-go="help">玩法与操作说明</button>
    <div class="mnote" style="text-align:center">泰拉瑞亚式画面 · 我的世界式玩法 · 无限延伸的世界 · 独立运转的世界历法</div>
  </div><div class="footer">Claude Opus 5.5 · 程序化生成的像素美术与音效 · 存档保存在浏览器 IndexedDB</div>`, false);
  listWorlds().then(ws => { if (ws.length && menu === 'title') { const b = $('btnCont'); if (b) { b.style.display = ''; b.textContent = `继续:${ws[0].name}(第 ${(ws[0].day || 0) + 1} 天)`; b.dataset.arg = ws[0].id; } } });
}

function newWorldMenu() {
  menu = 'new';
  const n = 1 + Math.floor(Math.random() * 999);
  setMenu(`<div class="mbox" style="width:560px">
    <h2 style="margin:0 0 10px">新建世界</h2>
    <div class="mrow"><label>世界名称</label><input type="text" id="wName" value="新大陆 ${n}" maxlength="24"></div>
    <div class="mrow"><label>种子</label><input type="text" id="wSeed" placeholder="留空则随机;同一种子生成同一世界" maxlength="32"></div>
    <div class="mrow"><label>游戏模式</label><div class="seg" data-name="mode"><span data-v="survival" class="on">生存</span><span data-v="creative">创造</span></div></div>
    <div class="mrow"><label>难度</label><div class="seg" data-name="diff"><span data-v="0">和平</span><span data-v="1">简单</span><span data-v="2" class="on">普通</span><span data-v="3">困难</span></div></div>
    <div class="mrow"><label>一天时长</label><div class="seg" data-name="day"><span data-v="10">10 分钟</span><span data-v="20" class="on">20 分钟</span><span data-v="30">30 分钟</span><span data-v="48">48 分钟</span></div></div>
    <div class="mrow"><label>每季天数</label><div class="seg" data-name="season"><span data-v="3">3 天</span><span data-v="5" class="on">5 天</span><span data-v="7">7 天</span><span data-v="10">10 天</span></div></div>
    <div class="mnote">世界的时间独立运转:一天的长度和四季的长短由你决定。昼长随季节变化,冬季夜长怪多;
      离开某片区域后,那里的作物、树苗与熔炉仍会按流逝的世界时间继续生长和工作。</div>
    <div style="display:flex;gap:10px;margin-top:12px"><button class="mbtn" data-go="title">返回</button><button class="mbtn" data-go="create">下一步:创建角色</button></div>
  </div>`);
  setTimeout(() => $('wName')?.addEventListener('keydown', e => e.stopPropagation()), 0);
  setTimeout(() => $('wSeed')?.addEventListener('keydown', e => e.stopPropagation()), 0);
}


// ———————————————————————— 角色创建
let pendingWorld = null, creator = null, previewTimer = null;
function newCreator(faction = Math.random() < 0.5 ? 'alliance' : 'horde') {
  const race = RACE_ORDER[faction][(Math.random() * 5) | 0];
  const st = { faction, race, cls: RACES[race].classes[0], gender: Math.random() < 0.5 ? 'm' : 'f', skin: 0, eye: 0, hairStyle: 0, hairColor: 1, beard: 0, shirt: 0, pants: 5, ruleset: 'normal', anim: 0 };
  randomizeLook(st);
  const [a, b] = randomName(race); st.name = a; st.surname = b;
  return st;
}
function randomizeLook(st) {
  const r = RACES[st.race], R = n => (Math.random() * n) | 0;
  st.skin = R(r.skins.length); st.eye = R(r.eyes.length); st.hairColor = R(HAIR_COLORS.length);
  st.hairStyle = st.gender === 'f' ? [1, 2, 5, 7, 9][R(5)] : [0, 3, 4, 6, 8][R(5)];
  st.beard = st.gender === 'm' ? (st.race === 'dwarf' ? 2 : R(4)) : 0;
  st.shirt = R(OUTFIT_COLORS.length); st.pants = R(OUTFIT_COLORS.length);
}
function creatorLook(st) {
  const r = RACES[st.race];
  return {
    race: st.race, body: r.body, ears: r.ears, tusks: r.tusks, horns: r.horns, undead: r.undead, glowEyes: r.glowEyes, gender: st.gender,
    skin: r.skins[st.skin % r.skins.length], eye: r.eyes[st.eye % r.eyes.length], hair: HAIR_COLORS[st.hairColor], hairStyle: st.hairStyle,
    beard: st.gender === 'm' ? st.beard : 0, shirt: OUTFIT_COLORS[st.shirt], pants: OUTFIT_COLORS[st.pants], shoes: '#3a2a1a',
  };
}
function stopPreview() { if (previewTimer) clearInterval(previewTimer); previewTimer = null; }
function creatorMenu() {
  menu = 'creator';
  if (!creator) creator = newCreator();
  const st = creator, race = RACES[st.race];
  if (!race.classes.includes(st.cls)) st.cls = race.classes[0];
  const sw = (key, list, cur) => `<div class="swatches">${list.map((c, i) => `<span class="sw ${i === cur ? 'on' : ''}" data-k="${key}" data-v="${i}" style="background:${c}"></span>`).join('')}</div>`;
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<span data-k="${key}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</span>`).join('')}</div>`;
  const cls = CLASSES[st.cls];
  setMenu(`<div class="mbox creator">
    <div class="cleft">
      <h2 style="margin:0 0 8px">创建角色 <span style="font-size:13px;color:#aab;font-weight:normal">· 艾泽拉斯无限:原初大陆的平行时空,联盟与部落彻底隔绝</span></h2>
      <div class="facTabs"><div class="facTab alliance ${st.faction === 'alliance' ? 'on' : ''}" data-fac="alliance">联盟</div><div class="facTab horde ${st.faction === 'horde' ? 'on' : ''}" data-fac="horde">部落</div></div>
      <div class="mrow"><label>种族</label>${seg('race', RACE_ORDER[st.faction].map(k => [k, RACES[k].name]), st.race)}</div>
      <div class="mrow"><label>职业</label>${seg('cls', race.classes.map(k => [k, `<span style="color:${CLASSES[k].color}">${CLASSES[k].name}</span>`]), st.cls)}</div>
      <div class="mrow"><label>性别</label>${seg('gender', [['m', '男'], ['f', '女']], st.gender)}</div>
      <div class="mrow"><label>名 · 姓</label><input type="text" id="cName" value="${esc(st.name)}" maxlength="8" style="width:120px;flex:none"><input type="text" id="cSurname" value="${esc(st.surname)}" maxlength="8" placeholder="姓氏(可留空)"><button class="mbtn small" data-go="rollName">随机</button></div>
      <div class="mrow"><label>肤色</label>${sw('skin', race.skins, st.skin)}</div>
      <div class="mrow"><label>眼睛</label>${sw('eye', race.eyes, st.eye)}</div>
      <div class="mrow"><label>发型</label>${seg('hairStyle', HAIR_STYLES.map((n, i) => [i, n]), st.hairStyle)}</div>
      <div class="mrow"><label>发色</label>${sw('hairColor', HAIR_COLORS, st.hairColor)}</div>
      ${st.gender === 'm' ? `<div class="mrow"><label>胡须</label>${seg('beard', BEARDS.map((n, i) => [i, n]), st.beard)}</div>` : ''}
      <div class="mrow"><label>上衣</label>${sw('shirt', OUTFIT_COLORS, st.shirt)}</div>
      <div class="mrow"><label>裤子</label>${sw('pants', OUTFIT_COLORS, st.pants)}</div>
      <div class="mrow"><label>规则集</label>${seg('ruleset', [['normal', '普通'], ['hardcore', '硬核(只有一条命)']], st.ruleset)}</div>
    </div>
    <div class="cright">
      <canvas id="previewCanvas" width="288" height="288"></canvas>
      <div class="cdesc"><b>${race.name}</b>(${FACTIONS[race.faction].name})· 起始区域:${race.zone}<br>${race.desc}<br><span style="color:#cfe">被动:${race.passive}</span><br><span style="color:#8fd0ff">种族技能 ${race.racial.name}:${race.racial.desc}</span><br><b style="color:${cls.color}">${cls.name}</b>:${cls.desc}</div>
      <div style="display:flex;gap:8px;width:100%"><button class="mbtn small" data-go="rollLook">随机外观</button><button class="mbtn small" data-go="creatorBack">返回</button></div>
      <button class="mbtn" data-go="creatorGo">进入艾泽拉斯</button>
    </div></div>`);
  const m = $('menu');
  m.querySelectorAll('.facTab').forEach(t => t.onclick = () => { if (t.dataset.fac !== st.faction) { creator = newCreator(t.dataset.fac); play('ui'); creatorMenu(); } });
  m.querySelectorAll('[data-k]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.k, v = el.dataset.v;
    st.name = $('cName').value; st.surname = $('cSurname').value;
    if (k === 'race') { st.race = v; randomizeLook(st); const [a, b] = randomName(v); st.name = a; st.surname = b; }
    else if (k === 'cls' || k === 'ruleset') st[k] = v;
    else if (k === 'gender') { st.gender = v; randomizeLook(st); }
    else st[k] = +v;
    play('ui'); creatorMenu();
  }));
  for (const id of ['cName', 'cSurname']) $(id).addEventListener('keydown', e => e.stopPropagation());
  stopPreview();
  const cv = $('previewCanvas'), cx = cv.getContext('2d');
  const wpn = st.cls === 'hunter' ? 'bow' : ['mage', 'priest', 'warlock', 'druid'].includes(st.cls) ? 'apprentice_staff' : 'wood_sword';
  const draw = () => {
    if (!document.body.contains(cv)) { stopPreview(); return; }
    st.anim += 0.12;
    const walk = Math.floor(st.anim * 1.5) % 16 < 8;
    const legF = walk ? 1 + (Math.floor(st.anim * 4) % 6) : 0;
    const sw2 = walk ? Math.sin(st.anim * 4) * 0.6 : 0;
    const img = renderer.composeHuman(creatorLook(st), { facing: 1, legF, backA: -sw2 + 0.1, frontA: walk ? sw2 + 0.1 : 0.3, item: walk ? null : wpn, itemMode: 'swing', headBob: 0 });
    cx.clearRect(0, 0, 288, 288); cx.imageSmoothingEnabled = false;
    cx.fillStyle = 'rgba(0,0,0,0.3)'; cx.fillRect(84, 262, 120, 8);
    cx.drawImage(img, 0, 0, 72, 72, 0, -14, 288, 288);
  };
  draw();
  previewTimer = setInterval(draw, 80);
}

let delPending = null;
async function worldsMenu() {
  menu = 'worlds';
  const ws = await listWorlds();
  const items = ws.map(w => delPending === w.id ? `<div class="witem" style="border:1px solid #f88"><div><div class="wn">删除「${esc(w.name)}」?</div><div class="wd">世界与所有区块存档将被永久删除,无法恢复。</div></div>
    <div style="white-space:nowrap"><button class="mbtn small danger" data-go="delYes" data-arg="${w.id}">确认删除</button><button class="mbtn small" data-go="delNo">取消</button></div></div>` : `<div class="witem"><div><div class="wn">${esc(w.name)}</div>
    <div class="wd">${w.mode === 'creative' ? '创造' : '生存'} · 第 ${(w.day || 0) + 1} 天 · 种子 ${w.seed} · 日长 ${w.dayMinutes} 分 · 每季 ${w.seasonDays} 天<br>上次游玩 ${new Date(w.played || w.created).toLocaleString()}</div></div>
    <div style="white-space:nowrap"><button class="mbtn small" data-go="play" data-arg="${w.id}">进入</button><button class="mbtn small danger" data-go="del" data-arg="${w.id}">删除</button></div></div>`).join('');
  setMenu(`<div class="mbox" style="width:640px"><h2 style="margin:0 0 6px">世界列表</h2>
    <div class="wlist">${items || '<div class="mnote">还没有世界,先新建一个吧。</div>'}</div>
    <div style="display:flex;gap:10px"><button class="mbtn" data-go="title">返回</button><button class="mbtn" data-go="newWorld">新建世界</button></div></div>`);
}

function settingsMenu(back = 'title') {
  menu = 'settings';
  const seg = (name, opts, cur) => `<div class="seg" data-name="${name}">${opts.map(([v, l]) => `<span data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</span>`).join('')}</div>`;
  setMenu(`<div class="mbox" style="width:560px"><h2 style="margin:0 0 10px">设置</h2>
    <div class="mrow"><label>画面缩放</label>${seg('scale', [[0, '自动'], [1, '×1'], [1.5, '×1.5'], [2, '×2'], [2.5, '×2.5'], [3, '×3']], settings.scale)}</div>
    <div class="mrow"><label>光照</label>${seg('smooth', [[1, '平滑'], [0, '方格']], settings.smooth ? 1 : 0)}</div>
    <div class="mrow"><label>音效音量</label>${seg('sfx', [[0, '关'], [0.35, '低'], [0.7, '中'], [1, '高']], settings.sfx)}</div>
    <div class="mrow"><label>背景音乐</label>${seg('music', [[0, '关'], [0.2, '低'], [0.35, '中'], [0.6, '高']], settings.music)}</div>
    <div class="mrow"><label>小地图</label>${seg('minimap', [[1, '显示'], [0, '隐藏']], settings.minimap ? 1 : 0)}</div>
    <div class="mrow"><label>调试信息</label>${seg('fps', [[1, '显示'], [0, '隐藏']], settings.fps ? 1 : 0)}</div>
    <div class="mnote">游戏中也可用 + / - 调整缩放,F3 切换调试信息,Tab 切换小地图,F1 隐藏界面。</div>
    <button class="mbtn" data-go="saveSettings" data-arg="${back}">保存并返回</button></div>`);
}

function helpMenu(back = 'title') {
  menu = 'help';
  setMenu(`<div class="mbox" style="max-width:860px"><h2 style="margin:0 0 10px">玩法与操作说明</h2><div class="help">
    <p><b>移动</b>:A/D 或 ←/→ 行走,双击或按住 Ctrl 奔跑;空格跳跃(按住跳得更高);S 穿过木平台;W/S 攀爬梯子与藤蔓;Shift 潜行(不会从边缘掉落)。遇到一格高的台阶会自动走上去。</p>
    <p><b>鼠标</b>:左键挖掘方块 / 攻击生物(剑会挥砍扇形范围);右键放置方块、使用物品、开关门、打开箱子/熔炉/工作台、在床上睡觉。手持弓按住左键蓄力、松开射箭。</p>
    <p><b>背包</b>:E 打开;1-9 或滚轮切换快捷栏;Q 丢出(Ctrl+Q 整组)。Shift+点击快速移动,右键拆分一半/放入一个,悬停时按数字键与快捷栏交换。合成列表在背包右侧,靠近工作台解锁更多配方。</p>
    <p><b>工具与等级</b>:镐挖石头和矿,斧砍树(砍断树干整棵倒下)、锹挖土沙,锤子敲掉背景墙,锄头耕地。木 → 石 → 铜 → 铁 → 钻石 → 狱岩:铁矿需要铜镐,金与钻石需要铁镐,黑曜石与狱岩需要钻石镐。</p>
    <p><b>生存</b>:十颗心为生命,十个鸡腿为饱食度。饱食充足时自动回血,饿肚子会掉血。摔落、溺水、岩浆、仙人掌都会受伤。死亡时物品存入墓碑,右键墓碑取回。</p>
    <p><b>熔炉</b>:放入原料与燃料(煤炭、木炭、木材)冶炼矿石、烤肉、烧玻璃与砖块。熔炉按世界时间工作,你离开后它仍在燃烧。</p>
    <p><b>农业</b>:锄头把泥土/草地变耕地,附近 4 格内有水或下雨时耕地湿润、作物长得更快;骨粉催熟。高草有概率掉落种子;树叶掉落树苗与苹果。</p>
    <p><b>独立时间观</b>:世界拥有自己的历法——一天 24 小时、四季轮转、8 相月相与天气。夏季昼长、作物长得快;冬季昼短夜长、降雪结冰、作物几乎停长、怪物更多。满月之夜可能出现血月。</p>
    <p><b>时间饰品</b>:放在背包里即生效——铜怀表显示整点、金怀表精确到分钟、世界历书显示日期/月相/日出日落/季节倒计时、气压计预报下一场天气。可合成,也可在宝箱中找到。</p>
    <p><b>睡觉</b>:夜晚或雷暴时右键床入睡,时间以延时摄影般飞速流逝到清晨,其间作物与熔炉同步推进;右键床也会设置重生点。附近有怪或血月时无法入睡。</p>
    <p><b>无限世界</b>:世界向左右无限延伸,地表有平原、森林、沙漠、雪原、丛林、山地与海洋;地下有洞穴、含水层、发光蘑菇洞、地下小屋;高空有浮空岛;最深处是地狱与基岩。M 打开世界地图。</p>
    <p><b>危险</b>:黑暗中会刷出僵尸、骷髅、苦力怕(靠近会爆炸并炸毁方块)、蜘蛛;史莱姆与恶魔眼、洞穴蝙蝠、地狱熔岩史莱姆。用火把照亮基地可以防止刷怪;僵尸与骷髅在阳光下会燃烧。</p>
    <p><b>指令</b>:T 或回车打开聊天,输入 /help 查看指令,例如 /time set night、/time add 48、/season winter、/weather thunder、/give 铁镐、/gamemode creative。</p>
  </div><button class="mbtn" data-go="${back === 'pause' ? 'pause' : 'title'}">返回</button></div>`);
}

function pauseMenu() {
  menu = 'pause';
  if (game) game.paused = true;
  setMenu(`<div class="mbox"><h2 style="margin:0 0 10px;text-align:center">游戏暂停</h2>
    <div class="mnote" style="text-align:center;margin-bottom:8px">暂停时世界时间也停止流动。</div>
    <button class="mbtn" data-go="resume">继续游戏</button>
    <button class="mbtn" data-go="settingsP">设置</button>
    <button class="mbtn" data-go="helpP">玩法与操作说明</button>
    <button class="mbtn" data-go="quit">保存并返回标题</button></div>`);
}

function deathMenu(cause, grave) {
  menu = 'death';
  setMenu(`<div class="mbox death"><h1>你死了!</h1><div style="font-size:16px;margin-bottom:6px">${esc(cause)}</div>
    ${grave ? `<div class="mnote">你的物品已存入墓碑:X ${grave.x} · 高度 ${-grave.y}(地图上以灰点标出)</div>` : ''}
    <button class="mbtn" data-go="respawn" id="btnRespawn" disabled>重生</button><button class="mbtn" data-go="quit">保存并返回标题</button></div>`);
  setTimeout(() => { const b = $('btnRespawn'); if (b) b.disabled = false; }, 900);
}

const ACTIONS = {
  title: () => titleMenu(),
  newWorld: () => newWorldMenu(),
  worlds: () => worldsMenu(),
  settings: () => settingsMenu('title'),
  settingsP: () => settingsMenu('pause'),
  help: () => helpMenu('title'),
  helpP: () => helpMenu('pause'),
  pause: () => pauseMenu(),
  saveSettings: back => {
    settings.scale = +segVal('scale'); settings.smooth = segVal('smooth') === '1'; settings.sfx = +segVal('sfx'); settings.music = +segVal('music');
    settings.musicOn = settings.music > 0; settings.minimap = segVal('minimap') === '1'; settings.fps = segVal('fps') === '1';
    applySettings();
    back === 'pause' ? pauseMenu() : titleMenu();
  },
  continue: id => id && ACTIONS.play(id),
  create: async () => {
    const name = ($('wName').value || '新世界').slice(0, 24);
    const seedStr = $('wSeed').value.trim();
    const seed = seedStr ? seedFromString(seedStr) : (Math.random() * 4294967295) >>> 0;
    const dayMinutes = +segVal('day'), seasonDays = +segVal('season');
    pendingWorld = {
      id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name, seed,
      mode: segVal('mode'), difficulty: +segVal('diff'), dayMinutes, seasonDays, created: Date.now(), played: Date.now(),
    };
    creatorMenu();
  },
  creatorBack: () => { stopPreview(); newWorldMenu(); },
  creatorGo: async () => {
    const st = creator;
    st.name = ($('cName').value || '').trim().slice(0, 8) || randomName(st.race)[0];
    st.surname = ($('cSurname').value || '').trim().slice(0, 8);
    stopPreview();
    const meta = { ...pendingWorld, race: st.race, cls: st.cls, charName: st.name, surname: st.surname, look: creatorLook(st), ruleset: st.ruleset };
    await enterWorld(meta, true);
  },
  rollName: () => { const [a, b] = randomName(creator.race); creator.name = a; creator.surname = b; creatorMenu(); },
  rollLook: () => { creator.name = $('cName').value; creator.surname = $('cSurname').value; randomizeLook(creator); creatorMenu(); },
  play: async id => { const m = await getWorld(id); if (m) await enterWorld(m, false); },
  del: id => { delPending = id; worldsMenu(); },
  delNo: () => { delPending = null; worldsMenu(); },
  delYes: async id => {
    await deleteWorld(id);
    localStorage.removeItem('boundless:snap:' + id);
    if (sessionStorage.getItem('boundless:resume') === id) sessionStorage.removeItem('boundless:resume');
    delPending = null; worldsMenu();
  },
  resume: () => { setMenu(null); menu = null; if (game) game.paused = false; },
  respawn: () => { setMenu(null); menu = null; game.respawn(); },
  quit: async () => { await leaveWorld(); titleMenu(); },
};

// ———————————————————————— 进入 / 离开世界
async function enterWorld(meta, isNew, resumed = false) {
  $('loading').classList.remove('hidden');
  // 刷新/关闭页面时写入的同步快照(玩家、角色、任务、时间)若比数据库里的新,则以快照为准
  try {
    const snap = JSON.parse(localStorage.getItem('boundless:snap:' + meta.id) || 'null');
    if (snap && !isNew && (snap.played || 0) > (meta.played || 0)) Object.assign(meta, snap);
  } catch { /* 快照损坏时忽略 */ }
  sessionStorage.setItem('boundless:resume', meta.id);
  $('ldFill').style.width = '20%';
  await new Promise(r => setTimeout(r, 30));
  const store = new ChunkStore(meta.id);
  await store.load();
  $('ldFill').style.width = '60%';
  await new Promise(r => setTimeout(r, 30));
  demo = null;
  game = new Game({ meta, store, renderer, ui });
  game.onDeath = (cause, grave) => deathMenu(cause, grave);
  window.__game = game;
  setMenu(null); menu = null;
  ui.showHud(true);
  applySettings();
  $('ldFill').style.width = '100%';
  setTimeout(() => $('loading').classList.add('hidden'), 120);
  const c = game.clock, col = game.gen.column(Math.floor(game.player.x));
  if (isNew) {
    const rpg = game.player.rpg, rc = RACES[rpg.race];
    game.msg(`${esc(rpg.fullName)},${rc.name}${CLASSES[rpg.cls].name}——欢迎来到「${esc(meta.name)}」:原初艾泽拉斯在无限服中向两端无尽延伸,联盟与部落再无交集。`, '#ffe08a');
    game.msg(`你出生在${rc.zone}。附近有一座${FACTIONS[rc.faction].name}营地,去找任务官(头顶“!”)接取任务;敌对阵营的士兵见到你就会攻击。`, '#cfd8ff');
    game.msg(`种子 ${meta.seed} · 出生在${BIOME_NAMES[col.biome]} · 一天 ${meta.dayMinutes} 分钟 · 每季 ${meta.seasonDays} 天`, '#cfd8ff');
    game.msg('提示:砍树(左键)→ 按 E 合成木板与工作台 → 制作工具。天黑前造好庇护所并点亮火把!', '#cfc');
    ui.hint('A/D 移动 · 空格跳跃 · 左键挖掘/攻击 · 右键放置/对话 · Z X C V B 技能 · G 种族技能 · E 背包 · K 技能书 · L 任务 · M 地图', 10);
  } else if (resumed) {
    game.msg('页面刚刚被刷新,已自动回到你的世界(刷新前已存档)。', '#9fd0ff');
  } else {
    game.msg(`欢迎回来。${c.fmtDate()},${['春', '夏', '秋', '冬'][c.season]}日的世界仍在等你。`, '#ffe08a');
  }
  await putWorld(game.meta);
  localStorage.removeItem('boundless:snap:' + meta.id);
}
// 同步快照:pagehide 时 IndexedDB 的异步写入可能来不及完成,先把关键状态写进 localStorage
function snapshot() {
  if (!game) return;
  try {
    const m = game.meta;
    const snap = { clock: game.clock.save(), player: game.player.save(), rpg: game.player.rpg.save(), quests: game.quests.save(), played: Date.now(), day: game.clock.day, lastDeath: game.lastDeath, difficulty: game.difficulty };
    localStorage.setItem('boundless:snap:' + m.id, JSON.stringify(snap));
  } catch { /* 存储已满时忽略 */ }
}
async function leaveWorld() {
  sessionStorage.removeItem('boundless:resume');
  if (game) { await game.save(); localStorage.removeItem('boundless:snap:' + game.meta.id); }
  game = null;
  ui.showHud(false); ui.closePanel(); if (ui.mapOpen) ui.toggleMap(); if (ui.chatOpen) ui.closeChat();
  startDemo();
}
function startDemo() {
  const meta = { id: 'demo', seed: seedFromString('无垠拓荒'), dayMinutes: 20, seasonDays: 5, clock: { tick: 2 * 5 * DAY_TICKS + 9000, dayMinutes: 20, seasonDays: 5 }, mode: 'creative' };
  const store = new ChunkStore('demo');
  demo = new Game({ meta, store, renderer, ui, demo: true });
  demo.player.y -= 2;
  renderer.cx = 0; renderer.cy = (demo.gen.column(0).s - 6) * 16;
}

// ———————————————————————— 主循环
let last = performance.now(), acc = 0, lastFrame = performance.now(), fpsT = 0, fpsN = 0;
function active() { return game || demo; }
function tick(now) {
  const g = active();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!g) return;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { g.step(STEP); endFrame(); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  if (g.demo) { const c = g.gen.column(Math.floor(renderer.cx / 16)); renderer.cy += ((c.s - 8) * 16 - renderer.cy) * Math.min(1, dt * 1.5); }
  renderer.draw(dt);
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { g.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
}
function loop(now) { lastFrame = performance.now(); tick(now); requestAnimationFrame(loop); }
// 标签页隐藏时 rAF 停止:用定时器兜底推进
setInterval(() => { const now = performance.now(); if (now - lastFrame > 150) { lastFrame = now; tick(now); } }, 100);

// ———————————————————————— 启动
function boot() {
  buildAtlas();
  renderer = new Renderer(null, canvas);
  ui = new UI();
  applySettings();
  bindInput(canvas, e => {
    initAudio();
    if (e.code === 'Escape') {
      if (ui.chatOpen) return false;
      if (ui.mapOpen) { ui.toggleMap(); return false; }
      if (ui.panel) { ui.closePanel(); return false; }
      if (menu === 'pause') { ACTIONS.resume(); return false; }
      if (menu === 'settings' || menu === 'help') { game ? pauseMenu() : titleMenu(); return false; }
      if (menu === 'new' || menu === 'worlds') { titleMenu(); return false; }
      if (menu === 'creator') { stopPreview(); newWorldMenu(); return false; }
      if (!menu && game && !game.player.dead) { pauseMenu(); return false; }
      return false;
    }
    if (ui.mapOpen && e.code === 'KeyM') { ui.toggleMap(); return false; }
  });
  canvas.addEventListener('mousedown', () => initAudio());
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('pagehide', () => { snapshot(); game?.save(); });
  window.addEventListener('beforeunload', () => snapshot());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game?.save(); });
  startDemo();
  titleMenu();
  requestAnimationFrame(loop);
  // 页面被意外刷新(开发服务器热重载 / 重启)时自动回到原来的世界
  const rid = sessionStorage.getItem('boundless:resume');
  if (rid) getWorld(rid).then(m => { if (m && !game) enterWorld(m, false, true); else sessionStorage.removeItem('boundless:resume'); });
  // 清理已删除世界留下的快照
  listWorlds().then(ws => { const ids = new Set(ws.map(w => w.id)); for (const k of Object.keys(localStorage)) if (k.startsWith('boundless:snap:') && !ids.has(k.slice(15))) localStorage.removeItem(k); });
  window.__bench = bench;
  bench.ready = true;
}

if (import.meta.hot) {
  const flush = async () => { if (!game) return; snapshot(); try { await game.save(); } catch { /* 保存失败时仍保留快照 */ } };
  import.meta.hot.on('vite:beforeFullReload', flush);
  import.meta.hot.on('vite:ws:disconnect', flush);
}

// ———————————————————————— 评测钩子(无头确定性驱动)
const bench = {
  ready: false,
  get game() { return game; },
  get renderer() { return renderer; },
  async newWorld(o = {}) {
    const race = o.race || 'human', st = { race, gender: o.gender || 'm', skin: 0, eye: 0, hairStyle: o.hairStyle ?? 0, hairColor: 1, beard: o.beard ?? 0, shirt: 0, pants: 5 };
    const meta = { id: 'bench' + Date.now().toString(36), name: o.name || '评测世界', seed: o.seed ?? 12345, mode: o.mode || 'survival', difficulty: o.difficulty ?? 2, dayMinutes: o.dayMinutes || 20, seasonDays: o.seasonDays || 5, created: Date.now(), played: Date.now(), race, cls: o.cls || RACES[race].classes[0], charName: o.charName || '评测员', surname: o.surname || '', look: creatorLook(st), ruleset: o.ruleset || 'normal' };
    await enterWorld(meta, true);
    return this.state();
  },
  step(n = 1) { const g = active(); for (let i = 0; i < n; i++) { if (this.lock) this.aim(this.lock.x, this.lock.y); g.step(STEP); endFrame(); } renderer.draw(STEP); return this.state(); },
  aim(wx, wy) { const r = canvas.getBoundingClientRect(); input.mx = (wx * 16 - renderer.camX) * (r.width || renderer.W) / renderer.W; input.my = (wy * 16 - renderer.camY) * (r.height || renderer.H) / renderer.H; },
  lock: null,
  press(code, down = true) { press(code, down); },
  tap(code) { press(code, true); },
  release(code) { press(code, false); },
  // 鼠标锁定在世界坐标(每步按当前镜头换算,镜头移动时仍指向同一格)
  mouseWorld(wx, wy) { this.lock = { x: wx, y: wy }; this.aim(wx, wy); },
  button(b, down) { mouseButton(b, down); },
  cmd(t) { game?.chat(t); },
  render() { renderer.draw(STEP); },
  shot(type = 'image/png') { renderer.draw(STEP); return canvas.toDataURL(type); },
  state() {
    const g = active();
    if (!g) return null;
    const p = g.player, c = g.clock;
    return {
      scene: game ? (menu || 'play') : 'title', x: +p.x.toFixed(2), y: +p.y.toFixed(2), hp: p.hp, hunger: p.hunger, dead: p.dead, onGround: p.onGround,
      time: c.fmtTime(), day: c.day + 1, season: c.season, weather: c.weather, blood: c.blood, tick: Math.round(c.tick),
      chunks: g.world.chunks.size, entities: g.entities.length, mobs: g._mobs.length, fps: Math.round(g.fps || 0),
      held: p.inv.held?.id || null, inv: p.inv.slots.filter(Boolean).map(s => s.id + 'x' + s.n),
    };
  },
};

boot();
