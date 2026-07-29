import {
  ALL_CHARACTERS,
  ARENAS,
  BOSSES,
  CHARACTERS,
  CUP_ROUTE,
  DIFFICULTIES,
  GAME_MODES,
  ITEMS,
  RULES,
} from '../data/gameData.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const escapeHTML = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const asArray = (value) => Array.isArray(value) ? value : [];
const percent = (value, fallback = 0) => clamp(value ?? fallback, 0, 100);

function payloadAttribute(payload) {
  if (!payload || !Object.keys(payload).length) return '';
  return ` data-payload="${escapeHTML(JSON.stringify(payload))}"`;
}

function actionButton(action, label, {
  payload = {}, className = '', disabled = false, hint = '', ariaLabel = '', autofocus = false,
} = {}) {
  return `<button type="button" class="${escapeHTML(className)}" data-action="${escapeHTML(action)}"${payloadAttribute(payload)}${disabled ? ' disabled aria-disabled="true"' : ''}${autofocus ? ' data-autofocus="true"' : ''}${ariaLabel ? ` aria-label="${escapeHTML(ariaLabel)}"` : ''}>
    <span>${label}</span>${hint ? `<kbd>${escapeHTML(hint)}</kbd>` : ''}
  </button>`;
}

function statBars(character) {
  const labels = { speed: '速度', power: '力量', range: '射程', guard: '防御' };
  return Object.entries(labels).map(([key, label]) => {
    const value = clamp(character?.stats?.[key] ?? 0, 0, 5);
    return `<div class="stat-line"><span>${label}</span><i><b style="--stat:${value}"></b></i><strong>${value}</strong></div>`;
  }).join('');
}

function normalizeFighters(source, selectedCharacter, localPlayers = 1) {
  const raw = Array.isArray(source)
    ? source
    : source?.fighters ?? [source?.player, source?.enemy].filter(Boolean);
  const defaults = [
    { id: 'player', name: selectedCharacter?.name ?? '亚古兽', en: selectedCharacter?.en ?? 'AGUMON', hp: 100, energy: 0, stocks: 2, human: true },
    { id: 'cpu-1', name: '加布兽', en: 'GABUMON', hp: 100, energy: 0, stocks: 2 },
    { id: 'cpu-2', name: '妖狐兽', en: 'RENAMON', hp: 100, energy: 0, stocks: 2 },
    { id: 'cpu-3', name: '甲虫兽', en: 'TENTOMON', hp: 100, energy: 0, stocks: 2 },
  ];
  const humanSlots = clamp(localPlayers, 1, 4);
  return defaults.map((fallback, index) => ({ ...fallback, human: index < humanSlots, ...(raw[index] ?? {}) }));
}

/**
 * 完整产品界面的纯视图层。
 *
 * GameUI 不直接修改 GameFlowController；所有用户操作都通过 onAction(action, payload)
 * 交给组合根处理。实例化后会隐藏 index.html 中兼容旧 main.js 的 legacy-ui。
 */
export class GameUI {
  constructor({ root = document.querySelector('#productUI'), onAction = null } = {}) {
    if (!root) throw new Error('GameUI 需要 #productUI 根节点');
    this.root = root;
    this.mount = root.querySelector('[data-ui-mount]') ?? root;
    this.actionHandler = typeof onAction === 'function' ? onAction : null;
    this.currentState = null;
    this.currentViewModel = null;
    this.announcementTimer = null;
    this.toastTimer = null;

    this.handleClick = this.#handleClick.bind(this);
    this.handleChange = this.#handleChange.bind(this);
    this.handleInput = this.#handleInput.bind(this);
    this.handleKeyDown = this.#handleKeyDown.bind(this);
    this.handleSubmit = this.#handleSubmit.bind(this);
    root.addEventListener('click', this.handleClick);
    root.addEventListener('change', this.handleChange);
    root.addEventListener('input', this.handleInput);
    root.addEventListener('keydown', this.handleKeyDown);
    root.addEventListener('submit', this.handleSubmit);

    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('product-ui-active');
  }

  setActionHandler(handler) {
    if (handler !== null && typeof handler !== 'function') throw new TypeError('操作处理器必须是函数或 null');
    this.actionHandler = handler;
    return this;
  }

  onAction(action, payload = {}) {
    const detail = { action, payload: clone(payload) };
    if (this.actionHandler) this.actionHandler(action, detail.payload);
    this.root.dispatchEvent(new CustomEvent('gameui:action', { detail, bubbles: true }));
    return detail;
  }

  render(flowState, viewModel = {}) {
    const state = typeof flowState === 'string'
      ? { screen: flowState, context: {}, save: {}, settings: {} }
      : (flowState ?? { screen: 'boot', context: {}, save: {}, settings: {} });
    const screen = state.screen ?? 'boot';
    const model = this.#buildViewModel(state, viewModel);
    this.currentState = clone(state);
    this.currentViewModel = model;

    this.root.dataset.screen = screen;
    this.root.classList.toggle('ui-high-contrast', Boolean(model.settings.highContrast));
    this.root.classList.toggle('ui-reduced-motion', Boolean(model.settings.reducedMotion));
    this.mount.innerHTML = this.#renderScreen(screen, state, model);

    if (screen !== 'battle') {
      requestAnimationFrame(() => {
        const target = this.mount.querySelector('[data-autofocus="true"]')
          ?? this.mount.querySelector('[data-action]:not([disabled])');
        target?.focus({ preventScroll: true });
      });
    }
    return this;
  }

