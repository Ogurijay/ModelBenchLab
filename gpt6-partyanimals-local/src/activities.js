import { rng, FISH, clamp } from './catalog.js';
export const CARD_COLORS=['coral','gold','mint','blue'];
export class PawsGame {
  constructor(seed=1234,humans=1){this.random=rng(seed);this.humans=humans;this.deck=[];this.discard=[];this.hands=Array.from({length:4},()=>[]);this.turn=0;this.direction=1;this.winner=null;this.called=false;this.drawn=false;this.log=['每人 7 张牌；颜色或数字相同可以出牌。'];
    let id=0;for(const color of CARD_COLORS){this.deck.push({id:id++,color,value:0});for(let copy=0;copy<2;copy++)for(const value of[1,2,3,4,5,6,7,8,9,'skip','reverse','draw2'])this.deck.push({id:id++,color,value});}
    for(let i=0;i<4;i++)for(const value of['wild','draw4'])this.deck.push({id:id++,color:'wild',value});
    this.shuffle(this.deck);for(const h of this.hands)for(let i=0;i<7;i++)h.push(this.take());let first=this.take();while(typeof first.value!=='number'){this.deck.unshift(first);first=this.take();}this.discard=[first];this.color=first.color;this.delay=.8;
  }
  shuffle(d){for(let i=d.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}}
  take(){if(!this.deck.length){const top=this.discard.pop();this.deck=this.discard;this.discard=top?[top]:[];this.shuffle(this.deck);}return this.deck.pop();}
  get top(){return this.discard.at(-1);}
  legal(index,player=this.turn){const c=this.hands[player]?.[index];if(!c||this.winner!==null)return false;if(c.value==='draw4')return !this.hands[player].some(x=>x.color===this.color);return c.color==='wild'||c.color===this.color||c.value===this.top.value;}
  declare(){this.called=true;}
  next(n=1){this.turn=(this.turn+this.direction*n+40)%4;this.called=false;this.drawn=false;this.drawnId=null;this.delay=.85;}
  play(index,color){if(!this.legal(index)||this.drawn&&this.hands[this.turn][index].id!==this.drawnId)return false;const player=this.turn,c=this.hands[player].splice(index,1)[0];this.discard.push(c);this.color=c.color==='wild'?(CARD_COLORS.includes(color)?color:CARD_COLORS[0]):c.color;this.log.push(`玩家 ${player+1}：${c.value}`);if(this.log.length>8)this.log.shift();
    if(this.hands[player].length===1&&!this.called){for(let i=0;i<2;i++){const penalty=this.take();if(penalty)this.hands[player].push(penalty);}this.log.push('忘记喊 PAWS，补两张！');}
    if(!this.hands[player].length){this.winner=player;return true;}
    if(c.value==='reverse')this.direction*=-1;
    if(c.value==='draw2'||c.value==='draw4'){const victim=(player+this.direction+4)%4;for(let i=0;i<(c.value==='draw4'?4:2);i++){const x=this.take();if(x)this.hands[victim].push(x);}this.next(2);}else this.next(c.value==='skip'?2:1);return true;
  }
  draw(){if(this.winner!==null)return;if(this.drawn){this.next();return;}const c=this.take();if(!c){this.next();return;}this.hands[this.turn].push(c);this.drawn=true;this.drawnId=c.id;if(!this.legal(this.hands[this.turn].length-1))this.next();}
  tick(dt){if(this.turn<this.humans||this.winner!==null)return;this.delay-=dt;if(this.delay>0)return;const hand=this.hands[this.turn],index=hand.findIndex((_,i)=>this.legal(i)&&(!this.drawn||hand[i].id===this.drawnId));if(index>=0){this.declare();const color=CARD_COLORS.map(c=>[c,hand.filter(x=>x.color===c).length]).sort((a,b)=>b[1]-a[1])[0][0];this.play(index,color);}else this.draw();this.delay=.85;}
}

export class Fishing {
  constructor(seed=1234,season='winter',rod=0){this.random=rng(seed);this.season=season;this.rod=rod;this.phase='ready';this.time=0;this.tension=.3;this.progress=0;this.fish=null;this.holding=false;this.wait=0;this.catches=[];}
  cast(){if(!['ready','caught','lost'].includes(this.phase))return;this.phase='waiting';this.time=0;this.wait=2+this.random()*4;const r=this.random(),index=r>.97?6:r>.90?7:r>.78?5:r>.62?4:r>.42?3:r>.24?2:r>.1?1:0;this.fish=FISH[index];this.tension=.3;this.progress=0;}
  hook(){if(this.phase==='bite'){this.phase='reeling';this.time=0;}else if(this.phase==='waiting')this.phase='lost';}
  tick(dt){this.time+=dt;if(this.phase==='waiting'&&this.time>=this.wait){this.phase='bite';this.time=0;}if(this.phase==='bite'&&this.time>1.8){this.phase='lost';this.time=0;}if(this.phase==='reeling'){
    const pull=(.10+Math.sin(this.time*2.7)*.05)*this.fish.difficulty;
    this.tension=clamp(this.tension+dt*(this.holding?.36+pull:-.38),0,1.1);
    this.progress=clamp(this.progress+dt*(this.holding&&this.tension<.91?(10+this.rod*2)/this.fish.difficulty:-1.2),0,100);
    if(this.tension>=1.04){this.phase='lost';this.time=0;}else if(this.progress>=100){this.phase='caught';this.weight=+(this.fish.difficulty*(.7+this.random()*2)).toFixed(2);this.catches.push({id:this.fish.id,weight:this.weight});this.time=0;}
  }}
}
