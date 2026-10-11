// 魔兽式界面:单位框/目标框/经验条/技能栏/任务追踪,以及 NPC 对话、商人、技能书、任务日志、职业融合窗口。
import { iconURL } from './art.js';
import { portrait } from './avatar.js';
import { ITEMS, itemName } from './items.js';
import { RACES, CLASSES, SKILLS, RES_INFO, FACTIONS, VENDOR, GREETINGS, SKILL_KEY_NAMES, FUSION_LEVEL, xpForLevel, classSkills, fmtMoney, LEVEL_CAP } from './wow.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const BUFF_NAMES = { shield_wall: '盾墙', divine_shield: '圣盾', evasion: '闪避', stealth: '潜行', sprint: '疾跑', rapid_fire: '急速', pw_shield: '真言盾', rejuv: '回春', stoneform: '石像', blood_fury: '血怒', berserking: '狂暴', escape_artist: '逃命', cannibalize: '食尸' };

export function sellPrice(id) {
  const it = ITEMS[id];
  if (!it || it.coin) return 0;
  if (it.tool || it.armor) return 40 + (it.tool?.tier || 0) * 35 + (it.armor?.pts || 0) * 12 + (it.weapon ? 120 : 0);
  if (id === 'diamond') return 180; if (id.endsWith('_ingot')) return id.startsWith('gold') ? 40 : 16;
  if (id.startsWith('raw_')) return 6; if (it.food) return 3; if (it.info) return 150;
  if (id.endsWith('_insignia')) return 25; if (id.endsWith('_cloth')) return 8;
  return it.kind === 'block' || it.kind === 'wall' ? 1 : 2;
}

export function skillIcon(id, extraCls = '') {
  const s = SKILLS[id];
  if (!s) return `<div class="skill empty ${extraCls}"></div>`;
  return `<div class="skill ${extraCls}" style="background:radial-gradient(${s.color}, #101018 85%);color:#fff">${s.glyph}</div>`;
}

