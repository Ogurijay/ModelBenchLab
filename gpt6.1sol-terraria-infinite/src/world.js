import {Exploration} from './exploration.js';
import {RACES,TILE,BIOMES,SOLID_TILES} from './data.js';
export const CHUNK=32, DEPTH=112, DAY=720;
export function hash(x,y=0,seed=1){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(seed|0,144269); n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function smooth(x,seed){const i=Math.floor(x),f=x-i,t=f*f*(3-2*f);return hash(i,7,seed)*(1-t)+hash(i+1,7,seed)*t;}
export class World{
 constructor(seed=42719,race='human',saved={}){this.fog=new Exploration(saved.fog||[]);this.seed=seed;this.race=race;this.cache=new Map();this.walls=new Map(saved.walls||[]);this.objects=new Map(saved.objects||[]);this.edits=new Map(saved.edits||[]);this.devices=new Map(saved.devices||[]);this.visited=new Set(saved.visited||[]);this.time=saved.time??DAY/3;}
 biome(x){const base=RACES.find(r=>r.id===this.race)?.biome||0;return (base+Math.abs(Math.floor((x+80)/180)))%BIOMES.length;}
 surface(x){if(Math.abs(x)<17)return 34;const blend=Math.min(1,(Math.abs(x)-17)/18);return Math.floor(34+blend*((smooth(x/30,this.seed)-0.5)*15+(smooth(x/8,this.seed+1)-0.5)*4));}
 base(x,y){if(y<0)return 0;if(y>=DEPTH)return TILE.STONE;const s=this.surface(x);
  if(y>=s){if(y===s)return this.biome(x)===2?19:this.biome(x)===1?17:1;if(y<s+5)return hash(Math.floor(x/5),Math.floor(y/3),this.seed)>.8?18:this.biome(x)===1?17:2;
   const cave=Math.sin(x*.19+Math.sin(y*.21)*2+this.seed)*Math.cos(y*.18+Math.sin(x*.1));if(y>s+9&&y<DEPTH-3&&cave>.50)return 0;
   const ore=hash(Math.floor(x/2),Math.floor(y/2),this.seed+21);const d=y-s;if(d>65&&ore>.88)return 25;if(d>50&&ore>.82&&ore<.88)return 23;if(d>36&&ore>.62&&ore<.69)return 22;if(d>24&&ore>.54&&ore<.62)return 21;if(d>40&&ore>.47&&ore<.5)return 24;if(ore>.965&&y>s+25)return TILE.CRYSTAL;if(ore>.90&&y>s+9)return TILE.IRON;if(ore>.81&&ore<.87)return TILE.COAL;if(ore>.72&&ore<.79)return TILE.COPPER;return TILE.STONE;
  }
  for(let tx=x-3;tx<=x+3;tx++){if(Math.abs(tx)<6||tx%8!==0||hash(tx,1,this.seed)<.17)continue;const ts=this.surface(tx),height=8+Math.floor(hash(tx,2,this.seed)*3);if(x===tx&&y<ts&&y>=ts-height)return TILE.WOOD;const dy=y-(ts-height);if(dy>=-3&&dy<=1&&Math.abs(x-tx)<=3-Math.floor(Math.abs(dy)/2)&&hash(x,y,this.seed)>.08)return TILE.LEAF;}
  return 0;
 }
 chunk(cx){if(this.cache.has(cx))return this.cache.get(cx);const cells=new Uint8Array(CHUNK*DEPTH);for(let lx=0;lx<CHUNK;lx++)for(let y=0;y<DEPTH;y++){const x=cx*CHUNK+lx;cells[y*CHUNK+lx]=this.edits.get(`${x},${y}`)??this.base(x,y);}this.cache.set(cx,cells);this.visited.add(cx);return cells;}
 get(x,y){x=Math.floor(x);y=Math.floor(y);if(y<0)return 0;if(y>=DEPTH)return TILE.STONE;const cx=Math.floor(x/CHUNK);return this.chunk(cx)[y*CHUNK+(x-cx*CHUNK)];}
 set(x,y,tile){x=Math.floor(x);y=Math.floor(y);if(y<0||y>=DEPTH-1)return false;const key=`${x},${y}`;this.edits.set(key,tile);if(this.fog.get(x,y)!==null)this.fog.remember(x,y,tile);const cx=Math.floor(x/CHUNK);this.chunk(cx)[y*CHUNK+(x-cx*CHUNK)]=tile;
  this.devices.delete(key);if([TILE.CROP,TILE.FURNACE,TILE.FORGE].includes(tile))this.devices.set(key,{tile,at:this.time,queue:[]});return true;
 }
 solid(x,y){return SOLID_TILES.has(this.get(x,y));}
 manage(x){const center=Math.floor(x/CHUNK);for(const k of this.cache.keys())if(Math.abs(k-center)>5)this.cache.delete(k);}
 get calendar(){const day=Math.floor(this.time/DAY)+1,hours=((this.time%DAY)/DAY)*24;return {day,hours,season:['春','夏','秋','冬'][Math.floor((day-1)/8)%4],night:hours<6||hours>=19,weather:hash(day,0,this.seed)>.72?'雨':'晴',blood:day%7===0};}
 grow(key){const d=this.devices.get(key);return d?.tile===TILE.CROP?Math.min(3,Math.floor((this.time-d.at)/35)):0;}
 serialize(){return {time:this.time,fog:this.fog.serialize(),walls:[...this.walls],objects:[...this.objects],edits:[...this.edits],devices:[...this.devices],visited:[...this.visited]};}
}
