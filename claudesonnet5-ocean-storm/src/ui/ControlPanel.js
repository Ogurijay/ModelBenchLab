import GUI from "lil-gui";

export class ControlPanel {
  constructor({
    onAutoMode,
    onManualOverride,
    onTimeScale,
    onDroneSpeed,
    onSpawnStorm,
    onClearSkies,
    onTriggerLightning,
    onAudioToggle,
  }) {
    this.params = {
      autoWeather: true,
      manualControl: false,
      manualIntensity: 0.6,
      timeScale: 1,
      droneSpeed: 6,
      audioEnabled: false,
      spawnStorm: () => onSpawnStorm(),
      clearSkies: () => onClearSkies(),
      triggerLightning: () => onTriggerLightning(),
    };

    const gui = new GUI({ title: "台风海洋控制台" });
    this.gui = gui;

    const weatherFolder = gui.addFolder("天气系统 · 移动台风");
    weatherFolder
      .add(this.params, "autoWeather")
      .name("自动生成台风")
      .onChange((v) => onAutoMode(v));
    weatherFolder
      .add(this.params, "manualControl")
      .name("手动接管强度")
      .onChange(() => this._applyManual(onManualOverride));
    weatherFolder
      .add(this.params, "manualIntensity", 0, 1, 0.01)
      .name("手动台风强度")
      .onChange(() => this._applyManual(onManualOverride));
    weatherFolder.add(this.params, "spawnStorm").name("🌀 就近生成台风");
    weatherFolder.add(this.params, "clearSkies").name("☀ 清空天空");
    weatherFolder.add(this.params, "triggerLightning").name("⚡ 触发闪电");
    weatherFolder.open();

    const timeFolder = gui.addFolder("时间与镜头");
    timeFolder
      .add(this.params, "timeScale", 0.1, 10, 0.1)
      .name("天气时间倍速")
      .onChange((v) => onTimeScale(v));
    timeFolder
      .add(this.params, "droneSpeed", 0, 24, 0.5)
      .name("巡航速度 (m/s)")
      .onChange((v) => onDroneSpeed(v));

    const audioFolder = gui.addFolder("音频");
    this.audioController = audioFolder
      .add(this.params, "audioEnabled")
      .name("环境音效（风/雨/雷）")
      .onChange((v) => onAudioToggle(v));
  }

  _applyManual(onManualOverride) {
    onManualOverride(this.params.manualControl ? this.params.manualIntensity : null);
  }

  setAudioState(v) {
    this.params.audioEnabled = v;
    this.audioController.updateDisplay();
  }
}