// ———————————————————————— HUD
export function updateRpgHud(ui, dt) {
  const g = ui.game, p = g.player, rpg = p.rpg;
  if (!rpg) return;
  // 头像与名字(只在变化时重绘)
  const lookSig = JSON.stringify(p.look) + rpg.form;
  if (ui.portraitSig !== lookSig) {
    ui.portraitSig = lookSig;
    const c = $('portrait'), x = c.getContext('2d');
    x.clearRect(0, 0, 48, 48); x.imageSmoothingEnabled = false;
    x.drawImage(portrait(p.look, 48), 0, 2);
  }
  $('ufLevel').textContent = rpg.level;
  const cls = CLASSES[rpg.cls], cls2 = rpg.cls2 ? CLASSES[rpg.cls2] : null;
  $('ufName').innerHTML = `<span style="color:${cls.color}">${esc(rpg.fullName)}</span><small>${RACES[rpg.race].name} ${cls.name}${cls2 ? '·' + cls2.name : ''}${rpg.hardcore ? ' · <span style="color:#f55">硬核</span>' : ''}</small>`;
  const hpk = Math.max(0, p.hp / p.maxHp);
  $('ufHp').style.width = (hpk * 100) + '%';
  $('ufHp').style.background = hpk > 0.5 ? '' : hpk > 0.25 ? 'linear-gradient(#e8d040,#a08010)' : 'linear-gradient(#f04a3a,#901a10)';
  $('ufHpT').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  const types = rpg.resTypes();
  ['ufRes1', 'ufRes2'].forEach((id, i) => {
    const el = $(id), t = types[i];
    if (!t || p.creative && false) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const max = rpg.maxRes(t), v = Math.min(max, rpg.res[t] ?? 0);
    el.firstChild.style.width = (v / max * 100) + '%';
    el.firstChild.style.background = `linear-gradient(${RES_INFO[t].color}, #101018 160%)`;
    el.lastChild.textContent = `${RES_INFO[t].name} ${Math.floor(v)} / ${max}`;
  });
  const bsig = Object.keys(rpg.buffs).join(',') + rpg.form + (rpg.canGlide() ? Math.round(rpg.glide) : '');
  if (bsig !== ui.buffSig) {
    ui.buffSig = bsig;
    const tags = Object.keys(rpg.buffs).map(k => `<b>${BUFF_NAMES[k] || k}</b>`);
    if (rpg.form) tags.unshift(`<b>${rpg.form === 'bear' ? '熊形态' : '猎豹形态'}</b>`);
    if (rpg.canGlide() && rpg.glide < 10) tags.push(`<b>滑翔 ${Math.round(rpg.glide)}s</b>`);
    $('ufBuffs').innerHTML = tags.join('');
  }
  // 目标框
  const t = g.lastTarget;
  if (t && !t.dead) {
    $('targetFrame').classList.remove('hidden');
    const col = t.side === 'A' ? '#7cf27c' : t.side === 'B' ? '#ff6a5a' : '#f2e27a';
    $('tfName').innerHTML = `<span style="color:${col}">${esc(t.displayName || t.def?.name || '')}</span><small>${t.level} 级${t.role === 'elite' ? ' 精英' : ''}${t.npc ? ' · ' + FACTIONS[t.faction].name : ''}</small>`;
    $('tfHp').style.width = Math.max(0, t.hp / t.maxHp * 100) + '%';
    $('tfHpT').textContent = `${Math.max(0, Math.ceil(t.hp))} / ${t.maxHp}`;
  } else $('targetFrame').classList.add('hidden');
  // 经验条
  if (rpg.level >= LEVEL_CAP) { $('xpFill').style.width = '100%'; $('xpText').textContent = `${LEVEL_CAP} 级(满级)`; }
  else { const need = xpForLevel(rpg.level); $('xpFill').style.width = (rpg.xp / need * 100) + '%'; $('xpText').textContent = `${rpg.level} 级 · 经验 ${rpg.xp} / ${need}`; }
  // 技能栏
  const bar = $('actionBar');
  if (!ui.skillEls) {
    ui.skillEls = [];
    bar.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div');
      el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); if (ui.pickSkill && i < 5) { rpg.bar[i] = ui.pickSkill; ui.pickSkill = null; ui.skillSig = ''; if (ui.panel === 'skills') ui.buildPanel(); return; } i < 5 ? g.player.rpg.cast(i) : g.player.rpg.castRacial(); });
      el.addEventListener('mouseenter', () => ui.showSkillTip(i < 5 ? g.player.rpg.bar[i] : 'racial'));
      el.addEventListener('mouseleave', () => ui.hideTip());
      bar.appendChild(el); ui.skillEls.push(el);
    }
  }
  const sig = rpg.bar.join(',') + rpg.level + rpg.cls2 + rpg.race;
  if (sig !== ui.skillSig) {
    ui.skillSig = sig;
    ui.skillEls.forEach((el, i) => {
      if (i === 5) {
        const r = RACES[rpg.race].racial;
        el.className = 'skill racial'; el.style.background = 'radial-gradient(#8fd0ff, #101018 85%)';
        el.innerHTML = `<span class="key">G</span>${r.name[0]}<div class="cd"></div><div class="cdt"></div>`;
        return;
      }
      const id = rpg.bar[i], s = SKILLS[id];
      if (!s) { el.className = 'skill empty'; el.style.background = ''; el.innerHTML = `<span class="key">${SKILL_KEY_NAMES[i]}</span>`; return; }
      el.className = 'skill' + (rpg.skillUnlocked(id) ? '' : ' locked');
      el.style.background = `radial-gradient(${s.color}, #101018 85%)`;
      el.innerHTML = `<span class="key">${SKILL_KEY_NAMES[i]}</span>${s.glyph}<div class="cd"></div><div class="cdt"></div>`;
    });
  }
  ui.skillEls.forEach((el, i) => {
    const cdEl = el.querySelector('.cd'), cdt = el.querySelector('.cdt');
    if (!cdEl) return;
    let cd = 0, max = 1;
    if (i === 5) { cd = rpg.racialCd; max = RACES[rpg.race].racial.cd; }
    else { const id = rpg.bar[i], s = SKILLS[id]; if (s) { cd = Math.max(rpg.cds[id] || 0, rpg.gcd); max = rpg.cds[id] ? s.cd : 0.45; const res = CLASSES[s.cls].res; el.classList.toggle('nores', (rpg.res[res] ?? 0) < (s.cost || 0)); } }
    cdEl.style.height = cd > 0 ? Math.min(100, cd / max * 100) + '%' : '0';
    cdt.textContent = cd > 1 ? Math.ceil(cd) : '';
  });
  // 任务追踪
  const q = g.quests.current(), qt = $('questTracker');
  const rc = $('rightCol');
  qt.style.top = (rc.offsetTop + rc.offsetHeight + 8) + 'px';
  const pr = g.quests.progress();
  const qsig = q ? q.id + pr.have + '/' + pr.need : g.quests.offer()?.id || '';
  if (qsig !== ui.qtSig) {
    ui.qtSig = qsig;
    if (q) qt.innerHTML = `<div class="qt">${esc(q.name)}</div><div class="${pr.have >= pr.need ? 'qd' : 'qo'}">· ${g.quests.objText(q)}:${pr.have}/${pr.need}${pr.have >= pr.need ? '(可交付)' : ''}</div>`;
    else { const o = g.quests.offer(); qt.innerHTML = o ? `<div class="qo" style="color:#ffd76a">! 本阵营任务官有新任务:${esc(o.name)}</div>` : ''; }
  }
}

