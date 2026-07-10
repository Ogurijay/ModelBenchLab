import { PointerPainter } from "../input/PointerPainter";
import { PRESETS, loadPreset, type PresetId } from "../presets/presets";
import { ParticleRenderer } from "../render/ParticleRenderer";
import { CATEGORY_META, ELEMENT_LIST, ElementId, getElement } from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { BrushSelection, ElementCategory, ProbeReading, SimulationSnapshot, ToolId, ViewMode } from "../simulation/types";

const TOOLS: Array<{ id: ToolId; icon: string; label: string; detail: string }> = [
  { id: "erase", icon: "⌫", label: "擦除", detail: "移除物质并复位局部空气" },
  { id: "heat", icon: "+°", label: "加热", detail: "提高粒子与空气温度" },
  { id: "cool", icon: "−°", label: "冷却", detail: "降低粒子与空气温度" },
  { id: "air", icon: "→", label: "气流", detail: "按拖动方向注入空气速度" },
  { id: "vacuum", icon: "−P", label: "真空", detail: "降低局部相对压力" },
  { id: "pressure", icon: "+P", label: "增压", detail: "提高局部相对压力" },
  { id: "mix", icon: "↔", label: "搅拌", detail: "交换画笔范围内的物质" },
  { id: "lightning", icon: "ϟ", label: "闪电", detail: "放置高温放电脉冲" }
];

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: "normal", label: "物质" },
  { id: "heat", label: "热量" },
  { id: "pressure", label: "压力" },
  { id: "air", label: "气流" },
  { id: "electric", label: "电路" }
];

const categoryOrder: ElementCategory[] = ["build", "powder", "liquid", "gas", "electricity", "energy", "life"];
const STORAGE_KEY = "gpt5.6sol-powdergame:slot-1";

const format = (value: number, digits = 1): string => Number.isFinite(value) ? value.toFixed(digits) : "0.0";

export class AppUi {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: ParticleRenderer;
  paused = false;
  speed = 1;

  private selection: BrushSelection = { kind: "element", id: ElementId.Sand };
  private brushRadius = 4;
  private activeCategory: ElementCategory = "powder";
  private probe: ProbeReading;
  private readonly painter: PointerPainter;
  private readonly undoStack: SimulationSnapshot[] = [];
  private readonly redoStack: SimulationSnapshot[] = [];
  private toastTimer = 0;
  private lastUiUpdate = 0;

  constructor(
    root: HTMLElement,
    private readonly simulation: PowderSimulation
  ) {
    this.root = root;
    this.root.innerHTML = this.shellMarkup();
    const canvas = this.root.querySelector<HTMLCanvasElement>("#simulation-canvas");
    if (!canvas) throw new Error("界面缺少模拟画布");
    this.canvas = canvas;
    this.renderer = new ParticleRenderer(canvas, simulation);
    this.probe = simulation.getProbe(Math.floor(simulation.width / 2), Math.floor(simulation.height / 2));
    this.renderElementGrid();
    this.bindEvents();
    this.painter = new PointerPainter(canvas, simulation, {
      getSelection: () => this.selection,
      getRadius: () => this.brushRadius,
      onProbe: (reading) => { this.probe = reading; },
      onStrokeStart: () => this.pushHistory(),
      onStrokeEnd: () => this.updateNow(0)
    });
    this.selectElement(ElementId.Sand);
    this.setView("normal");
    this.updateTransport();
    this.updateRangeOutputs();
  }

  destroy(): void {
    this.painter.destroy();
  }

  update(now: number, fps: number): void {
    if (now - this.lastUiUpdate < 120) return;
    this.lastUiUpdate = now;
    this.updateNow(fps);
  }

