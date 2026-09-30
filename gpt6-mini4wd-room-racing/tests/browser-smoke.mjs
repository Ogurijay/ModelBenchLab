import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base=process.env.MINI4WD_URL||'http://127.0.0.1:3000/gpt6-mini4wd-room-racing/';
const output=new URL('../docs/screenshots/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const snap=()=>page.evaluate(()=>window.mini4wd.snapshot());
const shot=async name=>{await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output)),fullPage:true});};
const check=message=>{checks.push(message);console.log('PASS',message);};
const click=selector=>page.locator(selector).first().click();
try{
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.mini4wd);
  assert.equal((await snap()).carCount,8);assert.equal(await page.locator('.car-card img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth===320).length),8);check('Eight named cars and generated thumbnails load');
  await shot('lobby');
  const calls=(await snap()).render.calls;assert.ok(calls<700);check(`Scene batches to ${calls} draw calls including shadow pass`);
  await click('[data-action="page-garage"]');await click('[data-action="explode"]');
  for(const slot of ['shell','chassis','motor','tires','rollers','battery']){await click(`#sidebar [data-slot="${slot}"]`);await click('[data-install="2"]');assert.equal((await snap()).build[slot],2);}
  await page.waitForFunction(()=>document.querySelectorAll('.part-label:not([hidden])').length===6);await page.waitForTimeout(350);await shot('garage-exploded');
  const upgraded=await snap();assert.ok(upgraded.stats[0]>86&&upgraded.stats[2]>71);check('All six slots can be selected and replaced, updating the actual build');
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.mini4wd);assert.deepEqual((await snap()).build,upgraded.build);check('Installed parts persist after reload');
  await click('[data-action="page-garage"]');await click('[data-action="reset-build"]');await click('[data-action="page-race"]');
  for(const id of ['hurricane','triangle','evolution','cobra','spider','giant','devil','cyclone']){await click(`[data-car="${id}"]`);assert.equal((await snap()).selected,id);}check('Every classic car is selectable');
  await click('[data-action="tracks"]');await click('[data-venue="night"]');await click('[data-track="cross"]');await click('[data-action="close"]');assert.equal((await snap()).track,'cross');await shot('night-crossover');
  await click('[data-action="tracks"]');await click('[data-venue="club"]');await click('[data-track="speed"]');await click('[data-action="close"]');await shot('club-speed');
  await click('[data-action="tracks"]');await click('[data-venue="bedroom"]');await click('[data-track="classic"]');await click('[data-action="close"]');check('All three venues and track layouts render');
  await page.selectOption('#lap-select','1');await click('[data-action="start"]');await page.waitForFunction(()=>window.mini4wd.snapshot().state==='running');await page.waitForTimeout(2000);await shot('race-live');
  await page.keyboard.press('Space');assert.equal((await snap()).state,'paused');const paused=(await snap()).time;await page.waitForTimeout(250);assert.equal((await snap()).time,paused);await page.keyboard.press('Space');check('Keyboard pause freezes the simulation and resumes');
  await page.waitForFunction(()=>window.mini4wd.snapshot().state==='finished',{},{timeout:25000});assert.ok((await snap()).racers.every(r=>r.finish!==null));assert.equal(await page.locator('.result-table>div').count(),9);await shot('race-results');check('Eight racers complete a browser race and receive eight ranked results');
  await click('[data-action="close"]');await click('[data-action="reset"]');await click('[data-mode="manual"]');await page.selectOption('#lap-select','3');await click('[data-action="start"]');await page.waitForFunction(()=>window.mini4wd.snapshot().state==='running');
  await page.waitForTimeout(350);assert.equal((await snap()).racers[0].speed,0);
  await page.keyboard.down('w');await page.waitForTimeout(1350);const moving=await snap();assert.ok(moving.racers[0].speed>5);await page.keyboard.down('Shift');await page.waitForTimeout(350);await page.keyboard.up('Shift');assert.ok((await snap()).racers[0].battery<moving.racers[0].battery);
  await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForTimeout(1000);await page.keyboard.up('s');assert.ok((await snap()).racers[0].speed<.5);check('Manual throttle, braking and battery-consuming boost work through keyboard events');
  await click('[data-action="camera-follow"]');assert.equal((await snap()).camera,'follow');await click('[data-action="camera-top"]');assert.equal((await snap()).camera,'top');await click('[data-action="camera-orbit"]');check('Follow, top and orbit cameras switch');
  await click('[data-action="reset"]');await click('[data-action="extension"]');await page.locator('#custom-form [name="name"]').fill('流星冲锋');await page.locator('#custom-form [name="shape"]').selectOption('devil');await page.locator('#custom-form button[type="submit"]').click();
  assert.equal((await snap()).carCount,9);assert.match((await snap()).selected,/^custom-/);await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.mini4wd);assert.equal((await snap()).carCount,9);check('Custom racer creation and persistence work');
  await click('[data-action="extension"]');await page.locator('#import-car').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"name":"bad","color":"red","stats":[999,999,999,999]}')});await page.waitForFunction(()=>document.querySelector('#custom-error').textContent.length>0);assert.equal((await snap()).carCount,9);check('Invalid imported racers are rejected without corrupting the garage');
  await page.locator('#import-car').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'银翼冲锋',color:'#94b5b7',accent:'#d8ce68',shape:'magnum',stats:[80,80,80,80]}))});await page.waitForFunction(()=>window.mini4wd.snapshot().carCount===10);check('Valid JSON racer import works');
  await click('[data-action="extension"]');const downloadPromise=page.waitForEvent('download');await click('[data-action="export"]');const download=await downloadPromise;assert.equal(download.suggestedFilename(),'mini4wd-car.json');await click('[data-action="close"]');check('Racer JSON export produces a download');
  // Acceptance targets desktop browsers and keyboard/mouse controls.
  await page.setViewportSize({width:1280,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1280);check('1280px layout has no horizontal overflow');
  assert.deepEqual(errors,[]);check('No JavaScript exceptions or browser console errors');
  const report={date:new Date().toISOString(),browser:'Microsoft Edge, headless, WebGL 2',base,checks,errors,finalSnapshot:await snap()};await writeFile(new URL('../docs/browser-validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){console.error('FAILED',error);console.error('Console errors:',errors);await shot('failure').catch(()=>{});throw error;}finally{await browser.close();}
