import { useGameStore } from '../store/gameStore';
import { Thermometer, MousePointer2, Gauge, Box } from 'lucide-react';

export function StatusBar() {
  const { fps, particleCount, mouseX, mouseY, mouseTemp, isPaused } = useGameStore();

  const tempC = mouseTemp - 273.15;
  const tempColor = tempC > 100 ? 'text-red-400' : tempC < 0 ? 'text-blue-400' : 'text-green-400';

  return (
    <div className="h-7 bg-[#0d0d14] border-t border-[#1a1a2e] flex items-center px-4 gap-6 text-xs font-mono">
      <div className="flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5 text-gray-500" />
        <span className={fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
          {fps} FPS
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Box className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-400">{particleCount.toLocaleString()} 粒子</span>
      </div>

      <div className="h-4 w-px bg-[#1a1a2e]" />

      <div className="flex items-center gap-1.5">
        <MousePointer2 className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-400">
          ({mouseX}, {mouseY})
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Thermometer className="w-3.5 h-3.5 text-gray-500" />
        <span className={tempColor}>
          {tempC.toFixed(1)}°C
        </span>
      </div>

      <div className="flex-1" />

      <div className={isPaused ? 'text-orange-400' : 'text-gray-600'}>
        {isPaused ? '[ 已暂停 ]' : '[ 运行中 ]'}
      </div>

      <div className="text-gray-600">
        粉末物理沙盒 v1.0
      </div>
    </div>
  );
}
