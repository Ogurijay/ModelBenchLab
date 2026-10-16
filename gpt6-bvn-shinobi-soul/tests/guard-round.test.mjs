import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,ROSTER,DT,hurtBox} from '../src/combat.js';
const make=(id='naruto')=>{const b=new Battle({mode:'local',p1:id,p2:id});b.phase='fight';b.fighters[0].x=500;b.fighters[1].x=575;return b;};
test('guard entered after retreat faces the opponent and blocks for either player',()=>{
  for(const {id} of ROSTER)for(const i of [0,1]){const b=make(id),f=b.fighters[i],o=b.fighters[1-i],input=[{},{}];input[i]=i?{right:true}:{left:true};b.step(input);assert.equal(f.face,i?1:-1);input[i]={down:true};b.step(input);assert.equal(f.state,'block');assert.equal(f.face,i?-1:1);b.hit(o,f,40,0,'normal');assert.equal(f.hp,1000);assert.equal(f.stats.blocks,1);}
});
test('held guard locks facing when the opponent crosses behind',()=>{const b=make(),[f,o]=b.fighters;b.step([{down:true},{}]);o.x=425;b.step([{down:true},{}]);assert.equal(f.face,1);b.hit(o,f,40,0,'normal');assert.ok(f.hp<1000);});
test('holding guard through blockstun does not automatically cover a cross-up',()=>{const b=make(),[f,o]=b.fighters;b.step([{down:true},{}]);b.hit(o,f,40,0,'normal');o.x=425;for(let i=0;i<25;i++)b.step([{down:true},{}]);assert.equal(f.state,'block');assert.equal(f.face,1);b.hit(o,f,40,0,'normal');assert.ok(f.hp<1000);});
test('holding guard returns to guard as soon as hitstun ends',()=>{const b=make(),[f,o]=b.fighters;b.hit(o,f,40,0,'normal');for(let i=0;i<40;i++)b.step([{down:true},{}]);assert.equal(f.state,'block');assert.equal(f.face,1);});
test('round result has a winner presentation before round two and final result',()=>{const b=make();for(let n=1;n<=2;n++){b.phase='fight';b.fighters[1].hp=0;b.endRound();assert.equal(b.phase,'roundover');assert.ok(b.phaseTimer>=3);for(let i=0;i<150;i++)b.step();assert.equal(b.phase,'roundover');for(let i=0;i<60;i++)b.step();assert.equal(b.phase,n===1?'intro':'finished');assert.equal(b.wins[0],n);}});
test('smaller fighters have matching shorter and narrower hurt boxes',()=>{const b=make(),box=hurtBox(b.fighters[0]);assert.ok(box.h<=108);assert.ok(box.w<=40);});
