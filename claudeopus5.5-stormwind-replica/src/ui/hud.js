// HUD：区域名 / 时间 / 模式 + 运行时统计 + 操作说明（中文）
import { DISTRICTS, VALLEY } from '../world/coords.js';

const REGION_NAMES = { valley: VALLEY.name, canal: '运河', sea: '暴风港外海', outside: '艾尔文森林' };

export class Hud {
  constructor() {
    this.el = {
      where: document.getElementById('hud-where'),
      clock: document.getElementById('hud-clock'),
      mode: document.getElementById('hud-mode'),
      stats: document.getElementById('hud-stats'),
      enter: document.getElementById('enter'),
      cross: document.getElementById('crosshair'),
    };
    this.fps = 60;
    this.acc = 0;
    this.frames = 0;
  }

  regionName(r) {
    if (!r) return '';
    if (r.region === 'island') return DISTRICTS[r.district]?.name || '';
    return REGION_NAMES[r.region] || '';
  }

  update(dt, s) {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.25) return;
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    const h = Math.floor(s.hour);
    const m = Math.floor((s.hour - h) * 60);
    this.el.where.textContent = s.indoor ? `${this.regionName(s.region)} · 室内` : this.regionName(s.region);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${s.night > 0.5 ? '☾' : '☀'}`;
    this.el.mode.textContent = { walk: s.fly ? '飞行' : '第一人称', overview: '俯瞰', tour: '自动巡游' }[s.mode];
    this.el.stats.textContent =
      `${this.fps.toFixed(0)} fps · ${s.calls} drawcall · ${(s.tris / 1e6).toFixed(2)}M 三角形\n` +
      `可进入建筑 ${s.hollow} 栋 · 室内已加载 ${s.interiorsOn} · 动态光 ${s.lightsOn}/${s.lightsTotal}`;
    this.el.cross.style.display = s.mode === 'walk' && s.locked ? 'block' : 'none';
    this.el.enter.style.display = s.mode === 'walk' && !s.locked && !s.capture ? 'flex' : 'none';
  }
}
