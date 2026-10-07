import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:3000/gpt6astra-mini4wd-aerial-racing/';
try{
 await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 const link=page.locator('a[href="./gpt6astra-mini4wd-aerial-racing/"]');
 assert.equal(await link.count(),1);assert.ok((await link.innerText()).includes('ASTRA'));
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.astra?.ready);
 const state=await page.evaluate(()=>({models:window.astra.models.length,images:[...document.querySelectorAll('.car-card img')].map(i=>i.naturalWidth),length:window.astra.course.length}));
 assert.equal(state.models,8);assert.ok(state.images.every(w=>w>0));assert.deepEqual(errors,[]);
 const result={url,date:new Date().toISOString(),portalEntry:true,nestedRoute:true,state,errors};
 fs.writeFileSync(path.resolve(import.meta.dirname,'../docs/qa/root-route.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
