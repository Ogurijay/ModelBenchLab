import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,HOME_OBJECTS,TOWN_OBJECTS,pathToObject,pathTo,isBlocked,advance,actionsFor,completeAction,actionError,buyUpgrade,readSave,mood} from '../src/model.js';

for(const [scene,objects,start] of [['home',HOME_OBJECTS,{x:14.5,y:12.5}],['town',TOWN_OBJECTS,{x:15.5,y:16.5}]]){
  for(const o of objects.filter(o=>!o.decor))test(`${scene}: ${o.id} is reachable without crossing walls or furniture`,()=>{
    const route=pathToObject(scene,start,o);assert.notEqual(route,null);
    let previous=start;
    for(const p of route){assert.equal(isBlocked(scene,p.x,p.y),false);assert.ok(Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y)<=1.001);previous=p;}
  });
}
test('a closed wall cannot be a destination',()=>assert.equal(pathTo('home',{x:14.5,y:12.5},{x:3,y:3}),null));
test('eating charges exactly once and rewards the first wish only once',()=>{const s=initialState();const a=actionsFor(s,'fridge')[0];completeAction(s,a);assert.equal(s.money,518);assert.equal(s.needs.hunger,100);assert.deepEqual(s.wishes,['eat']);completeAction(s,a);assert.equal(s.money,506);assert.deepEqual(s.wishes,['eat']);});
test('failed actions do not mutate state and free food keeps a bankrupt player viable',()=>{const s=initialState();s.money=0;const before=JSON.stringify(s);assert.match(completeAction(s,actionsFor(s,'fridge')[0]).error,/零钱/);assert.equal(JSON.stringify(s),before);assert.equal(actionError(s,actionsFor(s,'fridge')[1]),null);});
test('work has opening hours, energy gate, daily limit and refreshed next day',()=>{const s=initialState();const work=actionsFor(s,'cafe')[0];s.time=470;assert.match(actionError(s,work),/08:00/);s.time=1000;assert.match(actionError(s,work),/08:00/);s.time=480;s.needs.energy=10;assert.match(actionError(s,work),/精力/);s.needs.energy=88;completeAction(s,work);assert.equal(s.money,710);assert.match(actionError(s,work),/今天/);advance(s,1440);s.time=480;s.needs.energy=80;assert.equal(actionError(s,work),null);});
test('garden refreshes daily and fishing is rate limited',()=>{const s=initialState(),garden=actionsFor(s,'flowers')[0];completeAction(s,garden);assert.match(actionError(s,garden),/今天/);const fish=actionsFor(s,'pond')[0];completeAction(s,fish);assert.match(actionError(s,fish),/鱼儿/);advance(s,60);assert.equal(actionError(s,fish),null);});
test('sleep reaches the next morning with full energy',()=>{const s=initialState();s.time=1380;completeAction(s,actionsFor(s,'bed')[1]);assert.equal(s.day,2);assert.equal(s.time,420);assert.equal(s.needs.energy,100);});
test('purchases are unique, charged correctly, and change actual simulation effects',()=>{const s=initialState();assert.deepEqual(buyUpgrade(s,'bed'),{ok:true});assert.equal(s.money,260);assert.equal(actionsFor(s,'bed')[0].effect.energy,80);assert.ok(buyUpgrade(s,'bed').error);assert.equal(s.money,260);const base=initialState(),improved=initialState();buyUpgrade(improved,'rug');improved.needs.fun=base.needs.fun;advance(base,100);advance(improved,100);assert.ok(improved.needs.fun>base.needs.fun);});
test('all six needs stay finite and bounded across many days',()=>{const s=initialState();advance(s,14400);assert.equal(s.day,11);assert.ok(Object.values(s.needs).every(n=>n>=0&&n<=100));assert.ok(Number.isFinite(mood(s)));});
test('full save round-trip preserves progress and sanitizes optional fields',()=>{const s=initialState();completeAction(s,actionsFor(s,'neighbor')[0]);buyUpgrade(s,'plant');assert.deepEqual(readSave(JSON.stringify(s)),s);s.upgrades.push('unknown','plant');s.journal.unshift({text:'bad',day:-1,time:0});const restored=readSave(JSON.stringify(s));assert.deepEqual(restored.upgrades,['plant']);assert.ok(restored.journal.every(j=>j.day>0));});
test('malformed saves and nonfinite/out-of-range numbers cannot poison the game',()=>{for(const raw of ['null','undefined','{bad','{}','[]'])assert.equal(readSave(raw),null);for(const alter of [s=>s.needs.energy=null,s=>s.time=1440,s=>s.day=1.4,s=>s.money=-1,s=>s.player.x=500,s=>s.scene='bad']){const s=initialState();alter(s);assert.equal(readSave(JSON.stringify(s)),null);}});
test('a saved position inside furniture recovers to an open floor tile',()=>{const s=initialState();s.player={x:5.5,y:5.5,dir:'down'};const restored=readSave(JSON.stringify(s));assert.equal(isBlocked(restored.scene,restored.player.x,restored.player.y),false);});
