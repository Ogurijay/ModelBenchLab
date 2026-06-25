// Canvas 小地图：静态赛道轮廓 + 实时车辆圆点（玩家高亮）。

export function createMinimap(container, track) {
  const size = 150;
  const canvas = document.createElement('canvas');
  canvas.className = 'minimap';
  canvas.width = size;
  canvas.height = size;
  // 内联尺寸：styles.css 里 `#app canvas` 的全屏规则优先级更高，必须在这里覆盖。
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // 世界坐标 → 画布坐标的等比映射
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const pad = 12;
  const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxZ - minZ));
  const toCanvas = (x, z) => [
    pad + (x - minX) * scale,
    size - pad - (z - minZ) * scale,
  ];

  return {
    draw(racers) {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(10, 20, 30, 0.55)';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, 10);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      track.points.forEach((p, i) => {
        const [cx, cy] = toCanvas(p.x, p.z);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();

      // 起点标记
      const [sx, sy] = toCanvas(track.points[0].x, track.points[0].z);
      ctx.fillStyle = '#ffd24d';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);

      for (const racer of racers) {
        const [cx, cy] = toCanvas(racer.kart.x, racer.kart.z);
        ctx.beginPath();
        ctx.arc(cx, cy, racer.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = racer.cssColor;
        ctx.fill();
        if (racer.isPlayer) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    },
  };
}
