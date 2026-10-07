import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {CARS} from '../src/catalog.js';
const pass=process.argv[2]||'blockout',painted=!['blockout','structural-pass','form-refinement'].includes(pass);
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:750},deviceScaleFactor:1});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:3059/review.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__READY__);
for(const car of CARS){
 const dir=path.join(root,'reconstruction',car.id,pass);fs.mkdirSync(dir,{recursive:true});
 for(const angle of ['reference','front','right','rear','left','top']){
   const info=await page.evaluate(({id,angle,painted})=>window.astraReview.show(id,angle,painted),{id:car.id,angle,painted});
   await page.locator('#label').evaluate(e=>e.style.display='none');
   await page.locator('canvas').screenshot({path:path.join(dir,angle+'.png')});
   fs.writeFileSync(path.join(dir,angle+'.json'),JSON.stringify({car:car.id,pass,angle,...info,errors},null,2));
 }
 console.log(car.id,pass);
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
