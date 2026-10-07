import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const project=path.resolve(import.meta.dirname,'..'),out=path.join(project,'docs/qa');fs.mkdirSync(out,{recursive:true});
const url=process.env.ASTRA_URL||'http://127.0.0.1:3059/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const checks=[],errors=[],observations={};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
async function ready(){await page.waitForFunction(()=>window.astra?.ready);await page.waitForTimeout(220);}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
try{
 await page.goto(url,{waitUntil:'networkidle'});await ready();
 await check('eight renderable cars and genuine model thumbnails',async()=>{
  assert.equal(await page.locator('[data-car]').count(),8);
  const data=await page.evaluate(()=>({count:window.astra.models.length,imgs:[...document.querySelectorAll('.car-card img')].map(x=>({src:x.src,width:x.naturalWidth}))}));
  assert.equal(data.count,8);assert.ok(data.imgs.every(i=>i.width>0));
  const ref=await page.evaluate(()=>window.astra.models.map(m=>m.userData.carId));assert.equal(new Set(ref).size,8);
 });
 await shot('race-overview');
 await page.locator('#reference-open').click();
 await check('all eight primary classic reference links are listed in the archive',async()=>{
  assert.equal(await page.locator('.reference-grid a').count(),8);assert.ok((await page.locator('.reference-grid').innerText()).includes('19301'));
 });await page.locator('#modal-close').click();
 await page.locator('[data-view="garage"]').click();
 await check('all eight separately authored models expose 13 exploded assemblies',async()=>{
  const silhouettes=[];
  for(let i=0;i<8;i++){await page.locator(`[data-car="${i}"]`).click();const result=await page.evaluate(()=>({parts:Object.keys(window.astra.garageModel.userData.parts),panels:Object.keys(window.astra.garageModel.userData.panelMeshes)}));assert.equal(result.parts.length,13);silhouettes.push(result.panels.join('/'));}
  assert.equal(new Set(silhouettes).size,8);
 });
 await page.locator('[data-car="0"]').click();await shot('garage-cyclone');
 await page.locator('#compare-open').click();
 await check('reference comparison distinguishes photograph from rendered model',async()=>{const sources=await page.locator('.compare-images img').evaluateAll(images=>images.map(i=>i.src));assert.notEqual(sources[0],sources[1]);});await page.locator('#modal-close').click();
 await page.locator('#explode-toggle').click();
 await check('exploded view separates shell, canopy and wheel assemblies',async()=>{const p=await page.evaluate(()=>{const p=window.astra.garageModel.userData.parts;return {shell:p.shell.position.y,canopy:p.canopy.position.y,wheel:p['wheel-0'].position.x};});assert.ok(p.shell>50&&p.canopy>70&&p.wheel<-50);});await shot('garage-exploded');
 await check('clicking an exposed motor selects its component editor',async()=>{
  await page.locator('[data-part="battery"]').click();
  const point=await page.evaluate(()=>{const a=window.astra,m=a.garageModel.userData.parts.motor.children[0];const p=m.getWorldPosition(a.camera.position.clone()).project(a.camera),r=a.renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.click(point.x,point.y);assert.equal(await page.locator('.parts-grid .active').getAttribute('data-part'),'motor');
 });
 await page.locator('#explode-toggle').click();
 await page.locator('[data-part="motor"]').click();await page.locator('[data-option="2"]').click();
 await check('motor replacement updates visible performance figures',async()=>{assert.equal(await page.evaluate(()=>window.astra.state.builds.cyclone.motor),2);assert.ok((await page.locator('#build-stats').innerText()).includes('37.4'));});
 await page.locator('[data-part="roller"]').click();await page.locator('[data-option="1"]').click();
 await check('roller replacement adds four visible upper bearing rollers',async()=>assert.equal(await page.evaluate(()=>window.astra.garageModel.userData.parts.rollers.children.filter(o=>o.name==='upper-bearing-guide').length),4));
 await page.reload({waitUntil:'networkidle'});await ready();
 await check('configuration survives a real browser reload',async()=>{const b=await page.evaluate(()=>window.astra.state.builds.cyclone);assert.equal(b.motor,2);assert.equal(b.roller,1);});
 await page.locator('[data-view="garage"]').click();
 await check('repeated garage selection releases replaced GPU geometry and textures',async()=>{
  async function cycle(){for(let i=0;i<8;i++){await page.locator(`[data-car="${i}"]`).click();await page.waitForTimeout(30);}await page.locator('[data-car="0"]').click();await page.waitForTimeout(120);return page.evaluate(()=>({...window.astra.renderer.info.memory}));}
  const before=await cycle(),after=await cycle();observations.memory={before,after};assert.ok(after.geometries<=before.geometries+8);assert.ok(after.textures<=before.textures+2);
 });
 const downloaded=page.waitForEvent('download');await page.locator('#export-build').click();const dl=await downloaded;const exported=path.join(out,'exported-build.json');await dl.saveAs(exported);const exportedData=JSON.parse(fs.readFileSync(exported,'utf8'));
 await check('export contains a valid independent build',async()=>{assert.equal(exportedData.schema,'astra-mini4wd/1');assert.equal(exportedData.build.motor,2);});
 await page.locator('#add-car').click();await page.locator('#custom-form [name="name"]').fill('ASTRA 测试改');await page.locator('#custom-form [name="color"]').fill('#238f69');await page.locator('#custom-form [type="submit"]').click();
 await check('custom car keeps its own name, color and build',async()=>{assert.equal(await page.locator('[data-car]').count(),9);assert.equal(await page.locator('#garage-name').innerText(),'ASTRA 测试改');const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('astra-mini4wd-v1')).customCars);assert.equal(data[0].customColor,'#238f69');});
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"invalid"}')});
 await check('invalid import is rejected without adding a car',async()=>{await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('无法导入'));assert.equal(await page.locator('[data-car]').count(),9);});
 await page.locator('#import-file').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exportedData,name:'导入测试车'}))});
 await check('valid import creates an independent car',async()=>{await page.waitForFunction(()=>document.querySelectorAll('[data-car]').length===10);assert.equal(await page.locator('#garage-name').innerText(),'导入测试车');});
 await page.locator('#back-race').click();
 await check('custom selection replaces one starter while preserving the eight-car limit',async()=>{const ids=await page.evaluate(()=>window.astra.race.cars.map(c=>c.car.name));assert.equal(ids.length,8);assert.ok(ids.includes('导入测试车'));});
 await check('three long tracks, three rooms and 2/4/8-car grids switch through actual controls',async()=>{
  const lengths={};for(const id of ['helix','technical','aerial']){await page.locator('#course-select').selectOption(id);lengths[id]=await page.evaluate(()=>window.astra.course.length);assert.ok(lengths[id]>95);}
  for(const id of ['night','workshop','club'])await page.locator('#venue-select').selectOption(id);
  for(const n of [4,8,2]){await page.locator('#count-select').selectOption(String(n));assert.equal(await page.evaluate(()=>window.astra.race.cars.length),n);}
  observations.lengths=lengths;
 });
 await page.locator('#control-select').selectOption('manual');await page.locator('#start').click();await page.waitForFunction(()=>window.astra.race.status==='running');
 await page.keyboard.down('KeyW');await page.waitForTimeout(800);const fast=await page.evaluate(()=>window.astra.race.cars[window.astra.race.player].v);await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');await page.waitForTimeout(300);const slow=await page.evaluate(()=>window.astra.race.cars[window.astra.race.player].v);await page.keyboard.up('KeyS');
 await check('actual W and S keyboard input powers and brakes the player',async()=>{assert.ok(fast>1);assert.ok(slow<fast);observations.manual={fast,slow};});
 await check('race settings lock while running',async()=>assert.equal(await page.locator('#course-select').isDisabled(),true));
 await page.locator('[data-view="garage"]').click();
 await check('garage pauses a race and rejects mid-race component changes',async()=>{assert.equal(await page.evaluate(()=>window.astra.race.status),'paused');const before=await page.evaluate(()=>JSON.stringify(window.astra.state.builds));await page.locator('[data-part="motor"]').click();await page.locator('[data-option="0"]').click();assert.equal(await page.evaluate(()=>JSON.stringify(window.astra.state.builds)),before);});
 await page.locator('#back-race').click();await page.locator('#pause').click();
 await check('paused race resumes from the control panel',async()=>assert.equal(await page.evaluate(()=>window.astra.race.status),'running'));
 await page.locator('#reset').click();await page.evaluate(()=>localStorage.removeItem('astra-mini4wd-v1'));await page.reload({waitUntil:'networkidle'});await ready();
 await page.locator('#start').click();await page.waitForFunction(()=>window.astra.race.status==='running');await shot('race-chase');
 await page.waitForFunction(()=>{const c=window.astra.race.cars[0];if(c.frame.loop&&c.frame.u.y<-.97){window.astra.race.status='paused';return true;}return false;},{},{timeout:18000,polling:'raf'});
 await page.waitForTimeout(300);
 await check('close-follow camera enters and inverts on a physically simulated loop',async()=>{const data=await page.evaluate(()=>({up:window.astra.camera.up.toArray(),normal:window.astra.race.cars[0].frame.u.toArray(),distance:window.astra.camera.position.distanceTo(window.astra.race.cars[0].frame.p),status:window.astra.race.cars[0].status,support:window.astra.race.cars[0].support}));assert.ok(data.up[1]<-.9);assert.ok(data.distance>.2&&data.distance<.5);assert.equal(data.status,'running');assert.ok(data.support>0);observations.follow=data;});await shot('loop-inverted-chase');
 await page.evaluate(()=>{window.astra.race.status='running';window.astra.step(200);});
 await check('eight cars finish eight laps and the live table shows results',async()=>{const result=await page.evaluate(()=>({status:window.astra.race.status,cars:window.astra.race.cars.map(c=>({id:c.id,lap:c.lap,status:c.status,finish:c.finishTime}))}));assert.equal(result.status,'finished');assert.ok(result.cars.every(c=>c.lap===8&&c.status==='finished'));assert.equal(await page.locator('.standing small').filter({hasText:'FINISH'}).count(),8);observations.race=result;});await shot('race-results');
 await page.locator('#start').click();
 await check('finished race can start again',async()=>assert.equal(await page.evaluate(()=>window.astra.race.status),'countdown'));await page.locator('#reset').click();
 await page.keyboard.press('KeyV');
 await check('V switches camera mode',async()=>assert.equal(await page.evaluate(()=>window.astra.state.cameraMode),'nose'));
 await page.locator('[data-camera="overview"]').click();await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(200);await shot('desktop-1280');
 await check('desktop layout stays within the viewport at 1280 × 800',async()=>{const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));assert.ok(size.scroll<=size.view);});
 await check('no browser JavaScript, WebGL or network console errors',async()=>assert.deepEqual(errors,[]));
}catch(error){checks.push({name:'acceptance failure',passed:false,error:error.stack});console.error(error);process.exitCode=1;await shot('acceptance-failure').catch(()=>{});}
finally{fs.writeFileSync(path.join(out,'browser-acceptance.json'),JSON.stringify({url,date:new Date().toISOString(),browser:await browser.version(),checks,errors,observations},null,2));await browser.close();}
