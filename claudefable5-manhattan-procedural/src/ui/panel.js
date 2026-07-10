// 右侧中文控制面板:天气 / 时间(自动昼夜 + 倍速) / 风速 / 种子重建 / 相机与阴影。
export function createPanel(opts) {
  const el = document.createElement('div');
  el.id = 'panel';
  el.innerHTML = `
    <h1>曼哈顿 · MANHATTAN</h1>
    <div class="sub">3D 场景复现 · 程序化活城 — Claude Fable 5</div>

    <div class="sec">
      <div class="sec-label">天气</div>
      <div class="btn-grid" id="wx-btns"></div>
      <div class="row"><label>风速</label><input id="wind" type="range" min="0" max="25" step="0.5" /><span class="val" id="wind-val"></span></div>
    </div>

    <div class="sec">
      <div class="sec-label">时间</div>
      <div class="row"><input id="time" type="range" min="0" max="1439" step="5" /><span class="val" id="time-val">17:24</span></div>
      <div class="row">
        <label><input id="auto" type="checkbox" checked /> 自动昼夜</label>
        <select id="speed">
          <option value="60">60×</option>
          <option value="240" selected>240×</option>
          <option value="720">720×</option>
        </select>
      </div>
    </div>

    <div class="sec">
      <div class="sec-label">城市生成(种子确定性)</div>
      <div class="row"><input id="seed" type="number" /><button id="regen" style="flex:1">重新生成</button></div>
    </div>

    <div class="sec">
      <div class="sec-label">相机 / 渲染</div>
      <div class="btn-grid two">
        <button id="cam-free" class="active">自由视角</button>
        <button id="cam-tour">自动环游</button>
      </div>
      <div class="row" style="margin-top:8px">
        <label><input id="shadow" type="checkbox" checked /> 阴影</label>
        <label style="margin-left:10px"><input id="hud-toggle" type="checkbox" checked /> 统计</label>
      </div>
    </div>

    <div class="hint">拖拽旋转 · 滚轮缩放 · 右键平移<br/>雷暴天首次点击页面后可听到雷声(按声速延迟)</div>
  `;
  document.body.appendChild(el);

  const $ = (id) => el.querySelector('#' + id);

  // 天气按钮
  const wxWrap = $('wx-btns');
  const wxBtns = {};
  for (const name of opts.weathers) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => { setWeatherActive(name); opts.onWeather(name); };
    wxWrap.appendChild(b);
    wxBtns[name] = b;
  }
  function setWeatherActive(name) {
    for (const [n, b] of Object.entries(wxBtns)) b.classList.toggle('active', n === name);
  }
  setWeatherActive(opts.state.weather);

  // 时间
  const timeEl = $('time'), timeVal = $('time-val');
  const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  timeEl.value = Math.round(opts.state.hours * 60);
  timeVal.textContent = fmt(opts.state.hours);
  timeEl.addEventListener('input', () => {
    const h = timeEl.value / 60;
    timeVal.textContent = fmt(h);
    opts.onTime(h);
  });
  $('auto').addEventListener('change', (e) => opts.onAuto(e.target.checked));
  $('speed').addEventListener('change', (e) => opts.onSpeed(Number(e.target.value)));

  // 风
  const windEl = $('wind'), windVal = $('wind-val');
  windEl.value = opts.state.wind;
  windVal.textContent = `${opts.state.wind} m/s`;
  windEl.addEventListener('input', () => {
    windVal.textContent = `${windEl.value} m/s`;
    opts.onWind(Number(windEl.value));
  });

  // 种子
  const seedEl = $('seed');
  seedEl.value = opts.state.seed;
  $('regen').addEventListener('click', () => {
    const s = Math.max(0, Math.floor(Number(seedEl.value) || 0));
    seedEl.value = s;
    opts.onRegen(s);
  });

  // 相机 / 渲染
  const camFree = $('cam-free'), camTour = $('cam-tour');
  camFree.onclick = () => { camFree.classList.add('active'); camTour.classList.remove('active'); opts.onTour(false); };
  camTour.onclick = () => { camTour.classList.add('active'); camFree.classList.remove('active'); opts.onTour(true); };
  $('shadow').addEventListener('change', (e) => opts.onShadow(e.target.checked));
  $('hud-toggle').addEventListener('change', (e) => opts.onHud(e.target.checked));

  return {
    // 自动昼夜运行时同步滑杆(不触发 input 事件)
    syncTime(h) {
      timeEl.value = Math.round(h * 60);
      timeVal.textContent = fmt(h);
    },
    syncWind(v) {
      windEl.value = v;
      windVal.textContent = `${v.toFixed(1)} m/s`;
    },
    setWeatherActive,
  };
}