  selectElement(id: ElementId): void {
    this.selection = { kind: "element", id };
    const element = getElement(id);
    this.activeCategory = element.category;
    this.root.querySelectorAll<HTMLElement>("[data-element]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.element) === id));
    this.root.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => button.classList.remove("is-active"));
    this.root.querySelectorAll<HTMLElement>("[data-category]").forEach((button) => button.classList.toggle("is-active", button.dataset.category === element.category));
    const readout = this.root.querySelector<HTMLElement>("#selection-readout");
    if (readout) readout.innerHTML = `<strong>${element.name}</strong><span>${this.elementCode(element.id)}</span>`;
    this.updateElementDetail(id);
  }

  selectTool(id: ToolId): void {
    this.selection = { kind: "tool", id };
    this.root.querySelectorAll<HTMLElement>("[data-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === id));
    this.root.querySelectorAll<HTMLElement>("[data-element]").forEach((button) => button.classList.remove("is-active"));
    const tool = TOOLS.find((item) => item.id === id);
    const readout = this.root.querySelector<HTMLElement>("#selection-readout");
    if (readout && tool) readout.innerHTML = `<strong>${tool.label}</strong><span>工具 · ${tool.icon}</span>`;
  }

  setView(mode: ViewMode): void {
    this.renderer.setViewMode(mode);
    this.root.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === mode));
  }

  loadPreset(id: PresetId, recordHistory = true): void {
    if (recordHistory) this.pushHistory();
    loadPreset(this.simulation, id);
    const select = this.root.querySelector<HTMLSelectElement>("#preset-select");
    if (select) select.value = id;
    this.showToast(`${PRESETS[id].label}已装载`);
  }

  getSelection(): BrushSelection {
    return { ...this.selection };
  }

  getBrushRadius(): number {
    return this.brushRadius;
  }

  private shellMarkup(): string {
    const toolButtons = TOOLS.map((tool) => `
      <button class="tool-button has-tooltip" type="button" data-tool="${tool.id}" data-tooltip="${tool.detail}" aria-label="${tool.label}">
        <span class="tool-icon" aria-hidden="true">${tool.icon}</span>
        <span class="tool-label">${tool.label}</span>
      </button>`).join("");
    const viewButtons = VIEWS.map((view) => `<button type="button" data-view="${view.id}">${view.label}</button>`).join("");
    const categoryButtons = categoryOrder.map((category) => `<button type="button" data-category="${category}" style="--category-tone:${CATEGORY_META[category].tone}">${CATEGORY_META[category].label}</button>`).join("");
    const presetOptions = Object.entries(PRESETS).map(([id, preset]) => `<option value="${id}">${preset.label}</option>`).join("");

    return `
      <div class="lab-app">
        <header class="topbar">
          <div class="brand-block">
            <span class="brand-mark" aria-hidden="true">SOL</span>
            <div><h1>物质实验场</h1><p>100.0-CN / GPT 5.6 SOL</p></div>
          </div>
          <div class="transport" aria-label="模拟控制">
            <button class="icon-button has-tooltip" type="button" data-action="pause" data-tooltip="暂停模拟" aria-label="暂停模拟"><span id="pause-icon">Ⅱ</span></button>
            <button class="icon-button has-tooltip" type="button" data-action="step" data-tooltip="单步推进" aria-label="单步推进">▸|</button>
            <button class="icon-button has-tooltip" type="button" data-action="undo" data-tooltip="撤销" aria-label="撤销">↶</button>
            <button class="icon-button has-tooltip" type="button" data-action="redo" data-tooltip="重做" aria-label="重做">↷</button>
            <button class="icon-button has-tooltip danger" type="button" data-action="clear" data-tooltip="清空实验场" aria-label="清空实验场">⌫</button>
            <div class="speed-control" aria-label="模拟速度">
              <button type="button" data-speed="1" class="is-active">1×</button>
              <button type="button" data-speed="2">2×</button>
              <button type="button" data-speed="4">4×</button>
            </div>
          </div>
          <div class="file-controls">
            <label class="preset-control"><span>实验</span><select id="preset-select" aria-label="实验预设">${presetOptions}</select></label>
            <button class="icon-button has-tooltip" type="button" data-action="save" data-tooltip="保存到本机" aria-label="保存到本机">↓</button>
            <button class="icon-button has-tooltip" type="button" data-action="load" data-tooltip="读取本机存档" aria-label="读取本机存档">↑</button>
            <button class="icon-button has-tooltip" type="button" data-action="capture" data-tooltip="导出画布图片" aria-label="导出画布图片">▣</button>
            <button class="icon-button has-tooltip" type="button" data-action="fullscreen" data-tooltip="切换全屏" aria-label="切换全屏">⛶</button>
          </div>
        </header>

        <main class="lab-layout">
          <aside class="tool-rail" aria-label="物理工具">
            <div class="rail-caption">工具</div>
            ${toolButtons}
            <label class="brush-control has-tooltip" data-tooltip="画笔半径">
              <span id="brush-output">R 04</span>
              <input id="brush-size" type="range" min="1" max="16" value="4" aria-label="画笔半径" />
            </label>
          </aside>

          <section class="stage-shell">
            <div class="stage-toolbar">
              <div id="selection-readout" class="selection-readout"></div>
              <div class="view-control" aria-label="观测视图">${viewButtons}</div>
            </div>
            <div class="canvas-frame">
              <canvas id="simulation-canvas" aria-label="逐像素物理模拟画布"></canvas>
              <div class="canvas-grid" aria-hidden="true"></div>
              <div class="corner-label top-left">X 000</div>
              <div class="corner-label bottom-right">224 × 128 CELL</div>
            </div>
            <div class="status-strip" aria-live="polite">
              <span><b id="status-state">运行</b> 状态</span>
              <span><b id="status-fps">60</b> FPS</span>
              <span><b id="status-tick">0</b> 步</span>
              <span><b id="status-particles">0</b> 粒子</span>
              <span><b id="status-temp">22.0</b> °C 均温</span>
              <span><b id="status-pressure">0.0</b> 峰压</span>
            </div>
          </section>

          <aside class="inspector">
            <section class="inspector-section probe-section">
              <header><span>实时探针</span><code id="probe-coord">X000 Y000</code></header>
              <div class="probe-identity"><i id="probe-swatch"></i><div><strong id="probe-name">空</strong><span id="probe-code">VOID</span></div></div>
              <dl class="probe-grid">
                <div><dt>温度</dt><dd id="probe-temp">22.0 °C</dd></div>
                <div><dt>压力</dt><dd id="probe-pressure">0.00</dd></div>
                <div><dt>气流 X</dt><dd id="probe-vx">0.00</dd></div>
                <div><dt>气流 Y</dt><dd id="probe-vy">0.00</dd></div>
                <div><dt>寿命</dt><dd id="probe-life">0</dd></div>
                <div><dt>电荷</dt><dd id="probe-charge">0</dd></div>
              </dl>
            </section>

            <section class="inspector-section element-detail" id="element-detail"></section>

            <section class="inspector-section environment-section">
              <header><span>环境参数</span><code>ENV</code></header>
              <label><span>环境温度 <output data-output="ambientTemp">22°C</output></span><input type="range" min="-200" max="300" step="1" value="22" data-setting="ambientTemp" /></label>
              <label><span>基准压力 <output data-output="ambientPressure">0.0</output></span><input type="range" min="-10" max="10" step="0.1" value="0" data-setting="ambientPressure" /></label>
              <label><span>水平风速 <output data-output="ambientVx">0.0</output></span><input type="range" min="-3" max="3" step="0.1" value="0" data-setting="ambientVx" /></label>
              <label><span>垂直风速 <output data-output="ambientVy">0.0</output></span><input type="range" min="-3" max="3" step="0.1" value="0" data-setting="ambientVy" /></label>
              <label><span>重力强度 <output data-output="gravity">1.0</output></span><input type="range" min="0" max="2" step="0.05" value="1" data-setting="gravity" /></label>
              <label><span>涡量约束 <output data-output="vorticity">0.10</output></span><input type="range" min="0" max="1" step="0.05" value="0.1" data-setting="vorticity" /></label>
              <div class="setting-row"><span>重力方向</span><div class="gravity-control"><button type="button" data-gravity="down" class="is-active">向下</button><button type="button" data-gravity="radial">中心</button><button type="button" data-gravity="off">关闭</button></div></div>
              <label class="toggle-row"><span>空气热对流</span><input type="checkbox" data-setting="airHeat" checked /><i></i></label>
            </section>

            <section class="inspector-section reaction-section">
              <header><span>反应记录</span><code>LIVE</code></header>
              <ol id="reaction-list"><li class="empty-event">暂无反应事件</li></ol>
            </section>
          </aside>
        </main>

        <section class="element-dock">
          <div class="dock-header">
            <div class="category-tabs" aria-label="元素类别">${categoryButtons}</div>
            <label class="element-search"><span aria-hidden="true">⌕</span><input id="element-search" type="search" placeholder="搜索中文名 / 符号 / 化学式" aria-label="搜索元素" /></label>
            <span class="element-count"><b>${ELEMENT_LIST.length}</b> 种物质</span>
          </div>
          <div id="element-grid" class="element-grid"></div>
        </section>
        <div id="toast" class="toast" role="status" aria-live="polite"></div>
      </div>`;
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("button");
      if (!target) return;
      if (target.dataset.element) this.selectElement(Number(target.dataset.element) as ElementId);
      if (target.dataset.tool) this.selectTool(target.dataset.tool as ToolId);
      if (target.dataset.view) this.setView(target.dataset.view as ViewMode);
      if (target.dataset.category) {
        this.activeCategory = target.dataset.category as ElementCategory;
        this.root.querySelectorAll<HTMLElement>("[data-category]").forEach((button) => button.classList.toggle("is-active", button === target));
        this.renderElementGrid();
      }
      if (target.dataset.gravity) {
        this.simulation.settings.gravityMode = target.dataset.gravity as "down" | "off" | "radial";
        this.root.querySelectorAll<HTMLElement>("[data-gravity]").forEach((button) => button.classList.toggle("is-active", button === target));
      }
      if (target.dataset.speed) {
        this.speed = Number(target.dataset.speed);
        this.root.querySelectorAll<HTMLElement>("[data-speed]").forEach((button) => button.classList.toggle("is-active", button === target));
      }
      if (target.dataset.action) this.handleAction(target.dataset.action);
    });

    this.root.querySelector<HTMLInputElement>("#brush-size")?.addEventListener("input", (event) => {
      this.brushRadius = Number((event.target as HTMLInputElement).value);
      const output = this.root.querySelector<HTMLElement>("#brush-output");
      if (output) output.textContent = `R ${String(this.brushRadius).padStart(2, "0")}`;
    });

    this.root.querySelector<HTMLInputElement>("#element-search")?.addEventListener("input", () => this.renderElementGrid());
    this.root.querySelector<HTMLSelectElement>("#preset-select")?.addEventListener("change", (event) => this.loadPreset((event.target as HTMLSelectElement).value as PresetId));

    this.root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.setting;
        if (!key) return;
        if (key === "airHeat") this.simulation.settings.airHeat = input.checked;
        else this.simulation.settings[key as "ambientTemp" | "ambientPressure" | "ambientVx" | "ambientVy" | "gravity" | "vorticity"] = Number(input.value);
        this.updateRangeOutputs();
      });
    });

    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (event.code === "Space" || event.key.toLowerCase() === "p") {
        event.preventDefault();
        this.paused = !this.paused;
        this.updateTransport();
      } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        this.undo();
      } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.redo();
      } else if (event.key === "[") {
        this.setBrushRadius(this.brushRadius - 1);
      } else if (event.key === "]") {
        this.setBrushRadius(this.brushRadius + 1);
      }
    });
  }

  private handleAction(action: string): void {
    switch (action) {
      case "pause":
        this.paused = !this.paused;
        this.updateTransport();
        break;
      case "step":
        this.simulation.step();
        this.renderer.render();
        break;
      case "undo": this.undo(); break;
      case "redo": this.redo(); break;
      case "clear":
        this.pushHistory();
        this.simulation.clear();
        this.showToast("实验场已清空");
        break;
      case "save": this.saveLocal(); break;
      case "load": this.loadLocal(); break;
      case "capture": this.renderer.exportPng(`物质实验场-${Date.now()}.png`); break;
      case "fullscreen":
        if (document.fullscreenElement) void document.exitFullscreen();
        else void this.root.requestFullscreen();
        break;
    }
  }

  private renderElementGrid(): void {
    const grid = this.root.querySelector<HTMLElement>("#element-grid");
    if (!grid) return;
    const query = this.root.querySelector<HTMLInputElement>("#element-search")?.value.trim().toLowerCase() ?? "";
    const source = ELEMENT_LIST.filter((element) => {
      if (query) return `${element.name} ${element.symbol} ${element.formula ?? ""} ${element.description}`.toLowerCase().includes(query);
      return element.category === this.activeCategory;
    });
    grid.innerHTML = source.map((element) => `
      <button class="element-button${this.selection.kind === "element" && this.selection.id === element.id ? " is-active" : ""}" type="button" data-element="${element.id}" style="--element-color:${element.color}" title="${element.description}">
        <i></i><span class="element-symbol">${element.symbol}</span><span class="element-name">${element.name}</span><small>${element.formula ?? element.state.toUpperCase()}</small>
      </button>`).join("") || `<div class="empty-elements">没有匹配的元素</div>`;
  }

  private updateNow(fps: number): void {
    const stats = this.simulation.getStats();
    this.setText("status-state", this.paused ? "暂停" : "运行");
    this.setText("status-fps", String(Math.round(fps)));
    this.setText("status-tick", stats.tick.toLocaleString("zh-CN"));
    this.setText("status-particles", stats.particles.toLocaleString("zh-CN"));
    this.setText("status-temp", format(stats.averageTemp));
    this.setText("status-pressure", format(stats.peakPressure));
    this.updateProbe();
    this.updateReactionList();
  }

  private updateProbe(): void {
    const element = getElement(this.probe.id);
    this.setText("probe-coord", `X${String(this.probe.x).padStart(3, "0")} Y${String(this.probe.y).padStart(3, "0")}`);
    this.setText("probe-name", element.name);
    this.setText("probe-code", this.elementCode(element.id));
    this.setText("probe-temp", `${format(this.probe.temp)} °C`);
    this.setText("probe-pressure", format(this.probe.pressure, 2));
    this.setText("probe-vx", format(this.probe.vx, 2));
    this.setText("probe-vy", format(this.probe.vy, 2));
    this.setText("probe-life", String(this.probe.life));
    this.setText("probe-charge", String(this.probe.charge));
    const swatch = this.root.querySelector<HTMLElement>("#probe-swatch");
    if (swatch) swatch.style.background = element.color;
  }

  private updateReactionList(): void {
    const list = this.root.querySelector<HTMLOListElement>("#reaction-list");
    if (!list) return;
    if (!this.simulation.events.length) {
      list.innerHTML = `<li class="empty-event">暂无反应事件</li>`;
      return;
    }
    list.innerHTML = this.simulation.events.slice(0, 7).map((event) => `<li data-kind="${event.kind}"><span>${event.label}</span><code>#${event.tick} · ${event.x},${event.y}</code></li>`).join("");
  }

  private updateElementDetail(id: number): void {
    const element = getElement(id);
    const target = this.root.querySelector<HTMLElement>("#element-detail");
    if (!target) return;
    target.innerHTML = `
      <header><span>当前物质</span><code>${element.symbol}</code></header>
      <div class="detail-title"><i style="background:${element.color}"></i><div><strong>${element.name}</strong><span>${this.elementCode(id)}</span></div></div>
      <p>${element.description}</p>
      <dl class="detail-stats"><div><dt>形态</dt><dd>${this.stateLabel(element.state)}</dd></div><div><dt>密度</dt><dd>${element.density.toLocaleString("zh-CN")}</dd></div><div><dt>导热</dt><dd>${format(element.conductivity, 3)}</dd></div><div><dt>耐酸</dt><dd>${Math.round(element.acidResistance * 100)}%</dd></div></dl>`;
  }

  private updateRangeOutputs(): void {
    const settings = this.simulation.settings;
    const values: Record<string, string> = {
      ambientTemp: `${format(settings.ambientTemp, 0)}°C`,
      ambientPressure: format(settings.ambientPressure),
      ambientVx: format(settings.ambientVx),
      ambientVy: format(settings.ambientVy),
      gravity: format(settings.gravity),
      vorticity: format(settings.vorticity, 2)
    };
    Object.entries(values).forEach(([key, value]) => {
      const output = this.root.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
      if (output) output.value = value;
    });
  }

  private updateTransport(): void {
    const icon = this.root.querySelector<HTMLElement>("#pause-icon");
    const button = this.root.querySelector<HTMLElement>("[data-action=" + '"pause"' + "]");
    if (icon) icon.textContent = this.paused ? "▶" : "Ⅱ";
    if (button) {
      button.dataset.tooltip = this.paused ? "继续模拟" : "暂停模拟";
      button.setAttribute("aria-label", this.paused ? "继续模拟" : "暂停模拟");
    }
  }

  private pushHistory(): void {
    this.undoStack.push(this.simulation.serialize());
    if (this.undoStack.length > 6) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      this.showToast("没有可撤销的操作");
      return;
    }
    this.redoStack.push(this.simulation.serialize());
    this.simulation.restore(snapshot);
    this.renderer.render();
    this.showToast("已撤销");
  }

  private redo(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      this.showToast("没有可重做的操作");
      return;
    }
    this.undoStack.push(this.simulation.serialize());
    this.simulation.restore(snapshot);
    this.renderer.render();
    this.showToast("已重做");
  }

  private saveLocal(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.simulation.serialize()));
      this.showToast("存档已写入本机");
    } catch {
      this.showToast("存档空间不足");
    }
  }

  private loadLocal(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.showToast("尚无本机存档");
        return;
      }
      this.pushHistory();
      this.simulation.restore(JSON.parse(raw) as SimulationSnapshot);
      this.showToast("本机存档已读取");
    } catch {
      this.showToast("存档损坏或版本不兼容");
    }
  }

  private showToast(message: string): void {
    const toast = this.root.querySelector<HTMLElement>("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1_800);
  }

  private setBrushRadius(value: number): void {
    this.brushRadius = Math.max(1, Math.min(16, value));
    const input = this.root.querySelector<HTMLInputElement>("#brush-size");
    if (input) input.value = String(this.brushRadius);
    const output = this.root.querySelector<HTMLElement>("#brush-output");
    if (output) output.textContent = `R ${String(this.brushRadius).padStart(2, "0")}`;
  }

  private elementCode(id: number): string {
    const element = getElement(id);
    return element.formula ? `${element.symbol} · ${element.formula}` : element.symbol;
  }

  private stateLabel(state: string): string {
    return ({ empty: "空", solid: "固体", powder: "粉末", liquid: "液体", gas: "气体", energy: "能量" } as Record<string, string>)[state] ?? state;
  }

  private setText(id: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (element) element.textContent = value;
  }
}
