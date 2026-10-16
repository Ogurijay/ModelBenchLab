import * as THREE from 'three';

export function buildSky(scene,sun) {
  const uniforms={night:{value:0},sunDirection:{value:sun.position.clone().normalize()},
    zenith:{value:new THREE.Color('#95b8ce')},horizon:{value:new THREE.Color('#f4dcb6')}};
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,
    vertexShader:`varying vec3 worldPosition; void main(){worldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 worldPosition; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection; uniform float night;
      void main(){vec3 d=normalize(worldPosition-cameraPosition);float h=pow(clamp(d.y,0.0,1.0),0.65);vec3 sky=mix(horizon,zenith,h);
      float s=max(dot(d,sunDirection),0.0);sky+=vec3(1.0,0.72,0.39)*(pow(s,180.0)*0.08+smoothstep(0.9996,0.99985,s)*1.3)*(1.0-night);
      float stars=step(0.9993,fract(sin(dot(floor(d.xz*650.0/max(d.y,0.08)),vec2(12.9898,78.233)))*43758.5453));
      sky+=stars*night*smoothstep(0.03,0.5,d.y)*0.5;gl_FragColor=vec4(sky,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1900,24,16),material);sky.frustumCulled=false;scene.add(sky);
  return {setNight(value){uniforms.night.value=value?1:0;uniforms.zenith.value.set(value?'#102536':'#95b8ce');uniforms.horizon.value.set(value?'#34525a':'#f4dcb6');}};
}
