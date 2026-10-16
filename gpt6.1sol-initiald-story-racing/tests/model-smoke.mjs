import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {browserOptions,graphicsInfo} from './browser-options.mjs';
import {artifactsAt} from './qa-artifacts.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BENCH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'tmp/qa/models',process.env.BENCH_QA_LABEL||'');
const base=process.env.BENCH_URL||'http://localhost:3000/gpt6.1sol-initiald-story-racing/';
const artifacts=artifactsAt(out);
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],models=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(base+'?models=1');
  await page.waitForFunction(()=>window.__models?.snapshot().render.frame>=2&&getComputedStyle(document.querySelector('.model-layout')).display==='grid');
  const ids=await page.locator('[data-model]').evaluateAll(nodes=>nodes.map(n=>n.dataset.model));assert.equal(ids.length,8);
  for(const id of ids){
    await page.locator('[data-model="'+id+'"]').click();
    assert.equal((await page.evaluate(()=>window.__models.snapshot())).car,id);
    await page.evaluate(()=>window.__models.setLights(false));
    for(const view of ['hero','side','rear','front']){
      await page.locator('[data-view="'+view+'"]').click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const current=await page.evaluate(()=>window.__models.snapshot());assert.equal(current.car,id);assert.equal(current.view,view);
      await artifacts.screenshot(page,id+'-'+view+'.png');
    }
    const s=await page.evaluate(()=>window.__models.snapshot());models.push(s);
    assert.equal(s.three,'185');assert.equal(s.wheels,4);assert.ok(s.triangles<16000);assert.ok(s.drawCalls<40);
    assert.equal(s.lighting.intensity.head,0);assert.equal(s.lighting.intensity.tail,0);
    await page.evaluate(()=>{window.__models.setLights(true);window.__models.setView('front');});await page.waitForTimeout(90);
    const lit=await page.evaluate(()=>window.__models.snapshot());assert.ok(lit.lighting.intensity.head>1);assert.equal(lit.lighting.anchors.length,2);
    if(['ae86','fc'].includes(id))assert.ok(lit.lighting.popups.every(p=>p.visible&&p.angle<-.6));
    await artifacts.screenshot(page,id+'-lit-front.png');
    await page.evaluate(()=>{window.__models.setView('rear');window.__models.setBrakes(true);});await page.waitForTimeout(90);
    const braking=await page.evaluate(()=>window.__models.snapshot());
    assert.ok(braking.lighting.intensity.tail>1.5,id+' brake lamp state: '+JSON.stringify(braking));
    await artifacts.screenshot(page,id+'-brake-rear.png');await page.evaluate(()=>window.__models.setBrakes(false));
  }
  checks.push('Eight models render in four views with a bounded triangle/draw budget');
  checks.push('Eight front lamp pairs, two pop-up assemblies and independent brake lights render in lit views');
  await page.locator('[data-model="ae86"]').click();await page.evaluate(()=>window.__models.setLights(false));await page.locator('#model-light').click();await page.locator('[data-view="hero"]').click();
  await page.waitForTimeout(150);await artifacts.screenshot(page,'ae86-night.png');assert.equal((await page.evaluate(()=>window.__models.snapshot())).lights,true);
  checks.push('Pop-up lamps switch on in the viewer');
  const prior=(await page.evaluate(()=>window.__models.snapshot())).camera;
  await page.mouse.move(1000,470);await page.mouse.down();await page.mouse.move(1180,480,{steps:12});await page.mouse.up();await page.waitForTimeout(200);
  assert.notDeepEqual((await page.evaluate(()=>window.__models.snapshot())).camera,prior);
  checks.push('Real pointer drag rotates the model camera');
  // Inspect topology and clone ownership only on source routes; production is tested without source imports.
  if(!base.includes('/dist/')){
    const geometry=await page.evaluate(async()=>{
      const transformed=await fetch('./src/vehicle-model.js').then(r=>r.text());
      const specifier=transformed.match(/import \* as T from ['"]([^'"]+)['"]/)[1];
      const T=await import(specifier);
      const {CARS}=await import('./src/data.js');
      const {VehicleModelFactory,cloneVehicleModel,animateVehicleModel}=await import('./src/vehicle-model.js');
      const factory=new VehicleModelFactory(),find=(m,name)=>m.getObjectByName(name),all=[];
      for(const c of CARS){
        const model=factory.create(c),p=model.userData.vehicle,clone=cloneVehicleModel(model);
        animateVehicleModel(clone,{speed:20,steering:.7,charm:true,passengers:2,lights:true},.1,1);
        if(find(model,'vehicle-charm').visible||!find(clone,'vehicle-charm').visible)throw new Error('Clone charm ownership');
        if(find(model,'wheel:1:front').rotation.y!==0||find(clone,'wheel:1:front').rotation.y===0)throw new Error('Clone steering ownership');
        if(find(clone,'wheel:1:rear').rotation.y!==0)throw new Error('Rear wheel steers');
        if(find(clone,'wheel:1:front').rotation.x!==0||find(clone,'wheel-spin').rotation.x===0)throw new Error('Spin axle shares steering pivot');
        model.updateMatrixWorld(true);
        for(const side of [-1,1])for(const axle of [-p.wheelbase/2,p.wheelbase/2]){
          const ray=new T.Raycaster(new T.Vector3(side*2,p.radius+.012+p.radius*.45,axle),new T.Vector3(-side,0,0));
          const hit=ray.intersectObject(find(model,'vehicle-shell'),true).find(h=>h.object.isMesh);
          if(hit&&Math.abs(hit.point.x)>p.width/2-p.tire-.015)throw new Error(c.id+' solid shell covers a wheel opening');
        }
        let vertices=0;
        model.traverse(o=>{if(o.geometry){const a=o.geometry.attributes.position;vertices+=a.count;for(const n of a.array)if(!Number.isFinite(n))throw new Error('Non-finite vertex');}});
        all.push({id:c.id,vertices,cloned:true,wheelClearance:true});
      }
      return all;
    });
    checks.push('Cloned cars own independent animation and attachments; all four wheel openings stay clear');
    artifacts.json('geometry.json',geometry);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('[data-model="wuling"]').click();await page.locator('[data-view="hero"]').click();await page.waitForTimeout(150);
  await artifacts.screenshot(page,'mobile-viewer.png');
  assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
  checks.push('390px viewer fits without horizontal overflow');
  await page.setViewportSize({width:1440,height:900});await page.goto(base+'?bench=1');await page.waitForFunction(()=>!!window.__bench);await page.waitForTimeout(150);
  await artifacts.screenshot(page,'after-menu.png');
  await page.evaluate(()=>window.__bench.startRace({car:'ae86',opponent:'ae86',track:'downhill',mode:'duel',weather:'night',title:'同车测试',assist:true,free:true,charm:true}));
  await page.evaluate(()=>window.__bench.advance(3));await page.waitForTimeout(160);
  await artifacts.screenshot(page,'duplicate-race.png');
  assert.equal((await page.evaluate(()=>window.__bench.getState())).race.opponents[0].id,'ae86');
  checks.push('A player and opponent of the same model render and animate together');
  assert.equal(errors.length,0,errors.join('\n'));
  const report={date:new Date().toISOString(),base,browser:browser.version(),graphics:await graphicsInfo(page),checks,models,errors};
  artifacts.json('model-smoke.json',report);
  console.log(JSON.stringify({checks:checks.length,models:models.map(({id,triangles,drawCalls})=>({id,triangles,drawCalls})),errors},null,2));
} finally {await browser.close();artifacts.flush();}
