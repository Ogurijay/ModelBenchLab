import { ACHIEVEMENTS, COSTUMES, ANIMALS, FISH, MAPS, MODES, clamp } from './catalog.js';
export const STORAGE_KEY='party-club.local.v1';
export function blankProfile(){return{version:1,xp:0,cookies:200,animal:'corgi',costume:'classic',owned:['classic'],achievements:[],stats:{matches:0,wins:0,hits:0,kos:0,throws:0,fish:0,cards:0,races:0},fish:{},bucket:[],history:[],settings:{volume:.45,music:.3,quality:'high',shake:true,touch:false,split:false,locale:'zh'},daily:{date:'',played:0,claimed:false},rod:0,tutorial:[]};}
export function sanitize(raw){
 const p=blankProfile();if(!raw||raw.version!==1)return p;
 const number=(v,max=1e8,fallback=0)=>Number.isFinite(Number(v))?clamp(Number(v),0,max):fallback;
 for(const key of['xp','cookies','rod'])p[key]=Math.floor(number(raw[key],key==='rod'?3:1e8));for(const key in p.stats)p.stats[key]=Math.floor(number(raw.stats?.[key]));
 if(ANIMALS.some(a=>a.id===raw.animal))p.animal=raw.animal;
 p.owned=Array.isArray(raw.owned)?[...new Set(['classic',...raw.owned.filter(id=>COSTUMES.some(c=>c.id===id))])]:p.owned;p.costume=p.owned.includes(raw.costume)?raw.costume:'classic';
 p.achievements=Array.isArray(raw.achievements)?[...new Set(raw.achievements.filter(id=>ACHIEVEMENTS.some(a=>a.id===id)))]:[];
 for(const key of['volume','music'])p.settings[key]=number(raw.settings?.[key]??p.settings[key],1,p.settings[key]);
 for(const key of['shake','touch','split'])if(typeof raw.settings?.[key]==='boolean')p.settings[key]=raw.settings[key];
 if(['high','medium','low'].includes(raw.settings?.quality))p.settings.quality=raw.settings.quality;
 if(Array.isArray(raw.settings?.bindings)&&raw.settings.bindings.length===2&&raw.settings.bindings.every(b=>b&&Object.values(b).every(v=>typeof v==='string'&&/^[A-Za-z0-9]{1,24}$/.test(v))))p.settings.bindings=raw.settings.bindings;
 p.history=Array.isArray(raw.history)?raw.history.filter(h=>h&&MODES.some(m=>m.id===h.mode)&&MAPS.some(m=>m.id===h.map)).slice(0,30).map(h=>({mode:h.mode,map:h.map,win:!!h.win,xp:number(h.xp),time:typeof h.time==='string'?h.time.slice(0,30):''})):[];
 p.bucket=Array.isArray(raw.bucket)?raw.bucket.filter(f=>f&&FISH.some(x=>x.id===f.id)&&Number.isFinite(f.weight)&&f.weight>0).slice(0,200).map(f=>({id:f.id,weight:number(f.weight,100),price:Math.round(FISH.find(x=>x.id===f.id).price*number(f.weight,100)),locked:!!f.locked})):[];
 for(const fish of FISH){const amount=Math.floor(number(raw.fish?.[fish.id]));if(amount)p.fish[fish.id]=amount;}
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw.daily?.date))p.daily={date:raw.daily.date,played:number(raw.daily.played),claimed:raw.daily.claimed===true};
 p.tutorial=Array.isArray(raw.tutorial)?raw.tutorial.filter(v=>['move','jump','hit','stun','grab','throw'].includes(v)):[];return p;
}
export class Profile {
  constructor(storage){this.storage=storage;this.error=null;try{this.data=sanitize(JSON.parse(storage?.getItem(STORAGE_KEY)||'null'));}catch{this.data=blankProfile();this.error='旧存档无法读取，已使用临时新档；原数据未覆盖。';this.corrupt=true;}this.awarded=new Set();}
  save(){if(this.corrupt)return false;try{this.storage?.setItem(STORAGE_KEY,JSON.stringify(this.data));return true;}catch{this.error='浏览器无法保存，当前进度仅保留在本次打开期间。';return false;}}
  get level(){return Math.floor(Math.sqrt(this.data.xp/80))+1;}
  refreshDaily(){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());if(this.data.daily.date!==date)this.data.daily={date,played:0,claimed:false};}
  rewardMatch(id,result){if(this.awarded.has(id))return[];this.awarded.add(id);const p=this.data;p.stats.matches++;if(result.win)p.stats.wins++;if(result.mode==='kart')p.stats.races++;for(const k of['hits','kos','throws'])p.stats[k]+=result.stats?.[k]||0;const xp=90+(result.win?100:0)+Math.min(100,(result.stats?.hits||0)*3);p.xp+=xp;p.cookies+=result.win?90:45;p.history.unshift({mode:result.mode,map:result.map,win:result.win,xp,time:new Date().toISOString()});p.history=p.history.slice(0,30);const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());if(p.daily.date!==date)p.daily={date,played:0,claimed:false};p.daily.played++;const achievements=this.check();this.save();return achievements;}
  check(){const earned=[];for(const a of ACHIEVEMENTS)if(!this.data.achievements.includes(a.id)&&this.data.stats[a.key]>=a.target){this.data.achievements.push(a.id);this.data.cookies+=a.reward;earned.push(a);}return earned;}
  purchase(id){const c=COSTUMES.find(x=>x.id===id);if(!c||this.data.owned.includes(id)||this.data.cookies<c.price)return false;this.data.cookies-=c.price;this.data.owned.push(id);this.data.costume=id;this.save();return true;}
  equip(id){if(!this.data.owned.includes(id))return false;this.data.costume=id;this.save();return true;}
  catchFish(fish,weight){this.data.stats.fish++;this.data.fish[fish.id]=(this.data.fish[fish.id]||0)+1;this.data.bucket.push({id:fish.id,weight,price:Math.round(fish.price*weight),locked:false});if(this.data.bucket.length>200)this.data.bucket.shift();this.data.xp+=20;const a=this.check();this.save();return a;}
  sellFish(){const sold=this.data.bucket.filter(f=>!f.locked),value=sold.reduce((s,f)=>s+(f.price||0),0);this.data.bucket=this.data.bucket.filter(f=>f.locked);this.data.cookies+=value;this.save();return value;}
  winCards(){this.data.stats.cards++;this.data.cookies+=80;this.data.xp+=60;this.check();this.save();}
  claimDaily(){this.refreshDaily();const d=this.data.daily;if(d.played<3||d.claimed)return false;d.claimed=true;this.data.cookies+=150;this.save();return true;}
  upgradeRod(){const cost=(this.data.rod+1)*180;if(this.data.rod>=3||this.data.cookies<cost)return false;this.data.cookies-=cost;this.data.rod++;this.save();return true;}
  import(text){const raw=JSON.parse(text);if(raw.version!==1)throw new Error('存档版本不兼容');const next=sanitize(raw);try{this.storage?.setItem(STORAGE_KEY+'.backup',JSON.stringify(this.data));}catch{}this.corrupt=false;this.data=next;this.save();}
}
