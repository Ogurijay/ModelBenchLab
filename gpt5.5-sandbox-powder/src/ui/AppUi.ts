import {
  CATEGORY_LABELS,
  ELEMENT_ORDER,
  ELEMENTS,
  ElementId,
  TOOLS,
  elementLabel
} from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { BrushSelection, RenderMode, SimulationStats, ToolId } from "../simulation/types";
import type { ParticleRenderer } from "../render/ParticleRenderer";

const STORAGE_KEY = "gpt55-powdergame-save";

export class AppUi {
  readonly canvas: HTMLCanvasElement;
  private brush: BrushSelection = { type: "element", element: ElementId.Sand };
  private brushSize = 5;
  private speed = 1;
  private paused = false;
  private readonly paletteEl: HTMLElement;
  private readonly activeEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly brushSizeEl: HTMLInputElement;
  private readonly speedEl: HTMLInputElement;
  private readonly pauseButton: HTMLButtonElement;
  private renderer: ParticleRenderer | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly simulation: PowderSimulation
  ) {
    this.root.innerHTML = this.template();
    this.canvas = must<HTMLCanvasElement>(this.root.querySelector("#powder-canvas"));
    this.paletteEl = must<HTMLElement>(this.root.querySelector("#palette"));
    this.activeEl = must<HTMLElement>(this.root.querySelector("#active-brush"));
    this.statsEl = must<HTMLElement>(this.root.querySelector("#stats"));
    this.brushSizeEl = must<HTMLInputElement>(this.root.querySelector("#brush-size"));
    this.speedEl = must<HTMLInputElement>(this.root.querySelector("#sim-speed"));
    this.pauseButton = must<HTMLButtonElement>(this.root.querySelector("#pause"));
    this.bind();
    this.renderPalette();
    this.updateActiveBrush();
    this.updateAmbientLabels();
  }

  attachRenderer(renderer: ParticleRenderer): void {
    this.renderer = renderer;
  }

  getBrush(): BrushSelection {
    return this.brush;
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  getSpeed(): number {
    return this.speed;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseButton.textContent = paused ? "继续" : "暂停";
    this.pauseButton.dataset.active = paused ? "true" : "false";
  }

  updateStats(stats: SimulationStats, fps: number): void {
    this.statsEl.innerHTML = `
      <span>帧 ${stats.frame}</span>
      <span>粒子 ${stats.particles}</span>
      <span>均温 ${stats.avgTemp.toFixed(1)}C</span>
      <span>峰温 ${stats.maxTemp.toFixed(0)}C</span>
      <span>压强 ${stats.avgPressure.toFixed(2)}</span>
      <span>${fps.toFixed(0)} FPS</span>
    `;
  }

  private template(): string {
    return `
      <main class="shell">
        <header class="topbar">
          <div>
            <h1>粉末物理沙盒 100.0-CN</h1>
            <p>The Powder Toy 风格 · 中文元素表 · ${this.simulation.width}x${this.simulation.height} 元胞网格</p>
          </div>
          <div class="top-actions">
            <button id="pause" type="button">暂停</button>
            <button id="step" type="button">单步</button>
            <button id="clear" type="button">清空</button>
          </div>
        </header>

        <section class="workspace">
          <aside class="panel palette-panel">
            <div class="panel-title">
              <span>元素</span>
              <input id="search" type="search" placeholder="搜索" autocomplete="off" />
            </div>
            <div id="palette" class="palette"></div>
          </aside>

          <section class="stage-wrap">
            <div class="stage-toolbar">
              <div id="active-brush" class="active-brush"></div>
              <div class="mode-tabs" role="group" aria-label="视图模式">
                <button class="mode active" type="button" data-mode="normal">常规</button>
                <button class="mode" type="button" data-mode="thermal">热量</button>
                <button class="mode" type="button" data-mode="pressure">压力</button>
                <button class="mode" type="button" data-mode="electric">电路</button>
              </div>
            </div>
            <canvas id="powder-canvas" aria-label="粉末物理沙盒画布"></canvas>
            <div id="stats" class="stats"></div>
          </section>

          <aside class="panel controls-panel">
            <div class="panel-title">控制</div>
            <label class="control-row">
              <span>笔刷</span>
              <input id="brush-size" type="range" min="1" max="18" value="5" />
              <output id="brush-size-label">5</output>
            </label>
            <label class="control-row">
              <span>速度</span>
              <input id="sim-speed" type="range" min="0" max="5" value="1" />
              <output id="sim-speed-label">1x</output>
            </label>
            <div class="button-grid">
              <button id="save" type="button">保存</button>
              <button id="load" type="button">读取</button>
              <button id="heat-view" type="button">热图</button>
              <button id="pressure-view" type="button">压图</button>
            </div>
            <label class="select-row">
              <span>预设</span>
              <select id="preset">
                <option value="">选择场景</option>
                <option value="volcano">火山水池</option>
                <option value="reactor">水冷反应堆</option>
                <option value="circuit">导线点火</option>
                <option value="garden">种子生态</option>
                <option value="storm">氢氧风暴</option>
              </select>
            </label>

            <div class="panel-title small">环境</div>
            ${this.slider("gravity", "重力", "-1", "1.8", "0.1", "1")}
            ${this.slider("wind-x", "横风", "-2", "2", "0.1", "0")}
            ${this.slider("wind-y", "竖风", "-1.2", "1.2", "0.1", "0")}
            ${this.slider("ambient-pressure", "环境压", "-3", "3", "0.1", "0")}
            ${this.slider("vorticity", "涡量", "0", "1", "0.02", "0.12")}
            <label class="toggle-row">
              <span>热对流</span>
              <input id="air-heat" type="checkbox" checked />
            </label>
          </aside>
        </section>
      </main>
    `;
  }

  private slider(id: string, label: string, min: string, max: string, step: string, value: string): string {
    return `
      <label class="control-row compact">
        <span>${label}</span>
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
        <output id="${id}-label">${value}</output>
      </label>
    `;
  }

  private bind(): void {
    this.brushSizeEl.addEventListener("input", () => {
      this.brushSize = Number(this.brushSizeEl.value);
      must<HTMLOutputElement>(this.root.querySelector("#brush-size-label")).value = String(this.brushSize);
      this.updateActiveBrush();
    });

    this.speedEl.addEventListener("input", () => {
      this.speed = Number(this.speedEl.value);
      must<HTMLOutputElement>(this.root.querySelector("#sim-speed-label")).value = `${this.speed}x`;
    });

    this.pauseButton.addEventListener("click", () => this.setPaused(!this.paused));
    must<HTMLButtonElement>(this.root.querySelector("#step")).addEventListener("click", () => {
      this.simulation.step(1);
      this.renderer?.render();
    });
    must<HTMLButtonElement>(this.root.querySelector("#clear")).addEventListener("click", () => {
      this.simulation.clear();
      this.renderer?.render();
    });

    must<HTMLInputElement>(this.root.querySelector("#search")).addEventListener("input", (event) => {
      this.renderPalette((event.target as HTMLInputElement).value.trim().toLowerCase());
    });

    this.paletteEl.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-element],button[data-tool]");
      if (!button) {
        return;
      }
      const element = button.dataset.element;
      const tool = button.dataset.tool;
      if (element) {
        this.brush = { type: "element", element: Number(element) as ElementId };
      } else if (tool) {
        this.brush = { type: "tool", tool: tool as ToolId };
      }
      this.updateActiveBrush();
      this.renderPalette(must<HTMLInputElement>(this.root.querySelector("#search")).value.trim().toLowerCase());
    });

    this.root.querySelectorAll<HTMLButtonElement>(".mode").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as RenderMode;
        this.renderer?.setMode(mode);
        this.root.querySelectorAll<HTMLButtonElement>(".mode").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
      });
    });

    must<HTMLButtonElement>(this.root.querySelector("#heat-view")).addEventListener("click", () => this.setMode("thermal"));
    must<HTMLButtonElement>(this.root.querySelector("#pressure-view")).addEventListener("click", () => this.setMode("pressure"));

    must<HTMLButtonElement>(this.root.querySelector("#save")).addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, this.simulation.toJSON());
    });

    must<HTMLButtonElement>(this.root.querySelector("#load")).addEventListener("click", () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return;
      }
      this.simulation.loadJSON(saved);
      this.syncControlsFromSimulation();
      this.renderer?.render();
    });

    must<HTMLSelectElement>(this.root.querySelector("#preset")).addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value) {
        this.simulation.createPreset(value as "volcano" | "reactor" | "circuit" | "garden" | "storm");
        this.syncControlsFromSimulation();
        this.renderer?.render();
      }
    });

    this.bindAmbient("gravity", (value) => (this.simulation.ambient.gravity = value));
    this.bindAmbient("wind-x", (value) => (this.simulation.ambient.windX = value));
    this.bindAmbient("wind-y", (value) => (this.simulation.ambient.windY = value));
    this.bindAmbient("ambient-pressure", (value) => (this.simulation.ambient.ambientPressure = value));
    this.bindAmbient("vorticity", (value) => (this.simulation.ambient.vorticity = value));
    must<HTMLInputElement>(this.root.querySelector("#air-heat")).addEventListener("change", (event) => {
      this.simulation.ambient.airHeatConvection = (event.target as HTMLInputElement).checked;
    });

    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,select,textarea")) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        this.setPaused(!this.paused);
      }
      if (event.key === "[") {
        this.brushSize = Math.max(1, this.brushSize - 1);
        this.brushSizeEl.value = String(this.brushSize);
        must<HTMLOutputElement>(this.root.querySelector("#brush-size-label")).value = String(this.brushSize);
        this.updateActiveBrush();
      }
      if (event.key === "]") {
        this.brushSize = Math.min(18, this.brushSize + 1);
        this.brushSizeEl.value = String(this.brushSize);
        must<HTMLOutputElement>(this.root.querySelector("#brush-size-label")).value = String(this.brushSize);
        this.updateActiveBrush();
      }
      if (event.key.toLowerCase() === "h") {
        this.setMode("thermal");
      }
      if (event.key.toLowerCase() === "p") {
        this.setMode("pressure");
      }
      if (event.key.toLowerCase() === "e") {
        this.setMode("electric");
      }
      if (event.key.toLowerCase() === "n") {
        this.setMode("normal");
      }
    });
  }

  private setMode(mode: RenderMode): void {
    this.renderer?.setMode(mode);
    this.root.querySelectorAll<HTMLButtonElement>(".mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
  }

  private bindAmbient(id: string, apply: (value: number) => void): void {
    must<HTMLInputElement>(this.root.querySelector(`#${id}`)).addEventListener("input", (event) => {
      const value = Number((event.target as HTMLInputElement).value);
      apply(value);
      must<HTMLOutputElement>(this.root.querySelector(`#${id}-label`)).value = value.toFixed(id === "vorticity" ? 2 : 1);
    });
  }

  private syncControlsFromSimulation(): void {
    const pairs: Array<[string, number]> = [
      ["gravity", this.simulation.ambient.gravity],
      ["wind-x", this.simulation.ambient.windX],
      ["wind-y", this.simulation.ambient.windY],
      ["ambient-pressure", this.simulation.ambient.ambientPressure],
      ["vorticity", this.simulation.ambient.vorticity]
    ];
    for (const [id, value] of pairs) {
      must<HTMLInputElement>(this.root.querySelector(`#${id}`)).value = String(value);
      must<HTMLOutputElement>(this.root.querySelector(`#${id}-label`)).value =
        id === "vorticity" ? value.toFixed(2) : value.toFixed(1);
    }
    must<HTMLInputElement>(this.root.querySelector("#air-heat")).checked = this.simulation.ambient.airHeatConvection;
  }

  private updateAmbientLabels(): void {
    this.syncControlsFromSimulation();
  }

  private renderPalette(filter = ""): void {
    const byCategory = new Map<string, ElementId[]>();
    for (const id of ELEMENT_ORDER) {
      const element = ELEMENTS[id];
      const label = elementLabel(id).toLowerCase();
      const searchable = `${element.name} ${element.symbol} ${element.formula ?? ""} ${element.key}`.toLowerCase();
      if (filter && !label.includes(filter) && !searchable.includes(filter)) {
        continue;
      }
      const list = byCategory.get(element.category) ?? [];
      list.push(id);
      byCategory.set(element.category, list);
    }

    const sections: string[] = [];
    for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
      const items = byCategory.get(category);
      if (!items?.length) {
        continue;
      }
      sections.push(`<div class="palette-section"><h2>${label}</h2><div class="element-grid">`);
      for (const id of items) {
        const element = ELEMENTS[id];
        const active = this.brush.type === "element" && this.brush.element === id;
        sections.push(`
          <button class="element-button ${active ? "active" : ""}" type="button" data-element="${id}" title="${elementLabel(id)}">
            <span class="swatch" style="background:${element.color}"></span>
            <span class="symbol">${element.symbol}</span>
            <span class="name">${element.name}</span>
          </button>
        `);
      }
      sections.push("</div></div>");
    }

    sections.push(`<div class="palette-section"><h2>工具</h2><div class="element-grid">`);
    for (const tool of TOOLS) {
      const active = this.brush.type === "tool" && this.brush.tool === tool.id;
      sections.push(`
        <button class="element-button tool ${active ? "active" : ""}" type="button" data-tool="${tool.id}" title="${tool.name}(${tool.symbol}) · ${tool.description}">
          <span class="swatch tool-swatch"></span>
          <span class="symbol">${tool.symbol}</span>
          <span class="name">${tool.name}</span>
        </button>
      `);
    }
    sections.push("</div></div>");
    this.paletteEl.innerHTML = sections.join("");
  }

  private updateActiveBrush(): void {
    if (this.brush.type === "element") {
      const element = ELEMENTS[this.brush.element];
      this.activeEl.innerHTML = `
        <span class="active-dot" style="background:${element.color}"></span>
        <strong>${elementLabel(this.brush.element)}</strong>
        <span>笔刷 ${this.brushSize}</span>
      `;
    } else {
      const tool = TOOLS.find((item) => item.id === this.brush.tool);
      this.activeEl.innerHTML = `
        <span class="active-dot tool-dot"></span>
        <strong>${tool?.name ?? this.brush.tool}(${tool?.symbol ?? this.brush.tool})</strong>
        <span>笔刷 ${this.brushSize}</span>
      `;
    }
  }
}

const must = <T extends Element>(value: T | null): T => {
  if (!value) {
    throw new Error("UI 节点缺失");
  }
  return value;
};
