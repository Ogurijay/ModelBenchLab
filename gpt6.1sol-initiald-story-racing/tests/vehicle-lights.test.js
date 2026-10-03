import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CARS } from '../src/data.js';
import { VehicleModelFactory,animateVehicleModel,cloneVehicleModel,vehicleLightState,vehicleModelStats } from '../src/vehicle-model.js';
// Canvas pixels are checked in browser QA. This stub allows actual geometry,
// material ownership and mechanical lamp transforms to be checked in Node.
globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){},createRadialGradient(){return {addColorStop(){}};}})})};
const factory=new VehicleModelFactory();
test('pop-up lenses lift above the hood and face forward when fully deployed',()=>{
  for(const id of ['ae86','fc']){
    const model=factory.create(CARS.find(c=>c.id===id));animateVehicleModel(model,{lights:false},0);model.updateMatrixWorld(true);
    const closed=vehicleLightState(model);assert.ok(closed.popups.every(p=>!p.visible&&p.angle===0));
    animateVehicleModel(model,{lights:true},0);model.updateMatrixWorld(true);const on=vehicleLightState(model);
    assert.ok(on.anchors.every((p,i)=>p[1]>closed.anchors[i][1]+.2));
    for(const side of [-1,1]){
      const face=model.getObjectByName('headlamp:'+side).getObjectByName('headlamp-lens'),normal=face.getWorldDirection(new T.Vector3());
      assert.ok(normal.z>.9999&&Math.abs(normal.y)<1e-8,'headlamp must illuminate the road rather than point upward');
    }
  }
});
test('headlamps, running lights and brake lights respond independently on all eight cars',()=>{
  for(const car of CARS){
    const model=factory.create(car);animateVehicleModel(model,{lights:false,brake:false},0);
    const off=vehicleLightState(model);assert.equal(off.intensity.head,0);assert.equal(off.intensity.tail,0);
    animateVehicleModel(model,{lights:true,brake:false},0);const running=vehicleLightState(model);
    assert.ok(running.intensity.head>1&&running.intensity.tail>0&&running.intensity.tail<.5);
    animateVehicleModel(model,{lights:false,brake:true},0);const brake=vehicleLightState(model);
    assert.equal(brake.intensity.head,0);assert.ok(brake.intensity.tail>running.intensity.tail*5);
    assert.equal(brake.anchors.length,2);assert.ok(brake.anchors[0][0]*brake.anchors[1][0]<0);
  }
});
test('a cloned opponent cannot change the original car lighting or pop-up pose',()=>{
  for(const car of CARS){
    const original=factory.create(car);animateVehicleModel(original,{lights:false,brake:false},0);
    const clone=cloneVehicleModel(original);animateVehicleModel(clone,{lights:true,brake:true},0);
    const a=vehicleLightState(original),b=vehicleLightState(clone);
    assert.equal(a.intensity.head,0);assert.equal(a.intensity.tail,0);assert.ok(b.intensity.head>1&&b.intensity.tail>1);
    assert.ok(a.popups.every(p=>p.angle===0));
  }
});
test('the centre of each windscreen contains glass instead of an opaque paint panel',()=>{
  for(const car of CARS){
    const model=factory.create(car),p=model.userData.vehicle;model.updateMatrixWorld(true);
    const base=p.deck+.008,roof=p.height-.025,point=new T.Vector3(0,(base+roof)/2,(p.glassFront+p.roofFront)/2);
    const normal=new T.Vector3(0,p.glassFront-p.roofFront,roof-base).normalize(),ray=new T.Raycaster(point.clone().addScaledVector(normal,.06),normal.clone().negate());
    const hits=ray.intersectObject(model.getObjectByName('vehicle-shell'),true).filter(h=>h.object.isMesh);
    assert.ok(hits.some(h=>h.object.material.name==='glass'&&h.distance<.08));
    const opaque=hits.find(h=>!h.object.material.transparent);assert.ok(!opaque||opaque.distance>.12,car.id+' has an opaque window backing');
  }
});
test('all wheel openings remain clear and model detail fits the existing budget',()=>{
  for(const car of CARS){
    const model=factory.create(car),p=model.userData.vehicle,s=vehicleModelStats(model);model.updateMatrixWorld(true);
    assert.ok(s.triangles<16000&&s.drawCalls<40);assert.equal(s.wheels,4);
    for(const side of [-1,1])for(const axle of [-p.wheelbase/2,p.wheelbase/2]){
      const ray=new T.Raycaster(new T.Vector3(side*2,p.radius+.012+p.radius*.45,axle),new T.Vector3(-side,0,0));
      const hit=ray.intersectObject(model.getObjectByName('vehicle-shell'),true).find(h=>h.object.isMesh);
      assert.ok(!hit||Math.abs(hit.point.x)<p.width/2-p.tire-.015,car.id+' wheel opening is covered');
    }
  }
});
