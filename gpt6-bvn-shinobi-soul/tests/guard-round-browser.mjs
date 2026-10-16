import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('../tmp/v4/',import.meta.url));fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://localhost:3000/gpt6-bvn-shinobi-soul/';
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS',name);};
try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.waitForFunction(()=>window.__bench?.getState().assets.ready);await p.clock.install({time:new Date('2026-10-13T12:00:00Z')});await p.clock.pauseAt(new Date('2026-10-13T12:00:01Z'));
  const tick=ms=>p.clock.runFor(ms),state=()=>p.evaluate(()=>window.__bench.getState());
  const key=async(k,ms)=>{await p.keyboard.down(k);await tick(ms);await p.keyboard.up(k);};
  await p.selectOption('#mode','local');await p.locator('.player-tabs [data-player="1"]').click();await p.locator('[data-id="naruto"]').click();await p.click('#start');await tick(2100);
  await p.keyboard.down('d');await p.keyboard.down('ArrowLeft');for(let i=0;i<30;i++){await tick(30);const f=(await state()).battle.fighters;if(f[1].x-f[0].x<65)break;}await p.keyboard.up('d');await p.keyboard.up('ArrowLeft');
  await key('a',34);check('retreat faces away',(await state()).battle.fighters[0].face===-1);
  await p.keyboard.down('s');await tick(34);let f=(await state()).battle.fighters;check('S enters visible guard facing the opponent',f[0].state==='block'&&f[0].face===1);
  await p.screenshot({path:out+'guard-ready.png'});await key('1',170);f=(await state()).battle.fighters;assert.ok(f[0].hp===1000&&f[0].stats.blocks===1,JSON.stringify(f));check('guard after retreat blocks a real keyboard attack',true);await p.screenshot({path:out+'guard-hit.png'});await p.keyboard.up('s');
  await p.click('#back');await p.selectOption('#mode','training');await p.click('#start');await tick(2100);
  await p.selectOption('#dummy','block');await p.keyboard.down('s');await tick(34);check('training dropdown returns keyboard control to the arena',(await state()).battle.fighters[0].state==='block');await p.keyboard.up('s');
  await p.uncheck('#infinite');await p.keyboard.down('s');await tick(34);check('training checkbox does not swallow S',(await state()).battle.fighters[0].state==='block');await p.keyboard.up('s');
  await p.click('#back');await p.selectOption('#mode','watch');await p.click('#start');await tick(2100);
  for(let i=0;i<110&&(await state()).battle.phase!=='roundover';i++)await tick(2000);
  check('a real CPU round reaches its own presentation',(await state()).battle.phase==='roundover');
  await tick(400);await p.screenshot({path:out+'round-winner-live.png'});
  await tick(4000);check('round presentation advances to the next round',(await state()).battle.round===2);
  // Isolated renderer fixtures exercise every portrait and the draw path without mutating the game.
  await p.evaluate(async()=>{const base=new URL('.',location.href);const [{Battle,ROSTER},{Renderer},{loadAssets}]=await Promise.all([import(new URL('src/combat.js',base)),import(new URL('src/art.js',base)),import(new URL('src/assets.js',base))]);await loadAssets();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.id='render-fixture';document.body.replaceChildren(canvas);window.fixture={Battle,ROSTER,renderer:new Renderer(canvas)};});
  for(const id of ['naruto','sasuke','sakura','kakashi','ichigo','rukia','byakuya','renji','draw']){
    const result=await p.evaluate(id=>{const {Battle,renderer}=window.fixture,b=new Battle({mode:'local',p1:id==='draw'?'naruto':id,p2:'ichigo'});b.phase='fight';b.fighters[1].hp=0;if(id==='draw')b.fighters[0].hp=0;b.endRound();b.phaseTimer=2;const texts=[],c=renderer.c,fill=c.fillText.bind(c);c.fillText=(s,...args)=>{texts.push(s);fill(s,...args);};renderer.draw(b,0);c.fillText=fill;return texts;},id);
    check(id+' result renders its title and score',result.includes('0  :  0')||result.includes('1  :  0'));
    if(['naruto','ichigo','draw'].includes(id))await p.locator('#render-fixture').screenshot({path:out+`round-${id}.png`});
  }
  check('no page errors',errors.length===0);fs.writeFileSync(out+'browser-results.json',JSON.stringify({date:new Date().toISOString(),url,checks,errors},null,2));
}finally{await browser.close();}
