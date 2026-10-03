import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const material = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const white = material('#dbdfd5'), red = material('#973c31'), dark = material('#172e34'), steel = material('#8d9b9b', 0.35, 0.65), glass = material('#255463', 0.18, 0.4), wood = material('#987a52'), orange = material('#da752d');
function add(group, geo, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); group.add(mesh); return mesh;
}
function box(group, w, h, d, mat, x = 0, y = 0, z = 0) { return add(group, new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
function rod(group, start, end, radius, mat) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), vector = b.clone().sub(a);
  const mesh = add(group, new THREE.CylinderGeometry(radius, radius, vector.length(), 8), mat);
  mesh.position.copy(a.add(b).multiplyScalar(0.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()); return mesh;
}
function mergeStatic(group) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    mesh.updateMatrix();
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix); geo.deleteAttribute('uv');
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geo); mesh.geometry.dispose(); group.remove(mesh);
  }
  for (const [mat, geos] of batches) {
    group.add(new THREE.Mesh(mergeGeometries(geos), mat)); geos.forEach(g => g.dispose());
  }
  return group;
}
function hullGeometry() {
  const stations = [[-4.6, 1.45], [-3.7, 1.9], [0, 1.85], [3.1, 1.3], [5.1, 0.025]];
  const vertices = [], indices = [];
  for (const [z, w] of stations) {
    vertices.push(-w, 0.85, z, w, 0.85, z, -w*0.73, -0.5, z, w*0.73, -0.5, z, 0, -1.15, z);
  }
  const quad = (a,b,c,d) => indices.push(a,b,c,a,c,d);
  for (let i = 0; i < stations.length-1; i++) {
    const a=i*5,b=a+5;
    quad(a,b,b+2,a+2); quad(a+1,a+3,b+3,b+1); quad(a+2,b+2,b+4,a+4); quad(a+3,a+4,b+4,b+3); quad(a,a+1,b+1,b);
  }
  quad(0,2,3,1); indices.push(2,4,3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
export function createVessel() {
  const g = new THREE.Group();
  add(g,hullGeometry(),red);
  box(g,3.6,0.2,7.4,wood,0,0.88,-0.5);
  box(g,3.0,0.24,3.4,white,0,1.06,-1.5);
  box(g,2.65,2.0,2.7,white,0,2.15,-1.4);
  box(g,2.88,0.16,3.0,dark,0,3.22,-1.4);
  box(g,2.1,0.87,0.035,glass,0,2.53,-0.035);
  for (const x of [-1.333,1.333]) {
    box(g,0.025,0.88,1.8,glass,x,2.52,-1.2);
    box(g,0.04,0.95,0.06,white,x,2.53,-1.25);
  }
  box(g,0.08,0.92,0.06,white,0,2.55,0.015);
  box(g,0.82,1.55,0.08,dark,0,1.94,-2.79);
  box(g,0.75,1.45,0.10,white,0,1.94,-2.86);
  box(g,0.08,0.10,0.05,steel,0.28,1.85,-2.93);
  for (const x of [-1.72,1.72]) {
    for (const z of [-3.7,-1.5,1.0,2.6]) rod(g,[x,0.9,z],[x,1.72,z],0.022,steel);
    rod(g,[x,1.72,-3.7],[x,1.72,2.6],0.026,steel);
    rod(g,[x,1.32,-3.7],[x,1.32,2.6],0.017,steel);
    rod(g,[x,1.72,2.6],[x*0.2,1.62,4.4],0.026,steel);
    for (const z of [-3,0.3,2.1]) {
      const tire=add(g,new THREE.TorusGeometry(0.32,0.12,8,20),dark,x*1.09,0.65,z); tire.rotation.y=Math.PI/2;
    }
  }
  rod(g,[0,3.3,-1.9],[0,6.2,-1.9],0.055,steel);
  rod(g,[-1.25,4.5,-1.9],[1.25,4.5,-1.9],0.042,steel);
  rod(g,[0,4.5,-1.9],[0,5.2,0.1],0.045,steel);
  rod(g,[0,6.2,-1.9],[-1.7,1.72,1.6],0.01,dark);
  rod(g,[0,6.2,-1.9],[1.7,1.72,1.6],0.01,dark);
  rod(g,[0,3.25,-0.6],[0,5.25,-0.6],0.014,white);
  add(g,new THREE.CylinderGeometry(0.16,0.16,0.3,12),orange,0,6.26,-1.9);
  box(g,0.9,0.55,0.85,wood,0.75,1.26,1.65);
  box(g,0.83,0.7,1.1,wood,-0.72,1.33,2.0);
  add(g,new THREE.CylinderGeometry(0.42,0.42,0.24,16),steel,0,1.3,3.8);
  const ring=add(g,new THREE.TorusGeometry(0.34,0.12,10,24),orange,1.35,2.0,-2.0);ring.rotation.y=Math.PI/2;
  return mergeStatic(g);
}
export function createBuoy() {
  const g=new THREE.Group();
  add(g,new THREE.CylinderGeometry(0.72,1.12,0.68,24),orange,0,0.12);
  add(g,new THREE.CylinderGeometry(1.1,1.1,0.18,24),dark,0,-0.15);
  add(g,new THREE.CylinderGeometry(0.45,0.66,0.52,16),orange,0,0.66);
  rod(g,[0,0.8,0],[0,3.5,0],0.065,white);
  for(const x of [-0.52,0.52]) {const panel=box(g,0.8,0.06,0.75,glass,x,1.58);panel.rotation.z=-x*0.55;}
  add(g,new THREE.CylinderGeometry(0.17,0.2,0.15,12),dark,0,3.08);
  const beacon=material('#e4be65');beacon.emissive=new THREE.Color('#e2aa42');beacon.emissiveIntensity=1.2;
  add(g,new THREE.SphereGeometry(0.14,12,8),beacon,0,3.3);
  g.userData.beacon=beacon;
  return mergeStatic(g);
}
export function createCrate() {
  const g=new THREE.Group();box(g,1.4,1.25,1.4,wood);
  for(const x of [-0.73,0.73]) for(const z of [-0.5,0.5]) box(g,0.08,1.38,0.12,dark,x,0,z);
  for(const z of [-0.73,0.73]) {box(g,1.45,0.10,0.08,dark,0,0.44,z);box(g,1.45,0.10,0.08,dark,0,-0.44,z);}
  return mergeStatic(g);
}
export function createRing() {
  const g=new THREE.Group();const ring=add(g,new THREE.TorusGeometry(0.7,0.22,12,40),orange);ring.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++){const band=add(g,new THREE.TorusGeometry(0.7,0.225,8,8,0.36),white);band.rotation.x=Math.PI/2;band.rotation.z=i*Math.PI/2;}
  return mergeStatic(g);
}
