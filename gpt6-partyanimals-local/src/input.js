import { EMPTY_INPUT, clamp } from './catalog.js';
export const BINDINGS = [
  {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',run:'ShiftLeft',jump:'Space',punch:'KeyJ',kick:'KeyK',head:'KeyL',grab:'KeyE',throw:'KeyR',interact:'KeyF',emote:'KeyT'},
  {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',run:'ShiftRight',jump:'Numpad0',punch:'Numpad1',kick:'Numpad2',head:'Numpad3',grab:'Numpad4',throw:'Numpad5',interact:'Numpad6',emote:'Numpad7'},
];
export class Inputs {
  constructor(canvas,onPause,onBlur){this.keys=new Set();this.touch=EMPTY_INPUT();this.mouse={};this.active=false;this.maps=BINDINGS.map(x=>({...x}));this.capture=null;
    addEventListener('keydown',e=>{if(this.capture){e.preventDefault();const cb=this.capture;this.capture=null;cb(e.code);return;}if(e.code==='Escape'){e.preventDefault();onPause();return;}if(!this.active||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;e.preventDefault();this.keys.add(e.code);});
    addEventListener('keyup',e=>this.keys.delete(e.code));addEventListener('blur',()=>{this.clear();if(this.active)onBlur();});document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();if(this.active)onBlur();}});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(this.active){if(e.button===0)this.mouse.punch=true;if(e.button===2)this.mouse.grab=true;}});addEventListener('pointerup',e=>{if(e.button===0)this.mouse.punch=false;if(e.button===2)this.mouse.grab=false;});
  }
  clear(){this.keys.clear();this.touch=EMPTY_INPUT();this.mouse={};}
  sample(id,count){const out=EMPTY_INPUT(),b=this.maps[id];if(b){out.x=Number(this.keys.has(b.right))-Number(this.keys.has(b.left));out.z=Number(this.keys.has(b.down))-Number(this.keys.has(b.up));for(const action of['run','jump','punch','kick','head','grab','throw','interact','emote'])out[action]=this.keys.has(b[action]);}
    const pads=Array.from(navigator.getGamepads?.()||[]).filter(p=>p?.connected),offset=Math.max(0,count-pads.length),pad=pads[id-offset];if(pad){const x=pad.axes[0]||0,z=pad.axes[1]||0;if(Math.abs(x)>.15)out.x=x;if(Math.abs(z)>.15)out.z=z;const mapping={jump:0,kick:1,punch:2,head:3,grab:4,throw:5,run:7,interact:6,emote:8};for(const[a,i]of Object.entries(mapping))out[a] ||=!!pad.buttons[i]?.pressed;}
    if(id===0){if(this.touch.x||this.touch.z){out.x=this.touch.x;out.z=this.touch.z;}for(const a of['run','jump','punch','kick','head','grab','throw','interact','emote'])out[a] ||=this.touch[a]||this.mouse[a];}return out;
  }
  bindTouch(root){
    root.querySelectorAll('[data-hold]').forEach(el=>{const key=el.dataset.hold;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);this.touch[key]=true;el.classList.add('held');});const up=()=>{this.touch[key]=false;el.classList.remove('held');};el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);});
    const joystick=root.querySelector('[data-joystick]');if(joystick){let pointer;const move=e=>{if(pointer!==e.pointerId)return;const r=joystick.getBoundingClientRect(),x=clamp((e.clientX-r.x-r.width/2)/(r.width*.35),-1,1),z=clamp((e.clientY-r.y-r.height/2)/(r.height*.35),-1,1);this.touch.x=x;this.touch.z=z;joystick.style.setProperty('--jx',`${x*25}px`);joystick.style.setProperty('--jy',`${z*25}px`);};joystick.addEventListener('pointerdown',e=>{pointer=e.pointerId;joystick.setPointerCapture(pointer);move(e);});joystick.addEventListener('pointermove',move);const up=()=>{pointer=null;this.touch.x=this.touch.z=0;joystick.style.setProperty('--jx','0px');joystick.style.setProperty('--jy','0px');};joystick.addEventListener('pointerup',up);joystick.addEventListener('pointercancel',up);}
  }
}
