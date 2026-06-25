export interface FpsCounter {
  update: (now: number) => number;
}

export function createFpsCounter(): FpsCounter {
  let lastWindow = performance.now();
  let frames = 0;
  let fps = 60;

  return {
    update: (now: number) => {
      frames += 1;
      const elapsed = now - lastWindow;
      if (elapsed >= 500) {
        fps = Math.round((frames * 1000) / elapsed);
        frames = 0;
        lastWindow = now;
      }
      return fps;
    },
  };
}
