import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../tmp/v2/',import.meta.url));fs.mkdirSync(output,{recursive:true});
const url=process.env.GAME_URL||'http://localhost:3065/';
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.__bench);await p.clock.install();
  const tick=ms=>p.clock.runFor(ms),state=()=>p.evaluate(()=>window.__bench.getState());
  const key=async(k,ms=30)=>{await p.keyboard.down(k);await tick(ms);await p.keyboard.up(k);};
  check('all 22 original-sized generated assets loaded',(await state()).assets.ready&&(await state()).assets.loaded===22);
  await key('d');check('keyboard roster navigation',(await state()).selection.p1==='sasuke');await key('j');await key('d');check('keyboard confirms first player then selects second',(await state()).selection.p2==='rukia');
  await p.locator('.player-tabs [data-player="0"]').click();await p.locator('[data-id="naruto"]').click();await p.selectOption('#mode','training');await p.click('#start');await tick(2200);
  await p.keyboard.down('j');await p.keyboard.down('k');await tick(20);await p.keyboard.up('j');await p.keyboard.up('k');
  check('J+K opens transformation cut-in',(await state()).battle.cutin?.transform===true);await tick(1500);check('Naruto transforms without jumping',(await state()).battle.fighters[0].form===1&&(await state()).battle.fighters[0].y===0);
  await p.screenshot({path:output+'naruto-transformation.png'});await tick(17000);check('transformation persists beyond the old 15 second timer',(await state()).battle.fighters[0].form===1);
  await p.click('#back');await p.locator('[data-id="ichigo"]').click();await p.selectOption('#stage','seireitei');await p.click('#start');await tick(2200);
  await p.keyboard.down('j');await p.keyboard.down('k');await tick(20);await p.keyboard.up('j');await p.keyboard.up('k');await tick(1500);
  check('Ichigo Bankai is playable',(await state()).battle.fighters[0].form===1);await p.screenshot({path:output+'ichigo-bankai.png'});
  await p.click('#restart');await tick(2200);check('restart clears transformed form',(await state()).battle.fighters[0].form===0);
  await p.keyboard.down('s');await key('i');await p.keyboard.up('s');check('S+I triggers final ultimate instead of transformation',(await state()).battle.cutin?.name.startsWith('最终奥义')&&(await state()).battle.fighters[0].form===0);
  await tick(1500);await p.click('#back');await p.selectOption('#stage','valley');await p.click('#start');await tick(2200);await p.screenshot({path:output+'valley-battle.png'});
  check('no runtime errors',errors.length===0);
  fs.writeFileSync(output+'reconstruction-results.json',JSON.stringify({date:new Date().toISOString(),url,checks,errors},null,2));
}finally{await browser.close();}
