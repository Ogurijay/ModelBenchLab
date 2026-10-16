import {FIGHTER_SCALE} from './moves.js';
import {spriteBounds} from './sprite-metrics.js';
import {spritePose} from './animation.js';
import {ROSTER,getFighter,FLOOR,STAGE_PLATFORMS} from './combat.js';
const urls=import.meta.glob('../../shared/assets/bvn-shinobi-soul/*.png',{eager:true,query:'?url',import:'default'});
const images={},pivots={},TAU=Math.PI*2;
export const assetStatus={loaded:0,total:Object.keys(urls).length,ready:false,error:null};
export async function loadAssets(progress=()=>{}){
  await Promise.all(Object.entries(urls).map(async([path,url])=>{const id=path.split('/').pop().replace('.png',''),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error(`素材加载失败: ${id}`));img.src=url;});images[id]=img;assetStatus.loaded++;progress(assetStatus);}));
  for(const r of ROSTER)if(!images[r.id])throw Error(`缺少角色素材：${r.name}`);
  for(const id of ['portraits','stage-leaf','stage-valley','stage-seireitei'])if(!images[id])throw Error(`缺少素材：${id}`);
  for(const [id,img] of Object.entries(images))if(!id.startsWith('stage-')&&id!=='portraits'){
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data,cw=Math.floor(img.width/4),ch=Math.floor(img.height/4);
    pivots[id]=Array.from({length:16},(_,frame)=>{const ox=frame%4*cw,oy=Math.floor(frame/4)*ch,crop=id.includes('-motion-')?spriteBounds(data,img.width,ox,oy,cw,ch):{left:0,top:0,right:cw,bottom:ch};let bottom=crop.bottom;
      for(let y=crop.bottom-1;y>Math.max(crop.top,ch*.55);y--){let count=0;for(let x=Math.floor(cw*.15);x<cw*.85;x++)if(data[((oy+y)*img.width+ox+x)*4+3]>80)count++;if(count>cw*.04){bottom=y+1;break;}}
      let left=cw,right=0;for(let y=Math.max(0,Math.floor(bottom-ch*.1));y<bottom;y++)for(let x=Math.floor(cw*.2);x<cw*.8;x++)if(data[((oy+y)*img.width+ox+x)*4+3]>80){left=Math.min(left,x);right=Math.max(right,x);}
      return {x:right>left?(left+right)/2/cw:.5,y:bottom/ch,crop};
    });
  }
  assetStatus.ready=true;
}
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
function poly(c,pts,color,stroke,width=2){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,pts,color,width=2){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function text(c,str,x,y,size=20,color='#fff',align='left'){c.save();c.font=`900 ${size}px Arial Black, Microsoft YaHei, sans-serif`;c.textAlign=align;c.lineJoin='round';c.lineWidth=Math.max(2,size*.13);c.strokeStyle='#09102a';c.strokeText(str,x,y);c.fillStyle=color;c.fillText(str,x,y);c.restore();}
export function poseFrame(f){return spritePose(f,false).frame;}
export function drawFighter(c,f,t=0,opts={}){
  const awakened=!!(f.form&&images[f.id+'-awakened']),pose=opts.frame===undefined?spritePose(f,!!images[f.id+'-motion-v3'],awakened):{frame:opts.frame,sheet:'base'};
  const id=awakened?f.id+'-awakened':pose.sheet==='motion'?f.id+'-motion-v3':f.id,img=images[id];if(!img)return;
  const frame=pose.frame,cw=img.width/4,ch=img.height/4,size=190*FIGHTER_SCALE*(opts.scale??1),pivot=pivots[id]?.[frame]||{x:.5,y:.955};
  c.save();c.translate(Math.round(opts.x??f.x),Math.round(opts.y??FLOOR-f.y));c.scale(opts.face??f.face??1,1);c.imageSmoothingEnabled=false;c.globalAlpha*=opts.alpha??1;
  if(f.awakening>0&&!opts.portrait){c.save();c.globalAlpha*=.23;for(let i=0;i<7;i++){const h=100+Math.sin(t*12+i)*30;poly(c,[[i*13-42,2],[i*13-52,-h],[i*13-35,-h-20],[i*13-30,2]],getFighter(f.id).color);}c.restore();}
  if(f.state==='down'&&pose.sheet!=='motion'){c.rotate(-Math.PI/2);c.translate(40,45);}
  if(f.reaction&&['hit','launch'].includes(f.reaction.kind)&&f.reaction.age<2)c.filter='brightness(1.65)';
  const crop=pivot.crop||{left:0,top:0,right:cw,bottom:ch},sw=crop.right-crop.left,sh=crop.bottom-crop.top;c.drawImage(img,(frame%4)*cw+crop.left,Math.floor(frame/4)*ch+crop.top,sw,sh,size*(crop.left/cw-pivot.x),size*(crop.top/ch-pivot.y),size*sw/cw,size*sh/ch);c.restore();
}
export function portrait(c,id,x,y,w,h,face=1){const img=images.portraits;if(!img)return;const idx=ROSTER.findIndex(r=>r.id===id),cw=img.width/4,ch=img.height/2;c.save();c.translate(x+(face<0?w:0),y);c.scale(face,1);c.imageSmoothingEnabled=true;c.drawImage(img,idx%4*cw,Math.floor(idx/4)*ch,cw,ch,0,0,w,h);c.restore();}
export function drawPortrait(canvas,id,{side=1}={}){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);portrait(c,id,0,0,w,h,side);}
export function drawRoundResult(c,game){
  const elapsed=3.2-game.phaseTimer,draw=game.winner<0;
  c.save();rect(c,0,0,1280,720,'#030b1b99');
  if(elapsed<.38){text(c,game.time<=0?'TIME UP':draw?'DOUBLE K.O.':'K.O.',640,355,92,'#ffe393','center');c.restore();return;}
  const progress=Math.min(1,(elapsed-.38)/.32),slide=(1-progress)**3*150;
  c.globalAlpha=progress;c.translate(-slide,0);
  const winner=game.fighters[draw?0:game.winner],r=getFighter(winner.id);
  const gradient=c.createLinearGradient(0,130,1280,580);gradient.addColorStop(0,'#122642');gradient.addColorStop(.6,'#071225');gradient.addColorStop(1,draw?'#28314a':r.color+'88');
  poly(c,[[0,153],[1280,112],[1280,571],[0,616]],gradient);
  c.save();c.beginPath();c.rect(0,155,draw?530:420,432);c.clip();
  if(draw){portrait(c,game.fighters[0].id,25,155,250,365);portrait(c,game.fighters[1].id,280,155,250,365,-1);}
  else portrait(c,winner.id,88,108,355,485);
  c.restore();
  line(c,[[0,153],[1280,112]],'#ffe8a6',4);line(c,[[0,616],[1280,571]],draw?'#9ebfe0':r.color,4);
  text(c,`ROUND ${game.round}  /  ${draw?'DRAW':game.winner===0?'PLAYER 1':game.options.mode==='local'?'PLAYER 2':'COM'}`,835,215,19,'#b9dcf0','center');
  text(c,draw?'平局':r.name,835,295,46,'#fff8e9','center');
  text(c,draw?(game.time<=0?'TIME UP':'DOUBLE K.O.'):'ROUND WINNER',835,345,30,draw?'#b9dcf0':r.color,'center');
  text(c,`${game.wins[0]}  :  ${game.wins[1]}`,835,447,70,'#ffe29a','center');
  text(c,draw?'双方平局 · 即将再战':'赢得本回合',835,503,19,'#d3e6f0','center');
  c.restore();
}
export function drawPreview(c,p1,p2,stage,t){const w=c.canvas.width,h=c.canvas.height,portraitWidth=485/Math.max(.4,(c.canvas.clientWidth/c.canvas.clientHeight)/(1280/720));c.clearRect(0,0,w,h);c.save();c.scale(w/1280,h/720);const g=c.createRadialGradient(640,350,0,640,350,800);g.addColorStop(0,'#30779e');g.addColorStop(.55,'#16385f');g.addColorStop(1,'#071225');rect(c,0,0,1280,720,g);c.save();c.globalAlpha=.18;for(let i=0;i<30;i++){const x=(i*80+t*13)%1500-100;line(c,[[x,0],[x-300,720]],'#b9e9ff');}for(let i=0;i<15;i++)line(c,[[0,i*50],[1280,i*50]],'#8bbbd9',1);c.restore();
  c.save();c.beginPath();c.moveTo(0,60);c.lineTo(400,60);c.lineTo(480,650);c.lineTo(0,650);c.clip();portrait(c,p1,227.5-portraitWidth/2,40,portraitWidth,635,1);c.restore();c.save();c.beginPath();c.moveTo(880,60);c.lineTo(1280,60);c.lineTo(1280,650);c.lineTo(800,650);c.clip();portrait(c,p2,1052.5-portraitWidth/2,40,portraitWidth,635,-1);c.restore();
  text(c,'VS',640,336,112,'#ffe388','center');text(c,'CHARACTER SELECT',640,45,31,'#f4f9ff','center');text(c,'BLEACH × NARUTO',640,76,12,'#b6e5f7','center');
  const fade=c.createLinearGradient(0,490,0,720);fade.addColorStop(0,'#06142b00');fade.addColorStop(1,'#061229');rect(c,0,490,1280,230,fade);c.restore();}
