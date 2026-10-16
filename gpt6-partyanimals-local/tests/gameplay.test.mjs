import test from 'node:test';
import assert from 'node:assert/strict';
import {initPhysics,Arena} from '../src/simulation.js';
import {KartRace} from '../src/kart.js';
import {PawsGame,Fishing} from '../src/activities.js';
import {Profile,STORAGE_KEY} from '../src/profile.js';
import {MAPS,MODES,PERKS,EMPTY_INPUT,FISH} from '../src/catalog.js';
await initPhysics();
const step=(s,n=60)=>{for(let i=0;i<n;i++)s.tick(1/60);};
const practice=()=>{const s=new Arena({mode:'training',map:'gym',localPlayers:1,seed:9});step(s,220);return s;};
const place=(s,a,x,z=0,y=1.1)=>{s.teleport(a,{x,y,z});a.invulnerable=0;};

test('jointed actors stand, walk, jump, consume and recover stamina without a second airborne jump',()=>{
 const s=practice(),a=s.actors[0];try{
  assert.equal(a.bodies.length,6);assert.equal(a.joints.length,5);assert.ok(Math.abs(a.body.translation().y-1.1)<.2);
  s.setInput(0,{x:1,run:true});step(s,20);assert.ok(a.body.translation().x>-.6);assert.ok(a.stamina<100);
  s.setInput(0,{jump:true});step(s,10);const up=a.body.translation().y;assert.ok(up>1.5);
  s.setInput(0,{});step(s,1);s.setInput(0,{jump:true});step(s,10);assert.ok(a.body.translation().y<4);
  s.setInput(0,{});step(s,180);assert.ok(a.stamina>95);
 }finally{s.dispose();}
});

test('walking and running keep the conscious head upright while the neck remains a physical joint',()=>{
 const s=practice(),a=s.actors[0];try{
  place(s,a,0,3);place(s,s.actors[1],-5,-4);
  for(const input of[{x:1},{x:-1,run:true}]){s.setInput(0,input);step(s,55);const q=a.bodies[1].rotation(),up=1-2*(q.x*q.x+q.z*q.z);assert.ok(up>Math.cos(12*Math.PI/180),`head tipped ${Math.acos(up)*180/Math.PI} degrees`);}
  s.hurt(a,120,3,{x:1,z:0},1);assert.ok(a.stun>0);assert.ok(a.joints[0].isValid());
 }finally{s.dispose();}
});

test('combat knocks out, holding attack does not auto-repeat, recovery and team protection work',()=>{
 const s=practice(),[a,b]=s.actors;try{
  place(s,a,-.6);place(s,b,.6);a.yaw=Math.PI/2;s.setInput(0,{punch:true});step(s,1);const hits=a.stats.hits;assert.equal(hits,1);step(s,45);assert.equal(a.stats.hits,hits);
  place(s,a,-.6);place(s,b,.6);a.cooldown=0;s.hurt(b,120,2,{x:1,z:0},0);assert.ok(b.stun>0);assert.equal(b.conscious,0);
  step(s,400);assert.ok(b.stun<=0);assert.ok(b.conscious>0);
  b.team=a.team;place(s,a,-.6);place(s,b,.6);a.cooldown=0;const before=b.conscious;s.attack(a,'punch');assert.equal(b.conscious,before);
 }finally{s.dispose();}
});

test('grabbing creates a live constraint; throwing releases it and propels the opponent',()=>{
 const s=practice(),[a,b]=s.actors;try{
  place(s,a,-.6);place(s,b,.6);a.yaw=Math.PI/2;b.stun=5;s.setInput(0,{grab:true});step(s,1);assert.equal(a.grab?.target,b);assert.ok(a.grab.joint.isValid());
  s.setInput(0,{grab:true,throw:true});step(s,1);assert.equal(a.grab,null);assert.equal(a.stats.throws,1);assert.ok(b.body.linvel().x>8);assert.ok(s.training.done.includes('throw'));
 }finally{s.dispose();}
});

test('jumping while holding a weapon preserves the grip; a training reset clears it',()=>{
 const s=practice(),a=s.actors[0];try{place(s,s.actors[1],5,3);const p=a.body.translation(),item=s.addItem('pan',p.x,p.z+.5,1);s.setInput(0,{grab:true});step(s,1);assert.equal(a.grab?.item,item);s.setInput(0,{grab:true,jump:true});step(s,1);assert.equal(a.grab?.item,item);s.revive(a);assert.equal(a.grab,null);assert.equal(item.owner,null);}finally{s.dispose();}
});

test('ledge grab supports climbing back up',()=>{
 const s=practice(),a=s.actors[0];try{
  place(s,a,-7.3,0,.1);s.tryGrab(a);assert.equal(a.grab?.ledge,true);
  s.setInput(0,{grab:true,jump:true});step(s,1);assert.equal(a.grab,null);assert.ok(a.body.linvel().y>4);assert.ok(s.events.some(e=>e.type==='climb'));
 }finally{s.dispose();}
});

