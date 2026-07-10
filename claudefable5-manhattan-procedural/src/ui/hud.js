// 左上统计 HUD:FPS(均值/最低 + 走势图)、drawcall、三角形、
// 实例统计(楼宇/窗/树/车/信号灯)、太阳高度角、天气与种子。
export function createHud() {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div><span class="big" id="h-fps">--</span> <span class="k">FPS</span>
      <span class="dim" id="h-ms"></span></div>
    <canvas id="h-spark" width="184" height="30"></canvas>
    <div><span class="k">绘制调用</span> <span id="h-calls">-</span> · <span class="k">三角形</span> <span id="h-tris">-</span></div>
    <div><span class="k">楼宇</span> <span id="h-bld">-</span> · <span class="k">窗</span> <span id="h-win">-</span> · <span class="k">水塔</span> <span id="h-twr">-</span></div>
    <div><span class="k">树木</span> <span id="h-tree">-</span> · <span class="k">车辆</span> <span id="h-car">-</span> · <span class="k">信号灯</span> <span id="h-sig">-</span></div>
    <div><span class="k">时间</span> <span id="h-time">-</span> · <span class="k">太阳高度</span> <span id="h-sun">-</span></div>
    <div><span class="k">天气</span> <span id="h-wx">-</span> · <span class="k">风</span> <span id="h-wind">-</span> · <span class="k">种子</span> <span id="h-seed">-</span></div>
    <div class="dim" id="h-build"></div>
  `;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#' + id);
  const spark = $('h-spark').getContext('2d');

  const hist = new Float32Array(92);
  let hi = 0;
  let acc = 0, accN = 0, accMin = Infinity, uiTimer = 0;

  return {
    el,
    setVisible(v) { el.style.display = v ? '' : 'none'; },
    frame(dt) {
      const fps = 1 / Math.max(dt, 1e-4);
      acc += fps; accN++;
      accMin = Math.min(accMin, fps);
    },
    update(dt, renderer, data) {
      uiTimer += dt;
      if (uiTimer < 0.25 || accN === 0) return;
      const fps = acc / accN;
      hist[hi % hist.length] = fps;
      hi++;
      $('h-fps').textContent = fps.toFixed(0);
      $('h-ms').textContent = `${(1000 / fps).toFixed(1)}ms · 最低 ${accMin.toFixed(0)}`;
      acc = 0; accN = 0; accMin = Infinity; uiTimer = 0;

      const info = renderer.info.render;
      $('h-calls').textContent = info.calls;
      $('h-tris').textContent = info.triangles.toLocaleString();
      $('h-bld').textContent = data.buildings.toLocaleString();
      $('h-win').textContent = data.windows.toLocaleString();
      $('h-twr').textContent = data.waterTowers;
      $('h-tree').textContent = data.trees;
      $('h-car').textContent = data.cars;
      $('h-sig').textContent = data.signals;
      $('h-time').textContent = data.time;
      $('h-sun').textContent = `${data.sunDeg.toFixed(1)}°`;
      $('h-wx').textContent = data.weather;
      $('h-wind').textContent = `${data.wind.toFixed(1)}m/s`;
      $('h-seed').textContent = data.seed;
      $('h-build').textContent = `城市生成 ${data.buildMs.toFixed(0)}ms · 车道 ${data.lanes} · 平均 ${data.avgFps.toFixed(0)}fps`;

      // FPS 走势
      spark.clearRect(0, 0, 184, 30);
      spark.strokeStyle = '#3f6db3';
      spark.beginPath();
      const n = Math.min(hi, hist.length);
      for (let i = 0; i < n; i++) {
        const v = hist[(hi - n + i + hist.length * 8) % hist.length];
        const x = (i / (hist.length - 1)) * 184;
        const y = 30 - Math.min(1, v / 90) * 28 - 1;
        i === 0 ? spark.moveTo(x, y) : spark.lineTo(x, y);
      }
      spark.stroke();
      spark.strokeStyle = 'rgba(120,200,140,0.35)';
      spark.beginPath();
      const y60 = 30 - (60 / 90) * 28 - 1;
      spark.moveTo(0, y60); spark.lineTo(184, y60);
      spark.stroke();
    },
  };
}
