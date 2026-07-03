import { useEffect, useRef, useCallback } from 'react';
import { SimulationEngine } from '../simulation/engine';
import { CanvasRenderer } from '../render/renderer';
import { elements } from '../simulation/elements';
import { useGameStore } from '../store/gameStore';

type DrawMode = 'draw' | 'erase' | null;

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawModeRef = useRef<DrawMode>(null);
  
  const {
    selectedElement,
    brushSize,
    isPaused,
    simulationSpeed,
    gravity,
    showGlow,
    showGrid,
    setFps,
    setParticleCount,
    setMousePos,
    setDrawing,
    setLastPos,
    lastX,
    lastY,
  } = useGameStore();

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const engine = new SimulationEngine();
    const renderer = new CanvasRenderer(canvasRef.current, engine);
    
    engineRef.current = engine;
    rendererRef.current = renderer;
    
    renderer.onFpsUpdate = (fps) => setFps(fps);
    renderer.onParticleCount = (count) => setParticleCount(count);
    
    renderer.start();
    
    useGameStore.setState({ clear: () => engine.clear() });
    
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const cs = getComputedStyle(containerRef.current);
        const w = Math.floor(rect.width - parseInt(cs.paddingLeft) - parseInt(cs.paddingRight));
        const h = Math.floor(rect.height - parseInt(cs.paddingTop) - parseInt(cs.paddingBottom));
        renderer.resize(w, h);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const preventContext = (e: Event) => e.preventDefault();
    canvasRef.current.addEventListener('contextmenu', preventContext);
    
    return () => {
      renderer.stop();
      window.removeEventListener('resize', handleResize);
      canvasRef.current?.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.paused = isPaused;
    }
  }, [isPaused]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.speed = simulationSpeed;
    }
  }, [simulationSpeed]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setGravity(gravity.x, gravity.y);
    }
  }, [gravity.x, gravity.y]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowGlow(showGlow);
      rendererRef.current.setShowGrid(showGrid);
    }
  }, [showGlow, showGrid]);

  const getGridPos = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: -1, y: -1 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = Math.floor((clientX - rect.left) * scaleX / 4);
    const y = Math.floor((clientY - rect.top) * scaleY / 4);
    return { x, y };
  }, []);

  const handleDraw = useCallback((x: number, y: number, mode: DrawMode) => {
    if (!engineRef.current || mode === null) return;
    const el = mode === 'erase' ? elements.Eraser : elements[selectedElement];
    if (!el) return;
    
    if (lastX !== 0 || lastY !== 0) {
      engineRef.current.drawLine(lastX, lastY, x, y, brushSize, el.id);
    } else {
      engineRef.current.drawCircle(x, y, brushSize, el.id);
    }
    setLastPos(x, y);
  }, [selectedElement, brushSize, lastX, lastY]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = getGridPos(e.clientX, e.clientY);
    if (x < 0 || y < 0) return;
    
    if (e.button === 0) {
      drawModeRef.current = 'draw';
    } else if (e.button === 2) {
      drawModeRef.current = 'erase';
    } else {
      return;
    }
    
    setDrawing(true);
    setLastPos(0, 0);
    handleDraw(x, y, drawModeRef.current);
  }, [getGridPos, handleDraw]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getGridPos(e.clientX, e.clientY);
    if (x < 0 || y < 0) {
      setMousePos(0, 0, 295);
      return;
    }
    
    if (engineRef.current) {
      const temp = engineRef.current.getTemperatureAt(x, y);
      setMousePos(x, y, temp);
    }
    
    if (drawModeRef.current) {
      handleDraw(x, y, drawModeRef.current);
    } else {
      setLastPos(0, 0);
    }
  }, [getGridPos, handleDraw]);

  const handleMouseUp = useCallback(() => {
    drawModeRef.current = null;
    setDrawing(false);
    setLastPos(0, 0);
  }, []);

  const handleMouseLeave = useCallback(() => {
    drawModeRef.current = null;
    setDrawing(false);
    setLastPos(0, 0);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = getGridPos(touch.clientX, touch.clientY);
    if (x < 0 || y < 0) return;
    drawModeRef.current = 'draw';
    setDrawing(true);
    setLastPos(0, 0);
    handleDraw(x, y, 'draw');
  }, [getGridPos, handleDraw]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = getGridPos(touch.clientX, touch.clientY);
    if (x < 0 || y < 0) return;
    
    if (engineRef.current) {
      const temp = engineRef.current.getTemperatureAt(x, y);
      setMousePos(x, y, temp);
    }
    
    if (drawModeRef.current) {
      handleDraw(x, y, drawModeRef.current);
    }
  }, [getGridPos, handleDraw]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    drawModeRef.current = null;
    setDrawing(false);
    setLastPos(0, 0);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative bg-[#0a0a0f] overflow-hidden flex items-center justify-center p-1"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full cursor-crosshair shadow-2xl shadow-black/50"
        style={{ imageRendering: 'pixelated' }}
      />
      {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="text-5xl font-bold text-orange-400 tracking-[0.3em] animate-pulse drop-shadow-lg">
            已暂停
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 text-[10px] text-gray-600 font-mono pointer-events-none">
        左键绘制 · 右键擦除
      </div>
    </div>
  );
}
