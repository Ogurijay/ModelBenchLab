// 由程序化贴图组装关卡材质表（键与 map.js 中使用的材质键一致）。

import * as THREE from 'three';

export function createMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.55, ...o });
  const tx = (k) => ({ map: T[k].map, normalMap: T[k].normalMap || null, roughnessMap: T[k].roughnessMap || null });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), vertexColors: true, toneMapped: true });

  const M = {
    ground: std({ ...tx('ground'), roughness: 1, metalness: 0, envMapIntensity: 0.3 }),
    pave: std({ ...tx('pave'), roughness: 1, metalness: 0, envMapIntensity: 0.4 }),
    asphalt: std({ ...tx('asphalt'), roughness: 1, metalness: 0, envMapIntensity: 0.35 }),
    concrete: std({ ...tx('concrete'), roughness: 1, metalness: 0 }),
    concreteDark: std({ ...tx('concrete'), color: 0x7c7f84, roughness: 1, metalness: 0 }),
    jersey: std({ ...tx('concrete'), color: 0xd8d2c4, roughness: 1, metalness: 0 }),
    planter: std({ ...tx('concrete'), color: 0x5e6266, roughness: 1 }),
    floor: std({ ...tx('floor'), roughness: 1, metalness: 0.05, envMapIntensity: 0.7 }),
    plateFloor: std({ ...tx('plateFloor'), roughness: 1, metalness: 0.65, envMapIntensity: 0.8 }),
    metal: std({ ...tx('metal'), roughness: 1, metalness: 0.55, envMapIntensity: 0.7 }),
    panel: std({ ...tx('panel'), roughness: 0.6, metalness: 0.1 }),
    metalDark: std({ ...tx('metalDark'), roughness: 1, metalness: 0.7, envMapIntensity: 0.8 }),
    plate: std({ ...tx('plate'), roughness: 1, metalness: 0.75, envMapIntensity: 0.8 }),
    hazard: std({ ...tx('hazard'), roughness: 1, metalness: 0.3 }),
    roof: std({ ...tx('roof'), roughness: 0.7, metalness: 0.5 }),
    cont_red: std({ ...tx('cont_red'), roughness: 1, metalness: 0.45 }),
    cont_blue: std({ ...tx('cont_blue'), roughness: 1, metalness: 0.45 }),
    cont_green: std({ ...tx('cont_green'), roughness: 1, metalness: 0.45 }),
    cont_orange: std({ ...tx('cont_orange'), roughness: 1, metalness: 0.45 }),
    crate: std({ ...tx('crate'), roughness: 0.8, metalness: 0.05 }),
    crateTan: std({ ...tx('crateTan'), roughness: 0.8, metalness: 0.05 }),
    cardboard: std({ map: T.cardboard.map, roughness: 0.95 }),
    rock: std({ ...tx('rock'), roughness: 1, metalness: 0, envMapIntensity: 0.3 }),
    sandbag: std({ ...tx('sandbag'), roughness: 1 }),
    tank: std({ ...tx('tank'), roughness: 1, metalness: 0.35 }),
    truck: std({ ...tx('paint'), color: 0x5a6340, roughness: 1, metalness: 0.4 }),
    forklift: std({ ...tx('paint'), color: 0xd69a1c, roughness: 1, metalness: 0.4 }),
    rail: std({ ...tx('paint'), color: 0xd0a12a, roughness: 1, metalness: 0.5 }),
    pipe: std({ ...tx('paint'), color: 0x8a9298, roughness: 1, metalness: 0.6 }),
    pipeYellow: std({ ...tx('paint'), color: 0xc49a34, roughness: 1, metalness: 0.5 }),
    generator: std({ ...tx('metal'), color: 0x8a9c84, roughness: 1, metalness: 0.5 }),
    gun: std({ color: 0x1e2124, roughness: 0.5, metalness: 0.7 }),
    rubber: std({ color: 0x161616, roughness: 0.95, metalness: 0 }),
    server: std({ map: T.server.map, emissiveMap: T.server.emissiveMap, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.45, metalness: 0.6 }),
    screen: std({ map: T.screen.map, emissiveMap: T.screen.map, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0x111111, roughness: 0.2, metalness: 0.2 }),
    screenBig: std({ map: T.screenBig.map, emissiveMap: T.screenBig.map, emissive: 0xffffff, emissiveIntensity: 1.8, color: 0x0a0a0a, roughness: 0.2 }),
    glass: std({ color: 0x2a3a48, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 }),
    fence: std({ map: T.fence.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.7 }),
    gate: std({ ...tx('gate'), roughness: 1, metalness: 0.5 }),
    shutter: std({ ...tx('shutter'), roughness: 1, metalness: 0.55 }),
    helipad: std({ map: T.helipad.map, roughness: 0.85, metalness: 0.1 }),
    locker: std({ ...tx('locker'), roughness: 1, metalness: 0.5 }),
    counter: std({ ...tx('wood'), color: 0x8a6a50, roughness: 1 }),
    desk: std({ ...tx('wood'), color: 0xc8c4bc, roughness: 1 }),
    sofa: std({ ...tx('fabric'), color: 0x55606c, roughness: 1 }),
    glowCyan: glow(0.5, 2.6, 3.4),
    glowWarm: glow(3.4, 2.5, 1.5),
    glowCool: glow(2.6, 2.9, 3.3),
    glowRed: glow(4.0, 0.35, 0.25),
    glowGreen: glow(0.5, 3.4, 1.0),
    sign_logo: std({ map: T.sign_logo.map, transparent: true, alphaTest: 0.1, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  for (const k of ['sign_warning', 'sign_armory', 'sign_warehouse', 'sign_control', 'sign_reactor']) {
    M[k] = std({ map: T[k].map, roughness: 0.55, metalness: 0.3, emissiveMap: T[k].map, emissive: 0x444444, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  return M;
}
