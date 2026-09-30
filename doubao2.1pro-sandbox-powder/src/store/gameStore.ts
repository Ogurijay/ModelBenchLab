import { create } from 'zustand';
import { elements } from '../simulation/elements';
import { Category } from '../simulation/constants';

export type BrushShape = 'circle' | 'square';

interface GameState {
  selectedElement: keyof typeof elements;
  selectedCategory: Category;
  brushSize: number;
  brushShape: BrushShape;
  isPaused: boolean;
  simulationSpeed: number;
  gravity: { x: number; y: number };
  showGlow: boolean;
  showGrid: boolean;
  fps: number;
  particleCount: number;
  mouseX: number;
  mouseY: number;
  mouseTemp: number;
  isDrawing: boolean;
  lastX: number;
  lastY: number;
  setSelectedElement: (element: keyof typeof elements) => void;
  setSelectedCategory: (category: Category) => void;
  setBrushSize: (size: number) => void;
  setBrushShape: (shape: BrushShape) => void;
  togglePause: () => void;
  setSimulationSpeed: (speed: number) => void;
  setGravity: (x: number, y: number) => void;
  setShowGlow: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setFps: (fps: number) => void;
  setParticleCount: (count: number) => void;
  setMousePos: (x: number, y: number, temp: number) => void;
  setDrawing: (drawing: boolean) => void;
  setLastPos: (x: number, y: number) => void;
  clear: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  selectedElement: 'Sand',
  selectedCategory: Category.POWDER,
  brushSize: 3,
  brushShape: 'circle',
  isPaused: false,
  simulationSpeed: 1,
  gravity: { x: 0, y: 1 },
  showGlow: true,
  showGrid: false,
  fps: 0,
  particleCount: 0,
  mouseX: 0,
  mouseY: 0,
  mouseTemp: 295,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  
  setSelectedElement: (element) => set({ selectedElement: element }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(20, size)) }),
  setBrushShape: (shape) => set({ brushShape: shape }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setSimulationSpeed: (speed) => set({ simulationSpeed: Math.max(1, Math.min(8, speed)) }),
  setGravity: (x, y) => set({ gravity: { x, y } }),
  setShowGlow: (show) => set({ showGlow: show }),
  setShowGrid: (show) => set({ showGrid: show }),
  setFps: (fps) => set({ fps }),
  setParticleCount: (count) => set({ particleCount: count }),
  setMousePos: (x, y, temp) => set({ mouseX: x, mouseY: y, mouseTemp: temp }),
  setDrawing: (drawing) => set({ isDrawing: drawing }),
  setLastPos: (x, y) => set({ lastX: x, lastY: y }),
  clear: () => {},
}));
