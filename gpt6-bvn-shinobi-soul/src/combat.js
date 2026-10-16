import {moveData,hurtBox,attackBox,overlap,FIGHTER_SCALE} from './moves.js';
export {hurtBox,attackBox} from './moves.js';
export const ROSTER = [
  {id:'naruto',name:'漩涡鸣人',short:'鸣人',roman:'NARUTO UZUMAKI',clan:'木叶',style:'影分身 · 近身爆发',color:'#ff963e',hair:'#f6cc45',cloth:'#ed7b2a',skill:'螺旋丸',ultimate:'多重影分身 · 大玉螺旋丸',kind:'rush',speed:315,reach:98,power:1,range:300},
  {id:'sasuke',name:'宇智波佐助',short:'佐助',roman:'SASUKE UCHIHA',clan:'木叶',style:'雷遁 · 突进追击',color:'#a395ff',hair:'#182031',cloth:'#b6becd',skill:'千鸟',ultimate:'雷遁 · 麒麟',kind:'lightning',speed:340,reach:104,power:.98,range:420},
  {id:'sakura',name:'春野樱',short:'樱',roman:'SAKURA HARUNO',clan:'木叶',style:'怪力 · 破防重击',color:'#ff9fb8',hair:'#f3a0b6',cloth:'#b83250',skill:'樱花冲',ultimate:'百豪 · 怪力崩击',kind:'quake',speed:290,reach:92,power:1.16,range:235},
  {id:'kakashi',name:'旗木卡卡西',short:'卡卡西',roman:'KAKASHI HATAKE',clan:'木叶',style:'雷切 · 机动反击',color:'#a4e1dc',hair:'#d4dee4',cloth:'#668070',skill:'雷切',ultimate:'万花筒写轮眼 · 神威',kind:'warp',speed:330,reach:102,power:1,range:470},
  {id:'ichigo',name:'黑崎一护',short:'一护',roman:'ICHIGO KUROSAKI',clan:'尸魂界',style:'斩月 · 剑气压制',color:'#73cee9',hair:'#ef923c',cloth:'#182131',skill:'月牙天冲',ultimate:'卍解 · 天锁斩月',kind:'wave',speed:310,reach:142,power:1.04,range:750},
  {id:'rukia',name:'朽木露琪亚',short:'露琪亚',roman:'RUKIA KUCHIKI',clan:'尸魂界',style:'袖白雪 · 冰霜控制',color:'#bcecff',hair:'#222132',cloth:'#233040',skill:'初之舞 · 月白',ultimate:'卍解 · 白霞罚',kind:'ice',speed:325,reach:119,power:.93,range:530},
  {id:'byakuya',name:'朽木白哉',short:'白哉',roman:'BYAKUYA KUCHIKI',clan:'尸魂界',style:'千本樱 · 花刃封锁',color:'#eaa1d0',hair:'#202331',cloth:'#e5e8ea',skill:'散落吧 · 千本樱',ultimate:'卍解 · 千本樱景严',kind:'petals',speed:295,reach:134,power:.98,range:650},
  {id:'renji',name:'阿散井恋次',short:'恋次',roman:'RENJI ABARAI',clan:'尸魂界',style:'蛇尾丸 · 长距突刺',color:'#e67565',hair:'#b6313e',cloth:'#222432',skill:'咆哮吧 · 蛇尾丸',ultimate:'卍解 · 狒狒王蛇尾丸',kind:'whip',speed:300,reach:170,power:1.02,range:420},
];
export const WIDTH=1280,FLOOR=588,DT=1/60;
export const STAGE_PLATFORMS={leaf:[{x:155,w:230,y:145},{x:895,w:230,y:145}],seireitei:[{x:425,w:430,y:170}],valley:[{x:175,w:240,y:130},{x:865,w:240,y:130}]};
export const TRANSFORMS={naruto:'九尾查克拉',sasuke:'写轮眼 · 雷遁强化',sakura:'百豪之术',kakashi:'万花筒写轮眼',ichigo:'卍解 · 天锁斩月',rukia:'袖白雪 · 白霞',byakuya:'卍解 · 千本樱景严',renji:'卍解 · 狒狒王蛇尾丸'};
export const COMMANDS={
  naruto:['手里剑','螺旋丸突进','影分身突袭','空中螺旋丸'],
  sasuke:['豪火球','千鸟突刺','雷遁地走','空中千鸟'],
  sakura:['樱花冲','升龙怪力','地裂冲击','空中重锤'],
  kakashi:['苦无','雷切','写轮眼反击','空中雷切'],
  ichigo:['月牙天冲','上挑月牙','近地剑气','空中月牙'],
  rukia:['白涟','升空冰刃','月白冰阵','空中白涟'],
  byakuya:['千本樱花刃','升空花刃','花刃封锁','空中花刃'],
  renji:['蛇尾丸横扫','蛇尾丸上挑','低位蛇尾丸','空中蛇尾丸'],
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const getFighter=id=>ROSTER.find(r=>r.id===id)||ROSTER[0];
function fighter(id,index){return {id,index,x:index?910:370,y:0,vx:0,vy:0,face:index?-1:1,hp:1000,maxHp:1000,chakra:100,meter:0,assist:100,guard:100,state:'idle',form:0,grounded:true,time:0,attack:null,stun:0,invuln:0,airJumps:0,combo:0,comboTimer:0,chain:0,lastAttack:-10,awakening:0,aiTimer:0,knockdown:0,stats:{damage:0,hits:0,maxCombo:0,skills:0,blocks:0},trail:[],lastHit:false,reaction:null,blockstun:0,groupHits:{},comboOwner:null,receivedHits:0,runDistance:0,dropTime:0,guardDelay:0,prevX:index?910:370,prevY:0};}
export class Battle {
  constructor(options={}){this.options={mode:'versus',difficulty:'normal',stage:'valley',assist:'shuriken',p1:'naruto',p2:'ichigo',...options};this.randomSeed=options.seed||2718;this.events=[];this.round=1;this.wins=[0,0];this.level=1;this.streak=0;this.teamIndex=[0,0];this.teams=[this.team(this.options.p1),this.team(this.options.p2)];this.totalStats=[{damage:0,hits:0,maxCombo:0,skills:0,blocks:0},{damage:0,hits:0,maxCombo:0,skills:0,blocks:0}];this.infinite=true;this.dummy='idle';this.resetRound();}
  team(id){const first=getFighter(id),rest=ROSTER.filter(r=>r.clan===first.clan&&r.id!==id);return [id,...rest.slice(0,2).map(r=>r.id)];}
  random(){this.randomSeed=(Math.imul(1664525,this.randomSeed)+1013904223)>>>0;return this.randomSeed/4294967296;}
  emit(type,data={}){this.events.push({type,...data});if(this.events.length>200)this.events.shift();}
  drainEvents(){return this.events.splice(0);}
  resetRound(){this.fighters=[fighter(this.options.p1,0),fighter(this.options.p2,1)];if(this.options.mode==='training')this.fighters.forEach(f=>f.meter=300);if(this.options.mode==='arcade'&&this.level===8){this.fighters[1].maxHp=1400;this.fighters[1].hp=1400;}this.time=99;this.elapsed=0;this.tick=0;this.attackSerial=0;this.phase='intro';this.phaseTimer=1.9;this.projectiles=[];this.hitstop=0;this.cutin=null;this.winner=null;this.emit('round',{round:this.round});}
  snapshot(){return {phase:this.phase,round:this.round,wins:[...this.wins],time:this.time,mode:this.options.mode,level:this.level,streak:this.streak,teamIndex:[...this.teamIndex],winner:this.winner,cutin:this.cutin?{...this.cutin}:null,projectiles:this.projectiles.length,hitstop:this.hitstop,tick:this.tick,fighters:this.fighters.map(f=>({id:f.id,x:f.x,y:f.y,hp:f.hp,maxHp:f.maxHp,chakra:f.chakra,meter:f.meter,assist:f.assist,guard:f.guard,state:f.state,combo:f.combo,awakening:f.awakening,form:f.form||0,grounded:!!f.grounded,invuln:f.invuln,face:f.face,vx:f.vx,vy:f.vy,stun:f.stun,blockstun:f.blockstun,reaction:f.reaction?{...f.reaction}:null,attack:f.attack?{kind:f.attack.kind,frame:f.attack.frame,face:f.attack.face,phase:f.attack.frame<f.attack.move.startup?'startup':f.attack.frame<f.attack.move.startup+f.attack.move.active?'active':'recovery',confirm:f.attack.confirm}:null,stats:{...f.stats}}))};}
  cpu(f,o){
    if(this.options.mode==='training'&&f.index===1&&this.dummy!=='cpu')return {down:this.dummy==='block'};
    const dist=Math.abs(f.x-o.x),toward=o.x>=f.x?1:-1,input={};
    f.aiTimer-=DT;
    if(f.aiTimer<=0){
      const factor=this.options.difficulty==='hard'?1.5:this.options.difficulty==='easy'?.7:1,r=this.random();
      f.aiTimer=(.11+this.random()*.15)/factor;
      if(dist>getFighter(f.id).reach*FIGHTER_SCALE*.75||f.face!==toward)input[toward>0?'right':'left']=true;
      if(o.attack&&dist<240&&f.face===toward&&r<.35*factor){input.down=true;input.left=false;input.right=false;}
      else if(dist<getFighter(f.id).reach*FIGHTER_SCALE+10&&r<.85)input.attack=true;
      else if(dist<750&&r<.5*factor)input.skill=true;
      if(f.meter>=100&&dist<450&&r<.16*factor)input.ultimate=true;
      if(f.meter>=300&&!f.form&&r>.85)input.transform=true;
      if(f.assist>=100&&r>.93)input.assist=true;
      if(dist>300&&r>.68)input.dash=true;
      if((o.y>60||r>.91)&&dist<500)input.jump=true;
      if(input.skill&&r<.22)input.up=true;
      if(f.reaction&&r<.23*factor)input.dash=true;
      f.aiIntent={left:input.left,right:input.right,down:input.down,up:input.up};return input;
    }
    return {...f.aiIntent};
  }
  step(inputs=[{},{}],dt=DT){
    if(['finished','stageclear'].includes(this.phase))return;
    if(this.phase!=='fight'){
      this.phaseTimer-=dt;if(this.phaseTimer<=0){if(this.phase==='intro'){this.phase='fight';this.emit('fight');}else this.advanceRound();}return;
    }
    const before=this.fighters.map(f=>({...f}));
    const intents=this.fighters.map((f,i)=>this.options.mode==='watch'||i===1&&this.options.mode!=='local'?this.cpu(f,before[1-i]):inputs[i]||{});
    // Only commands are buffered. Held movement/guard directions always come from this frame.
    this.fighters.forEach((f,i)=>{
      const input=intents[i],action=['transform','ultimate','skill','attack','dash','jump','assist'].find(k=>input[k]);
      if(action)f.buffer={action,up:!!input.up,down:!!input.down,ttl:11};
    });
    if(this.cutin){this.cutin.time-=dt;if(this.cutin.time<=0)this.cutin=null;return;}
    if(this.hitstop>0){this.hitstop=Math.max(0,this.hitstop-dt);return;}
    this.tick=(this.tick||0)+1;this.elapsed+=dt;if(this.options.mode!=='training')this.time=Math.max(0,this.time-dt);
    // No damage is resolved while either fighter is still processing input or movement.
    this.fighters.forEach((f,i)=>this.updateFighter(f,before[1-i],intents[i],dt));
    this.fighters.forEach(f=>this.advanceAttack(f,dt));
    const [a,b]=this.fighters,dx=b.x-a.x;
    if(Math.abs(dx)<52*FIGHTER_SCALE&&Math.abs(a.y-b.y)<110){const push=(52*FIGHTER_SCALE-Math.abs(dx))/2,dir=dx>=0?1:-1;a.x=clamp(a.x-push*dir,45,1235);b.x=clamp(b.x+push*dir,45,1235);}
    const contacts=[];
    for(const f of this.fighters){const attack=f.attack,box=attackBox(f),o=this.fighters[1-f.index];
      if(box&&attack&&!attack.targets.has(o.index)&&overlap(box,hurtBox(o))){
        contacts.push(this.contact(f,o,attack.move.damage,attack.move.launch,attack.move.type,{move:attack.move,attack,sourceX:f.x,face:attack.face,box}));
      }
    }
    for(const p of this.projectiles){
      if(p.delay>0){p.delay-=dt;continue;}p.life-=dt;const oldX=p.x,oldY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;
      const o=this.fighters[1-p.owner],box={x:Math.min(oldX,p.x)-p.radius,y:Math.min(oldY,p.y)-p.radius,w:Math.abs(p.x-oldX)+p.radius*2,h:Math.abs(p.y-oldY)+p.radius*2};
      if(p.life>0&&overlap(box,hurtBox(o)))contacts.push(this.contact(this.fighters[p.owner],o,p.damage,p.launch,p.kind,{move:p.move,attack:p.attack,projectile:p,face:Math.sign(p.vx)||p.face,sourceX:oldX,box}));
    }
    this.settle(contacts);
    this.projectiles=this.projectiles.filter(p=>p.life>0&&p.x>-150&&p.x<1430);
    if(this.options.mode==='training'&&this.infinite)this.fighters.forEach(f=>{f.chakra=100;f.meter=300;f.assist=100;if(f.hp<=0)f.hp=f.maxHp;});
    if(a.hp<=0||b.hp<=0||this.time<=0)this.endRound();
  }
  setReaction(f,kind,frames,extra={}){
    f.reaction={kind,frames,age:0,...extra};f.attack=null;f.buffer=null;f.dashTime=0;f.counterTime=0;
    this.syncReaction(f);
  }
  syncReaction(f){
    const r=f.reaction;f.stun=r&&['hit','launch','break'].includes(r.kind)?Math.max(r.frames,1)*DT:0;
    f.blockstun=r?.kind==='block'?r.frames*DT:0;f.knockdown=r?.kind==='down'?r.frames*DT:0;
    if(r)f.state=({hit:'hurt',launch:'airhurt',break:'guardbreak',block:'blockstun',down:'down',wake:'wakeup',escape:'escape',tech:'tech'})[r.kind];
  }
  releaseCombo(f){if(f.comboOwner!==null&&f.comboOwner!==undefined){this.fighters[f.comboOwner].combo=0;f.comboOwner=null;}f.receivedHits=0;}
  updateFighter(f,o,input,dt){
    const r=getFighter(f.id);f.time+=dt;f.prevX=f.x;f.prevY=f.y;
    f.invuln=Math.max(0,f.invuln-dt);f.chakra=clamp(f.chakra+8*dt,0,100);f.assist=clamp(f.assist+4*dt,0,100);
    f.guardDelay=Math.max(0,(f.guardDelay||0)-dt);f.dropTime=Math.max(0,(f.dropTime||0)-dt);f.comboTimer=Math.max(0,f.comboTimer-dt);
    f.awakening=f.form?15:0;f.chainWindow=Math.max(0,(f.chainWindow||0)-1);
    if(!f.guardDelay&&!['block','blockstun'].includes(f.state)&&!f.reaction)f.guard=clamp(f.guard+10*dt,0,100);
    // Direct model setups can still use stun; ordinary gameplay enters through setReaction.
    if(!f.reaction&&f.stun>0){const pending=f.buffer;this.setReaction(f,'hit',Math.ceil(f.stun/DT));f.buffer=pending;}
    if(f.reaction){
      const react=f.reaction;react.age++;react.frames=Math.max(0,react.frames-1);
      const cmd=f.buffer;
      if(cmd?.action==='dash'&&['hit','launch'].includes(react.kind)&&react.age>=3&&f.chakra>=35){
        f.chakra-=35;this.releaseCombo(f);this.setReaction(f,'escape',9);f.invuln=.55;
        f.x=clamp(o.x-o.face*120,45,1235);f.face=o.x>=f.x?1:-1;f.vx=0;f.vy=0;
        this.emit('escape',{x:f.x,y:f.y,color:r.color,text:'替身'});
      }else if(cmd?.action==='jump'&&react.kind==='launch'&&!react.hard&&react.age>=12&&f.vy<=180&&f.chakra>=15){
        f.chakra-=15;this.releaseCombo(f);this.setReaction(f,'tech',10);f.invuln=.3;f.vy=360;f.vx=-react.face*160;f.airJumps=2;
        this.emit('escape',{x:f.x,y:f.y,color:r.color,text:'受身'});
      }else if(react.kind!=='launch'&&react.frames===0){
        if(react.kind==='down'){this.releaseCombo(f);this.setReaction(f,'wake',12);f.invuln=24*DT;f.vx=0;}
        else{if(['hit','break'].includes(react.kind))this.releaseCombo(f);f.reaction=null;f.stun=0;f.blockstun=0;f.knockdown=0;f.state=react.kind==='block'&&input.down?'block':'idle';}
      }
    }
    if(f.reaction){f.vx*=f.grounded?.83:.985;this.syncReaction(f);this.physics(f,dt);if(f.buffer&&--f.buffer.ttl<=0)f.buffer=null;return;}
    if(f.attack){
      f.attack.frame++;f.attack.t=f.attack.frame*DT;
      if(f.attack.frame>=f.attack.move.total){f.chainWindow=f.attack.kind==='normal'&&f.attack.confirm?7:0;f.attack=null;f.counterTime=0;f.lastHit=false;}
    }
    const cmd=f.buffer,axis=(input.right?1:0)-(input.left?1:0);
    // Guard locks facing. Attacks lock facing in the attack object until recovery/cancel.
    if(!f.attack&&!(input.down&&f.state==='block')&&axis)f.face=Math.sign(axis);
    if(cmd){
      const action=cmd.action,kind=action==='attack'?'normal':action;
      const permitted=!f.attack||this.canCancel(f.attack,kind);
      const transformChord=!f.attack||f.attack.kind==='normal'&&f.attack.frame<=3&&!f.attack.spawned;
      if(action==='transform'&&transformChord&&f.grounded&&f.meter>=300&&!f.form){
        f.meter-=300;f.form=1;f.awakening=15;f.buffer=null;this.setReaction(f,'escape',12);f.invuln=.6;
        this.cutin={id:f.id,index:f.index,name:TRANSFORMS[f.id],time:1,transform:true};this.emit('ultimate',{id:f.id,color:r.color});
      }else if(['normal','skill','ultimate'].includes(kind)&&permitted){
        if(this.startAttack(f,o,kind,cmd))f.buffer=null;
      }else if(!f.attack&&action==='jump'&&f.airJumps<2){
        if(cmd.down&&f.grounded&&f.y>0){f.dropTime=.25;f.y-=3;f.vy=-80;}else{f.vy=f.airJumps===0?690:600;f.airJumps++;this.emit('jump',{x:f.x,y:f.y,color:r.color});}
        f.grounded=false;f.buffer=null;
      }else if(!f.attack&&action==='dash'&&f.chakra>=12){f.chakra-=12;f.dashTime=.16;f.invuln=.1;f.vx=f.face*1050;f.buffer=null;this.emit('dash',{x:f.x,y:f.y,color:r.color});}
      else if(!f.attack&&action==='assist'&&f.assist>=100){this.assist(f);f.buffer=null;}
    }
    if(f.reaction){this.syncReaction(f);f.vx=0;}
    else if(f.attack){f.face=f.attack.face;f.state=f.attack.kind==='normal'?'attack':f.attack.kind==='ultimate'?'ultimate':'skill';f.vx*=.65;}
    else if(f.dashTime>0){f.dashTime=Math.max(0,f.dashTime-dt);f.state='dash';}
    else if(input.down&&f.grounded){if(f.state!=='block'&&f.state!=='blockstun')f.face=o.x>=f.x?1:-1;f.state='block';f.vx=0;}
    else{f.vx=axis*r.speed*(f.form?1.2:1);f.state=!f.grounded?'jump':axis?'run':'idle';}
    this.physics(f,dt);
    if(f.buffer&&--f.buffer.ttl<=0)f.buffer=null;
  }
  physics(f,dt){
    const wasGrounded=f.grounded,oldY=f.y;f.x=clamp(f.x+f.vx*dt,45,1235);f.vy-=1750*dt;f.y+=f.vy*dt;f.grounded=false;
    if(f.vy<=0&&f.dropTime<=0)for(const p of STAGE_PLATFORMS[this.options.stage]||[]){if(f.x>=p.x-5&&f.x<=p.x+p.w+5&&oldY>=p.y-.1&&f.y<=p.y){f.y=p.y;f.vy=0;f.grounded=true;break;}}
    if(f.y<=0){f.y=0;f.vy=0;f.grounded=true;}
    if(f.grounded){f.airJumps=0;if(f.reaction?.kind==='launch'){const down=f.reaction.knockdown;this.setReaction(f,down?'down':'hit',down?36:6);f.vx*=.4;this.emit('land',{x:f.x,y:f.y,color:getFighter(f.id).color});}else if(!wasGrounded)this.emit('land',{x:f.x,y:f.y,color:getFighter(f.id).color,soft:true});}
    if(f.state==='run')f.runDistance=(f.runDistance||0)+Math.abs(f.x-f.prevX);
  }
  canCancel(a,kind){
    if(a.frame<a.move.cancelStart||a.frame>a.move.cancelEnd)return false;
    return (a.confirm==='hit'?a.move.cancelHit:a.confirm==='block'?a.move.cancelBlock:[]).includes(kind);
  }
  startAttack(f,o,kind,input={}){
    if(f.reaction||f.stun>0||f.knockdown>0||f.attack&&!this.canCancel(f.attack,kind))return false;
    const r=getFighter(f.id),dir=input.up?'up':input.down?'down':!f.grounded&&f.y>10?'air':'neutral';let cost=0;
    if(kind==='skill'){if(f.chakra<24)return false;f.chakra-=24;f.stats.skills++;}
    if(kind==='ultimate'){cost=dir==='down'?300:dir==='up'?200:100;if(f.meter<cost)return false;f.meter-=cost;f.stats.skills++;
      this.cutin={id:f.id,index:f.index,name:(dir==='down'?'最终奥义 · ':'')+r.ultimate,time:dir==='down'?1.1:.65};this.emit('ultimate',{id:f.id,color:r.color});}
    const previous=f.attack,chain=kind==='normal'&&(previous?.kind==='normal'||f.chainWindow>0)?f.chain%4+1:1;
    f.chain=chain;f.chainWindow=0;f.lastHit=false;f.time=0;f.counterTime=0;f.dashTime=0;
    const move=moveData(r,kind,dir,chain,cost);
    f.attack={id:++this.attackSerial,kind,dir,chain,cost,face:f.face,frame:0,t:0,start:move.startup*DT,duration:move.total*DT,move,targets:new Set(),confirm:null,spawned:false,travel:0};
    return true;
  }
  advanceAttack(f,dt){
    const a=f.attack;if(!a)return;const m=a.move,active=a.frame>=m.startup&&a.frame<m.startup+m.active;
    if(!active){f.counterTime=0;return;}
    if(!a.spawned){a.spawned=true;const r=getFighter(f.id);this.emit('swing',{x:f.x,y:f.y,color:r.color,kind:m.type,sound:m.sound,heavy:m.heavy});
      if(['melee','rush','lightning','warp','quake','whip','counter'].includes(m.type)){
        if(m.type==='melee')this.emit('slash',{x:f.x+a.face*m.reach*.5,y:f.y+70,face:a.face,color:r.color,size:m.reach,heavy:m.heavy});
        else if(m.type==='counter')this.emit('escape',{x:f.x,y:f.y,color:r.color,text:'写轮眼'});
        else if(m.type==='quake'||m.type==='whip')this.emit(m.type,{x:f.x,y:m.type==='quake'?f.y:f.y+70,size:m.reach,face:a.face,color:r.color});
      }else this.spawnProjectiles(f,a);
    }
    if(m.type==='counter')f.counterTime=(m.startup+m.active-a.frame)*DT;
    if(m.speed&&!a.confirm&&a.travel<m.travel){const distance=Math.min(m.speed*dt,m.travel-a.travel),old=f.x;f.x=clamp(f.x+a.face*distance,45,1235);a.travel+=Math.abs(f.x-old);if(a.frame%3===0)this.emit('rush',{x:old,to:f.x,y:f.y,color:getFighter(f.id).color,face:a.face,kind:m.type,ult:a.kind==='ultimate'});}
  }
  spawnProjectiles(f,a){
    const r=getFighter(f.id),m=a.move,ult=a.kind==='ultimate',type=m.type,count=type==='petals'?5:ult?3:1;
    for(let n=0;n<count;n++){
      const trap=a.dir==='down'&&['wave','ice','petals'].includes(type),kind=type==='ground-lightning'?'lightning':type;
      this.projectiles.push({owner:f.index,attack:a,move:m,group:a.id,delay:n*4*DT,x:f.x+a.face*(trap?100:45),y:f.y+(type==='ground-lightning'?30:65),
        vx:a.face*(trap?180:['shuriken','kunai'].includes(type)?850:type==='ice'?520:680),vy:a.dir==='up'&&!['shuriken','fire','kunai'].includes(type)?150:a.dir==='air'?-150:0,
        radius:['shuriken','kunai'].includes(type)?18:type==='petals'?24:ult?62:38,damage:m.damage/count,launch:m.launch,life:trap?3:1.9,kind,face:a.face,color:f.form&&f.id==='ichigo'?'#ec354e':r.color});
    }
    this.emit('cast',{x:f.x,y:f.y,color:r.color,ult});
  }
  assist(f){
    const id=this.options.assist==='heal'?'sakura':this.options.assist==='seal'?'rukia':'kakashi';f.assist=0;f.stats.skills++;
    this.emit('partner',{id,x:f.x,y:f.y,face:f.face});
    if(id==='sakura'){const restored=Math.min(170,f.maxHp-f.hp);f.hp+=restored;this.emit('heal',{x:f.x,y:f.y,color:'#9beaaf',text:'+'+Math.round(restored)});}
    else{this.projectiles.push({owner:f.index,x:f.x+f.face*35,y:f.y+75,vx:f.face*780,vy:0,radius:id==='rukia'?48:20,damage:id==='rukia'?65:110,life:2,launch:id==='rukia'?200:0,kind:'assist',color:'#d9f6ba',group:++this.attackSerial});this.emit('assist',{x:f.x,y:f.y,color:'#d9f6ba'});}
  }
  contact(f,o,damage,launch,kind,extra={}){
    const move=extra.move||{hitstun:kind==='ice'?30:18,blockstun:10,hitstop:kind==='normal'?5:8,blockstop:3,push:launch?300:170,blockPush:100,guardDamage:kind==='quake'?55:25,chip:kind==='normal'?0:.06,knockdown:launch>300,hardKnockdown:false,sound:getFighter(f.id).clan==='尸魂界'?'blade':'fist',heavy:launch>300};
    return {f,o,damage,launch,kind,face:f.face,sourceX:f.x,...extra,move};
  }
  settle(contacts){
    // Freeze defensive eligibility before applying damage, so same-frame trades are symmetric.
    const defense=this.fighters.map(f=>({hp:f.hp,face:f.face,invuln:f.invuln,down:['down','wakeup'].includes(f.state),counter:f.counterTime>0,block:(f.state==='block'||f.state==='blockstun')&&f.grounded}));
    const classified=contacts.map(c=>{
      const d=defense[c.o.index],front=c.projectile?c.face===-d.face:(c.sourceX-c.o.x)*d.face>0;
      if(d.hp<=0||d.invuln>0||d.down)return [c,'immune'];
      const group=c.projectile?.group,key=group==null?null:`${c.f.index}:${group}`;
      if(key&&(c.o.groupHits[key]??-99)>this.tick-4)return [c,'immune'];
      if(key)c.o.groupHits[key]=this.tick;
      return [c,d.counter&&front?'counter':d.block&&front?'block':'hit'];
    });
    for(const [c,result] of classified){
      c.result=result;if(result==='immune')continue;
      if(c.projectile)c.projectile.life=0;else c.attack?.targets.add(c.o.index);
      if(result==='counter'){
        c.o.counterTime=0;const defender=c.o,attacker=c.f;defender.attack=null;defender.face=-c.face;
        this.emit('escape',{x:defender.x,y:defender.y,color:getFighter(defender.id).color,text:'雷切反击'});
        if(defense[attacker.index].invuln<=0)this.applyHit(this.contact(defender,attacker,140,260,'lightning',{face:-c.face}),false);
      }else this.applyHit(c,result==='block');
    }
    return classified;
  }
  applyHit(c,blocked){
    const {f,o,move:m,face,attack}=c,r=getFighter(f.id),box=c.box||hurtBox(o);
    const x=clamp(face>0?box.x+box.w:box.x,o.x-24,o.x+24),y=clamp(box.y+box.h*.5,o.y+15,o.y+125);
    this.hitstop=Math.max(this.hitstop,(blocked?m.blockstop:m.hitstop)*DT);
    if(attack){attack.confirm=blocked?'block':'hit';if(f.attack===attack)f.lastHit=!blocked;}
    o.guardDelay=1.4;
    if(blocked){
      o.hp=Math.max(1,o.hp-c.damage*m.chip);o.guard=Math.max(0,o.guard-m.guardDamage);o.stats.blocks++;o.meter=clamp(o.meter+8,0,300);
      o.vx=face*m.blockPush;f.vx=-face*m.blockPush*.25;
      if(o.guard<=0){this.setReaction(o,'break',52);this.emit('guardbreak',{x,y,color:'#fff1b0',text:'破 防',face});}
      else this.setReaction(o,'block',m.blockstun);
      this.emit('block',{x,y,color:'#a8dfea',face,heavy:m.heavy,sound:'guard'});return;
    }
    if(o.comboOwner!==f.index){this.releaseCombo(o);o.comboOwner=f.index;f.combo=0;}
    const scaled=c.damage*Math.max(.45,1-(o.receivedHits||0)*.075)*(f.form?1.25:1);
    o.hp=Math.max(0,o.hp-scaled);f.stats.damage+=scaled;f.stats.hits++;f.combo=++o.receivedHits;f.stats.maxCombo=Math.max(f.stats.maxCombo,f.combo);f.comboTimer=1.1;
    f.meter=clamp(f.meter+13+scaled*.09,0,300);o.meter=clamp(o.meter+9+scaled*.05,0,300);
    const protection=o.receivedHits>=8,launch=c.launch||(o.grounded?0:120);
    this.setReaction(o,launch||protection?'launch':'hit',Math.max(10,m.hitstun-(o.receivedHits-1)*1.5),{face,hard:m.hardKnockdown||protection,knockdown:m.knockdown||protection});
    o.vx=face*m.push;if(launch||protection){o.vy=protection?320:launch;o.grounded=false;}
    else o.vy=0;
    if(protection)o.invuln=.9;
    this.emit('hit',{x,y,color:r.color,damage:Math.round(scaled),combo:f.combo,kind:c.kind,face,heavy:m.heavy,sound:m.sound});
  }
  // Convenience for model tests; runtime attacks all pass through the shared contact batch.
  hit(f,o,damage,launch,kind,extra={}){const c=this.contact(f,o,damage,launch,kind,extra);this.settle([c]);return c.result==='hit';}

  endRound(){if(this.phase!=='fight')return;const [a,b]=this.fighters;this.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1;if(this.winner>=0)this.wins[this.winner]++;this.phase='roundover';this.phaseTimer=3.2;this.emit('ko',{winner:this.winner});for(let i=0;i<2;i++)for(const k in this.totalStats[i])this.totalStats[i][k]=k==='maxCombo'?Math.max(this.totalStats[i][k],this.fighters[i].stats[k]):this.totalStats[i][k]+this.fighters[i].stats[k];}
  advanceRound(){
    const mode=this.options.mode;
    if(mode==='team'){
      if(this.winner>=0){const loser=1-this.winner;this.teamIndex[loser]++;if(this.teamIndex[loser]>=3){this.phase='finished';return;}const keep={...this.fighters[this.winner]};this.options[loser?'p2':'p1']=this.teams[loser][this.teamIndex[loser]];this.round++;this.resetRound();this.fighters[keep.index].hp=keep.hp;this.fighters[keep.index].meter=keep.meter;return;}
    }
    if(mode==='arcade'||mode==='survival'){if(this.winner!==0){this.phase='finished';return;}this.streak++;if(mode==='arcade'&&this.level>=8){this.phase='finished';return;}this.phase='stageclear';return;}
    if(mode!=='team'&&(this.wins[0]>=2||this.wins[1]>=2)){this.phase='finished';return;}this.round++;this.resetRound();
  }
  nextStage(){this.level++;const current=ROSTER.findIndex(r=>r.id===this.options.p2);this.options.p2=ROSTER[(current+1)%ROSTER.length].id;const hp=this.fighters[0].hp;this.round++;this.wins=[0,0];this.resetRound();if(this.options.mode==='survival')this.fighters[0].hp=Math.min(1000,hp+220);}
}
