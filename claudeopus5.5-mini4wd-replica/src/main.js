// 入口：?lab=<车型> 进入建模对照实验室，否则进入游戏。
const params = new URLSearchParams(location.search);
if (params.has('lab')) {
  import('./lab.js').then(m => m.startLab(params));
} else {
  import('./app.js').then(m => m.startApp(params)).catch(err => {
    document.getElementById('app').textContent = '加载失败：' + err.message;
    console.error(err);
  });
}
