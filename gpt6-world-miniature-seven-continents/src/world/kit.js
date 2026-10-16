import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const materials = {};
export function material(color, options={}) {
  const key=JSON.stringify([color,options]);
  if(materials[key])return materials[key];
  const mat=new THREE.MeshStandardMaterial({color,roughness:.78,...options});
  const hsl={};mat.color.getHSL(hsl);
  // Fine world-space stone grain survives geometry batching without UV seams.
  if((options.metalness||0)<.3&&(hsl.h<.18||hsl.s<.13)&&hsl.l>.12&&hsl.l<.92) {
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 stonePosition; varying vec3 stoneNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 detailPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          detailPosition=instanceMatrix*detailPosition;
        #endif
        stonePosition=(modelMatrix*detailPosition).xyz;stoneNormal=normalize(mat3(modelMatrix)*normal);`);
      shader.fragmentShader='varying vec3 stonePosition; varying vec3 stoneNormal;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float grain=fract(sin(dot(floor(stonePosition*55.0),vec3(12.9898,78.233,39.425)))*43758.5453);
        float mottling=sin(stonePosition.x*2.3+sin(stonePosition.z*3.8))*cos(stonePosition.y*4.7)*0.012;
        diffuseColor.rgb*=0.975+grain*0.05+mottling;
        float row=floor(stonePosition.y*2.0),horizontal=min(fract(stonePosition.y*2.0),1.0-fract(stonePosition.y*2.0));
        float vertical=min(fract((stonePosition.x+stonePosition.z)*1.4+mod(row,2.0)*0.5),1.0-fract((stonePosition.x+stonePosition.z)*1.4+mod(row,2.0)*0.5));
        float joint=(1.0-smoothstep(0.005,0.018,min(horizontal,vertical)))*(1.0-smoothstep(0.4,0.75,abs(stoneNormal.y)));
        diffuseColor.rgb*=1.0-joint*0.085;`);
    };
    mat.customProgramCacheKey=()=>'miniature-stone-v1';
  }
  materials[key]=mat;return mat;
}
export function mesh(group,geometry,mat,x=0,y=0,z=0) {
  const m=new THREE.Mesh(geometry,typeof mat==='string'||typeof mat==='number'?material(mat):mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; group.add(m); return m;
}
export function box(g,w,h,d,mat,x=0,y=0,z=0) { return mesh(g,new THREE.BoxGeometry(w,h,d),mat,x,y,z); }
export function sphere(g,r,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1) { const m=mesh(g,new THREE.SphereGeometry(r,20,14),mat,x,y,z); m.scale.set(sx,sy,sz); return m; }
export function cylinder(g,rt,rb,h,mat,x=0,y=0,z=0,segments=16) { return mesh(g,new THREE.CylinderGeometry(rt,rb,h,segments),mat,x,y,z); }
export function cone(g,r,h,mat,x=0,y=0,z=0,segments=4) { return mesh(g,new THREE.ConeGeometry(r,h,segments),mat,x,y,z); }
export function beam(g,a,b,r,mat,segments=6) {
  const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const m=cylinder(g,r,r,v.length(),mat,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,segments);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()); return m;
}
export function batch(group) {
  group.updateMatrixWorld(true);
  const buckets=new Map();
  group.traverse(m=>{if(m.isMesh && !m.isInstancedMesh && !Array.isArray(m.material)) {
    const geo=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
    for(const k of Object.keys(geo.attributes)) if(!['position','normal',...(m.material.vertexColors?['color']:[])].includes(k)) geo.deleteAttribute(k);
    if(m.material.vertexColors&&!geo.attributes.color)geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*3).fill(1),3));
    if(!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(m.matrixWorld);
    if(!buckets.has(m.material)) buckets.set(m.material,[]);
    buckets.get(m.material).push(geo);
  }});
  const result=new THREE.Group(); result.name=group.name; result.userData={...group.userData};
  for(const [mat,geos] of buckets) { const geometry=mergeGeometries(geos,false); if(geometry) mesh(result,geometry,mat); geos.forEach(g=>g.dispose()); }
  return result;
}
export const kit={material,mesh,box,sphere,cylinder,cone,beam,batch};
