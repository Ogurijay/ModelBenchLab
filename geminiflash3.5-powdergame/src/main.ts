import { Sandbox } from './engine/Sandbox';
import { CanvasRenderer } from './engine/CanvasRenderer';
import type { RenderMode } from './engine/CanvasRenderer';
import { ElementId } from './engine/Types';
import { getElementDef } from './engine/Elements';

// 初始化沙盒引擎与渲染器
const GAME_WIDTH = 240;
const GAME_HEIGHT = 135;

const canvas = document.getElementById('sandbox-canvas') as HTMLCanvasElement;
const sandbox = new Sandbox(GAME_WIDTH, GAME_HEIGHT);
const renderer = new CanvasRenderer(canvas, GAME_WIDTH, GAME_HEIGHT);

// 获取状态指示灯 DOM
const statusLed = document.getElementById('status-led') as HTMLElement;

// 默认状态
let selectedElementId: ElementId = ElementId.STONE;
let brushSize = 6;
let brushShape: 'circle' | 'square' = 'circle';
let currentRenderMode: RenderMode = 'normal';
let isDrawing = false;
let isErasing = false; // 右键橡皮擦
let addSparkMode = false; // 是否是注入电火花模式

// 鼠标位置 (网格坐标)
let mouseGridX = -1;
let mouseGridY = -1;

// 初始化沙盒默认场景
function setupDemoScene() {
  sandbox.clear();
  
  // 底部绘制一层坚固的石头基底
  for (let x = 0; x < GAME_WIDTH; x++) {
    sandbox.setParticle(x, GAME_HEIGHT - 1, ElementId.WALL);
    sandbox.setParticle(x, GAME_HEIGHT - 2, ElementId.WALL);
  }
  
  // 左右两侧绘制高墙
  for (let y = 0; y < GAME_HEIGHT; y++) {
    sandbox.setParticle(0, y, ElementId.WALL);
    sandbox.setParticle(GAME_WIDTH - 1, y, ElementId.WALL);
  }
}

setupDemoScene();

/* ==========================================================================
   绘制操作逻辑 (Drawing & Erasing)
   ========================================================================== */
function drawBrush(cx: number, cy: number) {
  const r = brushSize;
  
  if (brushShape === 'circle') {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px = cx + dx;
          const py = cy + dy;
          applyPaint(px, py);
        }
      }
    }
  } else {
    const half = Math.floor(r / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        applyPaint(px, py);
      }
    }
  }
}

function applyPaint(x: number, y: number) {
  if (!sandbox.inBounds(x, y)) return;
  const idx = y * sandbox.width + x;

  if (isErasing) {
    // 右键擦除：设为真空
    sandbox.setParticle(x, y, ElementId.NONE);
    return;
  }

  if (addSparkMode) {
    // 电火花注入模式：只注入给导体
    const type = sandbox.gridType[idx];
    if (type === ElementId.COPPER || type === ElementId.SILICON || type === ElementId.COND_WALL) {
      sandbox.gridSpark[idx] = 8; // 触发带电
    }
  } else {
    // 正常绘制元素
    sandbox.setParticle(x, y, selectedElementId);
  }
}

/* ==========================================================================
   事件监听器绑定 (Canvas Events)
   ========================================================================== */
// 禁止右键菜单
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function getMouseGridCoords(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME_WIDTH / rect.width;
  const scaleY = GAME_HEIGHT / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);
  return { x, y };
}

canvas.addEventListener('mousedown', (e) => {
  const coords = getMouseGridCoords(e);
  if (e.button === 0) {
    isDrawing = true;
    isErasing = false;
  } else if (e.button === 2) {
    isDrawing = true;
    isErasing = true; // 右键作为橡皮擦
  }
  drawBrush(coords.x, coords.y);
});

window.addEventListener('mouseup', () => {
  isDrawing = false;
  isErasing = false;
});

canvas.addEventListener('mousemove', (e) => {
  const coords = getMouseGridCoords(e);
  mouseGridX = coords.x;
  mouseGridY = coords.y;

  if (isDrawing) {
    drawBrush(coords.x, coords.y);
  }
});

canvas.addEventListener('mouseleave', () => {
  mouseGridX = -1;
  mouseGridY = -1;
});

/* ==========================================================================
   DOM 控制交互绑定
   ========================================================================== */

// 1. 元素分类选项卡切换
const tabButtons = document.querySelectorAll('.tab-btn');
const elementGrids = document.querySelectorAll('.element-grid');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    elementGrids.forEach((g) => g.classList.remove('active'));
    
    btn.classList.add('active');
    const cat = btn.getAttribute('data-cat');
    const targetGrid = document.getElementById(`grid-${cat}`);
    if (targetGrid) {
      targetGrid.classList.add('active');
    }
  });
});

// 2. 元素按钮选择
const elButtons = document.querySelectorAll('.el-btn');
const elDesc = document.getElementById('el-desc')!;

elButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    elButtons.forEach((b) => b.classList.remove('active'));
    document.getElementById('btn-add-spark')?.classList.remove('active');
    
    btn.classList.add('active');
    addSparkMode = false;
    
    const id = parseInt(btn.getAttribute('data-id') || '0');
    selectedElementId = id as ElementId;
    
    const def = getElementDef(id);
    elDesc.innerHTML = `<strong>${def.name} (${def.symbol})</strong>: ${def.description}<br><br><span style="color: var(--text-muted)">默认温度: ${def.defaultTemp}℃ | 密度: ${def.density}</span>`;
  });
});