test('ranged weapons spend ammunition, hit a target and frozen targets recover',()=>{
 const s=practice(),[a,b]=s.actors;try{
  place(s,a,0);place(s,b,0,4);a.yaw=0;
  const gun=s.addItem('freeze',0,.5,1);s.tryGrab(a);assert.equal(a.grab?.item,gun);s.setInput(0,{grab:true,punch:true});step(s,16);assert.equal(gun.ammo,7);assert.ok(b.frozen>0);assert.ok(b.conscious<100);
  s.setInput(0,{});step(s,300);assert.equal(b.frozen,0);
 }finally{s.dispose();}
});

test('bombs detonate, consume their rigid body and damage nearby opponents',()=>{
 const s=practice(),[a,b]=s.actors;try{place(s,b,1);const bomb=s.addItem('bomb',1,0,1);bomb.fuse=.02;step(s,3);assert.equal(bomb.alive,false);assert.ok(b.conscious<100);assert.ok(s.events.some(e=>e.type==='explosion'));}finally{s.dispose();}
});

test('goal rules distinguish carried football and elevated released basketball',()=>{
 for(const [map,kind]of[['soccer','ball'],['hockey','puck'],['football','football'],['basket','basketball']]){
  const s=new Arena({mode:'score',map,count:2,localPlayers:2,target:1});try{
   s.phase='playing';const ball=s.items.find(i=>i.kind===kind);ball.body.setTranslation({x:s.map.w/2-.6,y:map==='basket'?3.2:.6,z:0},true);
   if(map==='football'){s.updateObjective(0);assert.deepEqual(s.teamScore,[0,0]);ball.owner=0;}
   if(map==='basket'){ball.owner=0;s.updateObjective(0);assert.deepEqual(s.teamScore,[0,0]);ball.owner=null;}
   s.updateObjective(0);assert.equal(s.teamScore[0],1,map);s.updateObjective(0);assert.equal(s.teamScore[0],1,'one ball cannot score twice');
  }finally{s.dispose();}
 }
});

test('SMASH waits for every local player and preserves their selected perks across rounds',()=>{
 const s=new Arena({mode:'smash',map:'ring',localPlayers:2,count:4,target:3});try{
  assert.equal(s.phase,'draft');assert.equal(s.choosePerk(0,'strong'),true);assert.equal(s.phase,'draft');assert.equal(s.choosePerk(0,'speed'),false);s.choosePerk(1,'jump');assert.equal(s.phase,'countdown');assert.equal(s.actors[2].perks.length,1);
  s.finishRound(0,'test');s.nextRound();assert.equal(s.phase,'draft');assert.ok(s.actors[0].perks.includes('strong'));assert.ok(s.actors[1].perks.includes('jump'));
 }finally{s.dispose();}
});

test('Crisis sabotage requires repair and fails the crew on expiry',()=>{
 const s=new Arena({mode:'crisis',map:'station',localPlayers:1,count:6,role:'saboteur'});try{
  s.phase='playing';const a=s.actors[0],terminal=s.layout.nodes[0];place(s,a,terminal.x,terminal.z);s.interact(a,1/60,true);assert.equal(s.sabotage,35);
  s.updateObjective(36);assert.equal(s.phase,'finished');assert.equal(s.winner,1);assert.equal(s.reason,'紧急维修超时');
 }finally{s.dispose();}
 const repaired=new Arena({mode:'crisis',map:'station',localPlayers:1,count:6,role:'crew'});try{
  repaired.phase='playing';repaired.sabotage=20;const node=repaired.layout.nodes[0];place(repaired,repaired.actors[0],node.x,node.z);
  for(let i=0;i<6;i++)repaired.interact(repaired.actors[0],1,false);assert.equal(repaired.sabotage,0);assert.notEqual(repaired.phase,'finished');
 }finally{repaired.dispose();}
});

test('dead spectators cannot cast a vote for a living character',()=>{
 const s=new Arena({mode:'crisis',map:'station',count:6,localPlayers:1,role:'crew'});try{
  s.phase='playing';s.time=20;s.actors[0].alive=false;s.callMeeting(s.actors[2]);assert.equal(s.phase,'meeting');s.vote(0,1);assert.equal(s.phase,'meeting');assert.equal(s.meeting.votes[0],undefined);s.vote(-1,-1);assert.equal(s.meeting.votes[0],undefined);assert.notEqual(s.phase,'meeting');
 }finally{s.dispose();}
});

test('all 33 maps simulate without invalid transforms; competitive CPU matches reach a result',()=>{
 for(const map of MAPS.filter(m=>m.kind!=='kart')){
  const mode=MODES.find(m=>m.maps.includes(map.id)).id,s=new Arena({mode,map:map.id,localPlayers:0,count:6,teams:2,target:1,roundTime:60,seed:42});try{
   const limit=['cabin','training'].includes(mode)?60*30:60*220;
   for(let n=0;n<limit;n++){s.tick();if(s.phase==='meeting')s.vote(s.actors.find(a=>a.alive).id,-1);if(['roundEnd','finished'].includes(s.phase))break;}
   for(const a of s.actors)assert.ok(Object.values(a.body.translation()).every(Number.isFinite),`${map.id}: invalid actor`);
   if(!['cabin','training'].includes(mode))assert.ok(['finished','roundEnd'].includes(s.phase),`${map.id}: unfinished at ${s.time}s`);
  }finally{s.dispose();}
 }
});

