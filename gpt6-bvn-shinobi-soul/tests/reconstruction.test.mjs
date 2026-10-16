import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,STAGE_PLATFORMS} from '../src/combat.js';
const fight=opts=>{const b=new Battle({mode:'local',...opts});b.phase='fight';return b;};
const tick=(b,n)=>{for(let i=0;i<n;i++)b.step();};

test('descending fighters land on each stage platform and S+K drops through',()=>{
  for(const [stage,platforms] of Object.entries(STAGE_PLATFORMS))for(const p of platforms){
    const b=fight({stage}),f=b.fighters[0];f.x=p.x+p.w/2;f.y=p.y+35;f.vy=-80;f.grounded=false;
    tick(b,30);assert.equal(f.y,p.y);assert.equal(f.grounded,true);assert.equal(f.airJumps,0);
    b.step([{jump:true,down:true},{}]);tick(b,60);assert.equal(f.y,0);assert.equal(f.grounded,true);
  }
});
test('three-bar ultimate does damage without becoming a transformation',()=>{
  const b=fight(),[f,o]=b.fighters;f.x=600;o.x=700;f.meter=300;
  b.step([{down:true,ultimate:true},{}]);assert.equal(f.meter,0);assert.equal(f.form,0);assert.equal(f.attack.cost,300);
  tick(b,160);assert.ok(o.hp<=580);assert.equal(f.form,0);
});
test('an input made during hitstop is retained and fires after it ends',()=>{
  const b=fight(),[f,o]=b.fighters;f.x=600;o.x=700;b.hitstop=.1;b.step([{skill:true},{}]);
  assert.equal(f.attack,null);tick(b,9);assert.equal(f.attack.kind,'skill');tick(b,30);assert.ok(o.hp<1000);assert.equal(f.stats.skills,1);
});
test('Naruto neutral U is a projectile and W+U is a close-range rush',()=>{
  const b=fight(),f=b.fighters[0],x=f.x;b.step([{skill:true},{}]);tick(b,8);assert.equal(f.x,x);assert.equal(b.projectiles[0].kind,'shuriken');
  const c=fight(),g=c.fighters[0];c.step([{skill:true,up:true},{}]);tick(c,14);assert.ok(g.x>x+100);assert.equal(c.projectiles.length,0);
});
test('Kakashi counter reverses one attack after the startup invulnerability',()=>{
  const b=fight({p1:'kakashi'}),[f,o]=b.fighters;f.x=600;o.x=690;b.step([{skill:true,down:true},{}]);tick(b,25);
  assert.ok(f.counterTime>0);assert.equal(f.invuln,0);const hp=f.hp;b.hit(o,f,100,0,'normal');assert.equal(f.hp,hp);assert.ok(o.hp<1000);assert.equal(f.counterTime,0);
});
test('assist emits the selected named partner and retains resource gating',()=>{
  for(const [assist,id] of [['heal','sakura'],['seal','rukia'],['shuriken','kakashi']]){const b=fight({assist});b.step([{assist:true},{}]);assert.ok(b.drainEvents().some(e=>e.type==='partner'&&e.id===id));b.step([{assist:true},{}]);assert.ok(!b.drainEvents().some(e=>e.type==='partner'));}
});