export function drawStage(c,id='leaf',t=0){const img=images['stage-'+id];if(img){c.save();c.imageSmoothingEnabled=false;c.drawImage(img,0,0,1280,720);c.restore();}else rect(c,0,0,1280,720,'#295775');for(const p of STAGE_PLATFORMS[id]||[]){const y=FLOOR-p.y;rect(c,p.x,y,p.w,7,'#dbe0b7');rect(c,p.x,y+7,p.w,12,'#697779');rect(c,p.x,y+19,p.w,4,'#223641');for(let x=p.x+5;x<p.x+p.w;x+=34){rect(c,x,y+8,25,3,'#a2aca1');rect(c,x,y+12,2,8,'#30464c');}rect(c,p.x-3,y-3,p.w+6,3,id==='leaf'?'#9fba6a':'#c8d7d9');}for(let i=0;i<10;i++){const x=(i*177+t*15)%1320,y=110+(i*67)%400+Math.sin(t+i)*10;rect(c,x,y,3,2,id==='seireitei'?'#f8c9df':'#d9e5ad');}}
export function drawHUD(c,game){c.save();game.fighters.forEach((f,i)=>{const right=!!i,x=right?748:80,w=450;poly(c,[[x,32],[x+w,32],[x+w-17,63],[x+17,63]],'#071021','#c9e9f1',3);c.save();c.beginPath();c.rect(right?x+w-w*f.hp/f.maxHp:x,36,w*f.hp/f.maxHp,23);c.clip();rect(c,x,36,w,23,'#e89435');rect(c,x,36,w,14,'#f5d552');rect(c,x,36,w,4,'#fff6a5');c.restore();portrait(c,f.id,right?1193:12,3,74,84,right?-1:1);text(c,getFighter(f.id).name,right?1179:97,24,17,'#fff',right?'right':'left');text(c,right?game.options.mode==='local'?'2P':'COM':'1P',right?1229:46,105,17,right?'#fa8c75':'#80d8f9','center');
    rect(c,x,71,w*.5,6,'#10182a');rect(c,right?x+w*.5*(1-f.chakra/100):x,71,w*.5*f.chakra/100,6,'#65c9e9');rect(c,x,82,w*.32,4,'#102334');rect(c,right?x+w*.32*(1-f.guard/100):x,82,w*.32*f.guard/100,4,'#b5d996');
    if(['block','blockstun'].includes(f.state))text(c,'防御中',right?1100:150,112,15,'#a1efff','center');
    const ex=right?950:90;poly(c,[[ex,668],[ex+240,668],[ex+226,687],[ex-9,687]],'#142b48','#9bd5e4',2);rect(c,ex,671,226*f.meter/300,12,'#ffbd34');for(let n=1;n<3;n++)rect(c,ex+n*75,670,2,15,'#111d32');text(c,Math.floor(f.meter/100),right?1230:44,690,42,'#fff8b9','center');text(c,'POWER',ex+113,707,11,'#c7e9f6','center');text(c,f.assist>=100?'援助 READY':`援助 ${Math.floor(f.assist)}%`,right?1090:188,647,12,f.assist>=100?'#e7ffb9':'#cad6e4','center');for(let n=0;n<2;n++){c.beginPath();c.arc(right?774+n*19:506-n*19,19,5,0,TAU);c.fillStyle=game.wins[i]>n?'#ffdf6a':'#365775';c.fill();}
    if(f.combo>1&&f.comboTimer>0){text(c,f.combo,right?1165:111,205,51,'#ffe986','center');text(c,'HITS',right?1165:111,229,19,'#fff','center');}if(f.awakening>0)text(c,'覚醒',right?1185:92,112,15,getFighter(f.id).color,right?'right':'left');});poly(c,[[555,0],[725,0],[707,77],[573,77]],'#101d36','#96c3d1',2);text(c,game.options.mode==='training'?'∞':Math.ceil(game.time).toString().padStart(2,'0'),640,52,49,'#f6eaba','center');text(c,'ROUND '+game.round,640,94,12,'#e2eafa','center');text(c,game.options.mode==='team'?`${game.teamIndex[0]+1}/3 TEAM ${game.teamIndex[1]+1}/3`:game.options.mode==='training'?'TRAINING MODE':game.options.mode==='arcade'?`STAGE ${game.level} / 8`:'BLEACH VS NARUTO',640,699,12,'#e3ecf1','center');c.restore();}
export function drawCutin(c,info){const r=getFighter(info.id);rect(c,0,0,1280,720,'#000b');c.save();c.beginPath();c.moveTo(0,205);c.lineTo(1280,145);c.lineTo(1280,455);c.lineTo(0,515);c.closePath();c.clip();const g=c.createLinearGradient(0,0,1280,0);g.addColorStop(0,'#161b47');g.addColorStop(.65,r.color);g.addColorStop(1,'#15112f');rect(c,0,100,1280,500,g);for(let i=0;i<26;i++)line(c,[[0,170+i*14],[1280,70+i*14]],'#fff3',2);portrait(c,info.id,10,-5,500,660);text(c,info.transform?'TRANSFORMATION':'SUPER ART',875,249,23,'#fff','center');text(c,info.name,875,335,info.name.length>14?24:32,'#fff6bc','center');text(c,r.name,875,390,17,'#fff','center');c.restore();line(c,[[0,205],[1280,145]],'#fff2bd',4);line(c,[[0,515],[1280,455]],r.color,4);}
