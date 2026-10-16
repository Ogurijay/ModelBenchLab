import rooftop from './rooftop.js';
import trawler from './trawler.js';
import icefloe from './icefloe.js';
import windfactory from './windfactory.js';
import bridge from './bridge.js';

export const MAPS = [rooftop, trawler, icefloe, windfactory, bridge];
export const mapById = Object.fromEntries(MAPS.map((m) => [m.id, m]));
