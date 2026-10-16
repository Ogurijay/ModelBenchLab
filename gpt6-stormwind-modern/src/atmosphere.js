import * as THREE from 'three';
import { makeSky } from './sky.js';
export function addAtmosphere(renderer,scene,materials){
 const envTexture=makeSky();const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(envTexture);scene.environment=env.texture;scene.environmentIntensity=.25;pmrem.dispose();scene.background=envTexture;scene.backgroundIntensity=.9;
 let seed=519;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const waves=Array.from({length:24},(_,i)=>({x:(1+Math.floor(rand()*(i<8?5:28)))*(rand()>.5?1:-1),y:1+Math.floor(rand()*(i<8?5:28)),phase:rand()*Math.PI*2,weight:i<8?.09:.018}));
 const n=document.createElement('canvas');n.width=n.height=256;const b=n.getContext('2d'),data=b.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const u=x/256*Math.PI*2,v=y/256*Math.PI*2;let dx=0,dy=0;for(const w of waves){const v2=Math.cos(u*w.x+v*w.y+w.phase)*w.weight/Math.hypot(w.x,w.y);dx+=v2*w.x;dy+=v2*w.y;}const norm=new THREE.Vector3(-dx,-dy,1).normalize(),i=(y*256+x)*4;data.data[i]=(norm.x*.5+.5)*255;data.data[i+1]=(norm.y*.5+.5)*255;data.data[i+2]=norm.z*255;data.data[i+3]=255;}b.putImageData(data,0,0);
 const normal=new THREE.CanvasTexture(n);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.anisotropy=4;
 for(const name of ['water','sea']){const m=materials[name];m.normalMap=normal;m.normalScale.set(.38,.38);m.roughness=.19;m.metalness=.5;m.envMapIntensity=1.2;m.color.set(name==='water'?'#3c9ca3':'#418c9f');m.needsUpdate=true;}
 materials.paving.bumpMap=materials.paving.map;materials.paving.bumpScale=.025;materials.paving.needsUpdate=true;
 return {update(t){normal.offset.set(t*.009,t*.005);},texture:normal,sky:envTexture};
}



