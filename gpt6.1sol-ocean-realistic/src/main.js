import './style.css';
import { Ocean } from './ocean.js';
import { PRESETS, finiteParam, peakPeriod } from './spectrum.js';
import { SeaAudio } from './audio.js';

const $=id=>document.getElementById(id),app=$('app'),canvas=$('sea'),query=new URLSearchParams(location.search);
const mobile=matchMedia('(max-width: 760px)').matches;
const state={preset:PRESETS[query.get('preset')]?query.get('preset'):'swell',paused:query.get('paused')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches,speed:1,immersive:false,quality:mobile?'low':'medium'};
let parameters={...PRESETS[state.preset],objects:true},ocean,audio=new SeaAudio(),animationId,toastTimer,previous,frames=[],graphHistory=[],lastGraphTime=-1;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function updateInputs(){
  for(const key of ['wind','height','direction','sun','cloud','azimuth']) {
    const input=$(key);input.value=parameters[key];input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
    const display=key==='cloud'?Math.round(parameters[key]*100):['wind','height'].includes(key)?parameters[key].toFixed(1):Math.round(parameters[key]);
    const unit={wind:'m/s',height:'m',direction:'°',sun:'°',cloud:'%',azimuth:'°'}[key];$(key+'-value').innerHTML=`${display} <small>${unit}</small>`;
  }
  document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===state.preset;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('objects').checked=parameters.objects;$('quality').value=state.quality;
}
function preset(key){
  if(!PRESETS[key])return;state.preset=key;parameters={...PRESETS[key],objects:parameters.objects};updateInputs();
  $('scene-number').textContent=parameters.number;$('scene-title').textContent=parameters.title;$('scene-description').textContent=parameters.description;
}
function playback(){
  $('play').setAttribute('aria-label',state.paused?'继续模拟':'暂停模拟');$('play-icon').setAttribute('d',state.paused?'M7 4v16l13-8L7 4Z':'M8 5v14M16 5v14');
  $('live-label').textContent=state.paused?'SIMULATION PAUSED':'LIVE SIMULATION';app.classList.toggle('paused',state.paused);
}
function setPanel(open){app.classList.toggle('panel-closed',!open);$('open-panel').setAttribute('aria-expanded',String(open));$('panel').inert=!open;if(!open)$('open-panel').focus();}
function immersive(value){state.immersive=value;app.classList.toggle('immersive',value);document.querySelectorAll('.ui').forEach(el=>el.inert=value);$('restore').hidden=!value;(value?$('restore'):$('immersive')).focus();}
function setView(view){ocean.setView(view);document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
function reset(){preset('swell');parameters.objects=true;state.quality=mobile?'low':'medium';state.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;state.speed=1;$('speed').value='1';ocean.clearDropped();ocean.setQuality(state.quality);setView('horizon');updateInputs();playback();toast('已恢复远洋涌浪');}
function graph(){
  const c=$('graph'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);const mid=c.height/2;
  ctx.strokeStyle='rgba(174,209,197,.16)';ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(c.width,mid);ctx.stroke();ctx.setLineDash([]);
  if(graphHistory.length<2)return;const max=Math.max(1.0,parameters.height),end=ocean.time,start=end-30;
  ctx.beginPath();graphHistory.forEach((p,i)=>{const x=(p.time-start)/30*c.width,y=mid-p.height/max*mid*.72;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#bdd6a7';ctx.lineWidth=1.35;ctx.stroke();
  const last=graphHistory.at(-1);ctx.fillStyle='#d4e8b6';ctx.beginPath();ctx.arc(c.width-1,mid-last.height/max*mid*.72,2,0,Math.PI*2);ctx.fill();
}
function animate(now){
  const raw=previous===undefined?0:(now-previous)/1000;previous=now;
  const dt=state.paused||document.hidden?0:Math.min(raw,0.075)*state.speed;
  ocean.render(dt,parameters,state.paused);audio.update(ocean.time,parameters.wind);
  if(raw>0&&raw<1){frames.push(raw);if(frames.length>90)frames.shift();}
  if(ocean.time-lastGraphTime>=0.1||lastGraphTime<0){
    graphHistory.push({time:ocean.time,height:ocean.surfaceHeight});while(graphHistory.length&&graphHistory[0].time<ocean.time-30)graphHistory.shift();lastGraphTime=ocean.time;graph();
  }
  if(Math.floor(now/200)!==Math.floor((now-raw*1000)/200)||raw===0){
    $('metric-height').textContent=ocean.parameters.height.toFixed(1);$('metric-wind').textContent=ocean.parameters.wind.toFixed(1);$('metric-period').textContent=peakPeriod(ocean.parameters.wind).toFixed(1);
    $('graph-value').textContent=(ocean.surfaceHeight>=0?'+':'')+ocean.surfaceHeight.toFixed(2)+' m';
    const seconds=Math.floor(ocean.time);$('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    $('fps').textContent=(frames.length?Math.round(frames.length/frames.reduce((a,b)=>a+b,0)):'—')+' FPS';
  }
  animationId=requestAnimationFrame(animate);
}
async function start(){
  try{
    ocean=new Ocean(canvas,{parameters,quality:state.quality,seed:finiteParam(query.get('seed'),61,0,4294967295),time:finiteParam(query.get('time'),0,0,86400)});
    preset(state.preset);updateInputs();playback();app.classList.toggle('panel-closed',mobile);$('open-panel').setAttribute('aria-expanded',String(!mobile));$('panel').inert=mobile;
    document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>preset(button.dataset.preset)));
    for(const key of ['wind','height','direction','sun','cloud','azimuth'])$(key).addEventListener('input',()=>{parameters[key]=Number($(key).value);state.preset=null;updateInputs();$('scene-number').textContent='↗';$('scene-title').textContent='属于你的海。';$('scene-description').textContent='风、浪与光，随你的心意改变。';});
    $('objects').addEventListener('change',()=>parameters.objects=$('objects').checked);
    $('quality').addEventListener('change',()=>{state.quality=$('quality').value;ocean.setQuality(state.quality);});
    $('speed').addEventListener('change',()=>state.speed=Number($('speed').value));
    $('play').addEventListener('click',()=>{state.paused=!state.paused;playback();});$('reset').addEventListener('click',reset);
    $('close-panel').addEventListener('click',()=>setPanel(false));$('open-panel').addEventListener('click',()=>setPanel(true));
    $('immersive').addEventListener('click',()=>immersive(true));$('restore').addEventListener('click',()=>immersive(false));
    $('info').addEventListener('click',()=>$('about').showModal());
    for(const kind of ['crate','ring'])$('drop-'+kind).addEventListener('click',()=>{
      parameters.objects=true;$('objects').checked=true;toast(ocean.drop(kind)?(kind==='crate'?'木箱已投放，观察它随浪浮动。':'救生圈已投放，观察它随浪浮动。'):'已有 16 个漂浮物，请先清除。');
    });
    $('clear-objects').addEventListener('click',()=>{ocean.clearDropped();toast('已清除投放物');});
    $('sound').addEventListener('click',async()=>{try{const enabled=await audio.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'关闭海浪声':'开启海浪声');}catch(error){toast(error.message);}});
    $('capture').addEventListener('click',async()=>{
      const blob=await ocean.capture();if(!blob){toast('截图未能生成，请重试');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tideline-${state.preset||'custom'}-${Math.floor(ocean.time)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('海的这一刻，已保存。');
    });
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
    const tabs=[$('tab-sea'),$('tab-sky')];
    function activateTab(index){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==index;});}
    tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>activateTab(i));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?1:1-i;activateTab(index);tabs[index].focus();}});});
    window.addEventListener('keydown',event=>{
      if($('about').open||event.ctrlKey||event.metaKey||event.altKey)return;
      if(event.target.closest('input,select,textarea,[contenteditable=true]'))return;
      if(event.code==='Space'&&!event.target.closest('button,a')){event.preventDefault();state.paused=!state.paused;playback();}
      else if(event.key.toLowerCase()==='h')immersive(!state.immersive);
      else if(event.key.toLowerCase()==='r')reset();
      else if(event.key==='Escape'&&state.immersive)immersive(false);
    });
    let down;canvas.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const body=ocean.pick(e.clientX,e.clientY);if(body)toast({vessel:'远洋小船 · 四点采样，弹簧阻尼浮力',buoy:'观测浮标 · 曲线记录此处的海面高度',crate:'木箱 · 随波起伏',ring:'救生圈 · 随波起伏'}[body.kind]);});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();state.paused=true;playback();toast('图形上下文丢失，请刷新页面恢复');});
    window.__tideline={snapshot:()=>({...ocean.snapshot(),target:{...parameters},preset:state.preset,paused:state.paused,speed:state.speed,immersive:state.immersive,audioEnabled:audio.enabled,frameMeanMs:frames.length?frames.reduce((a,b)=>a+b,0)/frames.length*1000:null})};
    app.classList.add('ready');animationId=requestAnimationFrame(animate);
    window.addEventListener('pagehide',event=>{cancelAnimationFrame(animationId);if(event.persisted){audio.context?.suspend();}else{audio.dispose();ocean.dispose();}});
    window.addEventListener('pageshow',event=>{if(event.persisted){previous=undefined;animationId=requestAnimationFrame(animate);if(audio.enabled)audio.context.resume().catch(()=>{});}});
  }catch(error){
    console.error(error);app.classList.add('failed');$('loading').replaceChildren();const message=document.createElement('span');message.textContent='海面暂时无法启动。请使用支持 WebGL 2 的浏览器，并启用硬件加速。';const link=document.createElement('a');link.href='./';link.textContent='重新载入';$('loading').append(message,link);
  }
}
start();
