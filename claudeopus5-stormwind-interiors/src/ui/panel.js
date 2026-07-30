// 右侧控制面板:视角 / 传送 / 时辰 / 显示选项。
export function createPanel(el, api) {
  el.innerHTML = `
    <h1>暴风王都</h1>
    <div class="sub">STORMHOLD · 内外可穿行全景</div>

    <div class="sec">
      <div class="sec-label">视 角</div>
      <div class="btn-grid three">
        <button data-mode="orbit">全景</button>
        <button data-mode="walk">行走</button>
        <button data-mode="fly">飞行</button>
      </div>
      <div class="row"><label>自动环绕</label><input type="checkbox" id="p-auto" checked></div>
    </div>

    <div class="sec">
      <div class="sec-label">传 送</div>
      <div class="btn-grid">
        <button data-go="gate">狮王之门</button>
        <button data-go="plaza">交易广场</button>
        <button data-go="bridge">英雄桥</button>
        <button data-go="cathedral">大教堂内</button>
        <button data-go="throne">王座厅</button>
        <button data-go="wall">城墙马道</button>
        <button data-go="harbor">西港栈桥</button>
        <button data-go="garden">王家花园</button>
        <button data-go="forge">熔炉工坊</button>
        <button data-go="oldtown">旧城民居</button>
      </div>
      <div class="btn-grid" style="margin-top:6px">
        <button class="gold" data-go="random-house">随机进一户人家</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-label">时 辰</div>
      <div class="row"><label>时刻</label><input type="range" id="p-time" min="0" max="24" step="0.05" value="10.5"><span class="val" id="p-time-v">10:30</span></div>
      <div class="row"><label>自动昼夜</label><input type="checkbox" id="p-daynight"></div>
      <div class="btn-grid three">
        <button data-time="7.2">清晨</button>
        <button data-time="13">正午</button>
        <button data-time="18.6">黄昏</button>
        <button data-time="22">夜</button>
        <button data-time="5.4">破晓</button>
        <button data-time="16">午后</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-label">显 示</div>
      <div class="row"><label>掀屋顶(看内景)</label><input type="checkbox" id="p-xray"></div>
      <div class="row"><label>阴影</label><input type="checkbox" id="p-shadow" checked></div>
      <div class="row"><label>市民</label><input type="checkbox" id="p-npc" checked></div>
      <div class="row"><label>画质</label><input type="range" id="p-res" min="0.6" max="2" step="0.1" value="1"><span class="val" id="p-res-v">1.0×</span></div>
    </div>

    <div class="sec">
      <div class="sec-label">操 作</div>
      <div class="keys">
        <kbd>点击</kbd>锁定鼠标 · <kbd>ESC</kbd>退出<br>
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>移动 · <kbd>⇧</kbd>疾跑<br>
        <kbd>空格</kbd>跳 / 飞行上升 · <kbd>C</kbd>飞行下降<br>
        <kbd>F</kbd>行走⇄飞行 · <kbd>R</kbd>掀屋顶 · <kbd>M</kbd>全景<br>
        <kbd>滚轮</kbd>飞行调速
      </div>
    </div>
  `;

  const $ = (id) => el.querySelector(id);
  const timeV = $('#p-time-v'), timeR = $('#p-time');
  const resV = $('#p-res-v');

  const fmtTime = (h) => {
    const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  el.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => api.setMode(b.dataset.mode)));
  el.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => api.teleport(b.dataset.go)));
  el.querySelectorAll('[data-time]').forEach((b) =>
    b.addEventListener('click', () => { api.setTime(parseFloat(b.dataset.time)); }));

  timeR.addEventListener('input', () => api.setTime(parseFloat(timeR.value)));
  $('#p-daynight').addEventListener('change', (e) => api.setAutoDay(e.target.checked));
  $('#p-auto').addEventListener('change', (e) => api.setAutoOrbit(e.target.checked));
  $('#p-xray').addEventListener('change', (e) => api.setXray(e.target.checked));
  $('#p-shadow').addEventListener('change', (e) => api.setShadow(e.target.checked));
  $('#p-npc').addEventListener('change', (e) => api.setNpc(e.target.checked));
  $('#p-res').addEventListener('input', (e) => {
    resV.textContent = parseFloat(e.target.value).toFixed(1) + '×';
    api.setResolution(parseFloat(e.target.value));
  });

  return {
    setTime(h) { timeR.value = h; timeV.textContent = fmtTime(h); },
    setMode(mode) {
      el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    },
    setXray(on) { $('#p-xray').checked = on; },
  };
}