// ———————————————————————— NPC 对话
export function buildDialog(ui, root) {
  const g = ui.game, npc = ui.panelData.npc, p = g.player, rpg = p.rpg, ql = g.quests;
  const box = document.createElement('div'); box.className = 'box dlg';
  const greet = GREETINGS[npc.faction][(npc.typeId.length + Math.floor(g.realT / 30)) % GREETINGS[npc.faction].length].replace('{name}', esc(rpg.name));
  let html = `<div class="npcName">${esc(npc.displayName)}<span style="font-size:12px;color:#aab;font-weight:normal"> · ${npc.level} 级 · ${RACES[npc.t.race].name}</span></div><div class="say">${greet}</div>`;
  const btns = [];
  if (npc.role === 'quest') {
    const cur = ql.current();
    if (cur) {
      const pr = ql.progress();
      html += `<div class="qbox"><h4>${esc(cur.name)}${ql.done() ? '(已完成)' : ''}</h4><div>${esc(cur.text.replace('{name}', rpg.name))}</div><div style="margin-top:4px">目标:${ql.objText(cur)} ${pr.have}/${pr.need}</div>${rewardHtml(cur)}</div>`;
      if (ql.done()) btns.push(['完成任务', () => { ql.turnIn(); ui.buildPanel(); }]);
      btns.push(['放弃任务', () => { ql.abandon(); ui.buildPanel(); }]);
    } else {
      const o = ql.offer();
      if (o) {
        html += `<div class="qbox"><h4>${esc(o.name)}</h4><div>${esc(o.text.replace('{name}', rpg.name))}</div><div style="margin-top:4px">目标:${ql.objText(o)}${o.obj.n > 1 ? ' ×' + o.obj.n : ''}</div>${rewardHtml(o)}</div>`;
        btns.push(['接受任务', () => { ql.accept(); ui.buildPanel(); }]);
      }
    }
    if (rpg.level >= FUSION_LEVEL && !rpg.cls2) {
      html += `<div class="qbox" style="border-color:#e0a0ff"><h4 style="color:#e0a0ff">职业融合</h4><div>${rpg.fusionReady ? '你已证明了自己。选择第二种职业,两种职业的技能可以同时放入技能栏。' : `完成「${FACTIONS[rpg.faction].name}」主线任务“${rpg.faction === 'alliance' ? '融合之道' : '先祖的双重之魂'}”后即可融合。`}</div></div>`;
      if (rpg.fusionReady) btns.push(['选择第二职业', () => { ui.open('fusion', { npc }); }]);
    }
  }
  if (npc.role === 'vendor') btns.push(['交易', () => ui.open('vendor', { npc })]);
  btns.push(['再见', () => ui.closePanel()]);
  box.innerHTML = html + '<div class="btnrow" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>';
  const row = box.querySelector('.btnrow');
  for (const [t, f] of btns) { const b = document.createElement('button'); b.className = 'mbtn small'; b.textContent = t; b.onclick = () => { g.sfx('ui'); f(); }; row.appendChild(b); }
  root.appendChild(box);
}
function rewardHtml(q) {
  const r = q.reward, parts = [];
  if (r.xp || q.repeat) parts.push(`<span style="color:#c8a0ff">经验 ${q.repeat ? '按等级' : r.xp}</span>`);
  if (r.money) parts.push(fmtMoney(r.money));
  for (const [id, n] of r.items || []) parts.push(`<span><img class="ic" src="${iconURL(id)}"> ${esc(itemName(id))}${n > 1 ? '×' + n : ''}</span>`);
  if (r.unlock === 'fusion') parts.push('<span style="color:#e0a0ff">解锁:职业融合</span>');
  return `<div class="rew">奖励:${parts.join(' ')}</div>`;
}

