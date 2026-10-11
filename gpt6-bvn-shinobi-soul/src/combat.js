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
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const getFighter=id=>ROSTER.find(r=>r.id===id)||ROSTER[0];
function fighter(id,index){return {id,index,x:index?910:370,y:0,vx:0,vy:0,face:index?-1:1,hp:1000,maxHp:1000,chakra:100,meter:0,assist:100,guard:100,state:'idle',time:0,attack:null,stun:0,invuln:0,airJumps:0,combo:0,comboTimer:0,chain:0,lastAttack:-10,awakening:0,aiTimer:0,knockdown:0,stats:{damage:0,hits:0,maxCombo:0,skills:0,blocks:0},trail:[],lastHit:false};}
export class Battle {
  constructor(options={}){this.options={mode:'versus',difficulty:'normal',stage:'valley',assist:'shuriken',p1:'naruto',p2:'ichigo',...options};this.randomSeed=options.seed||2718;this.events=[];this.round=1;this.wins=[0,0];this.level=1;this.streak=0;this.teamIndex=[0,0];this.teams=[this.team(this.options.p1),this.team(this.options.p2)];this.totalStats=[{damage:0,hits:0,maxCombo:0,skills:0,blocks:0},{damage:0,hits:0,maxCombo:0,skills:0,blocks:0}];this.infinite=true;this.dummy='idle';this.resetRound();}
  team(id){const first=getFighter(id),rest=ROSTER.filter(r=>r.clan===first.clan&&r.id!==id);return [id,...rest.slice(0,2).map(r=>r.id)];}
  random(){this.randomSeed=(Math.imul(1664525,this.randomSeed)+1013904223)>>>0;return this.randomSeed/4294967296;}
  emit(type,data={}){this.events.push({type,...data});if(this.events.length>200)this.events.shift();}
  drainEvents(){return this.events.splice(0);}
  resetRound(){this.fighters=[fighter(this.options.p1,0),fighter(this.options.p2,1)];if(this.options.mode==='training')this.fighters.forEach(f=>f.meter=300);if(this.options.mode==='arcade'&&this.level===8){this.fighters[1].maxHp=1400;this.fighters[1].hp=1400;}this.time=99;this.elapsed=0;this.phase='intro';this.phaseTimer=1.9;this.projectiles=[];this.hitstop=0;this.cutin=null;this.winner=null;this.emit('round',{round:this.round});}
  snapshot(){return {phase:this.phase,round:this.round,wins:[...this.wins],time:this.time,mode:this.options.mode,level:this.level,streak:this.streak,teamIndex:[...this.teamIndex],winner:this.winner,cutin:this.cutin?{...this.cutin}:null,projectiles:this.projectiles.length,fighters:this.fighters.map(f=>({id:f.id,x:f.x,y:f.y,hp:f.hp,maxHp:f.maxHp,chakra:f.chakra,meter:f.meter,assist:f.assist,guard:f.guard,state:f.state,combo:f.combo,awakening:f.awakening,invuln:f.invuln,stats:{...f.stats}}))};}
  cpu(f,o){const input={};if(this.options.mode==='training'&&f.index===1&&this.dummy!=='cpu'){input.down=this.dummy==='block';return input;}f.aiTimer-=DT;const diff=this.options.difficulty,dist=Math.abs(f.x-o.x);const factor=diff==='easy'?.68:diff==='hard'?1.6:1;f.aiIntent??={};if(f.aiTimer<=0){f.aiTimer=(.12+this.random()*.22)/factor;const toward=f.x<o.x?'right':'left';input[toward]=dist>getFighter(f.id).reach*.8;const r=this.random();if(o.attack&&dist<210&&r<.43*factor)input.down=true;if(dist<getFighter(f.id).reach+25&&r<.8)input.attack=true;else if(dist<700&&r<.35*factor)input.skill=true;if(f.meter>=100&&dist<450&&r<.16*factor)input.ultimate=true;if(f.assist>=100&&r>.92)input.assist=true;if(dist>300&&r>.7)input.dash=true;if((o.y>50||r>.87)&&dist<500)input.jump=true;if(r<.14)input.up=true;if(f.stun>0&&r<.35*factor)input.dash=true;f.aiIntent={left:input.left,right:input.right,down:input.down,up:input.up};return input;}return {...f.aiIntent};}
  step(inputs=[{},{}],dt=DT){
    if(this.phase==='finished'||this.phase==='stageclear')return;
    if(this.cutin){this.cutin.time-=dt;if(this.cutin.time<=0)this.cutin=null;return;}
    if(this.hitstop>0){this.hitstop-=dt;return;}
    if(this.phase==='intro'||this.phase==='roundover'){this.phaseTimer-=dt;if(this.phaseTimer<=0){if(this.phase==='intro'){this.phase='fight';this.emit('fight');}else this.advanceRound();}return;}
    this.elapsed+=dt;if(this.options.mode!=='training')this.time=Math.max(0,this.time-dt);
    this.fighters.forEach((f,i)=>{const o=this.fighters[1-i];let input=inputs[i]||{};if(this.options.mode==='watch'||(i===1&&this.options.mode!=='local'))input=this.cpu(f,o);this.updateFighter(f,o,input,dt);});
    const [a,b]=this.fighters;const dx=b.x-a.x;if(Math.abs(dx)<52&&Math.abs(a.y-b.y)<110){const push=(52-Math.abs(dx))/2,dir=dx>=0?1:-1;a.x=clamp(a.x-push*dir,45,1235);b.x=clamp(b.x+push*dir,45,1235);}
    for(const p of this.projectiles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;const o=this.fighters[1-p.owner];if(p.life>0&&Math.abs(p.x-o.x)<p.radius+25&&Math.abs(p.y-(o.y+70))<p.radius+65){this.hit(this.fighters[p.owner],o,p.damage,p.launch,p.kind);p.life=0;}}
    this.projectiles=this.projectiles.filter(p=>p.life>0&&p.x>-100&&p.x<1380);
    if(this.options.mode==='training'&&this.infinite){this.fighters.forEach(f=>{f.chakra=100;f.meter=300;f.assist=100;if(f.hp<=0)f.hp=f.maxHp;});}
    if(a.hp<=0||b.hp<=0||this.time<=0)this.endRound();
  }
  updateFighter(f,o,input,dt){
    const r=getFighter(f.id);f.time+=dt;f.chakra=clamp(f.chakra+8*dt,0,100);f.assist=clamp(f.assist+4*dt,0,100);f.guard=clamp(f.guard+7*dt,0,100);f.invuln=Math.max(0,f.invuln-dt);f.awakening=Math.max(0,f.awakening-dt);f.comboTimer-=dt;if(f.comboTimer<=0)f.combo=0;
    if(this.elapsed-f.lastAttack>1.05&&!f.attack)f.chain=0;
    if(f.knockdown>0){f.knockdown-=dt;f.state='down';if(f.knockdown<=0){f.invuln=.7;f.stun=0;f.state='idle';}}
    if(f.stun>0){f.stun-=dt;f.state='hurt';if(input.dash&&f.chakra>=35&&f.knockdown<=0){f.chakra-=35;f.stun=0;f.invuln=.55;f.x=clamp(o.x-o.face*120,60,1220);f.vx=0;f.state='dash';this.emit('escape',{x:f.x,y:f.y,color:r.color,text:'替身'});}else if(input.jump&&f.y>20&&f.chakra>=15){f.chakra-=15;f.stun=0;f.invuln=.3;f.vy=360;this.emit('escape',{x:f.x,y:f.y,color:r.color,text:'受身'});}}
    if(f.attack){const attack=f.attack;attack.t+=dt;f.state=attack.kind==='normal'?'attack':attack.kind==='ultimate'?'ultimate':'skill';if(attack.t>=attack.start&&!attack.fired){attack.fired=true;this.resolveAttack(f,o,attack);}if(attack.t>=attack.duration){f.attack=null;f.lastHit=false;}}
    const free=f.stun<=0&&f.knockdown<=0;const canCancel=f.attack&&f.lastHit&&f.attack.kind!=='ultimate';
    if(free){
      if(!f.attack)f.face=o.x>=f.x?1:-1;
      if(input.ultimate&&(!f.attack||canCancel))this.startAttack(f,o,'ultimate',input);
      else if(input.skill&&(!f.attack||canCancel&&f.attack.kind==='normal'))this.startAttack(f,o,'skill',input);
      else if(input.attack&&!f.attack)this.startAttack(f,o,'normal',input);
      if(input.assist&&f.assist>=100){f.assist=0;f.stats.skills++;if(this.options.assist==='heal'){f.hp=Math.min(f.maxHp,f.hp+170);this.emit('heal',{x:f.x,y:f.y,color:'#9beaaf',text:'+170'});}else{this.projectiles.push({owner:f.index,x:f.x-f.face*40,y:f.y+90,vx:f.face*780,vy:0,radius:this.options.assist==='seal'?65:25,damage:this.options.assist==='seal'?65:110,life:2,launch:this.options.assist==='seal'?200:0,kind:'assist',color:'#d9f6ba'});this.emit('assist',{x:f.x,y:f.y,color:'#d9f6ba'});}}
      if(!f.attack){
        if(input.jump&&f.airJumps<2){f.vy=f.airJumps===0?690:600;f.airJumps++;f.state='jump';this.emit('jump',{x:f.x,y:f.y,color:r.color});}
        if(input.dash&&f.chakra>=12){f.chakra-=12;f.vx=f.face*950;f.invuln=.15;f.dashTime=.19;this.emit('dash',{x:f.x,y:f.y,color:r.color});}
        if((f.dashTime||0)>0){f.dashTime-=dt;f.state='dash';}
        else if(input.down&&f.y<=0){f.state='block';f.vx=0;}
        else{const axis=(input.right?1:0)-(input.left?1:0);f.vx=axis*r.speed*(f.awakening>0?1.2:1);f.state=f.y>0?'jump':axis?'run':'idle';}
      }else f.vx*=.87;
    }else f.vx*=.93;
    f.x=clamp(f.x+f.vx*dt,45,1235);f.vy-=1750*dt;f.y+=f.vy*dt;
    if(f.y<=0){f.y=0;f.vy=0;f.airJumps=0;if(f.stun>0&&f.forceDown){f.knockdown=.65;f.forceDown=false;}}
  }
  startAttack(f,o,kind,input={}){
    const r=getFighter(f.id),dir=input.up?'up':input.down?'down':f.y>10?'air':'neutral';let cost=0;
    if(kind==='skill'){if(f.chakra<24)return false;f.chakra-=24;f.stats.skills++;}
    if(kind==='ultimate'){
      cost=dir==='down'?300:dir==='up'?200:100;if(f.meter<cost)return false;f.meter-=cost;f.stats.skills++;
      this.cutin={id:f.id,index:f.index,name:dir==='down'?'觉醒 · 灵魂共鸣':r.ultimate,time:1.05};this.emit('ultimate',{id:f.id,color:r.color});
      if(dir==='down'){f.awakening=10;f.hp=Math.min(f.maxHp,f.hp+80);f.invuln=1;f.attack=null;return true;}
    }
    if(kind==='normal'){f.chain=(this.elapsed-f.lastAttack<1.05?f.chain%4:0)+1;f.lastAttack=this.elapsed;}
    const n=f.chain||1;f.lastHit=false;f.time=0;
    f.attack={kind,dir,t:0,start:kind==='normal'?.075:kind==='skill'?.13:.18,duration:kind==='normal'?.25+(n===4?.12:0):kind==='skill'?.48:.82,fired:false,chain:n,cost};
    this.emit('swing',{x:f.x,y:f.y,color:r.color,kind});return true;
  }
  resolveAttack(f,o,a){
    const r=getFighter(f.id),air=a.dir==='air';let damage,range,launch=0;
    if(a.kind==='normal'){range=r.reach+(a.chain===4?35:0);damage=(32+a.chain*8)*r.power;launch=a.dir==='up'?570:a.chain===4?260:0;if(a.dir==='down'){damage*=1.15;range+=25;}this.emit('slash',{x:f.x+f.face*range*.6,y:f.y+75,face:f.face,color:r.color,size:range,kind:r.kind});if(Math.abs(f.x-o.x)<range+25&&(o.x-f.x)*f.face>-15&&Math.abs(f.y-o.y)<135)this.hit(f,o,damage,launch,a.dir==='down'?'low':'normal');return;}
    const ult=a.kind==='ultimate';damage=ult?(a.cost===200?290:205):105;damage*=r.power;if(air)damage*=1.1;range=ult?600:r.range;launch=ult?400:a.dir==='up'?580:150;
    if(r.kind==='rush'||r.kind==='lightning'||r.kind==='warp'){
      const distance=Math.abs(o.x-f.x),old=f.x;if(r.kind==='warp'){f.x=clamp(o.x-f.face*85,45,1235);}else f.x=clamp(f.x+f.face*Math.min(range,Math.max(0,distance-65)),45,1235);f.invuln=ult?.35:.12;
      this.emit('rush',{x:old,to:f.x,y:f.y,color:r.color,face:f.face,kind:r.kind,ult});
      if(Math.abs(f.x-o.x)<160&&Math.abs(f.y-o.y)<180)this.hit(f,o,damage,launch,r.kind);
    }else if(r.kind==='quake'){
      range=ult?620:a.dir==='down'?350:235;this.emit('quake',{x:f.x,y:0,color:r.color,size:range,ult});if(Math.abs(f.x-o.x)<range&&o.y<(ult?350:125))this.hit(f,o,damage,ult?580:400,'quake');
    }else if(r.kind==='whip'){
      range=ult?760:a.dir==='up'?260:420;this.emit('whip',{x:f.x,y:f.y+80,face:f.face,size:range,color:r.color,ult});if(Math.abs(f.x-o.x)<range&&(o.x-f.x)*f.face>-20&&Math.abs(f.y-o.y)<(a.dir==='up'?350:140))this.hit(f,o,damage,launch,'whip');
    }else{
      const count=r.kind==='petals'?5:ult?3:1;
      for(let n=0;n<count;n++){const trap=a.dir==='down';this.projectiles.push({owner:f.index,x:trap?f.x+f.face*(110+n*45):f.x+f.face*(65+n*35),y:f.y+65+(r.kind==='petals'?(n-2)*18:n*12),vx:trap?f.face*80:f.face*(ult?740:r.kind==='ice'?470:600),vy:a.dir==='up'?170:air?-180:0,radius:ult?70:r.kind==='petals'?20:45,damage:damage/count,launch,life:trap?3:1.65,kind:r.kind,color:r.color});}
      this.emit('cast',{x:f.x,y:f.y,color:r.color,ult});
    }
  }
  hit(f,o,damage,launch,kind){
    if(o.invuln>0||o.hp<=0)return false;const r=getFighter(f.id);const block=o.state==='block'&&(f.x-o.x)*o.face>0;
    if(block){o.guard-=kind==='quake'?55:25;o.hp=Math.max(1,o.hp-damage*.07);o.vx=f.face*100;o.meter=clamp(o.meter+8,0,300);o.stats.blocks++;this.emit('block',{x:o.x,y:o.y+80,color:'#a8dfea'});if(o.guard<=0){o.guard=40;o.stun=1;this.emit('text',{x:o.x,y:o.y+170,text:'破 防',color:'#fcb186'});}return false;}
    const scaled=damage*Math.max(.45,1-f.combo*.075)*(f.awakening>0?1.25:1);o.hp=Math.max(0,o.hp-scaled);f.stats.damage+=scaled;f.stats.hits++;f.combo++;f.stats.maxCombo=Math.max(f.stats.maxCombo,f.combo);f.comboTimer=1.3;f.lastHit=true;f.meter=clamp(f.meter+13+scaled*.09,0,300);o.meter=clamp(o.meter+9+scaled*.05,0,300);
    o.attack=null;o.state='hurt';o.stun=kind==='ice'?.58:.24+(launch>0?.15:0);o.vx=f.face*(launch>0?260:120);o.vy=launch||Math.max(o.vy,90);if(f.combo>=8){o.vy=300;o.forceDown=true;o.invuln=.8;o.stun=.75;}else if(launch>300)o.forceDown=true;
    this.hitstop=kind==='normal'?.045:.085;this.emit('hit',{x:o.x,y:o.y+85,color:r.color,damage:Math.round(scaled),combo:f.combo,kind});return true;
  }
  endRound(){if(this.phase!=='fight')return;const [a,b]=this.fighters;this.winner=a.hp===b.hp?-1:a.hp>b.hp?0:1;if(this.winner>=0)this.wins[this.winner]++;this.phase='roundover';this.phaseTimer=2.2;this.emit('ko',{winner:this.winner});for(let i=0;i<2;i++)for(const k in this.totalStats[i])this.totalStats[i][k]=k==='maxCombo'?Math.max(this.totalStats[i][k],this.fighters[i].stats[k]):this.totalStats[i][k]+this.fighters[i].stats[k];}
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
