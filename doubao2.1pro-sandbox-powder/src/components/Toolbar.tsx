import { Play, Pause, Trash2, RotateCcw, Zap } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { elements } from '../simulation/elements';
import { clsx } from 'clsx';

export function Toolbar() {
  const {
    selectedElement,
    brushSize,
    setBrushSize,
    isPaused,
    togglePause,
    simulationSpeed,
    setSimulationSpeed,
    clear,
  } = useGameStore();

  const selectedEl = elements[selectedElement];

  return (
    <div className="h-12 bg-[#0d0d14] border-b border-[#1a1a2e] flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-[#ff6b35]" />
        <h1 className="text-lg font-bold text-white tracking-wide">
          粉末沙盒
        </h1>
        <span className="text-xs text-gray-600 ml-1">物理模拟实验室</span>
      </div>

      <div className="h-8 w-px bg-[#1a1a2e]" />

      <div className="flex items-center gap-2">
        <button
          onClick={togglePause}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all',
            isPaused
              ? 'bg-green-600 text-white hover:bg-green-500'
              : 'bg-[#1f1f2e] text-gray-300 hover:bg-[#2a2a3e]'
          )}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {isPaused ? '播放' : '暂停'}
        </button>

        <button
          onClick={clear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-[#1f1f2e] text-gray-300 hover:bg-red-600 hover:text-white transition-all"
        >
          <Trash2 className="w-4 h-4" />
          清空
        </button>
      </div>

      <div className="h-8 w-px bg-[#1a1a2e]" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">速度:</span>
        <div className="flex gap-1">
          {[1, 2, 4, 8].map((speed) => (
            <button
              key={speed}
              onClick={() => setSimulationSpeed(speed)}
              className={clsx(
                'px-2 py-1 text-xs rounded font-mono transition-all',
                simulationSpeed === speed
                  ? 'bg-[#ff6b35] text-white'
                  : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
              )}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <div className="h-8 w-px bg-[#1a1a2e]" />

      <div className="flex items-center gap-3 flex-1">
        <span className="text-xs text-gray-500">画笔:</span>
        <input
          type="range"
          min="1"
          max="15"
          value={brushSize}
          onChange={(e) => setBrushSize(parseInt(e.target.value))}
          className="w-32 h-1 bg-[#1f1f2e] rounded-full appearance-none cursor-pointer accent-[#ff6b35]"
        />
        <span className="text-xs text-gray-400 font-mono w-6">{brushSize}</span>
      </div>

      <div className="flex items-center gap-2 bg-[#15151f] px-3 py-1.5 rounded">
        <div
          className="w-6 h-6 rounded border border-white/20"
          style={{
            backgroundColor: selectedEl?.color,
            boxShadow: selectedEl?.flags & 128 ? `0 0 10px ${selectedEl.color}` : 'none',
          }}
        />
        <div>
          <div className="text-sm text-white font-medium">{selectedEl?.nameCn}</div>
          <div className="text-[10px] text-gray-500 font-mono">{selectedEl?.symbol}</div>
        </div>
      </div>
    </div>
  );
}