// ———————————————————————— 商人
export function buildVendor(ui, root) {
  const g = ui.game, npc = ui.panelData.npc, rpg = g.player.rpg, inv = g.player.inv;
  const box = document.createElement('div'); box.className = 'box';
  box.style.width = '400px';
  const enemyIns = FACTIONS[FACTIONS[npc.faction].enemy].insignia;
  box.innerHTML = `<h3>${esc(npc.displayName)} 的货物<span class="money" id="vMoney"></span></h3><div class="mnote">左键购买;在右侧背包中 右键 / Shift+点击 出售物品。徽记可换取阵营装备。</div><div class="vlist" id="vlist"></div>`;
  root.appendChild(box);
  const list = box.querySelector('#vlist');
  const render = () => {
    box.querySelector('#vMoney').innerHTML = fmtMoney(rpg.money) + ` · ${itemName(enemyIns)} ${inv.count(enemyIns)}`;
    list.innerHTML = '';
    for (const [id, n, price, ins] of VENDOR[npc.faction]) {
      const ok = rpg.money >= price && (!ins || inv.count(enemyIns) >= ins);
      const el = document.createElement('div'); el.className = 'vitem' + (ok ? '' : ' no');
      el.innerHTML = `<img class="ic" src="${iconURL(id)}"><div class="nm">${esc(itemName(id))}${n > 1 ? ' ×' + n : ''}</div><div class="pr">${fmtMoney(price)}${ins ? `<br><span style="color:#ffd76a">${ins} ${esc(itemName(enemyIns))}</span>` : ''}</div>`;
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        if (!ok) { g.sfx('arrowHit'); return; }
        rpg.money -= price; if (ins) inv.remove(enemyIns, ins);
        const left = inv.add(id, n); if (left) g.dropItem(g.player.x, g.player.y - 1, id, left);
        g.sfx('craft'); render(); ui.repaintRefs();
      });
      el.addEventListener('mouseenter', () => ui.showTip(id));
      el.addEventListener('mouseleave', () => ui.hideTip());
      list.appendChild(el);
    }
  };
  ui.vendorRender = render;
  render();
}

// ———————————————————————— 技能书
export function buildSkills(ui, root) {
  const g = ui.game, rpg = g.player.rpg;
  const box = document.createElement('div'); box.className = 'box';
  const cls = rpg.classes();
  box.innerHTML = `<h3>技能书 · ${cls.map(c => `<span style="color:${CLASSES[c].color}">${CLASSES[c].name}</span>`).join(' + ')}<span class="dim" style="font-size:12px;color:#aab">点击技能后再点技能栏格子即可装配</span></h3><div class="barpick" id="barPick"></div><div class="sklist" id="skList"></div>`;
  root.appendChild(box);
  const pick = box.querySelector('#barPick');
  rpg.bar.forEach((id, i) => {
    const d = document.createElement('div');
    d.innerHTML = skillIcon(id, ui.pickSkill ? 'sel' : '');
    const el = d.firstChild; el.insertAdjacentHTML('afterbegin', `<span class="key">${SKILL_KEY_NAMES[i]}</span>`);
    el.addEventListener('mousedown', e => { e.preventDefault(); if (ui.pickSkill) { rpg.bar[i] = ui.pickSkill; ui.pickSkill = null; } else rpg.bar[i] = null; ui.skillSig = ''; ui.buildPanel(); });
    pick.appendChild(el);
  });
  const list = box.querySelector('#skList');
  for (const c of cls) for (const s of classSkills(c)) {
    const unlocked = rpg.skillUnlocked(s.id), need = c === rpg.cls ? s.lvl : Math.max(FUSION_LEVEL, s.lvl);
    const res = RES_INFO[CLASSES[s.cls].res];
    const row = document.createElement('div'); row.className = 'skrow' + (unlocked ? '' : ' locked');
    row.innerHTML = skillIcon(s.id, ui.pickSkill === s.id ? 'sel' : '') + `<div class="d"><b style="color:${s.color}">${s.name}</b> <span style="color:#aab">${CLASSES[s.cls].name} · ${unlocked ? '已学会' : need + ' 级学会'} · ${s.cost ? s.cost + ' ' + res.name : '无消耗'} · 冷却 ${s.cd} 秒</span><br>${s.desc}</div>`;
    row.addEventListener('mousedown', e => { e.preventDefault(); if (!unlocked) return; ui.pickSkill = s.id; ui.buildPanel(); });
    list.appendChild(row);
  }
  const r = RACES[rpg.race];
  list.insertAdjacentHTML('beforeend', `<div class="skrow"><div class="skill racial" style="background:radial-gradient(#8fd0ff,#101018 85%)">${r.racial.name[0]}</div><div class="d"><b style="color:#8fd0ff">${r.racial.name}</b> <span style="color:#aab">种族技能 · G 键 · 冷却 ${r.racial.cd} 秒</span><br>${r.racial.desc}<br><span style="color:#cfe">被动:${r.passive}</span></div></div>`);
}

