import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('../tmp/v3/',import.meta.url));fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://localhost:3065/';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.__bench?.getState().assets.ready);await p.clock.install();
  const tick=ms=>p.clock.runFor(ms),state=()=>p.evaluate(()=>window.__bench.getState());
  const key=async(k,ms=25)=>{await p.keyboard.down(k);await tick(ms);await p.keyboard.up(k);};
  await p.selectOption('#mode','local');await p.locator('.player-tabs [data-player="1"]').click();await p.locator('[data-id="naruto"]').click();
  const approach=async()=>{await p.keyboard.down('d');await p.keyboard.down('ArrowLeft');for(let i=0;i<20;i++){await tick(50);const fs=(await state()).battle.fighters;if(fs[1].x-fs[0].x<80)break;}await p.keyboard.up('d');await p.keyboard.up('ArrowLeft');await tick(17);};
  for(const attacker of [0,1]){
    await p.click('#start');await tick(2100);await approach();
    await key(attacker===0?'j':'1',17);for(let i=0;i<100&&(await state()).battle.fighters[attacker].attack?.frame<4;i++)await tick(1);
    assert.equal((await state()).battle.fighters[attacker].attack?.frame,4,'guard input must start on the last startup frame');
    const guard=attacker===0?'ArrowDown':'s';await p.keyboard.down(guard);for(let i=0;i<40&&!(await state()).battle.hitstop;i++)await tick(1);await p.keyboard.up(guard);
    const fs=(await state()).battle.fighters,d=fs[1-attacker];check(`${attacker===0?'2P':'1P'} guards on the attack active frame`,d.hp===1000&&d.stats.blocks===1&&d.state==='blockstun');
    await p.screenshot({path:out+`guard-player-${1-attacker}.png`});
    const next=attacker===0?'1':'j';await key(next,17);check('blockstun rejects immediate retaliation for player '+(1-attacker),(await state()).battle.fighters[1-attacker].attack===null);
    await p.click('#back');
  }
  await p.locator('.player-tabs [data-player="0"]').click();await p.selectOption('#mode','training');await p.click('#start');await tick(2100);
  await p.keyboard.down('a');await tick(200);check('left run faces left',(await state()).battle.fighters[0].face===-1);await p.screenshot({path:out+'run-left.png'});await p.keyboard.up('a');await tick(30);check('idle keeps left-facing',(await state()).battle.fighters[0].face===-1);
  await p.keyboard.down('d');await tick(200);check('right run faces right',(await state()).battle.fighters[0].face===1);await p.screenshot({path:out+'run-right.png'});await p.keyboard.up('d');
  for(let i=0;i<35;i++){const fs=(await state()).battle.fighters;if(fs[1].x-fs[0].x<75)break;await key('d',80);}
  await p.check('#hitboxes');await p.locator('#arena').focus();await key('j',17);for(let i=0;i<12&&!(await state()).battle.hitstop;i++)await tick(16.667);
  const impactFighters=(await state()).battle.fighters;check('actual J hits in the active phase and keeps ground victim grounded',impactFighters[0].attack?.phase==='active'&&impactFighters[1].hp<1000&&impactFighters[1].y===0);
  const frozen=JSON.stringify(impactFighters);await tick(17);check('impact freezes both combatants',JSON.stringify((await state()).battle.fighters)===frozen);await p.screenshot({path:out+'impact.png'});
  await key('u',17);await tick(200);check('buffered skill cancels a confirmed hit',(await state()).battle.fighters[0].attack?.kind==='skill');
  await tick(1000);await p.uncheck('#hitboxes');await p.click('#back');await p.selectOption('#mode','watch');await p.click('#start');await tick(5000);await p.screenshot({path:out+'watch.png'});
  check('no browser errors',errors.length===0);fs.writeFileSync(out+'timing-browser-results.json',JSON.stringify({date:new Date().toISOString(),url,checks,errors},null,2));
}finally{await browser.close();}
