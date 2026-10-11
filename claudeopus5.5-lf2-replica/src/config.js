// 全局常量。时间单位 TU = 1/30 秒(与 LF2 原版一致,所有 wait / 速度 / 重力都按 TU 计)。
export const W = 794;
export const H = 550;
export const HUD_H = 128;          // 顶部 8 格状态栏高度
export const TPS = 30;             // 逻辑帧率
export const GRAVITY = 1.7;        // 每 TU 竖直速度增量(LF2 原值)
export const MAX_HP = 500;
export const MAX_MP = 500;

// 角色基础运动参数(取 LF2 Template / Davis 头部原值,个别角色在 chars.js 覆盖)
export const BASE_STATS = {
  walking_frame_rate: 3,
  walking_speed: 5.0,
  walking_speedz: 2.5,
  running_frame_rate: 3,
  running_speed: 10.0,
  running_speedz: 1.6,
  heavy_walking_speed: 3.7,
  heavy_walking_speedz: 1.85,
  heavy_running_speed: 6.2,
  heavy_running_speedz: 1.0,
  jump_height: -16.3,
  jump_distance: 10.0,
  jump_distancez: 3.75,
  dash_height: -10.0,
  dash_distance: 18.0,
  dash_distancez: 5.0,
  rowing_height: -2.0,
  rowing_distance: 5.0,
};

// 队伍:0 = 独立(各自为战),1..4 = 队伍
export const TEAM_COLORS = ['#ffffff', '#4f8dff', '#3ee05a', '#ff4a4a', '#ffd23a'];
export const TEAM_NAMES = ['Independent', 'Team 1', 'Team 2', 'Team 3', 'Team 4'];

export const DIFFICULTIES = ['Easy', 'Normal', 'Difficult', 'CRAZY!'];

// 每名玩家 7 键:上 下 左 右 攻击 跳 防御
export const KEY_NAMES = ['up', 'down', 'left', 'right', 'attack', 'jump', 'defend'];
export const DEFAULT_KEYS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'KeyJ', jump: 'KeyK', defend: 'KeyL' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'Numpad1', jump: 'Numpad2', defend: 'Numpad3' },
  { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', attack: 'KeyZ', jump: 'KeyX', defend: 'KeyC' },
  { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', attack: 'Numpad7', jump: 'Numpad9', defend: 'NumpadAdd' },
];
// 原版 LF2 data/control.txt 默认键位(可在 Control Settings 一键套用)
export const LF2_KEYS = [
  { up: 'Numpad8', down: 'Numpad2', left: 'Numpad4', right: 'Numpad6', attack: 'Numpad5', jump: 'Numpad0', defend: 'NumpadAdd' },
  { up: 'KeyW', down: 'KeyX', left: 'KeyA', right: 'KeyD', attack: 'KeyS', jump: 'Tab', defend: 'Backquote' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'Enter', jump: 'ShiftRight', defend: 'ControlRight' },
  { up: 'KeyI', down: 'Comma', left: 'KeyJ', right: 'KeyL', attack: 'KeyK', jump: 'Space', defend: 'Period' },
];
