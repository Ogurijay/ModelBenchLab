export const atmosphere = /* glsl */`
uniform vec3 uSun;
uniform float uCloud;
uniform float uTime;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
float fbm(vec2 p) {
  float n = 0.5*noise(p); p = mat2(0.8,-0.6,0.6,0.8)*p*2.03;
  n += 0.25*noise(p); p = mat2(0.8,-0.6,0.6,0.8)*p*2.07;
  n += 0.125*noise(p); p = mat2(0.8,-0.6,0.6,0.8)*p*2.01;
  return n + 0.0625*noise(p);
}
vec3 sunlight() { return mix(vec3(1.0,0.57,0.27),vec3(1.0,0.94,0.82),smoothstep(0.03,0.44,uSun.y)); }
vec3 sky(vec3 d, float detail) {
  float y = max(d.y,0.0), sd = max(dot(d,uSun),0.0);
  float sunset = 1.0-smoothstep(0.04,0.35,uSun.y);
  vec3 zenith = mix(vec3(0.047,0.17,0.32),vec3(0.08,0.14,0.24),sunset);
  vec3 horizon = mix(vec3(0.56,0.72,0.77),vec3(0.76,0.46,0.24),sunset*(0.4+0.6*pow(sd,2.0)));
  vec3 color = mix(horizon,zenith,pow(y,0.42));
  color += vec3(0.26,0.26,0.21)*pow(sd,9.0)*(1.0-y)*(1.0-uCloud);
  color = mix(color, mix(vec3(0.22,0.28,0.32),vec3(0.075,0.11,0.15),sqrt(y)),uCloud*0.87);
  vec2 p = d.xz/(y+0.11)*2.4 + vec2(uTime*0.005,uTime*0.001);
  float cloud = fbm(p+fbm(p*0.55)*0.9);
  float density = smoothstep(0.67-uCloud*0.31,0.80-uCloud*0.32,cloud);
  float shade = fbm(p+vec2(-0.06,0.05));
  vec3 cc = mix(vec3(0.79,0.84,0.84),vec3(0.2,0.25,0.29),uCloud*0.88);
  cc = mix(cc*0.65,cc*1.12,smoothstep(0.32,0.66,shade));
  cc += sunlight()*pow(sd,12.0)*sunset*0.2;
  color = mix(color,cc,density*smoothstep(0.025,0.18,y)*detail);
  float disk = smoothstep(0.99970,0.99990,sd);
  color += sunlight()*(pow(sd,80.0)*0.32+pow(sd,500.0)*0.6+disk*7.0)*(1.0-uCloud*0.97);
  return max(color,vec3(0.0));
}
`;
export const waterVertex = /* glsl */`
uniform float uTime;
uniform float uChop;
uniform vec2 uCenter;
uniform vec4 uWaves[24];
uniform vec2 uPhase[24];
varying vec3 vWorld;
varying vec2 vBase;
varying vec3 vNormal;
varying float vCompression;
void main() {
  vec2 base = position.xz+uCenter;
  vec3 p = vec3(base.x,0.0,base.y), t = vec3(1,0,0), b = vec3(0,0,1);
  float dist = length(position.xz);
  for (int i=0;i<24;i++) {
    vec4 w = uWaves[i];
    float phase = w.z*dot(w.xy,base)-uPhase[i].x*uTime+uPhase[i].y;
    float a = w.w*(1.0-smoothstep(50.0,260.0,dist*w.z));
    float s=sin(phase), c=cos(phase), q=a*uChop;
    p.xz += q*w.xy*c; p.y += a*s;
    t += vec3(-q*w.z*w.x*w.x*s,a*w.z*w.x*c,-q*w.z*w.x*w.y*s);
    b += vec3(-q*w.z*w.x*w.y*s,a*w.z*w.y*c,-q*w.z*w.y*w.y*s);
  }
  vNormal = normalize(cross(b,t)); vWorld=p; vBase=base;
  vCompression = 1.0-(t.x*b.z-t.z*b.x);
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
}
`;
export const waterFragment = /* glsl */`
uniform float uWind;
uniform float uHeight;
uniform vec4 uBoat;
uniform float uObjects;
varying vec3 vWorld;
varying vec2 vBase;
varying vec3 vNormal;
varying float vCompression;
${atmosphere}
void main() {
  vec3 v=normalize(cameraPosition-vWorld);
  float distanceToEye=length(cameraPosition-vWorld);
  float footprint=max(length(dFdx(vBase)),length(dFdy(vBase)));
  vec2 ripple=vec2(0.0);
  float frequency=1.75, amp=0.047+uWind*0.0020;
  for(int i=0;i<7;i++) {
    float fi=float(i), a=fi*2.399+0.4;
    vec2 d=vec2(cos(a),sin(a));
    float phase=dot(vBase,d)*frequency-uTime*sqrt(9.81*frequency);
    float weight=1.0-smoothstep(0.4,2.5,frequency*footprint);
    ripple+=d*cos(phase+sin(phase*0.29+fi)*0.85)*amp*weight;
    amp*=0.68; frequency*=1.9;
  }
  vec2 boatDelta=vWorld.xz-uBoat.xy;
  vec2 boatDir=vec2(sin(uBoat.z),cos(uBoat.z));
  float back=-dot(boatDelta,boatDir), side=abs(dot(boatDelta,vec2(boatDir.y,-boatDir.x)));
  float wake=smoothstep(0.0,4.0,back)*(1.0-smoothstep(12.0,38.0,back));
  float wakeRidge=exp(-pow((side-back*0.28)/1.2,2.0))*wake;
  float trail=exp(-side*side/3.0)*wake*(0.55+0.45*sin(back*2.7-uTime*4.0));
  ripple+=vec2(0.035*sin(back*3.0-uTime*4.0),0.022*cos(back*2.0))*wakeRidge*uObjects;
  vec3 n=normalize(vNormal+vec3(ripple.x,0.0,ripple.y));
  float nv=max(dot(n,v),0.01);
  float fresnel=0.0204+0.9796*pow(1.0-nv,5.0);
  vec3 reflected=reflect(-v,n); reflected.y=max(abs(reflected.y),0.005);
  vec3 reflection=sky(reflected,0.65);
  float diffuse=0.35+0.65*max(dot(n,uSun),0.0);
  vec3 deep=vec3(0.006,0.037,0.051);
  vec3 body=deep+vec3(0.005,0.045,0.05)*diffuse*(1.0-uCloud*0.6);
  float crest=smoothstep(-uHeight*0.2,uHeight*0.7,vWorld.y);
  float scatter=pow(max(dot(v,-uSun),0.0),4.0);
  body+=vec3(0.013,0.12,0.105)*crest*(0.35+scatter*1.7)*(1.0-uCloud*0.72);
  vec3 color=mix(body,reflection,fresnel);
  vec3 h=normalize(v+uSun);
  float nh=max(dot(n,h),0.0), nl=max(dot(n,uSun),0.0);
  float rough=0.085+uWind*0.0014, a2=rough*rough;
  float denom=nh*nh*(a2-1.0)+1.0;
  float ggx=a2/(3.14159*denom*denom+0.00001);
  color+=sunlight()*ggx*0.035*nl*(1.0-uCloud*0.97);
  float broad=pow(nh,50.0)*0.12;
  color+=sunlight()*broad*(1.0-uCloud*0.95);
  vec2 foamUV=vBase*1.7-ripple*2.0;
  float foamNoise=fbm(foamUV+vec2(uTime*0.06,0.0));
  float foam=smoothstep(0.28,0.60,vCompression)*smoothstep(0.26,0.61,foamNoise);
  float lace=1.0-smoothstep(0.025,0.11,abs(noise(foamUV*3.0)-0.5));
  foam*=0.55+lace*0.45;
  foam*=smoothstep(2.0,15.0,uWind);
  foam+=uObjects*(wakeRidge*0.23+trail*0.3)*smoothstep(0.20,0.66,foamNoise);
  foam*=1.0-smoothstep(250.0,1100.0,distanceToEye);
  vec3 foamColor=mix(vec3(0.76,0.88,0.84),vec3(0.38,0.47,0.48),uCloud);
  color=mix(color,foamColor,clamp(foam,0.0,0.92));
  float fog=1.0-exp(-distanceToEye*(0.00025+uCloud*0.0008));
  vec3 horizon=sky(normalize(vec3(-v.x,0.008,-v.z)),0.0);
  color=mix(color,horizon*0.94,fog);
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const skyVertex = /* glsl */`
varying vec3 vDirection;
void main() {
  vDirection=position;
  vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.0);
  gl_Position=p.xyww;
}
`;
export const skyFragment = /* glsl */`
varying vec3 vDirection;
${atmosphere}
void main() {
  gl_FragColor=vec4(sky(normalize(vDirection),1.0),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
