import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpectrum, updateSpectrum, sampleParametric, sampleWorld, maximumElevation, stepSpring, finiteParam, PRESETS } from '../src/spectrum.js';

test('Seeded coefficients reproduce wave phases without altering global randomness',()=>{
  assert.deepEqual(createSpectrum(61),createSpectrum(61));assert.notDeepEqual(createSpectrum(61),createSpectrum(62));
});
test('All presets normalize theoretical significant height and bound horizontal folding',()=>{
  for(const p of [...Object.values(PRESETS),{...PRESETS.storm,height:6,wind:24}]){
    const waves=createSpectrum(),chop=updateSpectrum(waves,p),hs=4*Math.sqrt(waves.reduce((s,w)=>s+w.amplitude*w.amplitude/2,0));
    assert.ok(Math.abs(hs-p.height)<1e-10);assert.ok(waves.reduce((s,w)=>s+w.k*w.amplitude*chop,0)<=0.7800001);
    for(let t=0;t<30;t+=1.7)for(let x=-30;x<=30;x+=10){const s=sampleParametric(x,-x*0.73,t,waves,chop);assert.ok(Math.abs(s.y)<=maximumElevation(waves)+1e-10);assert.ok(s.jacobian>0);assert.ok(Math.abs(Math.hypot(...s.normal)-1)<1e-10);}
  }
});
test('Inverse horizontal lookup returns the actual world surface for buoyancy',()=>{
  const waves=createSpectrum(),chop=updateSpectrum(waves,PRESETS.storm);
  for(let t=0;t<20;t+=1.3)for(const [x,z] of [[0,0],[15,-15],[-14,-34],[23,8]]){
    const surface=sampleWorld(x,z,t,waves,chop);assert.ok(Math.hypot(surface.x-x,surface.z-z)<0.035);
  }
});
test('Analytic normals match finite differences of displaced wave geometry',()=>{
  const waves=createSpectrum(),chop=updateSpectrum(waves,PRESETS.swell),h=1e-4;
  const s=sampleParametric(6,-12,7,waves,chop),dx=sampleParametric(6+h,-12,7,waves,chop),dz=sampleParametric(6,-12+h,7,waves,chop);
  const t=[dx.x-s.x,dx.y-s.y,dx.z-s.z],b=[dz.x-s.x,dz.y-s.y,dz.z-s.z];
  const n=[b[1]*t[2]-b[2]*t[1],b[2]*t[0]-b[0]*t[2],b[0]*t[1]-b[1]*t[0]],len=Math.hypot(...n);
  n.forEach((v,i)=>assert.ok(Math.abs(v/len-s.normal[i])<1e-4));
});
test('Critical damping converges under varied step sizes and does not explode after delay',()=>{
  for(const dt of [1/120,1/30,0.1,2]){let p=5,v=-1;for(let t=0;t<12;t+=dt){const s=stepSpring(p,v,1,dt);p=s.position;v=s.velocity;assert.ok(Number.isFinite(p)&&Number.isFinite(v));}assert.ok(Math.abs(p-1)<1e-8);assert.ok(Math.abs(v)<1e-8);}
});
test('URL parameter parsing rejects nonfinite values and clamps valid numbers',()=>{
  for(const value of [null,'','oops','Infinity','NaN'])assert.equal(finiteParam(value,61,0,100),61);
  assert.equal(finiteParam('-20',61,0,100),0);assert.equal(finiteParam('300',61,0,100),100);assert.equal(finiteParam('42',61,0,100),42);
});