// ———————————————————————— 任务日志
export function buildQuests(ui, root) {
  const g = ui.game, ql = g.quests, rpg = g.player.rpg;
  const box = document.createElement('div'); box.className = 'box'; box.style.width = '520px';
  const chain = ql.chain();
  let html = `<h3>任务日志 · ${FACTIONS[rpg.faction].name}主线 ${Math.min(ql.stage, chain.length)}/${chain.length}${ql.repeats ? ` · 阵营战争 ×${ql.repeats}` : ''}</h3>`;
  const cur = ql.current();
  if (cur) {
    const pr = ql.progress();
    html += `<div class="qbox" style="padding:8px 10px;border:1px solid rgba(255,215,106,.5);border-radius:6px"><b style="color:#ffd76a">${esc(cur.name)}</b><div style="margin:4px 0">${esc(cur.text.replace('{name}', rpg.name))}</div><div>目标:${ql.objText(cur)} <b>${pr.have}/${pr.need}</b>${pr.have >= pr.need ? ' <span style="color:#8f8">(回到任务官处交付)</span>' : ''}</div></div>`;
  } else html += `<div class="mnote">当前没有进行中的任务。${ql.offer() ? '去本阵营营地找任务官(头顶有“!”)接取新任务。' : ''}</div>`;
  html += '<div style="margin-top:8px;font-size:13px;line-height:1.8">' + chain.map((q, i) => `<div style="color:${i < ql.stage ? '#8f8' : i === ql.stage ? '#ffd76a' : '#778'}">${i < ql.stage ? '✔' : i === ql.stage ? '▶' : '·'} ${esc(q.name)} <span style="color:#99a;font-size:12px">— ${ql.objText(q)}${q.obj.n > 1 ? ' ×' + q.obj.n : ''}</span></div>`).join('') + '</div>';
  box.innerHTML = html;
  root.appendChild(box);
}

// ———————————————————————— 职业融合
export function buildFusion(ui, root) {
  const g = ui.game, rpg = g.player.rpg;
  const box = document.createElement('div'); box.className = 'box'; box.style.width = '520px';
  box.innerHTML = `<h3 style="color:#e0a0ff">职业融合:选择第二职业</h3><div class="mnote">主职业:${CLASSES[rpg.cls].name}。第二职业的技能可与主职业技能自由组合进技能栏(需 ${FUSION_LEVEL} 级以上);若资源不同,将同时拥有两种资源。融合后不可更改。</div><div class="clsgrid" id="clsGrid"></div>`;
  root.appendChild(box);
  const grid = box.querySelector('#clsGrid');
  for (const [k, c] of Object.entries(CLASSES)) {
    if (k === rpg.cls) continue;
    const b = document.createElement('div'); b.className = 'clsbtn';
    b.innerHTML = `<span style="color:${c.color}">${c.name}</span><div style="font-size:11px;font-weight:normal;color:#ccd">${c.desc}</div>`;
    b.onclick = () => {
      rpg.cls2 = k; rpg.fusion = true; rpg.fusionReady = false;
      rpg.res[CLASSES[k].res] = rpg.res[CLASSES[k].res] ?? 0;
      if (CLASSES[k].res === 'mana') rpg.res.mana = rpg.maxRes('mana');
      g.msg(`职业融合完成:你现在是 <b>${CLASSES[rpg.cls].name}·${c.name}</b>!按 K 打开技能书装配新技能。`, '#e0a0ff');
      g.sfx('chime'); ui.skillSig = ''; ui.open('skills');
    };
    grid.appendChild(b);
  }
}
