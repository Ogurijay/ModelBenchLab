// 漫画分格：关键超车时画面切成 3 格（车 / 对手震惊脸 / 拓海的眼神）；终章对视 2 格。
import { portraitSVG, eyesCloseup } from '../story/portraits.js';
import { sceneCanvas } from '../story/scenes.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OWNER = { r32: 'nakazato', evo: 'seiji', evo3: 'kyoichi', fc: 'ryosuke', ae85: 'itsuki', ae86: 'takumi', benz: 'money', wuling: 'itsuki' };

export class Cinema {
  constructor(app) { this.app = app; this.el = $('panels'); this.busy = false; this.last = -99; }

  panel(style, content, delay = 0) {
    const p = document.createElement('div');
    p.className = 'panel';
    Object.assign(p.style, style);
    if (typeof content === 'string') p.innerHTML = content; else p.appendChild(content);
    this.el.appendChild(p);
    setTimeout(() => p.classList.add('on'), delay);
    return p;
  }

  /** 超车三格：截取当前 3D 画面 + 对手震惊特写 + 拓海眼神 */
  async overtake(victimCar) {
    const now = performance.now() / 1000;
    if (this.busy || now - this.last < 9 || this.app.fast) return;
    this.busy = true; this.last = now;
    const shot = new Image();
    shot.src = await this.app.game.capture();
    this.el.innerHTML = '';
    const who = OWNER[victimCar] || 'nakazato';
    this.panel({ left: '3%', top: '6%', width: '56%', height: '50%', transform: 'rotate(-1.5deg)' }, shot, 0);
    const face = this.panel({ right: '3%', top: '8%', width: '34%', height: '56%', transform: 'rotate(2deg)', background: '#fff' }, `<div style="position:absolute;inset:0;background:repeating-conic-gradient(#fff 0 3deg,#ddd 3deg 6deg)"></div>${portraitSVG(who, 'shock')}`, 140);
    face.querySelector('svg').style.position = 'relative';
    this.panel({ left: '8%', bottom: '8%', width: '60%', height: '24%', transform: 'rotate(1deg)' }, eyesCloseup('takumi'), 280);
    const sfx = document.createElement('div'); sfx.className = 'sfx'; sfx.textContent = '超！'; sfx.style.left = '62%'; sfx.style.bottom = '16%';
    this.el.appendChild(sfx);
    this.app.audio.sfx('shutter');
    this.app.game.speedLines.burst(0.9);
    await sleep(1500);
    for (const p of this.el.querySelectorAll('.panel')) p.classList.remove('on');
    await sleep(300);
    this.el.innerHTML = '';
    this.busy = false;
  }

  /** 终章：左边拓海的眼睛，右边车窗后的夏树 */
  gaze() {
    this.el.innerHTML = '';
    const c = sceneCanvas('window_natsuki');
    const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
    this.panel({ left: '2%', top: '14%', width: '47%', height: '72%', clipPath: 'polygon(0 0,100% 0,92% 100%,0 100%)' }, eyesCloseup('takumi'), 0);
    this.panel({ right: '2%', top: '14%', width: '51%', height: '72%', clipPath: 'polygon(8% 0,100% 0,100% 100%,0 100%)' }, cv, 600);
  }
  clear() { for (const p of this.el.querySelectorAll('.panel')) p.classList.remove('on'); setTimeout(() => { if (!this.busy) this.el.innerHTML = ''; }, 400); }
}
