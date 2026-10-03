import GUI from 'lil-gui';

export function createGui(params, hooks) {
  const gui = new GUI({ title: '潮镜', width: 268 });
  gui.domElement.id = 'panel';

  const sea = gui.addFolder('海况');
  sea.add(params, 'windSpeed', 0.8, 24, 0.1).name('风速 m/s');
  sea.add(params, 'windDeg', 0, 360, 1).name('风向 °');
  sea.add(params, 'steepness', 0, 1, 0.01).name('尖浪');
  sea.add(params, 'swellHeight', 0, 2.4, 0.01).name('涌浪');
  sea.add(params, 'swellDeg', 0, 360, 1).name('涌向 °');
  sea.add(params, 'timeScale', 0, 3, 0.01).name('时间流速');

  const sky = gui.addFolder('天空');
  sky.add(params, 'hour', 0, 24, 0.01).name('时刻');
  sky.add(params, 'clouds', 0, 1, 0.01).name('云量');
  sky.add(params, 'exposure', 0.45, 1.7, 0.01).name('曝光').onChange((value) => hooks.exposure(value));

  const look = gui.addFolder('海面');
  look.add(params, 'foam', 0, 2, 0.01).name('泡沫');
  look.add(params, 'ripple', 0, 2, 0.01).name('涟漪');
  look.add(params, 'wireframe').name('线框');

  const play = gui.addFolder('交互');
  play.add(params, 'spawn', { 木箱: 'crate', 油桶: 'barrel', 航标: 'buoy' }).name('投放');
  play.add(params, 'follow').name('跟随渔船');
  play.add({ reset: () => hooks.reset() }, 'reset').name('重置镜头');

  if (window.matchMedia('(max-width: 800px)').matches) gui.close();
  return gui;
}

export function refreshGui(gui) {
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
}
