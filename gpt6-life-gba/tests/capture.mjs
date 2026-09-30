import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initialState,SAVE_KEY} from '../src/model.js';
const out=fileURLToPath(new URL('../tmp/',import.meta.url));mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
try{
  for(const [name,scene,width,height]of [['home','home',1440,1120],['town','town',1440,1120],['mobile-home','home',390,844]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});const page=await context.newPage();const state=initialState();state.scene=scene;if(scene==='town')state.player={x:15.5,y:15.5,dir:'up'};
    await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:SAVE_KEY,value:JSON.stringify(state)});
    await page.goto('http://localhost:3000/gpt6-life-gba/');await page.waitForFunction(()=>window.__bench?.ready);await page.waitForTimeout(4400);
    await page.screenshot({path:out+name+'.png',fullPage:true});await page.locator('#game').screenshot({path:out+name+'-canvas.png'});console.log(`Captured ${name}`);await context.close();
  }
}finally{await browser.close();}
