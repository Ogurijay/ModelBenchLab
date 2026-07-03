import { elements } from '../simulation/elements';
import { Category, FLAGS } from '../simulation/constants';
import { useGameStore } from '../store/gameStore';
import { clsx } from 'clsx';

const categories = [
  { id: Category.POWDER, label: '粉末', icon: '⏣' },
  { id: Category.LIQUID, label: '液体', icon: '💧' },
  { id: Category.GAS, label: '气体', icon: '☁' },
  { id: Category.SOLID, label: '固体', icon: '▣' },
  { id: Category.ENERGY, label: '能源', icon: '⚡' },
  { id: Category.SPECIAL, label: '特殊', icon: '✦' },
];

export function ElementPanel() {
  const { selectedElement, selectedCategory, setSelectedElement, setSelectedCategory } = useGameStore();
  
  const elementsInCategory = Object.values(elements).filter(
    (el) => el.category === selectedCategory && el.id !== 0
  );

  return (
    <div className="w-56 bg-[#0d0d14] border-r border-[#1a1a2e] flex flex-col">
      <div className="p-2 border-b border-[#1a1a2e]">
        <h2 className="text-sm font-bold text-gray-400 text-center mb-2 tracking-wider">元素选择</h2>
        <div className="grid grid-cols-3 gap-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={clsx(
                'px-1 py-1.5 text-xs rounded transition-all duration-150',
                selectedCategory === cat.id
                  ? 'bg-[#ff6b35] text-white shadow-lg shadow-orange-500/30'
                  : 'bg-[#15151f] text-gray-400 hover:bg-[#1f1f2e] hover:text-gray-200'
              )}
            >
              <span className="block text-sm">{cat.icon}</span>
              <span className="text-[10px]">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-track-[#0d0d14] scrollbar-thumb-[#1f1f2e]">
        <div className="grid grid-cols-2 gap-1.5">
          {elementsInCategory.map((el) => (
            <button
              key={el.name}
              onClick={() => setSelectedElement(el.name as keyof typeof elements)}
              className={clsx(
                'p-2 rounded text-left transition-all duration-100 relative overflow-hidden group',
                selectedElement === el.name
                  ? 'ring-2 ring-[#ff6b35] bg-[#1a1520] shadow-lg'
                  : 'bg-[#15151f] hover:bg-[#1f1f2e]'
              )}
              title={el.description}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className={clsx(
                    'w-5 h-5 rounded-sm flex-shrink-0 border border-white/10',
                    el.flags & FLAGS.GLOWING ? 'animate-pulse' : ''
                  )}
                  style={{
                    backgroundColor: el.color,
                    boxShadow: el.flags & FLAGS.GLOWING ? `0 0 8px ${el.color}` : 'none',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-200 font-medium truncate leading-tight">
                    {el.nameCn}
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono tracking-wide">
                    {el.symbol}
                  </div>
                </div>
              </div>
              {selectedElement === el.name && (
                <div className="absolute top-0 right-0 w-0 h-0 border-t-[10px] border-l-[10px] border-t-[#ff6b35] border-l-transparent" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