  setLoading(progress, label = '同步数码世界…', detail = '') {
    if (typeof progress === 'object') {
      ({ progress = 0, label = label, detail = detail } = progress);
    }
    const normalized = clamp(progress <= 1 ? progress * 100 : progress, 0, 100);
    for (const bar of document.querySelectorAll('#loadBar, [data-ui-load-bar]')) bar.style.width = `${normalized}%`;
    for (const text of document.querySelectorAll('#loadText, [data-ui-load-label]')) text.textContent = label;
    for (const text of document.querySelectorAll('[data-ui-load-detail]')) text.textContent = detail || `${Math.round(normalized)}%`;
    return this;
  }

  setBattleHUD(source, meta = {}) {
    const selected = this.#selectedCharacter(this.currentState ?? {}, this.currentViewModel ?? {});
    const fighters = normalizeFighters(source, selected, this.currentViewModel?.localPlayers ?? 1);
    fighters.forEach((fighter, index) => {
      const slot = this.root.querySelector(`[data-hud-slot="${index}"]`);
      if (!slot) return;
      const hp = percent(fighter.hp, 100);
      const energy = percent(fighter.energy ?? fighter.evolution, 0);
      const name = slot.querySelector('[data-hud-name]');
      const en = slot.querySelector('[data-hud-en]');
      const hpFill = slot.querySelector('[data-hud-hp]');
      const evoFill = slot.querySelector('[data-hud-evo]');
      const stock = slot.querySelector('[data-hud-stock]');
      if (name) name.textContent = fighter.name ?? `PLAYER ${index + 1}`;
      if (en) en.textContent = fighter.en ?? fighter.id ?? '';
      if (hpFill) hpFill.style.width = `${hp}%`;
      if (evoFill) evoFill.style.width = `${energy}%`;
      if (stock) stock.textContent = `×${fighter.stocks ?? fighter.lives ?? 1}`;
      slot.classList.toggle('is-defeated', hp <= 0);
      slot.classList.toggle('is-burst', Number(fighter.overdrive) > 0);
    });

    const timer = this.root.querySelector('[data-battle-timer]');
    if (timer && meta.time !== undefined) timer.textContent = String(Math.max(0, Math.ceil(meta.time))).padStart(2, '0');
    const round = this.root.querySelector('[data-battle-round]');
    if (round && meta.round !== undefined) round.textContent = `ROUND ${String(meta.round).padStart(2, '0')}`;
    const status = this.root.querySelector('[data-battle-status]');
    if (status && meta.status) status.textContent = meta.status;

    const legacyPairs = [[fighters[0], 'player'], [fighters[1], 'enemy']];
    for (const [fighter, prefix] of legacyPairs) {
      const hp = document.querySelector(`#${prefix}Hp`);
      const soul = document.querySelector(`#${prefix}Soul`);
      if (hp) hp.style.width = `${percent(fighter.hp, 100)}%`;
      if (soul) soul.style.width = `${percent(fighter.energy, 0)}%`;
    }
    return this;
  }

  announce(message, { kicker = 'NETWORK SIGNAL', tone = 'cyan', duration = 1300 } = {}) {
    const overlay = this.root.querySelector('[data-ui-announcement]');
    if (!overlay) return this;
    clearTimeout(this.announcementTimer);
    overlay.querySelector('small').textContent = kicker;
    overlay.querySelector('strong').textContent = message;
    overlay.dataset.tone = tone;
    overlay.classList.remove('hidden', 'pop');
    void overlay.offsetWidth;
    overlay.classList.add('pop');
    if (duration > 0) this.announcementTimer = setTimeout(() => overlay.classList.add('hidden'), duration);
    return this;
  }

  toast(message, { tone = 'info', duration = 2400 } = {}) {
    const node = this.root.querySelector('[data-ui-toast]');
    if (!node) return this;
    clearTimeout(this.toastTimer);
    node.textContent = message;
    node.dataset.tone = tone;
    node.classList.remove('hidden');
    if (duration > 0) this.toastTimer = setTimeout(() => node.classList.add('hidden'), duration);
    return this;
  }

  fatal(message, detail = '') {
    const node = this.root.querySelector('[data-ui-fatal]');
    if (node) {
      if (!message) {
        node.classList.add('hidden');
      } else {
        node.querySelector('strong').textContent = message;
        node.querySelector('span').textContent = detail;
        node.classList.remove('hidden');
      }
    }
    const legacy = document.querySelector('#fatal');
    if (legacy && message) {
      legacy.querySelector('strong').textContent = message;
      legacy.querySelector('span').textContent = detail;
    }
    return this;
  }

  destroy() {
    clearTimeout(this.announcementTimer);
    clearTimeout(this.toastTimer);
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('change', this.handleChange);
    this.root.removeEventListener('input', this.handleInput);
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.root.removeEventListener('submit', this.handleSubmit);
    this.root.classList.add('hidden');
    this.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('product-ui-active');
  }