// 3. 注入电火花专属按钮
const btnAddSpark = document.getElementById('btn-add-spark');
if (btnAddSpark) {
  btnAddSpark.addEventListener('click', () => {
    elButtons.forEach((b) => b.classList.remove('active'));
    btnAddSpark.classList.add('active');
    addSparkMode = true;
    elDesc.innerHTML = `<strong>⚡ 注入电火花</strong>: 激活此工具后，在铜线(Cu)、硅片(Si)或导线墙(Cw)上点击，可为其注入电信号火花，激活电学传导反应。`;
  });
}

// 默认选中石头
const defaultBtn = document.querySelector('.el-btn[data-id="3"]');
if (defaultBtn) {
  (defaultBtn as HTMLElement).click();
}

// 4. 渲染模式切换
const modeButtons = document.querySelectorAll('.btn-mode');
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentRenderMode = btn.getAttribute('data-mode') as RenderMode;
  });
});

// 5. 模拟控制：暂停/播放
const btnPause = document.getElementById('btn-pause')!;
btnPause.addEventListener('click', () => {
  sandbox.paused = !sandbox.paused;
  btnPause.innerText = sandbox.paused ? '▶ 播放模拟' : '⏸ 暂停模拟';
  btnPause.classList.toggle('active', sandbox.paused);
  
  // 更新 LED 状态灯颜色
  if (statusLed) {
    statusLed.className = sandbox.paused ? 'led led-paused' : 'led led-running';
  }
});

// 6. 模拟控制：单步
const btnStep = document.getElementById('btn-step')!;
btnStep.addEventListener('click', () => {
  if (sandbox.paused) {
    if (statusLed) {
      statusLed.className = 'led led-stepping';
    }
    sandbox.tick();
    setTimeout(() => {
      if (sandbox.paused && statusLed) {
        statusLed.className = 'led led-paused';
      }
    }, 120);
  }
});

// 7. 模拟控制：清屏
const btnClear = document.getElementById('btn-clear')!;
btnClear.addEventListener('click', () => {
  setupDemoScene();
});

// 8. 画笔大小调节
const brushSlider = document.getElementById('brush-size') as HTMLInputElement;
const brushVal = document.getElementById('val-brush-size')!;
brushSlider.addEventListener('input', () => {
  brushSize = parseInt(brushSlider.value);
  brushVal.innerText = brushSize.toString();
});

// 9. 画笔形状切换
const btnCircle = document.getElementById('brush-circle')!;
const btnSquare = document.getElementById('brush-square')!;

btnCircle.addEventListener('click', () => {
  btnCircle.classList.add('active');
  btnSquare.classList.remove('active');
  brushShape = 'circle';
});

btnSquare.addEventListener('click', () => {
  btnSquare.classList.add('active');
  btnCircle.classList.remove('active');
  brushShape = 'square';
});

// 10. 重力选择器
const gravitySelect = document.getElementById('gravity-select') as HTMLSelectElement;
gravitySelect.addEventListener('change', () => {
  const val = gravitySelect.value;
  if (val === 'down') {
    sandbox.gravityX = 0;
    sandbox.gravityY = 1;
  } else if (val === 'none') {
    sandbox.gravityX = 0;
    sandbox.gravityY = 0;
  } else if (val === 'left') {
    sandbox.gravityX = -1;
    sandbox.gravityY = 0;
  } else if (val === 'right') {
    sandbox.gravityX = 1;
    sandbox.gravityY = 0;
  } else if (val === 'up') {
    sandbox.gravityX = 0;
    sandbox.gravityY = -1;
  }
});

/* ==========================================================================
   信息视察看板更新与主循环 (Inspect & Loop)
   ========================================================================== */
const inspectName = document.getElementById('inspect-name')!;
const inspectTemp = document.getElementById('inspect-temp')!;
const inspectPress = document.getElementById('inspect-press')!;
const fpsCounter = document.getElementById('fps-counter')!;

let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

function updateInspectPanel() {
  if (mouseGridX !== -1 && mouseGridY !== -1 && sandbox.inBounds(mouseGridX, mouseGridY)) {
    const idx = mouseGridY * sandbox.width + mouseGridX;
    const type = sandbox.gridType[idx];
    const temp = sandbox.gridTemp[idx];
    
    // 获取气压
    const pressIdx = sandbox.air.getIndex(mouseGridX, mouseGridY);
    const pressure = pressIdx !== -1 ? sandbox.air.pressure[pressIdx] : 0;
    
    const def = getElementDef(type);
    
    inspectName.innerText = `${def.name} (${def.symbol})`;
    inspectTemp.innerText = `${temp.toFixed(1)}℃`;
    inspectPress.innerText = pressure.toFixed(2);
  } else {
    inspectName.innerText = '真空 (Vac)';
    inspectTemp.innerText = '--℃';
    inspectPress.innerText = '0.00';
  }
}

function loop() {
  const now = performance.now();
  frameCount++;
  
  if (now - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastTime));
    fpsCounter.innerText = fps.toString();
    frameCount = 0;
    lastTime = now;
  }

  // 1. 引擎步进
  sandbox.tick();

  // 2. 渲染画面
  renderer.render(sandbox, currentRenderMode);

  // 3. 更新视察 HUD
  updateInspectPanel();

  requestAnimationFrame(loop);
}

// 启动主循环
requestAnimationFrame(loop);