test('all race tracks complete three ordered laps; idle/reverse driving cannot award laps',()=>{
 for(const map of['coast','city','candyroad']){
  const s=new KartRace({map,localPlayers:0,seed:42});step(s,60*90);assert.equal(s.phase,'finished',map);const winner=s.actors[s.winner];assert.equal(winner.lap,3);assert.equal(winner.progress,144);assert.ok(winner.finishTime>15);
 }
 const idle=new KartRace({localPlayers:2,count:2});step(idle,60*15);assert.equal(idle.actors[0].lap,0);idle.setInput(0,{z:1});step(idle,60*15);assert.equal(idle.actors[0].lap,0);
});

test('PAWS deck conserves all 108 cards through shuffles, draws and a complete AI match',()=>{
 for(let seed=1;seed<=8;seed++){
  const s=new PawsGame(seed,0);for(let n=0;n<5000&&s.winner===null;n++){s.tick(1);const all=[...s.deck,...s.discard,...s.hands.flat()];assert.equal(all.length,108);assert.equal(new Set(all.map(c=>c.id)).size,108);}
  assert.notEqual(s.winner,null,`seed ${seed} ends`);assert.equal(s.hands[s.winner].length,0);
 }
});

test('PAWS rejects illegal +4, applies reverse and penalizes an unannounced last card',()=>{
 const s=new PawsGame(8);s.color='mint';s.discard=[{id:99,color:'mint',value:5}];s.hands[0]=[{id:0,color:'wild',value:'draw4'},{id:1,color:'mint',value:'reverse'}];assert.equal(s.legal(0),false);assert.equal(s.play(0),false);s.declare();s.play(1);assert.equal(s.direction,-1);assert.equal(s.turn,3);assert.equal(s.hands[0].length,1);
 const p=new PawsGame(8);p.color='gold';p.hands[0]=[{id:1000,color:'gold',value:3},{id:1001,color:'blue',value:8}];p.play(0);assert.equal(p.hands[0].length,3);
});

test('fishing has real hook windows, tension failure and successful controllable catches',()=>{
 const missed=new Fishing(12);missed.cast();missed.tick(7);assert.equal(missed.phase,'bite');missed.tick(2);assert.equal(missed.phase,'lost');
 const snap=new Fishing(12);snap.cast();snap.tick(7);snap.hook();snap.holding=true;snap.tick(4);assert.equal(snap.phase,'lost');
 for(let seed=1;seed<=8;seed++){const s=new Fishing(seed);s.cast();s.tick(7);s.hook();for(let i=0;i<60*180&&s.phase==='reeling';i++){if(s.tension>.7)s.holding=false;else if(s.tension<.3)s.holding=true;s.tick(1/60);}assert.equal(s.phase,'caught');assert.ok(s.weight>0);}
});

test('rewards deduplicate, purchases persist, locked fish are retained and imports keep a backup',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},p=new Profile(storage);
 p.rewardMatch('one',{mode:'last',map:'temple',win:true,stats:{hits:5}});const xp=p.data.xp;p.rewardMatch('one',{win:true});assert.equal(p.data.xp,xp);assert.equal(p.data.stats.matches,1);
 assert.ok(p.purchase('scarf'));assert.equal(p.data.costume,'scarf');assert.equal(new Profile(storage).data.costume,'scarf');
 p.catchFish(FISH[0],1);p.data.bucket[0].locked=true;p.catchFish(FISH[1],2);assert.equal(p.sellFish(),80);assert.equal(p.data.bucket.length,1);
 const old=JSON.stringify(p.data);p.import(old);assert.equal(memory.get(STORAGE_KEY+'.backup'),old);
 memory.set(STORAGE_KEY,'broken');const corrupt=new Profile(storage);assert.equal(corrupt.save(),false);assert.equal(memory.get(STORAGE_KEY),'broken');
});

test('malformed imported display data cannot become markup or non-finite currency',()=>{
 const p=new Profile();p.import(JSON.stringify({version:1,animal:'unknown',cookies:'Infinity',history:[{mode:'last',map:'temple',xp:'<img onerror=evil>'}],bucket:[{id:'silver',weight:2,price:'bad'}],settings:{volume:'bad',quality:'invalid'}}));
 assert.equal(p.data.animal,'corgi');assert.equal(p.data.cookies,0);assert.equal(p.data.history[0].xp,0);assert.equal(p.sellFish(),40);assert.ok(Number.isFinite(p.data.settings.volume));assert.equal(p.data.settings.quality,'high');
});
