import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HueSaturationShader } from 'three/addons/shaders/HueSaturationShader.js';
export function makePost(renderer,scene,camera){
 const size=new THREE.Vector2();renderer.getSize(size);
 const target=new THREE.WebGLRenderTarget(size.x*renderer.getPixelRatio(),size.y*renderer.getPixelRatio(),{type:THREE.HalfFloatType,samples:4});
 renderer.info.autoReset=false;const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
 const ao=new GTAOPass(scene,camera,size.x,size.y,undefined,{radius:2.4,thickness:1.2,distanceExponent:1.6,scale:.5,samples:16},{radius:7,rings:3,samples:20});ao.blendIntensity=.7;composer.addPass(ao);
 const color=new ShaderPass(HueSaturationShader);color.uniforms.saturation.value=.13;composer.addPass(color);composer.addPass(new OutputPass());
 return {render(){renderer.info.reset();composer.render();},resize(w,h){composer.setSize(w,h);},setAO(on){ao.enabled=on;},ao};
}

