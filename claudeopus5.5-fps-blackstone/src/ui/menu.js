// 菜单与设置界面（DOM）。

const SCREENS = ['menu', 'pause', 'settings', 'controls', 'results'];
const KEY = 'blackstone.settings';

export const DEFAULT_SETTINGS = { sens: 1.0, adsSens: 0.85, fov: 95, volume: 0.8, music: 0.5, quality: 'high', invert: false, showFps: false };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export class Menu {
  constructor(G) {
    this.G = G;
    this.current = 'menu';
    this.returnTo = 'menu';
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.G.audio.init();
        this.G.audio.play('ui_click', { volume: 0.5, reverb: false });
        this.act(b.dataset.act);
      });
      b.addEventListener('mouseenter', () => this.G.audio.play('ui_hover', { volume: 0.25, reverb: false }));
    });
    this.bindSettings();
    this.refreshBest();
  }

  act(a) {
    const G = this.G;
    switch (a) {
      case 'mission':
      case 'survival':
        G.start(a, this.difficulty());
        break;
      case 'resume':
        G.resume();
        break;
      case 'restart':
        G.start(G.modeId, G.difficulty);
        break;
      case 'quit':
        G.quitToMenu();
        break;
      case 'settings':
        this.returnTo = this.current;
        this.show('settings');
        break;
      case 'controls':
        this.returnTo = this.current;
        this.show('controls');
        break;
      case 'back':
        this.show(this.returnTo);
        break;
    }
  }

  difficulty() {
    const r = document.querySelector('input[name=diff]:checked');
    return r ? r.value : 'normal';
  }

  show(name) {
    this.current = name;
    for (const s of SCREENS) document.getElementById(s).classList.toggle('hidden', s !== name);
    if (name === 'menu') this.refreshBest();
  }

  refreshBest() {
    const best = Number(localStorage.getItem('blackstone.best') || 0);
    const wave = Number(localStorage.getItem('blackstone.bestWave') || 0);
    const mission = localStorage.getItem('blackstone.missionBest');
    const lines = [];
    if (mission) lines.push(`任务最佳：<b>${mission}</b>`);
    if (best) lines.push(`生存最高分：<b>${best}</b>（第 ${wave} 波）`);
    document.getElementById('best-score').innerHTML = lines.join('<br>');
  }

  showResults(win, title, sub, rows) {
    document.getElementById('res-title').textContent = title;
    document.getElementById('res-title').style.color = win ? '#7dff9a' : '#ff6a55';
    document.getElementById('res-sub').textContent = sub;
    document.getElementById('res-grid').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.show('results');
  }

  bindSettings() {
    const G = this.G, S = G.settings;
    const bindRange = (id, key, fmt) => {
      const el = document.getElementById('s-' + id), v = document.getElementById('v-' + id);
      el.value = S[key];
      v.textContent = fmt(S[key]);
      el.addEventListener('input', () => {
        S[key] = Number(el.value);
        v.textContent = fmt(S[key]);
        saveSettings(S);
        G.applySettings();
      });
    };
    bindRange('sens', 'sens', (x) => x.toFixed(2));
    bindRange('adssens', 'adsSens', (x) => x.toFixed(2));
    bindRange('fov', 'fov', (x) => `${x}°`);
    bindRange('vol', 'volume', (x) => `${Math.round(x * 100)}%`);
    bindRange('music', 'music', (x) => `${Math.round(x * 100)}%`);
    const q = document.getElementById('s-quality');
    q.value = S.quality;
    q.addEventListener('change', () => {
      S.quality = q.value;
      saveSettings(S);
      if (confirm('画质设置需要重新载入页面才能生效，现在重新载入吗？')) location.reload();
    });
    const inv = document.getElementById('s-invert');
    inv.checked = S.invert;
    inv.addEventListener('change', () => {
      S.invert = inv.checked;
      saveSettings(S);
    });
    const fps = document.getElementById('s-fps');
    fps.checked = S.showFps;
    fps.addEventListener('change', () => {
      S.showFps = fps.checked;
      saveSettings(S);
      G.applySettings();
    });
  }
}
