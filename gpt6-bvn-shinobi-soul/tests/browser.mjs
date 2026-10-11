import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url=process.env.GAME_URL||'http://127.0.0.1:3000/gpt6-bvn-shinobi-soul/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.__bench);await page.clock.install();
  const tick=ms=>page.clock.runFor(ms),state=()=>page.evaluate(()=>window.__bench.getState());
  const key=async(k,ms=60)=>{await page.keyboard.down(k);await tick(ms);await page.keyboard.up(k);};
  check('eight character cards',await page.locator('.fighter-card').count()===8);
  const ids=await page.locator('.fighter-card').evaluateAll(els=>els.map(e=>e.dataset.id));
  for(const id of ids){await page.locator(`[data-id="${id}"]`).click();check(`${id} selection`,(await state()).selection.p1===id);}
  await page.locator('[data-id="naruto"]').click();await tick(50);await page.screenshot({path:path.join(root,'docs/selection.png'),fullPage:true});
  await page.selectOption('#mode','training');await page.click('#start');await tick(2100);check('start reaches fight',(await state()).battle.phase==='fight');
  const x=(await state()).battle.fighters[0].x;await key('d',600);check('keyboard moves fighter',(await state()).battle.fighters[0].x>x+130);
  await key('k',30);await tick(110);check('jump gets airborne',(await state()).battle.fighters[0].y>25);await key('k',20);await tick(100);check('double jump gains height',(await state()).battle.fighters[0].y>120);await tick(1500);
  await key('u');await tick(450);check('Naruto skill hits target',(await state()).battle.fighters[1].hp<1000);
  await key('j');await tick(320);await key('j');await tick(320);check('normal attacks register hits',(await state()).battle.fighters[0].stats.hits>=2);
  await key('i',20);check('ultimate opens cut-in',!!(await state()).battle.cutin);await page.screenshot({path:path.join(root,'docs/ultimate.png')});await tick(1600);
  await page.click('#pause');check('pause overlay visible',(await state()).paused);const pausedState=(await state()).battle;await tick(1000);check('pause freezes simulation',JSON.stringify((await state()).battle)===JSON.stringify(pausedState));await page.click('#continue');check('resume works',!(await state()).paused);
  await page.check('#hitboxes');await page.selectOption('#dummy','block');await tick(100);check('training block dummy',(await state()).battle.fighters[1].state==='block');await page.click('#restore');check('training restores hp',(await state()).battle.fighters.every(f=>f.hp===f.maxHp));await page.uncheck('#hitboxes');
  await page.click('#sound');check('sound toggle',await page.locator('#sound').textContent()==='音效 ON');await key('j');await tick(100);
  await page.screenshot({path:path.join(root,'docs/battle.png')});
  for(const id of ids.slice(1)){await page.click('#back');await page.locator(`[data-id="${id}"]`).click();await page.click('#start');await tick(2000);await key('d',1400);await key('u');await tick(1000);check(`${id} playable skill damages opponent`,(await state()).battle.fighters[1].hp<1000);await key('i',20);check(`${id} ultimate rendered`,(await state()).battle.cutin?.id===id);await tick(1300);}
  await page.click('#back');await page.locator('[data-id="naruto"]').click();await page.selectOption('#mode','local');await page.selectOption('#stage','seireitei');await page.click('#start');await tick(2100);const p2x=(await state()).battle.fighters[1].x;await key('ArrowLeft',400);check('2P independent arrow movement',(await state()).battle.fighters[1].x<p2x-80);await key('2',60);await tick(80);check('2P number key jump',(await state()).battle.fighters[1].y>20);
  await page.click('#help');check('help pauses battle',(await state()).paused);await page.click('#close-help');await tick(50);check('closing help restores battle',!(await state()).paused);
  await page.click('#restart');check('restart resets round',(await state()).battle.round===1&&(await state()).battle.phase==='intro');
  await page.click('#back');await page.selectOption('#mode','watch');await page.locator('#difficulty [data-value="hard"]').click();await page.selectOption('#stage','leaf');await page.click('#start');await tick(5000);check('CPU moves in watch mode',(await state()).battle.fighters.some((f,i)=>f.stats.hits>0||Math.abs(f.x-(i?910:370))>10));
  // Advance the browser's clock through a whole match; gameplay still runs via RAF and real engine code.
  for(let i=0;i<32&&(await state()).battle.phase!=='finished';i++)await tick(10000);
  check('watch match reaches final result',(await state()).battle.phase==='finished');check('result overlay is actionable',await page.locator('#game-overlay').isVisible());await page.click('#continue');check('rematch returns to round one',(await state()).battle.phase==='intro');
  await page.click('#back');check('desktop no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url);await mobile.waitForFunction(()=>window.__bench);await mobile.screenshot({path:path.join(root,'docs/mobile-selection.png'),fullPage:true});check('mobile no horizontal overflow',await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.selectOption('#mode','training');await mobile.click('#start');await mobile.waitForTimeout(2200);const bounds=await mobile.locator('.touch-controls').boundingBox();check('mobile touch controls visible without scrolling',bounds.y+bounds.height<844);await mobile.locator('[data-key="KeyK"]').tap();
  await mobile.screenshot({path:path.join(root,'docs/mobile-battle.png')});
  check('no browser errors',errors.length===0);fs.writeFileSync(path.join(root,'docs/browser-results.json'),JSON.stringify({url,date:'2026-10-11',browser:await browser.version(),checks,errors},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,errors},null,2));
}finally{await browser.close();}