  #buildViewModel(state, viewModel) {
    const profile = state.save?.profile ?? {};
    const settings = { ...(state.settings ?? {}), ...(viewModel.settings ?? {}) };
    const localPlayers = clamp(viewModel.localPlayers ?? state.context?.match?.localPlayers ?? 1, 1, 4);
    const minimumCpu = localPlayers === 1 ? 1 : 0;
    const cpuCount = clamp(viewModel.cpuCount ?? state.context?.match?.cpuCount ?? 1, minimumCpu, 4 - localPlayers);
    return {
      characters: viewModel.characters ?? CHARACTERS,
      bosses: viewModel.bosses ?? BOSSES,
      allCharacters: viewModel.allCharacters ?? ALL_CHARACTERS,
      stages: viewModel.stages ?? ARENAS,
      rules: viewModel.rules ?? RULES,
      cupRoute: viewModel.cupRoute ?? CUP_ROUTE,
      modes: viewModel.modes ?? GAME_MODES,
      difficulties: viewModel.difficulties ?? DIFFICULTIES,
      items: viewModel.items ?? ITEMS,
      unlockedCharacters: new Set(viewModel.unlockedCharacters ?? profile.unlockedCharacters ?? CHARACTERS.map((item) => item.id)),
      unlockedStages: new Set(viewModel.unlockedStages ?? profile.unlockedStages ?? ['terminal']),
      settings,
      rule: viewModel.rule ?? (state.context?.mode === 'training' ? 'training' : 'stock'),
      localPlayers,
      cpuCount,
      difficulty: viewModel.difficulty ?? settings.difficulty ?? 'normal',
      previewCharacterId: viewModel.previewCharacterId,
      previewStageId: viewModel.previewStageId,
      fighters: viewModel.fighters,
      battle: viewModel.battle ?? {},
      loading: viewModel.loading ?? {},
      records: viewModel.records ?? state.save?.records ?? {},
      profile,
    };
  }

  #selectedCharacter(state, model) {
    const id = model.previewCharacterId ?? state.context?.characterId;
    return model.allCharacters?.find((character) => character.id === id)
      ?? model.characters?.find((character) => model.unlockedCharacters?.has(character.id))
      ?? model.characters?.[0];
  }

  #selectedStage(state, model) {
    const id = model.previewStageId ?? state.context?.stageId;
    return model.stages.find((stage) => stage.id === id)
      ?? model.stages.find((stage) => model.unlockedStages.has(stage.id))
      ?? model.stages[0];
  }

  #renderScreen(screen, state, model) {
    const renderers = {
      boot: () => this.#renderBoot(model),
      title: () => this.#renderTitle(state, model),
      menu: () => this.#renderMenu(state, model),
      mode: () => this.#renderMode(state, model),
      character: () => this.#renderCharacter(state, model),
      stage: () => this.#renderStage(state, model),
      cup: () => this.#renderCup(state, model),
      battle: () => this.#renderBattle(state, model),
      pause: () => this.#renderPause(state, model),
      result: () => this.#renderResult(state, model),
      ending: () => this.#renderEnding(state, model),
      lab: () => this.#renderLab(state, model),
      options: () => this.#renderOptions(state, model),
    };
    return (renderers[screen] ?? renderers.boot)();
  }

  #topline(code, title, { backAction = 'back', backLabel = '返回', noBack = false } = {}) {
    return `<header class="ui-topline">
      <div class="ui-route-code"><b>${escapeHTML(code)}</b><span>${escapeHTML(title)}</span></div>
      <div class="ui-net-state"><i></i><span>DIGITAL LINK / STABLE</span></div>
      ${noBack ? '<span class="ui-build">BUILD 2026.07</span>' : actionButton(backAction, backLabel, { className: 'ui-back', hint: 'ESC' })}
    </header>`;
  }

  #renderBoot(model) {
    const loading = model.loading;
    const progress = percent(loading.progress <= 1 ? loading.progress * 100 : loading.progress, 0);
    return `<section class="ui-screen boot-screen" aria-labelledby="boot-title">
      <div class="boot-protocol" aria-hidden="true"><i></i><i></i><i></i><b>DR</b></div>
      <div class="boot-copy">
        <p>NETWORK ARENA OPERATING SYSTEM</p>
        <h1 id="boot-title">正在接入<br><span>数码世界</span></h1>
        <div class="protocol-lines"><span>AUTH / LOCAL PLAYER</span><span>ASSET CHANNEL / GLB</span><span>COMBAT CORE / READY</span></div>
        <div class="ui-load-track"><i data-ui-load-bar style="width:${progress}%"></i></div>
        <div class="ui-load-meta"><strong data-ui-load-label>${escapeHTML(loading.label ?? '读取战斗资料…')}</strong><span data-ui-load-detail>${Math.round(progress)}%</span></div>
      </div>
    </section>`;
  }

  #renderTitle() {
    return `<section class="ui-screen product-title" aria-labelledby="product-game-title">
      <div class="title-data-sun" aria-hidden="true"><i></i><i></i><i></i><span>0101<br>1100<br>0010</span></div>
      <div class="title-scan" aria-hidden="true"></div>
      ${this.#topline('DIGI://00', '网络竞技协议', { noBack: true })}
      <div class="product-title-copy">
        <p class="eyebrow">EVOLVE · COLLIDE · SURVIVE</p>
        <h1 id="product-game-title"><span>DIGI</span><br>RUMBLE</h1>
        <div class="product-cn-title"><b>数码兽</b><i></i><strong>大乱斗</strong></div>
        ${actionButton('press-start', '<b>PRESS START</b><small>进入数码竞技网络</small>', { className: 'press-start', hint: 'ENTER', autofocus: true, ariaLabel: '开始游戏' })}
      </div>
      <div class="title-channel"><span>LOCAL ARENA</span><b>UP TO 4 FIGHTERS</b><em>NO. 2004-2026</em></div>
      <footer class="product-title-footer"><span>© LOCAL FAN STUDY BUILD</span><span>THREE.JS REAL-TIME SYSTEM</span></footer>
    </section>`;
  }

  #renderMenu(state, model) {
    const cup = state.save?.cup ?? {};
    const commands = [
      { action: cup.active ? 'resume-cup' : 'open-mode', index: '01', zh: cup.active ? '继续数码杯' : '开始战斗', en: cup.active ? `ROUND ${cup.currentRound + 1} / 6` : 'BATTLE GATE', accent: true },
      { action: 'open-mode', index: '02', zh: '模式选择', en: 'GAME MODES' },
      { action: 'open-lab', index: '03', zh: '数码实验室', en: 'DIGI-LAB' },
      { action: 'open-options', index: '04', zh: '系统设定', en: 'OPTIONS' },
    ];
    return `<section class="ui-screen menu-screen" aria-labelledby="menu-title">
      ${this.#topline('DIGI://01', '主终端', { backLabel: '标题' })}
      <div class="console-menu">
        <div class="menu-heading"><p>SELECT PROTOCOL</p><h1 id="menu-title">主菜单</h1><span>选择要接入的数码网络区域</span></div>
        <nav class="menu-rail" aria-label="主菜单">
          ${commands.map((item, index) => actionButton(item.action,
            `<em>${item.index}</em><strong>${item.zh}</strong><small>${item.en}</small><i>›</i>`,
            { className: `menu-command${item.accent ? ' is-accent' : ''}`, autofocus: index === 0 },
          )).join('')}
        </nav>
        <aside class="menu-core" aria-label="玩家资料">
          <div class="core-radar" aria-hidden="true"><i></i><i></i><b>${String(model.profile.data ?? 0).padStart(4, '0')}</b><span>DATA</span></div>
          <dl class="profile-readout">
            <div><dt>PLAYER</dt><dd>LOCAL 01</dd></div>
            <div><dt>ROSTER</dt><dd>${model.unlockedCharacters.size}/${model.allCharacters.length}</dd></div>
            <div><dt>CUP RECORD</dt><dd>${state.save?.records?.byMode?.cup?.wins ?? 0} WINS</dd></div>
            <div><dt>BEST COMBO</dt><dd>${state.save?.records?.bestCombo ?? 0} HIT</dd></div>
          </dl>
          <div class="menu-message"><b>SYSTEM MESSAGE</b><p>${cup.active ? `数码杯第 ${cup.currentRound + 1} 关等待继续。` : '所有战斗频道已开放。选择模式开始连接。'}</p></div>
        </aside>
      </div>
    </section>`;
  }

  #renderMode(state, model) {
    return `<section class="ui-screen mode-screen" aria-labelledby="mode-title">
      ${this.#topline('DIGI://02', '战斗协议')}
      <div class="mode-heading"><p>CHOOSE BATTLE PROTOCOL</p><h1 id="mode-title">模式选择</h1></div>
      <div class="mode-stack">
        ${model.modes.map((mode, index) => {
          const action = mode.id === 'lab' ? 'open-lab' : mode.id === 'options' ? 'open-options' : 'select-mode';
          return actionButton(action,
            `<em>${mode.index}</em><div><small>${escapeHTML(mode.en)}</small><strong>${escapeHTML(mode.name)}</strong><p>${escapeHTML(mode.description)}</p></div><b>${mode.id === 'cup' ? 'MAIN' : 'LINK'}</b>`,
            { payload: mode.id === 'lab' || mode.id === 'options' ? {} : { mode: mode.id }, className: `mode-band mode-${mode.id}`, autofocus: index === 0 },
          );
        }).join('')}
      </div>
      <div class="mode-index" aria-hidden="true"><b>05</b><span>ACTIVE PROTOCOLS</span></div>
    </section>`;
  }

  #renderCharacter(state, model) {
    const selected = this.#selectedCharacter(state, model);
    const roster = [...model.characters, ...model.bosses];
    return `<section class="ui-screen character-screen" aria-labelledby="character-title">
      ${this.#topline('DIGI://03', '角色资料库')}
      <div class="section-heading compact"><div><p>SELECT YOUR PARTNER</p><h1 id="character-title">选择数码兽</h1></div><span>${model.unlockedCharacters.size} / ${roster.length} LINKED</span></div>
      <div class="character-layout">
        <div class="roster-grid" role="list" aria-label="可选角色">
          ${roster.map((character, index) => {
            const unlocked = model.unlockedCharacters.has(character.id);
            const active = selected?.id === character.id;
            return actionButton('select-character',
              `<em>${String(index + 1).padStart(2, '0')}</em><span class="roster-mark">${unlocked ? escapeHTML(character.en.slice(0, 2)) : '×'}</span><div><strong>${unlocked ? escapeHTML(character.name) : '资料锁定'}</strong><small>${unlocked ? escapeHTML(character.en) : 'UNKNOWN'}</small></div>${character.boss ? '<b>BOSS</b>' : ''}`,
              { payload: { characterId: character.id, resumeCup: true }, className: `roster-slot${active ? ' is-selected' : ''}${character.boss ? ' is-boss' : ''}`, disabled: !unlocked, autofocus: index === 0 },
            );
          }).join('')}
        </div>
        <aside class="character-dossier" style="--char:${escapeHTML(selected?.color ?? '#3cecff')};--accent:${escapeHTML(selected?.accent ?? '#ffe53b')}">
          <div class="dossier-code"><span>PARTNER DATA</span><b>${escapeHTML(selected?.crest ?? '未知')}</b></div>
          <div class="dossier-sigil" aria-hidden="true"><span>${escapeHTML(selected?.en?.slice(0, 2) ?? 'DR')}</span></div>
          <h2>${escapeHTML(selected?.name)}</h2><p>${escapeHTML(selected?.en)} // ${escapeHTML(selected?.role)}</p>
          <div class="stats-grid">${statBars(selected)}</div>
          <div class="evolution-chain">
            <small>EVOLUTION ROUTE</small>
            <div>${asArray(selected?.forms).map((form, index) => `<article><em>0${index + 1}</em><strong>${escapeHTML(form.name)}</strong><span>${escapeHTML(form.en)}</span><small>${escapeHTML(form.skill)}</small></article>`).join('<i>›</i>')}</div>
          </div>
        </aside>
      </div>
      <footer class="ui-actionbar"><span><kbd>方向键</kbd> 浏览资料</span><span><kbd>ENTER</kbd> 确认搭档</span></footer>
    </section>`;
  }

  #renderStage(state, model) {
    const selected = this.#selectedStage(state, model);
    const selectedId = state.context?.stageId ?? model.previewStageId;
    const rules = Object.values(model.rules);
    const minimumCpu = model.localPlayers === 1 ? 1 : 0;
    const maximumCpu = 4 - model.localPlayers;
    const cpuOptions = Array.from({ length: maximumCpu - minimumCpu + 1 }, (_, index) => minimumCpu + index);
    return `<section class="ui-screen stage-screen" aria-labelledby="stage-title">
      ${this.#topline('DIGI://04', '战斗编成')}
      <div class="section-heading compact"><div><p>CONFIGURE THE ARENA</p><h1 id="stage-title">场地与规则</h1></div><span>${model.localPlayers}P + ${model.cpuCount} CPU</span></div>
      <div class="stage-layout">
        <div class="stage-strip" role="list" aria-label="竞技场">
          ${model.stages.map((stage, index) => {
            const unlocked = model.unlockedStages.has(stage.id);
            const active = selected?.id === stage.id;
            return actionButton('select-stage',
              `<em>${escapeHTML(stage.icon)}</em><div><small>${escapeHTML(stage.en)}</small><strong>${unlocked ? escapeHTML(stage.name) : '区域封锁'}</strong><p>${unlocked ? escapeHTML(stage.description) : '完成数码杯以取得访问权限。'}</p></div><b>${unlocked ? escapeHTML(stage.hazard.toUpperCase()) : 'LOCK'}</b>`,
              { payload: { stageId: stage.id }, className: `stage-band stage-${stage.id}${active ? ' is-selected' : ''}`, disabled: !unlocked, autofocus: index === 0 },
            );
          }).join('')}
        </div>
        <aside class="match-console">
          <div class="arena-readout"><span>SELECTED AREA</span><strong>${escapeHTML(selected?.name)}</strong><small>${escapeHTML(selected?.en)}</small><p>${escapeHTML(selected?.description)}</p></div>
          <fieldset><legend>战斗规则 / RULE</legend><div class="segment-control">${rules.map((rule) => actionButton('set-rule', escapeHTML(rule.name), { payload: { rule: rule.id }, className: rule.id === model.rule ? 'is-active' : '' })).join('')}</div></fieldset>
          <fieldset><legend>本地玩家 / LOCAL PLAYERS（P3/P4 仅手柄）</legend><div class="step-control local-player-control">${[1, 2, 3, 4].map((count) => {
            const nextCpu = count === 1 ? Math.max(1, Math.min(model.cpuCount, 3)) : Math.min(model.cpuCount, 4 - count);
            return actionButton('set-local-players', `${count}P${count >= 3 ? ' 🎮' : ''}`, { payload: { localPlayers: count, cpuCount: nextCpu }, className: count === model.localPlayers ? 'is-active' : '' });
          }).join('')}</div></fieldset>
          <fieldset><legend>CPU 数量 / CPU FIGHTERS</legend><div class="step-control cpu-count-control">${cpuOptions.map((count) => actionButton('set-cpu-count', `${count} CPU`, { payload: { cpuCount: count, localPlayers: model.localPlayers }, className: count === model.cpuCount ? 'is-active' : '' })).join('')}</div></fieldset>
          <fieldset><legend>难度 / DIFFICULTY</legend><div class="difficulty-control">${model.difficulties.map((difficulty) => actionButton('set-difficulty', `<strong>${escapeHTML(difficulty.name)}</strong><small>${escapeHTML(difficulty.en)}</small>`, { payload: { difficulty: difficulty.id }, className: difficulty.id === model.difficulty ? 'is-active' : '' })).join('')}</div></fieldset>
          ${actionButton('start-battle', '<strong>建立战斗链接</strong><small>LOAD MATCH DATA</small>', { payload: { stageId: selectedId ?? selected?.id, rule: model.rule, localPlayers: model.localPlayers, cpuCount: model.cpuCount, difficulty: model.difficulty }, className: 'primary-launch', disabled: !selectedId })}
        </aside>
      </div>
    </section>`;
  }

  #renderCup(state, model) {
    const cup = state.save?.cup ?? {};
    const currentRound = clamp(state.context?.cupRound ?? cup.currentRound ?? 0, 0, model.cupRoute.length - 1);
    const current = model.cupRoute[currentRound];
    return `<section class="ui-screen cup-screen" aria-labelledby="cup-title">
      ${this.#topline('DIGI://05', '锦标赛网络')}
      <div class="section-heading"><div><p>SIX-LINK CHAMPIONSHIP</p><h1 id="cup-title">数码杯</h1></div><span>ROUTE ${currentRound + 1} / 6</span></div>
      <div class="cup-route" role="list" aria-label="数码杯六关路线">
        ${model.cupRoute.map((round, index) => {
          const status = index < currentRound ? 'complete' : index === currentRound ? 'current' : 'locked';
          return `<article class="cup-node is-${status}" role="listitem"><span>${escapeHTML(round.tier)}</span><div><i></i><b>${escapeHTML(round.name)}</b><small>${escapeHTML(round.rule.toUpperCase())}</small></div><em>${status === 'complete' ? 'CLEAR' : status === 'current' ? 'NEXT' : 'LOCK'}</em></article>`;
        }).join('')}
      </div>
      <div class="cup-brief">
        <div class="cup-round-number"><small>ACTIVE NODE</small><strong>${escapeHTML(current.tier)}</strong></div>
        <div><p>${escapeHTML(current.name)}</p><h2>${escapeHTML(model.stages.find((stage) => stage.id === current.arena)?.name ?? current.arena)}</h2><span>对手：${current.opponents.map((id) => escapeHTML(model.allCharacters.find((item) => item.id === id)?.name ?? id)).join(' / ')}</span></div>
        <dl><div><dt>规则</dt><dd>${escapeHTML(model.rules[current.rule]?.name ?? current.rule)}</dd></div><div><dt>奖励</dt><dd>${escapeHTML(current.reward)}</dd></div></dl>
        ${actionButton('start-battle', '<strong>挑战本节点</strong><small>BEGIN MATCH</small>', { className: 'primary-launch', payload: { cupRound: currentRound } })}
      </div>
      <div class="cup-items"><span>ACTIVE ITEMS</span>${model.items.map((item) => `<i title="${escapeHTML(item.description)}">${escapeHTML(item.en.slice(0, 2))}</i>`).join('')}</div>
    </section>`;
  }

  #battleHUD(state, model) {
    const selected = this.#selectedCharacter(state, model);
    const fighters = normalizeFighters(model.fighters ?? model.battle, selected, model.localPlayers);
    return `<div class="quad-hud" aria-label="四名斗士战斗状态">
      ${fighters.map((fighter, index) => `<section class="hud-player hud-p${index + 1}" data-hud-slot="${index}">
        <header><em>${fighter.human || index === 0 ? `P${index + 1}` : 'CPU'}</em><div><strong data-hud-name>${escapeHTML(fighter.name)}</strong><small data-hud-en>${escapeHTML(fighter.en)}</small></div><b data-hud-stock>×${fighter.stocks ?? 2}</b></header>
        <div class="hud-hp"><i data-hud-hp style="width:${percent(fighter.hp, 100)}%"></i></div>
        <div class="hud-evo"><span>EVOLUTION</span><i><b data-hud-evo style="width:${percent(fighter.energy, 0)}%"></b></i></div>
      </section>`).join('')}
      <div class="battle-clock"><small data-battle-round>ROUND 01</small><strong data-battle-timer>${String(Math.ceil(model.battle.time ?? model.settings.battleTime ?? 90)).padStart(2, '0')}</strong><span data-battle-status>${escapeHTML(model.battle.status ?? 'BATTLE')}</span></div>
    </div>`;
  }

  #renderBattle(state, model) {
    const selected = this.#selectedCharacter(state, model);
    const fighters = normalizeFighters(model.fighters ?? model.battle, selected, model.localPlayers);
    const cheatTarget = fighters.find((fighter) => fighter.human) ?? fighters[0];
    const cheat = model.settings.freeEvolutionCheat ? `<aside class="evolution-cheat" aria-label="自由进化作弊控制">
      <header><span>CHEAT // FORM SHIFT</span><strong>自由进化</strong></header>
      <div>
        ${actionButton('cheat-devolve', '<strong>退化</strong><small>FORM −</small>', { className: 'cheat-step', payload: { fighterId: cheatTarget?.id ?? 'p1' } })}
        ${actionButton('cheat-evolve', '<strong>进化</strong><small>FORM +</small>', { className: 'cheat-step is-forward', payload: { fighterId: cheatTarget?.id ?? 'p1' } })}
      </div>
      <small>不消耗进化能量 · 仅作用于主玩家</small>
    </aside>` : '';
    return `<section class="ui-screen battle-screen" aria-label="战斗界面">
      ${this.#battleHUD(state, model)}
      ${actionButton('pause', '<span class="sr-only">暂停</span><b>Ⅱ</b>', { className: 'pause-trigger', ariaLabel: '暂停游戏', hint: 'ESC' })}
      <div class="battle-objective"><small>2.5D PLANE // ${escapeHTML(state.context?.match?.rule?.toUpperCase?.() ?? 'STOCK')}</small><strong>${escapeHTML(model.battle.objective ?? '击倒所有对手')}</strong></div>
      ${cheat}
      <footer class="battle-controls"><span><kbd>A / D</kbd>左右移动</span><span><kbd>W / SPACE</kbd>跳跃</span><span class="is-attack"><kbd>J</kbd>普通攻击</span><span class="is-ranged"><kbd>K</kbd>远程攻击</span><span><kbd>E</kbd>能量进化</span></footer>
    </section>`;
  }

  #renderPause(state, model) {
    return `<section class="ui-screen battle-screen pause-screen" aria-labelledby="pause-title">
      ${this.#battleHUD(state, model)}
      <div class="pause-shutter" aria-hidden="true"></div>
      <div class="pause-menu">
        <p>COMBAT LINK SUSPENDED</p><h1 id="pause-title">暂停</h1>
        <nav>${actionButton('resume', '<strong>继续战斗</strong><small>RESUME</small>', { className: 'pause-command', autofocus: true })}${actionButton('restart-battle', '<strong>重新开始</strong><small>RESTART MATCH</small>', { className: 'pause-command' })}${actionButton('exit-to-menu', '<strong>返回主菜单</strong><small>ABORT MATCH</small>', { className: 'pause-command is-danger' })}</nav>
        <span>当前对局进度尚未写入战绩</span>
      </div>
    </section>`;
  }

  #renderResult(state) {
    const result = state.context?.result ?? {};
    const win = result.outcome === 'win';
    const draw = result.outcome === 'draw';
    const title = win ? 'YOU WIN' : draw ? 'DRAW' : 'YOU LOSE';
    const code = win ? 'AREA SECURED' : draw ? 'TIME OVER' : 'DATA LINK LOST';
    const cupWin = result.mode === 'cup' && win;
    return `<section class="ui-screen product-result" aria-labelledby="product-result-title">
      <div class="result-rays" aria-hidden="true"></div>
      ${this.#topline('DIGI://07', '战斗结算', { noBack: true })}
      <div class="result-banner"><p>${code}</p><h1 id="product-result-title">${title}</h1><span>${escapeHTML(result.reward?.badges?.[0] ? '冠军资料已写入' : 'BATTLE COMPLETE')}</span></div>
      <div class="result-ledger">
        <div><small>剩余生命</small><strong>${Math.round(result.hp ?? result.player?.hp ?? 0)}%</strong></div>
        <div><small>战斗时间</small><strong>${escapeHTML(result.timeText ?? `${Math.round(result.durationSeconds ?? 0)}s`)}</strong></div>
        <div><small>最大连击</small><strong>${result.maxCombo ?? result.player?.maxCombo ?? 0} HIT</strong></div>
        <div><small>获得 DATA</small><strong>+${result.data ?? result.reward?.data ?? 0}</strong></div>
      </div>
      <nav class="result-actions">
        ${actionButton('retry', '<strong>再次挑战</strong><small>RETRY</small>', { className: 'result-action', disabled: cupWin })}
        ${actionButton('continue', `<strong>${result.cupCompleted ? '查看结局' : result.mode === 'cup' ? '下一节点' : '继续'}</strong><small>CONTINUE</small>`, { className: 'result-action is-primary', autofocus: true })}
        ${actionButton('change-character', '<strong>更换角色</strong><small>CHARACTER SELECT</small>', { className: 'result-action' })}
        ${actionButton('exit-to-menu', '<strong>主菜单</strong><small>MAIN TERMINAL</small>', { className: 'result-action' })}
      </nav>
    </section>`;
  }

  #renderEnding(state) {
    const records = state.save?.records ?? {};
    return `<section class="ui-screen ending-screen" aria-labelledby="ending-title">
      <div class="champion-halo" aria-hidden="true"><i></i><i></i><i></i><b>Ω</b></div>
      ${this.#topline('DIGI://Ω', '冠军认证', { noBack: true })}
      <div class="ending-copy"><p>DIGITAL WORLD CHAMPION</p><h1 id="ending-title">网络恢复</h1><h2>你成为了新一届数码杯冠军</h2><div><span>六个战斗节点已全部清除。</span><span>隐藏角色与黑暗区域访问权已解锁。</span></div>${actionButton('complete-ending', '<strong>返回数码世界</strong><small>COMPLETE CUP</small>', { className: 'press-start', autofocus: true })}</div>
      <dl class="ending-record"><div><dt>TOTAL WINS</dt><dd>${records.wins ?? 0}</dd></div><div><dt>BEST COMBO</dt><dd>${records.bestCombo ?? 0}</dd></div><div><dt>CUP CLEAR</dt><dd>${state.save?.cup?.completions ?? 1}</dd></div></dl>
    </section>`;
  }

  #renderLab(state, model) {
    const selected = this.#selectedCharacter(state, model);
    const records = model.records;
    return `<section class="ui-screen lab-screen" aria-labelledby="lab-title">
      ${this.#topline('DIGI://08', '数码实验室', { backAction: 'close-overlay' })}
      <div class="section-heading compact"><div><p>ARCHIVE & PERFORMANCE</p><h1 id="lab-title">数码实验室</h1></div><span>${model.unlockedCharacters.size} DATA FILES</span></div>
      <div class="lab-layout">
        <nav class="lab-index" aria-label="数码兽图鉴">${model.allCharacters.map((character, index) => {
          const unlocked = model.unlockedCharacters.has(character.id);
          return actionButton('lab-select', `<em>${String(index + 1).padStart(3, '0')}</em><strong>${unlocked ? escapeHTML(character.name) : '未解析资料'}</strong><small>${unlocked ? escapeHTML(character.en) : 'LOCKED'}</small>`, { payload: { characterId: character.id }, className: selected?.id === character.id ? 'is-active' : '', disabled: !unlocked, autofocus: index === 0 });
        }).join('')}</nav>
        <article class="lab-dossier"><div class="lab-watermark">${escapeHTML(selected?.en?.slice(0, 2) ?? 'DR')}</div><p>${escapeHTML(selected?.crest)} // ${escapeHTML(selected?.role)}</p><h2>${escapeHTML(selected?.name)}</h2><h3>${escapeHTML(selected?.en)}</h3><div class="lab-evolutions">${asArray(selected?.forms).map((form, index) => `<section><em>PHASE ${index + 1}</em><strong>${escapeHTML(form.name)}</strong><small>${escapeHTML(form.skill)}</small></section>`).join('')}</div><div class="stats-grid">${statBars(selected)}</div></article>
        <aside class="records-terminal"><h2>战斗记录</h2><dl><div><dt>总对局</dt><dd>${records.matches ?? 0}</dd></div><div><dt>胜 / 负</dt><dd>${records.wins ?? 0} / ${records.losses ?? 0}</dd></div><div><dt>最佳连击</dt><dd>${records.bestCombo ?? 0}</dd></div><div><dt>连续胜利</dt><dd>${records.bestWinStreak ?? 0}</dd></div><div><dt>训练次数</dt><dd>${records.trainingSessions ?? 0}</dd></div><div><dt>持有 DATA</dt><dd>${model.profile.data ?? 0}</dd></div></dl></aside>
      </div>
    </section>`;
  }

  #rangeSetting(name, label, value, min = 0, max = 1, step = 0.05) {
    return `<label class="option-row"><span><strong>${escapeHTML(label)}</strong><small>${escapeHTML(name.toUpperCase())}</small></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-action="setting-change" data-setting="${escapeHTML(name)}"><output data-output-for="${escapeHTML(name)}">${Math.round(Number(value) * (max === 1 ? 100 : 1))}${max === 1 ? '%' : ''}</output></label>`;
  }

  #renderOptions(state, model) {
    const settings = model.settings;
    return `<section class="ui-screen options-screen" aria-labelledby="options-title">
      ${this.#topline('DIGI://09', '系统设定', { backAction: 'close-overlay' })}
      <div class="section-heading compact"><div><p>CALIBRATE LOCAL SYSTEM</p><h1 id="options-title">系统设定</h1></div><span>AUTO SAVE / ON</span></div>
      <form class="options-console">
        <section><h2>战斗</h2><fieldset><legend>CPU 难度</legend><div class="option-radio">${model.difficulties.map((difficulty) => `<label><input type="radio" name="difficulty" value="${escapeHTML(difficulty.id)}" data-action="setting-change" data-setting="difficulty"${settings.difficulty === difficulty.id ? ' checked' : ''}><span><strong>${escapeHTML(difficulty.name)}</strong><small>${escapeHTML(difficulty.en)}</small></span></label>`).join('')}</div></fieldset><label class="option-row"><span><strong>战斗时间</strong><small>BATTLE TIME</small></span><select data-action="setting-change" data-setting="battleTime">${[60, 90, 120, 180].map((time) => `<option value="${time}"${Number(settings.battleTime) === time ? ' selected' : ''}>${time} 秒</option>`).join('')}</select></label>${this.#rangeSetting('cameraShake', '镜头震动', settings.cameraShake ?? 0.75)}<label class="option-toggle cheat-option"><span><strong>自由进化作弊</strong><small>FREE FORM SHIFT</small><em>战斗中显示“退化 / 进化”按钮，不消耗能量。</em></span><input type="checkbox" data-action="setting-change" data-setting="freeEvolutionCheat"${settings.freeEvolutionCheat ? ' checked' : ''}><i></i></label></section>
        <section><h2>音频</h2>${this.#rangeSetting('masterVolume', '主音量', settings.masterVolume ?? 0.8)}${this.#rangeSetting('musicVolume', '音乐', settings.musicVolume ?? 0.65)}${this.#rangeSetting('sfxVolume', '战斗音效', settings.sfxVolume ?? 0.8)}</section>
        <section><h2>显示与辅助</h2><label class="option-row"><span><strong>画面质量</strong><small>GRAPHICS</small></span><select data-action="setting-change" data-setting="graphicsQuality">${[['low', '性能'], ['medium', '均衡'], ['high', '高质量']].map(([id, label]) => `<option value="${id}"${settings.graphicsQuality === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${[['reducedMotion', '减少动画'], ['highContrast', '高对比度'], ['showControlHints', '显示操作提示']].map(([name, label]) => `<label class="option-toggle"><span><strong>${label}</strong><small>${name.replace(/[A-Z]/g, (match) => ` ${match}`).toUpperCase()}</small></span><input type="checkbox" data-action="setting-change" data-setting="${name}"${settings[name] ? ' checked' : ''}><i></i></label>`).join('')}</section>
        <footer>${actionButton('reset-settings', '<strong>恢复默认</strong><small>RESET ALL</small>', { className: 'secondary-action' })}${actionButton('close-overlay', '<strong>保存并返回</strong><small>APPLY</small>', { className: 'primary-launch', autofocus: true })}</footer>
      </form>
    </section>`;
  }

  #handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !this.root.contains(target) || target.disabled) return;
    event.preventDefault();
    this.onAction(target.dataset.action, this.#payloadFrom(target));
  }

  #handleChange(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !this.root.contains(target) || target.matches('button')) return;
    const value = target.type === 'checkbox'
      ? target.checked
      : target.type === 'range' || target.type === 'number' || target.dataset.number === 'true'
        ? Number(target.value)
        : target.value;
    const payload = { ...this.#payloadFrom(target), name: target.dataset.setting ?? target.name, value };
    this.onAction(target.dataset.action, payload);
  }

  #handleInput(event) {
    const target = event.target;
    if (!target.matches('input[type="range"][data-setting]')) return;
    const output = this.root.querySelector(`[data-output-for="${target.dataset.setting}"]`);
    if (output) output.textContent = Number(target.max) === 1 ? `${Math.round(Number(target.value) * 100)}%` : target.value;
  }

  #handleSubmit(event) {
    if (this.root.contains(event.target)) event.preventDefault();
  }

  #handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onAction(this.currentState?.screen === 'pause' ? 'resume' : 'back', {});
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.target.matches('input, select, textarea')) return;
    const targets = [...this.mount.querySelectorAll('[data-action]:not([disabled])')];
    if (!targets.length) return;
    const current = Math.max(0, targets.indexOf(document.activeElement));
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    targets[(current + delta + targets.length) % targets.length].focus();
    event.preventDefault();
  }

  #payloadFrom(target) {
    if (!target.dataset.payload) return {};
    try { return JSON.parse(target.dataset.payload); }
    catch { return {}; }
  }
}

export default GameUI;
