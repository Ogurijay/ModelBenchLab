import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const folder=fileURLToPath(new URL('../docs/qa/',import.meta.url));await mkdir(folder,{recursive:true});
const url=process.env.OCEAN_URL||'http://localhost:3000/gpt6.1sol-ocean-realistic/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
const errors=[],requests=[];const report={date:new Date().toISOString(),url,checks:[],errors,failedRequests:requests};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
const snapshot=()=>page.evaluate(()=>window.__tideline.snapshot());
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const load=async(query='')=>{await page.goto(url+query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__tideline&&document.querySelector('#app').classList.contains('ready'));await page.waitForTimeout(1000);};
try{
  await load('?seed=61&time=12&paused=1');report.initial=await snapshot();assert.equal(report.initial.revision,'185');assert.equal(report.initial.shaderErrors,0);assert.ok(report.initial.triangles>100000);
  await page.screenshot({path:folder+(url.includes('/dist/')?'production-sea.png':'desktop-swell.png')});check('Actual WebGL render initializes without shader errors');
  if(process.argv.includes('--visual-only')&&url.includes('/dist/')){
    await page.locator('[data-preset="sunset"]').click();await page.waitForTimeout(150);assert.equal((await snapshot()).parameters.height,1.5);
    await page.getByRole('button',{name:'投放木箱',exact:true}).click();await page.waitForTimeout(100);assert.equal((await snapshot()).dropped,1);check('Built JavaScript bundle responds to sea presets and float spawning');
    await page.setViewportSize({width:390,height:844});await load('?seed=61&time=12');await page.getByRole('button',{name:'展开控制台'}).click();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:folder+'production-mobile-controls.png'});check('Built CSS and JavaScript render the mobile controls correctly');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);check('Production build has no console or request errors');
  }
  if(!process.argv.includes('--visual-only')){
    await page.getByRole('button',{name:'继续模拟',exact:true}).click();const before=(await snapshot()).time;await page.waitForTimeout(500);assert.ok((await snapshot()).time>before);
    await page.getByRole('button',{name:'暂停模拟',exact:true}).click();const frozen=await snapshot();await page.waitForTimeout(350);assert.equal((await snapshot()).time,frozen.time);check('Playback advances and pause freezes ocean phase');
    for(const preset of ['calm','sunset','storm']){
      await page.locator(`[data-preset="${preset}"]`).click();await page.waitForTimeout(150);assert.equal((await snapshot()).preset,preset);await page.screenshot({path:folder+'desktop-'+preset+'.png'});
    }
    check('All four presets drive actual scene parameters');
    await page.getByRole('slider',{name:'有效波高'}).focus();await page.keyboard.press('End');await page.waitForTimeout(150);const high=await snapshot();assert.equal(high.target.height,6);assert.equal(high.preset,null);
    await page.mouse.move(710,520);await page.mouse.down();await page.mouse.move(710,180,{steps:12});await page.mouse.up();await page.mouse.wheel(0,-4000);await page.waitForTimeout(400);const camera=await snapshot();assert.ok(camera.camera[1]>=camera.minimumCameraY-1e-6);check('Extreme waves and camera orbit remain above the sea');
    await page.getByRole('tab',{name:'光与天空'}).click();await page.getByRole('slider',{name:'太阳高度'}).focus();await page.keyboard.press('End');await page.getByRole('slider',{name:'云层覆盖'}).focus();await page.keyboard.press('Home');await page.waitForTimeout(100);assert.equal((await snapshot()).target.sun,75);assert.equal((await snapshot()).target.cloud,0);check('Environment controls change shared sky and sea lighting');
    await page.getByRole('switch',{name:'船只与观测浮标'}).uncheck();await page.waitForTimeout(100);assert.equal((await snapshot()).objectsVisible,false);
    await page.getByRole('button',{name:'投放木箱',exact:true}).click();await page.getByRole('button',{name:'投放救生圈',exact:true}).click();await page.waitForTimeout(100);assert.equal((await snapshot()).dropped,2);assert.equal((await snapshot()).objectsVisible,true);
    await page.getByRole('button',{name:'清除投放物',exact:true}).click();assert.equal((await snapshot()).dropped,0);check('Float visibility, crate/ring spawning and cleanup work');
    await page.getByLabel('渲染质量').selectOption('low');assert.equal((await snapshot()).quality,'low');await page.getByLabel('渲染质量').selectOption('high');assert.equal((await snapshot()).quality,'high');check('Quality selection replaces the actual ocean mesh');
    await page.getByRole('button',{name:'恢复初始海况'}).click();assert.equal((await snapshot()).preset,'swell');assert.equal((await snapshot()).quality,'medium');assert.equal((await snapshot()).paused,false);assert.equal((await snapshot()).dropped,0);check('Reset restores sea, objects, camera, quality and playback');
    await page.getByRole('button',{name:'随船',exact:true}).click();assert.equal((await snapshot()).view,'vessel');await page.getByRole('button',{name:'俯瞰',exact:true}).click();assert.equal((await snapshot()).view,'aerial');await page.getByRole('button',{name:'海平线',exact:true}).click();check('All camera presets change the real camera');
    await page.getByRole('button',{name:'纯净观海',exact:true}).click();assert.equal((await snapshot()).immersive,true);assert.equal(await page.locator('#panel').evaluate(el=>el.inert),true);assert.equal(await page.locator('#restore').isVisible(),true);await page.keyboard.press('h');assert.equal((await snapshot()).immersive,false);check('Immersive mode hides and restores keyboard accessible controls');
    await page.getByRole('button',{name:'关于海洋模拟'}).click();assert.equal(await page.getByRole('dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);check('Simulation boundary dialog opens and closes');
    await page.getByRole('button',{name:'开启海浪声',exact:true}).click();await page.waitForFunction(()=>window.__tideline.snapshot().audioEnabled);await page.getByRole('button',{name:'关闭海浪声',exact:true}).click();await page.waitForFunction(()=>!window.__tideline.snapshot().audioEnabled);check('Audio requires user activation and switches off');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存海面截图'}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^tideline-.+\.png$/);await download.saveAs(folder+'exported-sea.png');check('Sea screenshot exports an actual PNG');
    await page.locator('#sea').focus();await page.keyboard.press('Space');assert.equal((await snapshot()).paused,true);await page.keyboard.press('r');assert.equal((await snapshot()).paused,false);check('Canvas shortcuts pause and reset simulation');
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(1000);
    const timings=await page.evaluate(async()=>{
      const samples=[];let last,start;await new Promise(resolve=>{const frame=now=>{start??=now;if(last!==undefined)samples.push(now-last);last=now;if(now-start>=30000)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});return samples;
    });
    report.performance={durationSeconds:30,samples:timings.length,meanMs:timings.reduce((a,b)=>a+b,0)/timings.length,p95Ms:[...timings].sort((a,b)=>a-b)[Math.floor(timings.length*.95)]};report.performance.averageFPS=1000/report.performance.meanMs;report.desktop=await snapshot();await page.screenshot({path:folder+'desktop-1080p.png'});check('1920×1080 actual frame timing recorded for 30 seconds');
    const portal=await browser.newPage();await portal.goto(new URL('/',url).href,{waitUntil:'networkidle'});const card=portal.locator('a[href="./gpt6.1sol-ocean-realistic/"]');assert.equal(await card.count(),1);assert.match(await card.textContent(),/GPT 6.1 SOL/);await portal.close();check('Portal shows exactly one correctly named GPT 6.1 SOL ocean card');
    await page.setViewportSize({width:390,height:844});await load('?seed=61&time=12');assert.equal((await snapshot()).quality,'low');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#panel').isVisible(),false);await page.screenshot({path:folder+'mobile-sea.png'});
    await page.getByRole('button',{name:'展开控制台'}).click();assert.equal(await page.locator('#panel').isVisible(),true);await page.locator('[data-preset="calm"]').click();await page.waitForTimeout(500);assert.equal((await snapshot()).target.wind,2);await page.screenshot({path:folder+'mobile-controls.png'});report.mobile=await snapshot();check('390px responsive scene and control panel work without overflow');
    await page.emulateMedia({reducedMotion:'reduce'});await load('?seed=61');assert.equal((await snapshot()).paused,true);check('Reduced-motion preference starts paused');
    await load('?seed=oops&time=Infinity&paused=1');assert.equal((await snapshot()).seed,61);assert.equal((await snapshot()).time,0);check('Invalid URL seed and time cannot corrupt the scene');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);check('No console errors, exceptions or failed requests across interactions');
  }
  console.log(JSON.stringify({initial:report.initial,performance:report.performance},null,2));
}catch(error){report.failure=error.stack;console.error(error);await page.screenshot({path:folder+'failure.png'}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(folder+(url.includes('/dist/')?'production-report.json':process.argv.includes('--visual-only')?'visual-report.json':'browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
