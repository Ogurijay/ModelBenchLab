// 第 8 章：刘教练的毽子操 QTE。按出现的方向键（触屏点按方向块），节奏越来越快。
import { portraitSVG } from '../story/portraits.js';

const KEYS = [['ArrowLeft', '←'], ['ArrowRight', '→'], ['ArrowUp', '↑'], ['ArrowDown', '↓']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function jianziQTE(app) {
  const el = document.getElementById('qte');
  el.classList.add('on');
  const seq = [0, 1, 0, 1, 2, 3, 0, 1, 2, 2];
  let ok = 0;
  for (let i = 0; i < seq.length; i++) {
    const [code, label] = KEYS[seq[i]];
    const window = 1300 - i * 70;
    el.innerHTML = `<div style="width:min(30vh,200px);height:min(45vh,300px);transform:translateY(${i % 2 ? -14 : 0}px) rotate(${i % 2 ? 6 : -6}deg)">${portraitSVG('seiji', 'smile')}</div>
      <div class="qkey" data-k="${code}">${label}</div><div class="qbar"><i style="width:100%"></i></div><div class="qtip">毽子操 ${i + 1}/${seq.length} · 跟上刘教练！</div>`;
    const bar = el.querySelector('.qbar i'), key = el.querySelector('.qkey');
    if (app.fast) { ok++; continue; }
    const res = await new Promise((resolve) => {
      const t0 = performance.now();
      let done = false;
      const finish = (v) => { if (done) return; done = true; removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (KEYS.some(([c]) => c === e.code)) finish(e.code === code); };
      addEventListener('keydown', onKey);
      key.addEventListener('pointerdown', () => finish(true));
      const tick = () => { if (done) return; const f = 1 - (performance.now() - t0) / window; bar.style.width = Math.max(0, f * 100) + '%'; if (f <= 0) finish(false); else requestAnimationFrame(tick); };
      tick();
      setTimeout(() => finish(false), window + 50);
    });
    key.classList.add(res ? 'ok' : 'bad');
    app.audio.sfx(res ? 'qteOk' : 'qteBad');
    if (res) ok++;
    app.danmaku.push(res ? ['踢！', '好腿', '毽子操yyds', '刘教练带带我'][i % 4] : ['踢歪了', '腿抽筋了', '哈哈哈哈'][i % 3]);
    await sleep(240);
  }
  el.innerHTML = `<div class="qtip" style="font-size:28px">毽子操完成 ${ok}/${seq.length}${ok >= 8 ? ' · 刘教练笑岔了气（对手状态 -）' : ''}</div>`;
  await sleep(app.fast ? 0 : 1400);
  el.classList.remove('on'); el.innerHTML = '';
  return ok / seq.length;
}
