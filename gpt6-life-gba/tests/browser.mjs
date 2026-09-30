import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initialState,SAVE_KEY} from '../src/model.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=root+'tmp/';mkdirSync(output,{recursive:true});
const fallback='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:fallback}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url=process.env.POCKET_DAYS_URL||'http://localhost:3000/gpt6-life-gba/';
const get=()=>page.evaluate(()=>window.__bench.getState());
const pass=label=>{checks.push(label);console.log('PASS '+label);};
async function clickObject(x,y){const b=await page.locator('#game').boundingBox();await page.mouse.click(b.x+x/30*b.width,b.y+y/20*b.height);await page.waitForFunction(()=>window.__bench.getState().modal==='interaction',{},{timeout:18000});}
async function finish(label){await page.getByRole('button',{name:new RegExp(label)}).click();await page.waitForFunction(()=>window.__bench.getState().activeAction===null,{},{timeout:12000});}
async function freeze(){if(!(await get()).paused)await page.locator('#pause-button').click();}
try{
  const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForFunction(()=>window.__bench?.ready);
  await page.screenshot({path:output+'desktop-home.png',fullPage:true});await freeze();console.log('SCREENSHOT '+output+'desktop-home.png');
  const before=await get();await page.waitForTimeout(400);assert.equal((await get()).time,before.time);pass('pause freezes game time');
  await page.locator('#resume-button').click();const start=(await get()).player;await page.locator('#game').focus();await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');assert.ok((await get()).player.x>start.x+.4);pass('keyboard movement changes character position');
  await page.locator('[data-speed="3"]').click();assert.equal((await get()).speed,3);
  await clickObject(13.5,4.7);const frozen=(await get()).time;await page.waitForTimeout(300);assert.equal((await get()).time,frozen);pass('click-to-walk reaches furniture and menus pause simulation');
  await finish('做一份三明治');assert.equal((await get()).money,518);assert.ok((await get()).wishes.includes('eat'));assert.ok((await get()).needs.hunger>95);pass('meal applies cost, need restoration and first wish reward');
  await clickObject(15.7,4.2);await page.getByRole('button',{name:/煮一碗番茄意面/}).click();const cash=(await get()).money;await page.keyboard.press('Escape');assert.equal((await get()).activeAction,null);assert.equal((await get()).money,cash);pass('cancelling an action does not charge money');
  await clickObject(22.5,4.7);await finish('洗个热水澡');assert.ok((await get()).needs.hygiene>95);await clickObject(24.5,4.7);await finish('上厕所');assert.ok((await get()).needs.bladder>95);pass('bathroom routes and both bathroom actions work');
  await page.locator('[data-wish="chat"]').click();await page.waitForFunction(()=>window.__bench.getState().modal==='interaction',{},{timeout:18000});await finish('聊聊小镇的日常');assert.equal((await get()).scene,'town');assert.equal((await get()).friendship,15);assert.ok((await get()).wishes.includes('chat'));pass('travel, neighbor interaction and friendship progression work');
  await page.screenshot({path:output+'desktop-town.png',fullPage:true});
  await page.locator('[data-wish="work"]').click();await page.waitForFunction(()=>window.__bench.getState().modal==='interaction',{},{timeout:18000});const workStart=await get();await finish('做半天咖啡店兼职');assert.equal((await get()).money,workStart.money+210);assert.equal((await get()).wishes.length,3);pass('cafe work earns money and completes all three wishes');
  await page.locator('#shop-tab').click();const shopStart=await get();await page.getByRole('button',{name:/一盆小绿意/}).click();assert.equal((await get()).money,shopStart.money-80);assert.ok((await get()).upgrades.includes('plant'));assert.ok(await page.getByRole('button',{name:/一盆小绿意/}).isDisabled());await page.screenshot({path:output+'shop.png',fullPage:true});await page.locator('#close-dialog').click();pass('furniture purchases charge once and disable duplicate purchases');
  await page.locator('#save-button').click();const saved=await get();await page.reload();await page.waitForFunction(()=>window.__bench?.ready);const restored=await get();assert.equal(restored.money,saved.money);assert.equal(restored.friendship,saved.friendship);assert.deepEqual(restored.upgrades,saved.upgrades);assert.deepEqual(restored.wishes,saved.wishes);pass('reload restores money, friendship, upgrades and goals');
  await page.locator('#map-tab').click();await page.getByRole('button',{name:/梧桐巷 · 我的小屋/}).click();assert.equal((await get()).scene,'home');await page.locator('[data-speed="3"]').click();await clickObject(6.5,6.5);await finish('一觉睡到明天');assert.equal((await get()).day,saved.day+1);assert.ok((await get()).time>=420&&(await get()).time<425);assert.ok((await get()).needs.energy>99);pass('sleep advances to next day at 07:00 and restores energy');
  await page.locator('#diary-button').click();assert.ok((await page.locator('#dialog-body').textContent()).includes('做半天咖啡店兼职'));await page.keyboard.press('Escape');pass('journal retains actual life events');
  await page.locator('#sound-button').click();assert.equal(await page.locator('#sound-button').getAttribute('aria-label'),'关闭游戏音乐');await page.locator('#sound-button').click();pass('audio toggles on and off without runtime errors');
  // Use the actual doorway in each direction, independently of map fast travel.
  const homeBox=await page.locator('#game').boundingBox();await page.mouse.click(homeBox.x+15/30*homeBox.width,homeBox.y+16.3/20*homeBox.height);await page.waitForFunction(()=>window.__bench.getState().scene==='town',{},{timeout:18000});
  const townBox=await page.locator('#game').boundingBox();await page.mouse.click(townBox.x+15/30*townBox.width,townBox.y+18.3/20*townBox.height);await page.waitForFunction(()=>window.__bench.getState().scene==='home',{},{timeout:18000});pass('physical doorway and return sign connect both scenes');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('.mobile-controls').isVisible());const controls=await page.locator('.mobile-controls').boundingBox(),side=await page.locator('.sidebar').boundingBox();assert.ok(controls.y<side.y);assert.ok(await page.locator('#mobile-money').isVisible());pass('390px mobile layout fits viewport and puts controls before the sidebar');
  const mobilePos=(await get()).player;
  const up=await page.locator('[data-key="ArrowUp"]').boundingBox();await page.mouse.move(up.x+up.width/2,up.y+up.height/2);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.up();assert.ok((await get()).player.y<mobilePos.y-.3);pass('on-screen direction control moves the character while held');
  await page.locator('#help-button').click();await page.getByRole('button',{name:'重新开始生活',exact:true}).click();await page.getByRole('button',{name:/保留现在的生活/}).click();assert.equal((await get()).money,saved.money);pass('reset requires explicit confirmation and can be cancelled');
  // A fresh isolated save fixture exercises the exhausted/zero bladder consequences.
  const low=initialState();low.needs.energy=0;low.needs.bladder=0;await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:SAVE_KEY,value:JSON.stringify(low)});
  // Navigation pagehide saves the live state, so load the fixture through an init script.
  await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:SAVE_KEY,value:JSON.stringify(low)});await page.reload();await page.waitForFunction(()=>window.__bench?.ready);await page.waitForFunction(()=>window.__bench.getState().activeAction!==null);await page.locator('[data-speed="3"]').click();await page.waitForFunction(()=>window.__bench.getState().activeAction===null,{},{timeout:10000});await page.waitForTimeout(150);const recovered=await get();assert.ok(recovered.needs.energy>40);assert.ok(recovered.needs.bladder>50);assert.ok(recovered.needs.hygiene<60);pass('zero energy and bladder trigger recovery and hygiene consequences');
  assert.deepEqual(errors,[]);pass('no browser console errors or uncaught exceptions');
  writeFileSync(output+'browser-results.json',JSON.stringify({url,checks,errors},null,2));console.log(`Completed ${checks.length} browser checks.`);
}catch(error){await page.screenshot({path:output+'failure.png',fullPage:true}).catch(()=>{});console.error('FAILED',error);console.error('STATE',await get().catch(()=>null));console.error('ERRORS',errors);process.exitCode=1;}
finally{await browser.close();}
