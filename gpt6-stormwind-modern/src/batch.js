import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function batchWorld(root){
 root.updateMatrixWorld(true);const batches=new Map(),remove=[];let originals=0;
 root.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.userData.dynamic||o.userData.water)return;
  let ancestor=o.parent;while(ancestor&&ancestor!==root){if(ancestor.userData.dynamic)return;ancestor=ancestor.parent;}
  const pos=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);const key=`${o.material.uuid}:${Math.floor(pos.x/80)}:${Math.floor(pos.z/80)}`;
  const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());g.applyMatrix4(o.matrixWorld);for(const n of Object.keys(g.attributes))if(!['position','normal','uv'].includes(n))g.deleteAttribute(n);
  if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});batches.get(key).geometries.push(g);remove.push(o);originals++;
 });
 const out=new THREE.Group();out.name='Batched city';for(const {material,geometries} of batches.values()){const geo=mergeGeometries(geometries,false);const m=new THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;out.add(m);for(const g of geometries)g.dispose();}
 // Detached original meshes remain available as exact, immutable navigation surfaces.
 for(const m of remove)m.removeFromParent();root.add(out);return {originals,batches:out.children.length};
}
