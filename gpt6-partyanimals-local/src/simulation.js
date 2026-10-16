import RAPIER from '@dimforge/rapier3d-compat';
import { ANIMALS, WEAPONS, PERKS, EMPTY_INPUT, byId, clamp, rng } from './catalog.js';
import { mapLayout, spawnPosition } from './maps.js';

let ready;
export function initPhysics(){ return ready ??= RAPIER.init(); }
const V=(x=0,y=0,z=0)=>({x,y,z});
const len=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const quat=y=>({x:0,y:Math.sin(y/2),z:0,w:Math.cos(y/2)});
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const transform=(p,y)=>V(p.x*Math.cos(y)+p.z*Math.sin(y),p.y,-p.x*Math.sin(y)+p.z*Math.cos(y));

export class Arena {
  constructor(options={}){
    this.options={mode:'last',map:'temple',count:8,localPlayers:1,difficulty:1,teams:4,target:3,roundTime:100,seed:1234,animal:'corgi',costume:'classic',...options};
    this.random=rng(this.options.seed);this.round=0;this.scores=Array(8).fill(0);this.matchStats=[];this.perks=Array.from({length:8},()=>[]);this.events=[];this.eventSeq=0;this.winner=null;this.roundWinner=null;this.history=[];this.startRound();
  }
  emit(type,data={}){this.events.push({id:++this.eventSeq,type,...data});if(this.events.length>180)this.events.shift();}
  startRound(){
    this.world?.free();this.world=new RAPIER.World(V(0,-18,0));this.world.timestep=1/60;
    this.world.numSolverIterations=8;this.world.numAdditionalFrictionIterations=2;
    this.layout=mapLayout(this.options.map);this.map=this.layout.map;this.actors=[];this.items=[];this.projectiles=[];this.round++;
    this.time=0;this.phase='countdown';this.phaseTime=2.6;this.goalCooldown=0;this.spawnClock=0;this.hazardClock=0;this.nextId=0;this.teamScore=[0,0];this.shipHP=[100,100];this.windOff=0;this.balloon=[0,0];this.witnesses=[];this.meeting=null;this.sabotage=0;this.tasks=Array(6).fill(0);this.taskTotal=0;
    this.sabotageRepair=0;this.drafted=new Set();
    this.mutator=this.options.mode==='mutator'?['moon','giant','turbo','bombs'][(this.round-1)%4]:null;
    if(this.mutator==='moon')this.world.gravity=V(0,-8,0);
    for(const p of this.layout.pieces){
      if(!p.solid)continue;
      const bd=p.dynamic?RAPIER.RigidBodyDesc.kinematicPositionBased():RAPIER.RigidBodyDesc.fixed();
      p.body=this.world.createRigidBody(bd.setTranslation(p.x,p.y,p.z).setRotation(quat(p.angle||0)));
      p.collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(p.w/2,p.h/2,p.d/2).setFriction(this.map.kind==='hockey'?.05:.8).setCollisionGroups(0x0001ffff),p.body);p.originalY=p.y;p.active=true;
    }
    const count=this.options.mode==='training'?2:clamp(this.options.count,2,8);
    const isObjective=['score','pirate'].includes(this.options.mode);
    for(let i=0;i<count;i++){
      let team=this.options.teams===1?i:i%this.options.teams;
      if(isObjective)team=i%2;
      const a=this.createActor(i,spawnPosition(this.map,i,count,isObjective),team);this.actors.push(a);
    }
    if(this.options.mode==='training'){this.teleport(this.actors[0],V(-1,1.4,0));this.teleport(this.actors[1],V(1,1.4,0));this.actors[0].yaw=Math.PI/2;this.training={step:0,done:[],text:'WASD 移动，然后按 Space 跳跃'};}
    if(this.options.mode==='crisis'){
      const bad=this.options.role==='saboteur'?0:this.options.role==='crew'?1:Math.floor(this.random()*count);
      this.actors.forEach(a=>{a.role=a.id===bad?'saboteur':'crew';a.task=Math.floor(this.random()*6);a.suspicion=Array(count).fill(0);a.killCooldown=18;});
    }
    this.initialItems();this.emit('round',{round:this.round,map:this.map.name});
    if(this.options.mode==='smash')this.phase='draft';
  }
  get teamCount(){return ['score','pirate'].includes(this.options.mode)?2:this.options.teams===1?this.actors.length:Math.min(this.options.teams,this.actors.length);}
  createActor(id,p,team){
    const bit=1<<(id+1),groups=(bit<<16)|(0xffff^bit);
    const a={id,name:id<this.options.localPlayers?`玩家 ${id+1}`:byId(ANIMALS,ANIMALS[(id*3+2)%ANIMALS.length].id).name,animal:id<this.options.localPlayers?(this.options.animals?.[id]||this.options.animal):ANIMALS[(id*3+2)%ANIMALS.length].id,costume:id===0?this.options.costume:'classic',team,yaw:0,body:null,bodies:[],joints:[],stamina:100,conscious:100,stun:0,frozen:0,hitLock:0,cooldown:0,alive:true,eliminatedAt:0,oxygen:6,lastInput:EMPTY_INPUT(),input:EMPTY_INPUT(),grab:null,grabTime:0,grabCooldown:0,charge:0,attack:0,attackKind:'',lastHit:-1,lastHitAt:0,stats:{hits:0,kos:0,throws:0,goals:0},perks:this.perks[id],aiTimer:0,invulnerable:1,walk:0,boost:0,emote:0,respawn:0};
    const parts=[{name:'body',r:.36,h:.32,m:4,o:V()},{name:'head',r:.47,m:1.3,o:V(0,.78,0)},{name:'left',r:.19,m:.65,o:V(-.6,.13,0)},{name:'right',r:.19,m:.65,o:V(.6,.13,0)},{name:'footL',r:.23,m:.8,o:V(-.23,-.65,.06)},{name:'footR',r:.23,m:.8,o:V(.23,-.65,.06)}];
    for(const part of parts){
      const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x+part.o.x,p.y+part.o.y,p.z+part.o.z).setLinearDamping(.28).setAngularDamping(2.5).setCcdEnabled(true).setCanSleep(false));
      const shape=part.h?RAPIER.ColliderDesc.capsule(part.h,part.r):RAPIER.ColliderDesc.ball(part.r);
      this.world.createCollider(shape.setMass(part.m).setFriction(.65).setRestitution(.08).setCollisionGroups(groups),b);a.bodies.push(b);
      if(part.name==='body')a.body=b;
    }
    const anchors=[[V(0,.4,0),V(0,-.37,0)],[V(-.36,.25,0),V(.18,.04,0)],[V(.36,.25,0),V(-.18,.04,0)],[V(-.23,-.45,0),V(0,.20,0)],[V(.23,-.45,0),V(0,.20,0)]];
    for(let i=1;i<6;i++){let j=this.world.createImpulseJoint(RAPIER.JointData.spherical(...anchors[i-1]),a.body,a.bodies[i],true);j.setContactsEnabled(false);a.joints.push(j);}
    a.spectator={x:0,z:0,cooldown:4};a.struggle=0;
    if(id<this.options.localPlayers&&this.options.costumes?.[id])a.costume=this.options.costumes[id];
    return a;
  }
  teleport(a,p){
    const old=a.body.translation(),d=V(p.x-old.x,p.y-old.y,p.z-old.z);
    for(const b of a.bodies){const q=b.translation();b.setTranslation(V(q.x+d.x,q.y+d.y,q.z+d.z),true);b.setLinvel(V(),true);b.setAngvel(V(),true);b.setRotation(quat(a.yaw),true);}
  }
  addItem(kind,x,z,y=2){
    const def=WEAPONS.find(w=>w.id===kind),ball=['ball','puck','football','basketball','candy','coal','stone'].includes(kind);
    const radius=kind==='puck'?.4:ball?.46:.25;
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y,z).setLinearDamping(kind==='puck'?.09:.4).setAngularDamping(.4).setCcdEnabled(true));
    const shape=kind==='puck'?RAPIER.ColliderDesc.cylinder(.12,.4):RAPIER.ColliderDesc.ball(radius);
    this.world.createCollider(shape.setMass(ball?1.1:.7).setRestitution(ball?.38:.13).setFriction(kind==='puck'?.02:.55),body);
    const item={id:++this.nextId,kind,def,body,radius,owner:null,alive:true,ammo:def?.ammo??0,fuse:-1,lastTouch:-1,born:this.time,banana:0};this.items.push(item);return item;
  }
  initialItems(){
    const k=this.map.kind;
    if(['soccer','hockey','football','basket'].includes(k))this.addItem({soccer:'ball',hockey:'puck',football:'football',basket:'basketball'}[k],0,0);
    if(['candy','train','trebuchet'].includes(k))for(let i=0;i<6;i++)this.addItem({candy:'candy',train:'coal',trebuchet:'stone'}[k],(i%3-1)*1.3,(Math.floor(i/3)-.5)*3);
    if(!['cabin','station'].includes(k))for(let i=0;i<4;i++)this.addItem(WEAPONS[i].id,(i%2?1:-1)*3,(i<2?-1:1)*2);
    if(this.options.mode==='training')WEAPONS.forEach((w,i)=>this.addItem(w.id,(i%6-2.5)*1.4,-4+Math.floor(i/6)*1.1));
  }
  setInput(id,input){if(this.actors[id])this.actors[id].input={...EMPTY_INPUT(),...input,x:clamp(Number(input.x)||0,-1,1),z:clamp(Number(input.z)||0,-1,1)};}
  choosePerk(id,index){
    const a=this.actors[id];if(!a||this.phase!=='draft'||this.drafted.has(id))return false;
    const pool=PERKS.filter(p=>!a.perks.includes(p.id)),p=pool.find(x=>x.id===index);
    if(pool.length&&!p)return false;if(p){a.perks.push(p.id);this.emit('perk',{actor:id,name:p.name});}this.drafted.add(id);
    if(this.actors.slice(0,this.options.localPlayers).some(b=>!this.drafted.has(b.id)))return true;
    for(const b of this.actors.filter(x=>x.id>=this.options.localPlayers)){const choices=PERKS.filter(p=>!b.perks.includes(p.id));if(choices.length)b.perks.push(choices[Math.floor(this.random()*choices.length)].id);}
    this.phase='countdown';this.phaseTime=2.6;return true;
  }
  has(a,id){return a.perks.includes(id);}
  support(a){const p=a.body.translation();return this.world.castRay(new RAPIER.Ray(V(p.x,p.y+.1,p.z),V(0,-1,0)),1.65,true,undefined,0xffff0001);}
  tick(dt=1/60){
    if(['finished','roundEnd','draft','meeting'].includes(this.phase)){if(this.phase==='roundEnd')this.phaseTime-=dt;return;}
    this.phaseTime-=dt;if(this.phase==='countdown'&&this.phaseTime<=0){this.phase='playing';this.emit('go');}
    const active=this.phase==='playing';if(active)this.time+=dt;this.goalCooldown=Math.max(0,this.goalCooldown-dt);this.windOff=Math.max(0,this.windOff-dt);
    for(const a of this.actors)for(const b of a.bodies){b.resetForces(true);b.resetTorques(true);}for(const i of this.items)if(i.alive)i.body.resetForces(true);
    this.updateHazards(dt,active);
    for(const a of this.actors){
      if(!a.alive){if(a.respawn>0){a.respawn-=dt;if(a.respawn<=0)this.revive(a);}else if(active&&a.id<this.options.localPlayers&&['last','smash','mutator','trainDuel'].includes(this.options.mode))this.spectatorStep(a,dt);continue;}
      if(active&&a.id>=this.options.localPlayers&&this.options.mode!=='training')a.input=this.ai(a,dt);
      this.actorStep(a,active?a.input:EMPTY_INPUT(),dt);
    }
    this.world.step();
    if(active){this.itemStep(dt);this.updateObjective(dt);this.checkRound();}
    for(const a of this.actors)a.lastInput={...a.input};
    if(active&&this.time>this.spawnClock+12&&!['cabin','station'].includes(this.map.kind)){
      this.spawnClock=this.time;if(this.items.filter(x=>x.alive&&x.def).length<12){const p=this.safeSpot();this.addItem(WEAPONS[Math.floor(this.random()*WEAPONS.length)].id,p.x,p.z,5);}
    }
  }
  actorStep(a,input,dt){
    a.cooldown=Math.max(0,a.cooldown-dt);a.grabCooldown=Math.max(0,a.grabCooldown-dt);a.hitLock=Math.max(0,a.hitLock-dt);a.invulnerable=Math.max(0,a.invulnerable-dt);a.attack=Math.max(0,a.attack-dt);a.frozen=Math.max(0,a.frozen-dt);a.boost=Math.max(0,a.boost-dt);a.emote=Math.max(0,a.emote-dt);
    const p=a.body.translation(),v=a.body.linvel();
    if(!Number.isFinite(p.x)||p.y < -9 ||Math.abs(p.x)>120||Math.abs(p.z)>120){this.eliminate(a);return;}
    const press=k=>input[k]&&!a.lastInput[k];
    if(press('emote')){a.emote=2;this.emit('emote',{actor:a.id});}
    if(a.stun>0){
      a.stun-=dt*(this.has(a,'recover')?2:1);a.stamina=Math.min(100,a.stamina+dt*16);
      if(press('punch')||press('kick')||press('jump'))a.stun-=.18;
      this.release(a,false);if(a.stun<=0){a.conscious=65;a.invulnerable=.5;this.emit('recover',{actor:a.id});}
    }else{
      a.conscious=Math.min(100,a.conscious+dt*(this.has(a,'regen')?8:3));
      const captors=this.actors.filter(b=>b.grab?.target===a);if(captors.length){a.struggle=Math.max(0,a.struggle-dt*8);if(press('punch')||press('kick')||press('jump'))a.struggle+=22;if(a.struggle>=75){captors.forEach(b=>this.release(b,false));a.struggle=0;a.invulnerable=.3;this.emit('escape',{actor:a.id});}}
      const norm=Math.hypot(input.x,input.z),moving=norm>.1,running=input.run&&a.stamina>5&&moving;
      if(moving)a.yaw+=turn(a.yaw,Math.atan2(input.x,input.z))*Math.min(1,dt*14);
      const speed=(running?6.8:4.2)*(this.has(a,'speed')?1.25:1)*(a.frozen?.35:1)*(this.mutator==='turbo'?1.6:1)*(a.grab?.7:1);
      const support=this.support(a);a.grounded=!!support&&support.toi<1.45&&v.y<2.5;
      const movingScale=a.hitLock>0?.05:a.grounded?1:.22;
      const desired=V(moving?input.x/Math.max(1,norm)*speed:0,0,moving?input.z/Math.max(1,norm)*speed:0);
      a.body.applyImpulse(V((desired.x-v.x)*a.body.mass()*dt*8*movingScale,0,(desired.z-v.z)*a.body.mass()*dt*8*movingScale),true);
      if(support&&!a.grab?.ledge&&v.y<3){const force=clamp((1.19-support.toi)*550-v.y*65+150,0,700);a.body.addForce(V(0,force,0),true);}
      this.orient(a.body,a.yaw,dt,55);
      // The head is an inverted pendulum above the neck. Its motor must exceed
      // gravity's overturning torque; a weak motor makes every walking animal nod down.
      // This only runs while conscious, so knockouts keep the free ragdoll neck.
      this.orient(a.bodies[1],a.yaw,dt,65);
      a.walk+=dt*(moving?norm*12:2);
      const attackSwing=a.attack>0?Math.sin(Math.min(1,a.attack/.35)*Math.PI):0;
      for(let i=2;i<6;i++){
        const left=i%2===0,hand=i<4;
        let off=hand?V(left?-.57:.57,.05,(moving?Math.sin(a.walk+(left?0:Math.PI))*.15:0)):V(left?-.23:.23,-.65,Math.sin(a.walk+(left?0:Math.PI))*(moving?.23:.01));
        if(hand&&a.grab)off=V(left?-.28:.28,a.grabTime>.4?.92:.15,.58);
        if(hand&&a.attack>0)off=V(left?-.45:.45,.22,.25+attackSwing*.7);
        if(!hand&&a.attackKind==='kick'&&a.attack>0)off=V(left?-.18:.18,-.35,.15+attackSwing*.75);
        const o=transform(off,a.yaw),bp=a.bodies[i].translation(),bv=a.bodies[i].linvel();
        a.bodies[i].addForce(V(clamp((p.x+o.x-bp.x)*35-(bv.x-v.x)*4,-65,65),clamp((p.y+o.y-bp.y)*35-(bv.y-v.y)*4,-65,65),clamp((p.z+o.z-bp.z)*35-(bv.z-v.z)*4,-65,65)),true);
      }
      if(press('jump')&&(a.grounded||a.grab?.ledge)&&a.stamina>10){
        const climbing=a.grab?.ledge,anchor=climbing?a.grab.anchor:null;
        if(climbing)this.release(a,false);for(const b of a.bodies){const vel=b.linvel();b.setLinvel(V(vel.x,7.7*(this.has(a,'jump')?1.45:1),vel.z),true);if(climbing)b.applyImpulse(V((anchor.x-p.x)*b.mass()*4,0,(anchor.z-p.z)*b.mass()*4),true);}
        a.stamina-=10;this.emit(climbing?'climb':'jump',{actor:a.id});if(this.training)this.trainingRecord('jump');
      }
      if(input.head)a.charge=Math.min(1.2,a.charge+dt);
      if(!input.head&&a.lastInput.head){this.attack(a,'head',a.charge);a.charge=0;}
      if(press('punch')){if(this.options.mode==='crisis'&&a.role==='saboteur')this.kill(a);else this.attack(a,running?'heavy':'punch');}
      if(press('kick'))this.attack(a,a.grounded?'kick':'dropkick');
      if(input.grab&&!a.grab&&a.grabCooldown<=0)this.tryGrab(a);
      if(press('throw')&&a.grab)this.release(a,true);
      if(!input.grab&&a.grab)this.release(a,false);
      if(a.grab){a.grabTime+=dt;a.stamina-=dt*(this.has(a,'stamina')?2:4);if(a.grab.target){const t=a.grab.target;const tp=t.body.translation();if(len(p,tp)>3.7||Math.abs(p.y-tp.y)>4)this.release(a,false);else if(a.grabTime>.4)t.body.addForce(V(0,t.body.mass()*22,0),true);}if(a.stamina<1)this.release(a,false);}
      if(press('interact')||input.interact&&['score','pirate','crisis'].includes(this.options.mode))this.interact(a,dt,press('interact'));
      if(press('throw')&&this.options.mode==='crisis'&&!a.grab)this.callMeeting(a);
      a.stamina=clamp(a.stamina+dt*(running?-(this.has(a,'stamina')?6:12):a.grab?0:18),0,100);
    }
    const water=this.waterLevel();
    if(water!==null&&p.y<water+.45){a.oxygen-=dt;a.body.addForce(V(0,Math.max(0,water-p.y+1)*75,0),true);if(a.oxygen<=0)this.eliminate(a,'落水');}else if(water!==null)a.oxygen=Math.min(6,a.oxygen+dt*2);
    if(this.training&&Math.hypot(v.x,v.z)>1.8)this.trainingRecord('move');
    // Reset persistent forces after each physics step below; accumulating addForce is avoided.
  }
  orient(body,yaw,dt,strength){
    const q=body.rotation(),target=quat(yaw),sign=q.w*target.w+q.y*target.y>=0?1:-1;
    const ex=target.w*(-q.x)+target.y*(-q.z),ey=target.w*(-q.y)+target.y*q.w,ez=target.w*(-q.z)-target.y*(-q.x),av=body.angvel();
    body.applyTorqueImpulse(V((ex*strength*sign-av.x*4)*dt,(ey*strength*sign-av.y*3)*dt,(ez*strength*sign-av.z*4)*dt),true);
  }
  attack(a,kind,charge=0){
    if(a.cooldown>0||a.stamina<8||a.stun>0||!a.alive)return false;
    const item=a.grab?.item,def=item?.def;
    if(def?.type==='food'){a.boost=14;a.stamina=100;a.conscious=100;this.consumeItem(item);this.emit('power',{actor:a.id});return true;}
    if(def&&['freeze','taser','crossbow'].includes(def.type)){
      if(item.ammo<=0){this.emit('empty',{actor:a.id});return false;}item.ammo--;a.cooldown=.65;a.attack=.3;
      const p=a.body.translation();this.projectiles.push({x:p.x+Math.sin(a.yaw),y:p.y+.25,z:p.z+Math.cos(a.yaw),vx:Math.sin(a.yaw)*22,vz:Math.cos(a.yaw)*22,ttl:.9,owner:a.id,type:def.type});this.emit('shoot',{actor:a.id,kind:def.type});return true;
    }
    const config={punch:[26,4.3,1.75,.32,8],heavy:[42,8,1.9,.65,18],kick:[33,7,2,.6,13],head:[38+charge*30,7+charge*4,1.65,.85,20],dropkick:[55,12,2.3,.9,22]}[kind]||[26,5,1.8,.35,8];
    let [damage,power,reach,cool,cost]=config;
    if(def?.type==='melee'){damage=def.damage;power=def.power;reach=def.reach;cool*=def.slow??1;}
    if(this.has(a,'strong')||a.boost>0){damage*=1.35;power*=1.35;}if(this.has(a,'reach'))reach*=1.4;if(this.mutator==='giant'){damage*=1.3;reach*=1.3;}
    a.cooldown=cool;a.stamina-=cost;a.attack=.35;a.attackKind=kind;const p=a.body.translation(),forward=V(Math.sin(a.yaw),0,Math.cos(a.yaw));let hit=false;
    for(const b of this.actors){if(b===a||!b.alive||b.invulnerable>0)continue;if(b.team===a.team)continue;const bp=b.body.translation(),distance=len(p,bp),dot=((bp.x-p.x)*forward.x+(bp.z-p.z)*forward.z)/Math.max(.01,distance);
      if(distance<reach&&Math.abs(bp.y-p.y)<1.8&&dot>-.08){this.hurt(b,damage,power,forward,a.id);hit=true;a.stats.hits++;if(this.has(a,'vampire'))a.stamina=clamp(a.stamina+15,0,100);if(this.has(a,'ice'))b.frozen=2;}
    }
    for(const item of this.items){if(!item.alive||item.owner!==null)continue;const bp=item.body.translation(),distance=len(p,bp);if(distance<reach&&(bp.x-p.x)*forward.x+(bp.z-p.z)*forward.z>-.15){item.body.applyImpulse(V(forward.x*power*.9,kind==='kick'?1.1:3,forward.z*power*.9),true);item.lastTouch=a.id;}}
    if(kind==='dropkick'){a.body.applyImpulse(V(forward.x*15,1,forward.z*15),true);a.hitLock=.5;}
    this.emit(hit?'hit':'swing',{actor:a.id,kind,x:p.x,y:p.y+1,z:p.z});if(this.training&&hit)this.trainingRecord('hit');return true;
  }
  hurt(a,damage,power,dir,source=-1){
    if(!a.alive||a.invulnerable>0)return;
    if(this.has(a,'armor'))damage*=.7;if(this.has(a,'heavy'))power*=.5;
    a.conscious-=damage;a.hitLock=.28;a.lastHit=source;a.lastHitAt=this.time;
    for(const b of a.bodies){const m=b.mass();b.applyImpulse(V(dir.x*power*m*.45,m*(power>8?2.6:1),dir.z*power*m*.45),true);}
    a.body.applyTorqueImpulse(V(dir.z*3,2,-dir.x*3),true);
    if(a.conscious<=0){const newly=a.stun<=0;a.stun=Math.max(a.stun,3.1+this.random()*1.2);a.conscious=0;this.release(a,false);if(newly){this.emit('stun',{actor:a.id});if(this.training)this.trainingRecord('stun');if(this.has(a,'blast'))for(const b of this.actors){if(b===a||!b.alive)continue;const p=a.body.translation(),q=b.body.translation(),d=len(p,q);if(d<3&&d>.1)b.body.applyImpulse(V((q.x-p.x)/d*24,15,(q.z-p.z)/d*24),true);}}}
  }
  tryGrab(a){
    if(a.stun||a.stamina<5)return;
    const p=a.body.translation(),hand=a.bodies[3],hp=hand.translation(),candidates=[];
    for(const b of this.actors){if(b===a||!b.alive)continue;const q=b.body.translation();if(len(p,q)<1.75&&Math.abs(p.y-q.y)<1.8)candidates.push({target:b,body:b.body,dist:len(p,q),priority:b.stun?-.8:0});}
    for(const item of this.items){if(item.alive&&item.owner===null){const q=item.body.translation();if(len(p,q)<1.8&&Math.abs(p.y-q.y)<2)candidates.push({item,target:item,body:item.body,dist:len(p,q),priority:-.3});}}
    candidates.sort((a,b)=>a.dist+a.priority-b.dist-b.priority);
    if(candidates.length){
      const c=candidates[0],bp=c.body.translation();
      const joint=this.world.createImpulseJoint(RAPIER.JointData.spherical(V(),V()),hand,c.body,true);joint.setContactsEnabled(false);
      a.grab={...c,joint};a.grabTime=0;if(c.item){c.item.owner=a.id;if(c.item.kind==='bomb'&&c.item.fuse<0)c.item.fuse=3.8;}else c.target.lastHit=a.id;
      this.emit('grab',{actor:a.id,target:c.target.id});if(this.training)this.trainingRecord('grab');return;
    }
    if(p.y<1.05){
      for(const piece of this.layout.pieces){
        if(!piece.active||!piece.floor||!piece.body)continue;const pp=piece.body.translation(),x=clamp(p.x,pp.x-piece.w/2,pp.x+piece.w/2),z=clamp(p.z,pp.z-piece.d/2,pp.z+piece.d/2),y=pp.y+piece.h/2;
        if(Math.hypot(p.x-x,p.z-z)<.85&&p.y>y-1.9&&p.y<y+.5){
          const anchor=V(x,y+.05,z),body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y,z));
          const joint=this.world.createImpulseJoint(RAPIER.JointData.spherical(V(),V()),hand,body,true);a.grab={ledge:true,joint,anchor,anchorBody:body};a.grabTime=0;this.emit('ledge',{actor:a.id});return;
        }
      }
    }
    a.grabCooldown=.12;
  }
  release(a,throwing){
    const g=a.grab;if(!g)return;a.grab=null;a.grabCooldown=.4;
    if(g.joint?.isValid())this.world.removeImpulseJoint(g.joint,true);if(g.anchorBody?.isValid())this.world.removeRigidBody(g.anchorBody);
    if(g.item)g.item.owner=null;
    if(throwing&&g.target){
      const mult=this.has(a,'strong')?1.3:1,power=(g.item?15:12)*mult,bodies=g.item?[g.item.body]:g.target.bodies;
      for(const b of bodies)b.setLinvel(V(Math.sin(a.yaw)*power,7.5,Math.cos(a.yaw)*power),true);
      if(g.item){g.item.lastTouch=a.id;if(g.item.kind==='banana')g.item.banana=1;}else{g.target.lastHit=a.id;g.target.lastHitAt=this.time;g.target.hitLock=.8;}
      a.stats.throws++;this.emit('throw',{actor:a.id});if(this.training)this.trainingRecord('throw');
    }
  }
  spectatorStep(a,dt){
    const s=a.spectator,i=a.input;s.x=clamp(s.x+i.x*dt*7,-this.map.w/2,this.map.w/2);s.z=clamp(s.z+i.z*dt*7,-this.map.d/2,this.map.d/2);s.cooldown=Math.max(0,s.cooldown-dt);
    if((i.punch&&!a.lastInput.punch||i.throw&&!a.lastInput.throw)&&s.cooldown===0){const target=this.actors.filter(b=>b.alive).find(b=>len(b.body.translation(),s)<1.3);if(target)this.hurt(target,30,5,V(0,0,1),a.id);s.cooldown=8;this.emit('spectator',{actor:a.id,x:s.x,y:1,z:s.z});}
  }
  consumeItem(item){if(item.owner!==null)this.release(this.actors[item.owner],false);item.alive=false;if(item.body.isValid())this.world.removeRigidBody(item.body);}
  itemStep(dt){
    for(const item of this.items){
      if(!item.alive)continue;const p=item.body.translation();
      if(item.fuse>=0){item.fuse-=dt;if(item.fuse<=0){this.explode(p,item.lastTouch??-1);this.consumeItem(item);continue;}}
      if(item.banana)for(const a of this.actors){if(!a.alive||a.stun||a.id===item.lastTouch)continue;if(len(a.body.translation(),p)<.65){this.hurt(a,45,3,V(0,0,1),item.lastTouch);a.stun=Math.max(1.5,a.stun);this.consumeItem(item);break;}}
      if(p.y<-10||Math.abs(p.x)>100||Math.abs(p.z)>100){const kind=item.kind;this.consumeItem(item);if(['ball','puck','basketball','football'].includes(kind))this.addItem(kind,0,0,2);}
    }
    for(const s of this.projectiles){s.x+=s.vx*dt;s.z+=s.vz*dt;s.ttl-=dt;for(const a of this.actors){if(a.id===s.owner||!a.alive)continue;const p=a.body.translation();if(len(p,s)<.65&&Math.abs(p.y-s.y)<1){const def=byId(WEAPONS,s.type);this.hurt(a,def.damage,def.power,V(s.vx/22,0,s.vz/22),s.owner);if(s.type==='freeze')a.frozen=4;if(s.type==='taser')a.stun=Math.max(a.stun,2.5);s.ttl=0;this.emit('hit',{actor:s.owner,kind:s.type,x:p.x,y:p.y,z:p.z});break;}}}
    this.projectiles=this.projectiles.filter(s=>s.ttl>0);
    // Rapier accumulates forces, so reset only after world.step() has consumed them.
    for(const a of this.actors)for(const b of a.bodies){b.resetForces(true);b.resetTorques(true);}for(const i of this.items)if(i.alive)i.body.resetForces(true);
  }
  explode(p,source){
    this.emit('explosion',{x:p.x,y:p.y,z:p.z});for(const a of this.actors){const q=a.body.translation(),d=len(p,q);if(a.alive&&d<5)this.hurt(a,100*(1-d/6),22*(1-d/7),V((q.x-p.x)/Math.max(.1,d),0,(q.z-p.z)/Math.max(.1,d)),source);}
  }
  waterLevel(){return ['sink','wave','shark','ice','pirate'].includes(this.map.kind)?-.7+(this.map.kind==='sink'?Math.max(0,this.time-30)*.013:0):null;}
  updateHazards(dt,active){
    if(!active)return;const t=this.time,k=this.map.kind,limit=this.options.roundTime,late=Math.max(0,t-limit)/35;
    for(const p of this.layout.pieces){if(!p.body||!p.active)continue;
      let y=p.originalY;
      if(p.dynamic==='sink')y-=Math.max(0,t-20)*.012;
      if(p.dynamic==='break'&&t>28+p.index*6){p.active=false;p.body.setNextKinematicTranslation(V(p.x,-15,p.z));this.emit('break',{x:p.x,y:0,z:p.z});continue;}
      if(p.dynamic==='collapse'&&t>(3-p.index)*28){p.active=false;p.body.setNextKinematicTranslation(V(p.x,-15,p.z));continue;}
      if(p.dynamic==='ice'){
        for(const a of this.actors)if(a.alive){const q=a.body.translation();if(Math.abs(q.x-p.x)<p.w/2&&Math.abs(q.z-p.z)<p.d/2)p.stress+=dt*(a.stun?.5:1);}
        if(p.stress>14||t>120-p.index*15){p.active=false;p.body.setNextKinematicTranslation(V(p.x,-15,p.z));continue;}
        y-=p.stress*.018;
      }
      if(p.dynamic==='ship')y-=Math.max(0,30-this.shipHP[p.side])*.04;
      if(p.dynamic&&y!==p.body.translation().y)p.body.setNextKinematicTranslation(V(p.x,y,p.z));
    }
    for(const a of this.actors){if(!a.alive)continue;const p=a.body.translation();
      if(k==='gas'||late>0&&['last','smash','mutator'].includes(this.options.mode)){const safe=Math.max(.4,(k==='gas'?7-Math.max(0,t-20)*.052:9)-late*8);if(Math.hypot(p.x,p.z)>safe){a.oxygen-=dt*1.5;if(a.oxygen<=0)this.eliminate(a,'毒雾');}}
      if(k==='wind'&&this.windOff<=0){const blocked=p.x>-2&&this.layout.pieces.some(o=>!o.floor&&Math.abs(p.z-o.z)<1.1);if(!blocked)a.body.addForce(V(25+Math.max(0,Math.sin(t*.7))*85,0,0),true);}
      if(k==='plane'){a.body.addForce(V(Math.sin(t*.3)*18,0,12+t*.3),true);if(Math.abs(p.x)>Math.max(2,8-t*.06))a.frozen=Math.max(a.frozen,.3);}
      if(k==='blackhole'&&t%18>11){const d=Math.hypot(p.x,p.z);a.body.addForce(V(-p.x/Math.max(1,d)*90,0,-p.z/Math.max(1,d)*90),true);if(d<.7)this.eliminate(a,'黑洞');}
      if(k==='cold'){const fires=this.layout.nodes.filter(n=>n.type==='fire'&&t<35+n.index*22),warm=fires.some(n=>len(p,n)<2.4);a.oxygen=clamp(a.oxygen+(warm?dt*3:-dt*.6),0,6);if(!warm&&a.oxygen<=0)this.eliminate(a,'失温');}
      if(k==='wave'&&t%16>12&&p.y<2){a.body.addForce(V(0,22,90),true);}
      if(k==='belt')a.body.addForce(V(0,0,(Math.floor((p.x+7)/4.7)%2?1:-1)*Math.sin(t*.35)*65),true);
      if(k==='shark'&&t%13>11){const x=Math.sin(Math.floor(t/13)*2.4)*5;if(Math.abs(p.x-x)<1.5)this.hurt(a,dt*70,dt*22,V(0,0,1));}
      if(k==='duel'&&t%12>10&&p.y>1.7)this.hurt(a,dt*100,dt*14,V(1,0,0));
      if(k==='ring'&&t>limit&&Math.abs(p.x)>4.5)this.hurt(a,dt*30,dt*4,V(-Math.sign(p.x),0,0));
    }
    if(this.mutator==='bombs'&&Math.floor(t/4)>this.hazardClock){this.hazardClock=Math.floor(t/4);const p=this.safeSpot(),item=this.addItem('bomb',p.x,p.z,7);item.fuse=2.8;}
  }
  safeSpot(){const floors=this.layout.pieces.filter(p=>p.floor&&p.active);if(!floors.length)return V();const p=floors[Math.floor(this.random()*floors.length)];return V(p.x+(this.random()-.5)*Math.min(5,p.w*.6),1.5,p.z+(this.random()-.5)*Math.min(4,p.d*.6));}
  ai(a,dt){
    const input=EMPTY_INPUT(),p=a.body.translation();a.aiTimer-=dt;
    if(a.stun>0){if(this.random()<.06)input.punch=true;return input;}
    if(this.options.mode==='crisis')return this.crisisAI(a,dt);
    if(this.options.mode==='cabin'){const angle=this.time*.16+a.id;input.x=Math.sin(angle)*.3;input.z=Math.cos(angle)*.3;return input;}
    let target=null,objective=false;
    const enemies=this.actors.filter(b=>b.alive&&b.id!==a.id&&(b.team!==a.team||this.teamCount===this.actors.length)).sort((b,c)=>len(p,b.body.translation())-len(p,c.body.translation()));
    if(a.grab?.target&&!a.grab.item){const dir=V(Math.sign(p.x||1),0,Math.sign(p.z||1));target=V(dir.x*(this.map.w/2+1),0,dir.z*(this.map.d/2+1));input.grab=true;input.throw=Math.abs(p.x)>this.map.w/2-1.4||Math.abs(p.z)>this.map.d/2-1.4;}
    else if(this.options.mode==='score'){
      const k=this.map.kind;if(k==='trebuchet'&&this.layout.nodes.some(n=>n.team===a.team&&n.ammo>0)){target=this.layout.nodes.find(n=>n.team===a.team);objective=true;}
      else if(['arcade','balloon'].includes(k)){target=this.layout.nodes.find(n=>k==='balloon'||n.team===a.team);objective=true;}
      else if(a.grab?.item&&!a.grab.item.def){target=this.layout.nodes.find(n=>['candy','train','trebuchet'].includes(k)?n.team===a.team:n.team!==a.team);input.grab=true;objective=true;if(target&&len(p,target)<3&&['basket','soccer','hockey'].includes(k)){a.yaw=Math.atan2(target.x-p.x,target.z-p.z);input.throw=true;}}
      else{const obj=this.items.filter(i=>i.alive&&!i.def&&i.owner===null).sort((b,c)=>len(p,b.body.translation())-len(p,c.body.translation()))[0];if(obj){target=obj.body.translation();if(len(p,target)<1.5)input.grab=true;objective=true;}}
    }else if(this.options.mode==='pirate'){const repair=Math.floor(a.id/2)===2&&this.shipHP[a.team]<65&&this.time<this.options.roundTime;const nodes=this.layout.nodes.filter(n=>n.team===a.team&&n.type===(repair?'repair':'cannon'));target=nodes[Math.floor(a.id/2)%nodes.length];objective=true;}
    if(!target){
      const enemy=enemies[0];if(enemy){target=enemy.body.translation();if(enemy.stun>0&&len(p,target)<1.7)input.grab=true;}
      if(!a.grab&&this.options.difficulty>0&&(!enemy||len(p,target)>3)){const item=this.items.find(i=>i.alive&&i.owner===null&&i.def&&i.kind!=='banana'&&len(p,i.body.translation())<2.7);if(item){target=item.body.translation();if(len(p,target)<1.65)input.grab=true;}}
    }
    if(a.grab?.item)input.grab=true;
    if(target){const d=len(p,target);input.x=(target.x-p.x)/Math.max(1,d);input.z=(target.z-p.z)/Math.max(1,d);input.run=d>4&&a.stamina>35;if(objective&&d<2){input.x=0;input.z=0;input.interact=true;}}
    const nearby=enemies[0];if(nearby&&len(p,nearby.body.translation())<(a.grab?.item?.def?.type==='melee'?2.3:1.9)&&a.cooldown===0&&a.aiTimer<=0){input.punch=this.random()>.25;input.kick=!input.punch;a.aiTimer=[.7,.25,.05][this.options.difficulty]??.25;}
    if(a.grab?.item?.def&&['freeze','taser','crossbow'].includes(a.grab.item.def.type)&&nearby){const q=nearby.body.translation();a.yaw=Math.atan2(q.x-p.x,q.z-p.z);input.punch=a.cooldown<=0;}
    if(a.grab?.item?.kind==='bomb'&&a.grabTime>1)input.throw=true;
    if(a.grab?.item?.kind==='spinach')input.punch=true;
    // Safety steering is disabled while carrying a stunned opponent to the edge.
    if(!a.grab?.target||a.grab.item){
      const floor=this.layout.pieces.find(o=>o.floor&&o.active&&Math.abs(p.x-o.x)<o.w/2+.1&&Math.abs(p.z-o.z)<o.d/2+.1);
      if(!floor){const safe=this.layout.pieces.filter(o=>o.floor&&o.active).sort((b,c)=>len(p,b)-len(p,c))[0];if(safe){input.x=clamp(safe.x-p.x,-1,1);input.z=clamp(safe.z-p.z,-1,1);input.grab=true;input.jump=p.y<.5;}}
      if(this.map.kind==='gas'&&Math.hypot(p.x,p.z)>Math.max(1.5,6-this.time*.05)){input.x=-p.x/Math.max(1,Math.hypot(p.x,p.z));input.z=-p.z/Math.max(1,Math.hypot(p.x,p.z));input.run=true;}
      if(this.map.kind==='cold'){const fires=this.layout.nodes.filter(n=>this.time<35+n.index*22).sort((b,c)=>len(p,b)-len(p,c));if(fires[0]&&len(p,fires[0])>1.6){input.x=clamp(fires[0].x-p.x,-1,1);input.z=clamp(fires[0].z-p.z,-1,1);}}
    }
    if(this.random()<dt*.14&&a.grounded&&this.options.difficulty>0)input.jump=true;
    return input;
  }
  interact(a,dt,pressed){
    const p=a.body.translation(),near=this.layout.nodes.filter(n=>len(p,n)<2.3).sort((b,c)=>len(p,b)-len(p,c))[0];
    if(this.options.mode==='crisis'){
      const body=this.actors.find(b=>!b.alive&&!b.reported&&len(p,b.body.translation())<2.5);if(body&&pressed){body.reported=true;this.callMeeting(a,body);return;}
      if(near?.type==='terminal'){
        if(a.role==='crew'){if(this.sabotage>0){this.sabotageRepair+=dt;if(this.sabotageRepair>=5){this.sabotage=0;this.sabotageRepair=0;this.emit('repair',{actor:a.id});}}else{this.tasks[near.index]=clamp(this.tasks[near.index]+dt/8,0,1);this.taskTotal=this.tasks.reduce((s,x)=>s+x,0);}}
        else if(pressed&&this.sabotage<=0){this.sabotage=35;this.sabotageRepair=0;this.emit('sabotage',{actor:a.id});}
      }
      if(near?.type==='meeting'&&pressed)this.callMeeting(a);return;
    }
    if(!near)return;
    if(near.type==='switch'&&pressed){this.windOff=7;this.emit('switch');}
    if(near.type==='arcade'&&a.team===near.team){this.teamScore[a.team]+=dt*1.4;a.stats.goals+=dt;}
    if(near.type==='balloon'){this.balloon[a.team]+=dt;this.teamScore[a.team]=Math.floor(this.balloon[a.team]);}
    if(near.type==='catapult'&&near.team===a.team&&near.ammo>0){near.load=(near.load||0)+dt;if(near.load>=1){near.load=0;near.ammo--;this.teamScore[a.team]+=3;this.emit('cannon',{x:near.x,y:1,z:near.z,team:a.team});}}
    if(near.type==='cannon'&&near.team===a.team){near.load=(near.load||0)+dt;if(near.load>=3){near.load=0;this.shipHP[1-a.team]-=this.time>this.options.roundTime?22:12;this.emit('cannon',{x:near.x,y:1,z:near.z,team:a.team});}}
    if(near.type==='repair'&&near.team===a.team)this.shipHP[a.team]=Math.min(100,this.shipHP[a.team]+dt*(this.time>this.options.roundTime?1:4));
    if(['cards','fish','shop','radio'].includes(near.type)&&pressed&&a.id===0)this.emit('activity',{activity:near.type});
    if(near.type==='rack'&&pressed){for(const b of this.actors){b.stun=0;b.conscious=100;}this.emit('resetTraining');}
  }
  updateObjective(dt){
    const k=this.map.kind;if(this.options.mode==='crisis'){const failing=this.sabotage>0;this.sabotage=Math.max(0,this.sabotage-dt);if(failing&&this.sabotage===0)this.finishRound(1,'紧急维修超时');for(const a of this.actors)a.killCooldown=Math.max(0,a.killCooldown-dt);if(this.taskTotal>=6)this.finishRound(0,'全部维修完成');const alive=this.actors.filter(a=>a.alive),bad=alive.filter(a=>a.role==='saboteur');if(!bad.length)this.finishRound(0,'潜伏者出局');else if(bad.length>=alive.length-bad.length)this.finishRound(1,'潜伏者占领空间站');return;}
    if(this.options.mode==='pirate'){if(this.shipHP[0]<=0)this.finishRound(1,'蓝方船体沉没');else if(this.shipHP[1]<=0)this.finishRound(0,'红方船体沉没');return;}
    if(this.options.mode!=='score')return;
    for(const item of this.items){if(!item.alive||item.def||this.goalCooldown>0)continue;const p=item.body.translation();let team=-1;
      if(['soccer','hockey','football','basket'].includes(k)){
        const threshold=this.map.w/2-1.1;
        if(Math.abs(p.x)>threshold&&Math.abs(p.z)<2.5){
          if(k==='football'&&item.owner===null)continue;
          if(k==='basket'&&(p.y<2.2||p.y>5.8||item.owner!==null))continue;
          team=p.x>0?0:1;
        }
      }else if(['candy','train','trebuchet'].includes(k)){
        const node=this.layout.nodes.find(n=>len(p,n)<1.7);
        if(node){team=node.team;this.consumeItem(item);if(k==='train')this.teamScore[team]+=4;if(k==='trebuchet'){node.ammo=(node.ammo||0)+1;team=-1;}const pos=this.safeSpot();this.addItem(item.kind,clamp(pos.x,-2,2),clamp(pos.z,-3,3));}
      }
      if(team>=0){this.teamScore[team]++;if(item.lastTouch>=0)this.actors[item.lastTouch].stats.goals++;this.emit('goal',{team});if(['soccer','hockey','football','basket'].includes(k)){this.consumeItem(item);this.addItem(item.kind,0,0);this.goalCooldown=2;}}
    }
    const target=Math.max(1,this.options.target);
    for(let i=0;i<2;i++)if(this.teamScore[i]>=target)this.finishRound(i,'达到目标分数');
    if(this.time>this.options.roundTime+35&&this.teamScore[0]!==this.teamScore[1])this.finishRound(this.teamScore[0]>this.teamScore[1]?0:1,'时间到');
  }
  eliminate(a,reason='掉出场外'){
    if(!a.alive)return;a.alive=false;a.eliminatedAt=this.time;this.release(a,false);
    for(const b of this.actors)if(b.grab?.target===a)this.release(b,false);
    if(a.lastHit>=0&&this.time-a.lastHitAt<15)this.actors[a.lastHit].stats.kos++;
    this.emit('out',{actor:a.id,reason});
    if(['score','pirate','training','cabin'].includes(this.options.mode))a.respawn=3;
  }
  revive(a){this.release(a,false);for(const b of this.actors)if(b.grab?.target===a)this.release(b,false);a.alive=true;a.stun=0;a.conscious=100;a.stamina=100;a.oxygen=6;a.invulnerable=2;this.teleport(a,spawnPosition(this.map,a.id,this.actors.length,['score','pirate'].includes(this.options.mode)));}
  checkRound(){if(!['last','smash','mutator','trainDuel'].includes(this.options.mode)||this.time<2)return;const alive=this.actors.filter(a=>a.alive),teams=[...new Set(alive.map(a=>a.team))];if(teams.length<=1)this.finishRound(teams[0]??-1,teams.length?'最后存活':'平局');}
  finishRound(team,reason){
    if(this.phase==='roundEnd'||this.phase==='finished')return;this.roundWinner=team;this.reason=reason;if(team>=0)this.scores[team]++;this.history.push({round:this.round,team,reason,time:this.time});
    this.actors.forEach((a,i)=>{this.matchStats[i]??={hits:0,kos:0,throws:0,goals:0};for(const key in a.stats)this.matchStats[i][key]+=a.stats[key];});
    const single=['score','pirate','crisis'].includes(this.options.mode);this.phase=team>=0&&(single||this.scores[team]>=this.options.target)?'finished':'roundEnd';this.phaseTime=3;this.winner=this.phase==='finished'?team:null;this.emit('win',{team,finished:this.phase==='finished'});
  }
  nextRound(){if(this.phase==='roundEnd')this.startRound();}
  trainingRecord(id){if(!this.training.done.includes(id)){this.training.done.push(id);this.training.step=this.training.done.length;this.emit('lesson',{id});}}
  kill(a){if(a.killCooldown>0)return;const p=a.body.translation(),victim=this.actors.find(b=>b.alive&&b.id!==a.id&&len(p,b.body.translation())<1.8);if(!victim)return;victim.alive=false;victim.stun=999;victim.eliminatedAt=this.time;a.killCooldown=20;this.emit('out',{actor:victim.id,reason:'遇袭'});for(const b of this.actors)if(b.alive&&b.id!==a.id&&len(p,b.body.translation())<5)b.suspicion[a.id]=3;}
  callMeeting(a,body){if(this.options.mode!=='crisis'||this.phase!=='playing'||!a.alive||!body&&this.time<15)return;this.phase='meeting';this.meeting={caller:a.id,body:body?.id??null,votes:{},resolved:false};this.emit('meeting',{actor:a.id});}
  vote(voter,suspect){if(this.phase!=='meeting')return;
    if(voter>=0){if(!this.actors[voter]?.alive||this.meeting.votes[voter]!==undefined||suspect!==-1&&!this.actors[suspect]?.alive)return;this.meeting.votes[voter]=suspect;}
    else if(this.actors.some(a=>a.id<this.options.localPlayers&&a.alive))return;
    for(const a of this.actors)if(a.alive&&a.id>=this.options.localPlayers){const candidates=this.actors.filter(b=>b.alive&&b.id!==a.id);candidates.sort((b,c)=>a.suspicion[c.id]-a.suspicion[b.id]);this.meeting.votes[a.id]=candidates[0]&&a.suspicion[candidates[0].id]>0?candidates[0].id:this.random()<.35?candidates[Math.floor(this.random()*candidates.length)]?.id??-1:-1;}
    if(this.actors.some(a=>a.alive&&a.id<this.options.localPlayers&&this.meeting.votes[a.id]===undefined))return;
    const totals={};for(const v of Object.values(this.meeting.votes))totals[v]=(totals[v]||0)+1;const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
    if(sorted.length&&sorted[0][0]!=='-1'&&(sorted.length===1||sorted[0][1]>sorted[1][1])){const e=this.actors[Number(sorted[0][0])];if(e){e.alive=false;e.reported=true;this.emit('voteout',{actor:e.id,role:e.role});}}
    this.meeting.resolved=true;this.phase='playing';for(const a of this.actors)if(a.alive){this.teleport(a,spawnPosition(this.map,a.id,this.actors.length));a.killCooldown=Math.max(a.killCooldown,10);}this.updateObjective(0);
  }
  crisisAI(a,dt){
    const input=EMPTY_INPUT(),p=a.body.translation();let target;
    if(a.role==='saboteur'){const victims=this.actors.filter(b=>b.alive&&b.id!==a.id).sort((b,c)=>len(p,b.body.translation())-len(p,c.body.translation()));target=victims[0]?.body.translation();if(target&&len(p,target)<1.6&&a.killCooldown<=0)this.kill(a);}
    else{const corpse=this.actors.find(b=>!b.alive&&!b.reported&&len(p,b.body.translation())<3);if(corpse){corpse.reported=true;this.callMeeting(a,corpse);return input;}if(this.tasks[a.task]>=1)a.task=this.tasks.findIndex(v=>v<1);target=this.layout.nodes.find(n=>n.type==='terminal'&&n.index===a.task);if(target&&len(p,target)<1.8)input.interact=true;}
    if(target){const d=len(p,target);input.x=(target.x-p.x)/Math.max(1,d);input.z=(target.z-p.z)/Math.max(1,d);if(d<1.4){input.x=0;input.z=0;}}
    return input;
  }
  snapshot(){return {mode:this.options.mode,map:this.map.id,phase:this.phase,round:this.round,time:+this.time.toFixed(2),scores:[...this.scores],teamScore:[...this.teamScore],winner:this.winner,shipHP:[...this.shipHP],tasks:[...this.tasks],actors:this.actors.map(a=>({id:a.id,animal:a.animal,team:a.team,alive:a.alive,stun:+a.stun.toFixed(2),position:a.body.translation(),stamina:Math.round(a.stamina),conscious:Math.round(a.conscious),grab:a.grab?.item?.kind??(a.grab?.ledge?'ledge':a.grab?.target?'actor':null),stats:{...a.stats}})),items:this.items.filter(i=>i.alive).map(i=>({kind:i.kind,owner:i.owner,position:i.body.translation()})),activeFloors:this.layout.pieces.filter(p=>p.floor&&p.active).length,training:this.training};}
  dispose(){this.world.free();}
}
