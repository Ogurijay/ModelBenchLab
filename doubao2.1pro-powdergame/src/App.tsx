import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { ElementPanel } from './components/ElementPanel';
import { GameCanvas } from './components/GameCanvas';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import { useGameStore } from './store/gameStore';

export default function App() {
  const {
    togglePause,
    setBrushSize,
    clear,
    brushSize,
  } = useGameStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePause();
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          clear();
          break;
        case 'Digit1':
          setBrushSize(1);
          break;
        case 'Digit2':
          setBrushSize(2);
          break;
        case 'Digit3':
          setBrushSize(3);
          break;
        case 'Digit4':
          setBrushSize(5);
          break;
        case 'Digit5':
          setBrushSize(7);
          break;
        case 'Digit6':
          setBrushSize(10);
          break;
        case 'Digit7':
          setBrushSize(12);
          break;
        case 'Digit8':
          setBrushSize(15);
          break;
        case 'BracketLeft':
          e.preventDefault();
          setBrushSize(Math.max(1, brushSize - 1));
          break;
        case 'BracketRight':
          e.preventDefault();
          setBrushSize(Math.min(20, brushSize + 1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause, setBrushSize, clear, brushSize]);

  return (
    <div className="w-screen h-screen bg-[#0a0a0f] flex flex-col overflow-hidden select-none">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <ElementPanel />
        <GameCanvas />
        <ControlPanel />
      </div>
      <StatusBar />
    </div>
  );
}
