import { ChevronDown, ChevronUp, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eye, EyeOff, Grid3X3 } from 'lucide-react';
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { clsx } from 'clsx';

interface PanelSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function PanelSection({ title, defaultOpen = true, children }: PanelSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border-b border-[#1a1a2e]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#15151f] transition-colors"
      >
        {title}
        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function ControlPanel() {
  const {
    gravity,
    setGravity,
    showGlow,
    setShowGlow,
    showGrid,
    setShowGrid,
  } = useGameStore();

  return (
    <div className="w-52 bg-[#0d0d14] border-l border-[#1a1a2e] flex flex-col overflow-y-auto">
      <PanelSection title="重力方向">
        <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
          <div />
          <button
            onClick={() => setGravity(0, -1)}
            className={clsx(
              'p-2 rounded flex items-center justify-center transition-all',
              gravity.y === -1 && gravity.x === 0
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
            )}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <div />
          <button
            onClick={() => setGravity(-1, 0)}
            className={clsx(
              'p-2 rounded flex items-center justify-center transition-all',
              gravity.x === -1 && gravity.y === 0
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setGravity(0, 1)}
            className={clsx(
              'p-2 rounded flex items-center justify-center transition-all',
              gravity.y === 1 && gravity.x === 0
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
            )}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            onClick={() => setGravity(1, 0)}
            className={clsx(
              'p-2 rounded flex items-center justify-center transition-all',
              gravity.x === 1 && gravity.y === 0
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
            )}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div />
          <button
            onClick={() => setGravity(0, 0)}
            className={clsx(
              'col-span-1 p-1.5 rounded text-[10px] font-medium transition-all',
              gravity.x === 0 && gravity.y === 0
                ? 'bg-[#ff6b35] text-white'
                : 'bg-[#1f1f2e] text-gray-400 hover:bg-[#2a2a3e]'
            )}
          >
            无重力
          </button>
          <div />
        </div>
      </PanelSection>

      <PanelSection title="显示选项">
        <div className="space-y-2">
          <button
            onClick={() => setShowGlow(!showGlow)}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all',
              showGlow ? 'bg-[#1a1520] text-[#ff6b35]' : 'bg-[#1f1f2e] text-gray-400'
            )}
          >
            {showGlow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            发光效果
          </button>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all',
              showGrid ? 'bg-[#1a1520] text-[#ff6b35]' : 'bg-[#1f1f2e] text-gray-400'
            )}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            显示网格
          </button>
        </div>
      </PanelSection>

      <PanelSection title="快捷键" defaultOpen={false}>
        <div className="space-y-1 text-[10px] text-gray-500 font-mono">
          <div className="flex justify-between">
            <span>空格</span>
            <span className="text-gray-400">暂停/播放</span>
          </div>
          <div className="flex justify-between">
            <span>1-9</span>
            <span className="text-gray-400">切换画笔大小</span>
          </div>
          <div className="flex justify-between">
            <span>Del</span>
            <span className="text-gray-400">清空画布</span>
          </div>
          <div className="flex justify-between">
            <span>鼠标左键</span>
            <span className="text-gray-400">绘制元素</span>
          </div>
          <div className="flex justify-between">
            <span>鼠标右键</span>
            <span className="text-gray-400">擦除元素</span>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="操作提示" defaultOpen={false}>
        <div className="space-y-2 text-[10px] text-gray-500 leading-relaxed">
          <p>• 选择左侧元素，在画布上点击或拖动绘制</p>
          <p>• 火会点燃可燃物并产生烟</p>
          <p>• 水可以灭火，遇热变成蒸汽</p>
          <p>• 酸会腐蚀大多数物质</p>
          <p>• 岩浆遇水会变成石头</p>
          <p>• 金属和水可以导电</p>
          <p>• 植物遇水会生长</p>
          <p>• 克隆器会复制接触的物质</p>
          <p>• 虚空会吞噬一切物质</p>
        </div>
      </PanelSection>
    </div>
  );
}
