// 车型登记表。每个车型一个文件（几何 + 涂装），META 合并原型档案与物理估计。
import cyclone from './cyclone.js';
import hurricane from './hurricane.js';
import tridagger from './tridagger.js';
import evolution from './evolution.js';
import cobra from './cobra.js';
import spider from './spider.js';
import gigant from './gigant.js';
import stinger from './stinger.js';
import { META } from './meta.js';

export const CARS = [cyclone, hurricane, tridagger, evolution, cobra, spider, gigant, stinger].map(c => Object.assign(c, META[c.id] || {}));
export const carById = id => CARS.find(c => c.id === id) || CARS[0];
