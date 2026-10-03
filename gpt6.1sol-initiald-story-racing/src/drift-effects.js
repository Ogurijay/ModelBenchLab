import * as T from 'three';

// Fixed pools: two draw calls, no new meshes/textures while the car is sliding.
const PUFFS=160,MARKS=640;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class DriftEffects {
  constructor(scene){
    this.time=0;this.seed=71;this.cursor=0;this.markCursor=0;this.markCount=0;this.emission=0;this.previous=null;
    this.particles=Array.from({length:PUFFS},()=>({age:2,life:1,x:0,y:0,z:0,vx:0,vz:0,strength:0}));
    this.positions=new Float32Array(PUFFS*3);this.sizes=new Float32Array(PUFFS);this.alphas=new Float32Array(PUFFS);
    const smokeGeo=new T.BufferGeometry();
    smokeGeo.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    smokeGeo.setAttribute('aSize',new T.BufferAttribute(this.sizes,1).setUsage(T.DynamicDrawUsage));
    smokeGeo.setAttribute('aAlpha',new T.BufferAttribute(this.alphas,1).setUsage(T.DynamicDrawUsage));
    this.smokeMaterial=new T.ShaderMaterial({
      uniforms:{uScale:{value:600},uColor:{value:new T.Color('#d7dee2')}},transparent:true,depthWrite:false,
      vertexShader:`attribute float aSize;attribute float aAlpha;uniform float uScale;varying float vAlpha;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(aSize*uScale/max(.1,-p.z),0.0,180.0);vAlpha=aAlpha;}`,
      fragmentShader:`uniform vec3 uColor;varying float vAlpha;
        void main(){vec2 p=gl_PointCoord*2.0-1.0;float edge=1.0-smoothstep(.15,1.0,length(p));
          float wisp=.86+.14*sin(p.x*8.0+p.y*6.0);float alpha=edge*edge*vAlpha*wisp;
          if(alpha<.005)discard;gl_FragColor=vec4(uColor,alpha);
          #include <colorspace_fragment>
        }`
    });
    this.smoke=new T.Points(smokeGeo,this.smokeMaterial);this.smoke.frustumCulled=false;this.smoke.renderOrder=2;scene.add(this.smoke);
    this.markPositions=new Float32Array(MARKS*18);this.births=new Float32Array(MARKS*6);this.markTimes=new Float32Array(MARKS);
    const uv=new Float32Array(MARKS*12);for(let i=0;i<MARKS;i++)uv.set([0,0,1,0,0,1,0,1,1,0,1,1],i*12);
    const markGeo=new T.BufferGeometry();
    markGeo.setAttribute('position',new T.BufferAttribute(this.markPositions,3).setUsage(T.DynamicDrawUsage));
    markGeo.setAttribute('aBirth',new T.BufferAttribute(this.births,1).setUsage(T.DynamicDrawUsage));
    markGeo.setAttribute('uv',new T.BufferAttribute(uv,2));markGeo.setDrawRange(0,0);
    this.markMaterial=new T.ShaderMaterial({uniforms:{uTime:{value:0},uColor:{value:new T.Color('#101820')}},transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:`attribute float aBirth;varying float vBirth;varying vec2 vUv;
        void main(){vBirth=aBirth;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float uTime;uniform vec3 uColor;varying float vBirth;varying vec2 vUv;
        void main(){float age=uTime-vBirth;float fade=1.0-smoothstep(10.0,16.0,age);
          float edge=smoothstep(0.0,.15,vUv.x)*(1.0-smoothstep(.85,1.0,vUv.x));
          gl_FragColor=vec4(uColor,fade*edge*.64);
          #include <colorspace_fragment>
        }`
    });
    this.marks=new T.Mesh(markGeo,this.markMaterial);this.marks.frustumCulled=false;this.marks.renderOrder=1;scene.add(this.marks);
    this.reset();
  }
  random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
  reset(){
    this.previous=null;this.cursor=0;this.markCursor=0;this.markCount=0;this.emission=0;this.time=0;this.markDirty=false;
    this.alphas.fill(0);this.sizes.fill(0);this.particles.forEach(p=>p.age=p.life+1);
    this.smoke.geometry.attributes.aAlpha.needsUpdate=true;this.smoke.geometry.attributes.aSize.needsUpdate=true;
    this.marks.geometry.setDrawRange(0,0);this.smoke.visible=false;this.marks.visible=false;this.intensity=0;this.activePuffs=0;
  }
  tirePositions(v,profile,track){
    const sin=Math.sin(v.yaw),cos=Math.cos(v.yaw),p=track.at(v.s),rise=(track.at(v.s+2).y-track.at(Math.max(0,v.s-2)).y)/4;
    return [-1,1].map(side=>{
      const x=side*(profile.width/2-profile.tire/2-.025),z=-profile.wheelbase/2,dx=x*cos+z*sin,dz=-x*sin+z*cos;
      return {x:v.x+dx,y:v.y+rise*(dx*p.tx+dz*p.tz)+.06,z:v.z+dz};
    });
  }
  puff(position,v,strength){
    const p=this.particles[this.cursor];this.cursor=(this.cursor+1)%PUFFS;
    Object.assign(p,{age:0,life:.9+this.random()*.6,x:position.x,y:position.y+.14,z:position.z,
      vx:v.vx*.045+(this.random()-.5)*1.2,vz:v.vz*.045+(this.random()-.5)*1.2,strength});
  }
  mark(a,b,width){
    const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<.08||d>4)return;
    const x=-dz/d*width*.5,z=dx/d*width*.5,i=this.markCursor;
    this.markPositions.set([a.x-x,a.y,a.z-z,a.x+x,a.y,a.z+z,b.x-x,b.y,b.z-z,
      b.x-x,b.y,b.z-z,a.x+x,a.y,a.z+z,b.x+x,b.y,b.z+z],i*18);
    this.births.fill(this.time,i*6,i*6+6);this.markTimes[i]=this.time;
    this.markCursor=(i+1)%MARKS;this.markCount=Math.min(MARKS,this.markCount+1);this.markDirty=true;
  }
  update(v,profile,track,dt,camera,height,enabled=true){
    this.time+=dt;this.markMaterial.uniforms.uTime.value=this.time;
    this.intensity=enabled&&v.speed>8&&!v.cooldown?clamp(v.driftIntensity||0,0,1):0;
    const active=this.intensity>.08;
    if(active&&dt>0){
      const tires=this.tirePositions(v,profile,track);
      this.emission+=dt*(22+this.intensity*26);
      while(this.emission>=1){this.emission--;for(const tire of tires)this.puff(tire,v,this.intensity);}
      if(this.previous){for(let i=0;i<2;i++)this.mark(this.previous[i],tires[i],profile.tire*.95);}
      this.previous=tires;
    }else if(dt>0||!enabled){this.previous=null;this.emission=0;}
    this.activePuffs=0;
    for(let i=0;i<PUFFS;i++){
      const p=this.particles[i];p.age+=dt;
      if(p.age>=p.life){this.alphas[i]=0;this.sizes[i]=0;continue;}
      p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=dt*(.38+p.strength*.45);
      const t=p.age/p.life;
      this.positions[i*3]=p.x;this.positions[i*3+1]=p.y;this.positions[i*3+2]=p.z;this.sizes[i]=.45+t*(1.7+p.strength*.8);
      this.alphas[i]=Math.min(1,t*10)*(1-t)**1.5*(.22+p.strength*.32);this.activePuffs++;
    }
    for(const attribute of Object.values(this.smoke.geometry.attributes))attribute.needsUpdate=true;
    this.smokeMaterial.uniforms.uScale.value=height*.5*camera.projectionMatrix.elements[5];
    if(this.markDirty){this.marks.geometry.attributes.position.needsUpdate=true;this.marks.geometry.attributes.aBirth.needsUpdate=true;this.markDirty=false;}
    this.marks.geometry.setDrawRange(0,this.markCount*6);
    this.smoke.visible=enabled&&this.activePuffs>0;this.marks.visible=enabled&&this.markCount>0;
  }
  snapshot(){
    let liveMarks=0;for(let i=0;i<this.markCount;i++)if(this.time-this.markTimes[i]<16)liveMarks++;
    return {intensity:this.intensity,smoke:this.smoke.visible?this.activePuffs:0,skidSegments:this.marks.visible?liveMarks:0,
      capacity:{smoke:PUFFS,skidSegments:MARKS},drawCalls:Number(this.smoke.visible)+Number(this.marks.visible)};
  }
}
