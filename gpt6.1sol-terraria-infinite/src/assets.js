import {ITEMS,RACES,BIOMES} from './data.js';
import {hash} from './world.js';
export const TILE_PX=24;
export const pixel=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
export function shade(hex,v){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(c=>Math.max(0,Math.min(255,c+v)).toString(16).padStart(2,'0')).join('');}
const canvas=(w,h)=>{const a=document.createElement('canvas');a.width=w;a.height=h;return a;};
const cached=new Map();
function ellipse(c,x,y,rx,ry,color){for(let j=-ry;j<=ry;j++){const len=Math.round(rx*Math.sqrt(Math.max(0,1-j*j/(ry*ry))));pixel(c,x-len,y+j,len*2+1,1,color);}}
export function character(c,x,y,config={},scale=1,frame=0,dir=1,equipment={}){
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(dir*scale,scale);const race=RACES.find(r=>r.id===config.race)||RACES[0],skin=config.skin||race.skin,hair=config.hairColor||'#88603b',shirt=config.outfit||'#407e85',armor=ITEMS[equipment.body]?.color,helm=ITEMS[equipment.head]?.color,leg=ITEMS[equipment.legs]?.color;const walk=frame?Math.round(Math.sin(frame)*3):0,r=(x,y,w,h,col)=>pixel(c,x,y,w,h,col),ink='#273044';
 // 20 x 42 layered sprite, with palette shading and articulated gait.
 r(-6,-17,12,5,ink);r(-5,-14,5,11+walk,ink);r(1,-14,5,11-walk,ink);r(-4,-13,3,10+walk,leg||'#536581');r(2,-13,3,10-walk,leg||'#536581');r(-5,-10,1,8+walk,leg?shade(leg,-35):'#354158');r(1,-10,1,8-walk,leg?shade(leg,-35):'#354158');r(-6,-3+walk,7,4,ink);r(1,-3-walk,7,4,ink);r(-5,-3+walk,5,2,'#846447');r(2,-3-walk,5,2,'#846447');r(-4,-2+walk,3,1,'#b28c5c');
 r(-6,-29,12,13,ink);r(-5,-28,10,10,armor||shirt);r(-5,-27,2,8,armor?shade(armor,-38):shade(shirt,-25));r(-2,-28,4,2,armor?shade(armor,36):shade(shirt,25));r(3,-26,2,7,armor?shade(armor,20):shade(shirt,12));r(-5,-20,10,3,'#765033');r(-1,-20,3,3,'#d9b454');r(0,-19,1,1,'#fff0a0');
 r(-9,-27,4,11,ink);r(-8,-26,3,7,armor||shirt);r(-8,-19,3,5,shade(skin,-35));r(-7,-19,2,4,skin);r(5,-27,4,11,ink);r(6,-26,2,7,armor||shade(shirt,12));r(6,-19,3,5,skin);r(6,-15,2,1,shade(skin,-30));
 r(-4,-38,10,11,ink);r(-3,-37,8,9,skin);r(-3,-36,2,7,shade(skin,-28));r(-1,-37,5,2,shade(skin,20));r(3,-34,3,3,shade(skin,12));r(2,-34,2,2,'#f1f1d7');r(3,-34,1,2,race.id==='nightelf'?'#afefbe':'#24364c');r(5,-32,2,2,skin);r(1,-29,3,1,shade(skin,-42));
 r(-5,-40,10,4,ink);r(-4,-39,9,3,hair);r(-4,-38,2,6,hair);r(-3,-39,6,1,shade(hair,34));r(-5,-36,2,6,shade(hair,-25));r(3,-37,3,2,hair);r(-3,-31,2,3,hair);
 if(config.hair===1){r(-6,-36,3,16,shade(hair,-25));r(-5,-35,1,14,hair);r(-7,-24,2,3,shade(hair,15));}if(config.hair===2){r(-3,-44,6,4,ink);r(-2,-43,4,4,hair);r(-1,-43,2,2,shade(hair,25));}if(['nightelf','bloodelf'].includes(race.id)){r(-9,-34,5,2,skin);r(-10,-35,3,1,shade(skin,22));r(5,-34,5,2,skin);r(8,-35,3,1,skin);}if(['orc','troll'].includes(race.id)){r(-1,-29,2,3,'#e9e2b8');r(4,-30,2,3,'#fff0c8');}if(race.id==='dwarf'){r(-3,-30,8,5,hair);r(-1,-26,5,2,hair);r(-1,-29,1,4,shade(hair,30));}if(race.id==='draenei'){r(-6,-42,2,8,'#b9b4cc');r(-7,-44,2,3,'#ece2d4');r(5,-42,2,6,'#a5b2d2');}
 if(helm){r(-5,-41,11,5,ink);r(-4,-40,9,4,helm);r(-3,-40,7,1,shade(helm,35));r(-5,-37,2,6,shade(helm,-25));r(4,-37,3,3,helm);}
 c.restore();
}
export function treeAsset(bi=0,seed=1,height=200){const key=`tree-${bi}-${seed%8}-${height}`;if(cached.has(key))return cached.get(key);const a=canvas(160,height+95),c=a.getContext('2d'),pal=[['#214b2f','#306b35','#43893b','#60a444','#80bb4d','#a5c85a'],['#5e5831','#7d7840','#97914b','#afa754','#c6b56a'],['#294e48','#3d6960','#598d7b','#9abcac','#d3e4d4'],['#303e63','#465581','#616b9b','#8995b9','#a8b7d3'],['#675228','#937034','#b8953f','#d6b453','#e9ce71']][bi];
 const r=(x,y,w,h,col)=>pixel(c,x,y,w,h,col),base=height+94,cy=67;
 // Irregular trunk, roots, branches, highlights and bark cracks.
 for(let y=cy;y<base;y++){const width=5+(y>base-22?Math.floor((y-(base-22))/5):0),bend=Math.round(Math.sin(y*.021+seed)*1.7);r(79-width/2+bend,y,width,1,'#4a392a');r(81-width/2+bend,y,Math.max(2,width-2),1,'#89633c');if(hash(y,seed)>.45)r(81+bend,y,1,2,'#ad824b');if(hash(y,seed+4)>.79)r(78+bend,y,2,4,'#3f332b');}
 for(let k=0;k<7;k++){let by=cy+30+k*(height-45)/7,side=k%2?1:-1;for(let j=0;j<18;j++)r(80+side*j,by-j*.65,4,3,'#674b32');r(80+side*13,by-11,8,3,'#997046');}
 // Leaf lobes use a pixel silhouette, then clustered 1–3 px highlights.
 const lobes=[[80,36,31,28],[52,49,30,28],[110,51,27,24],[35,69,27,25],[75,67,42,33],[124,75,26,24],[55,91,30,19],[100,91,31,20]];
 for(const [cx,cy,rx,ry]of lobes)ellipse(c,cx,cy,rx,ry,pal[0]);
 const mask=c.getImageData(0,0,160,116);
 for(let y=8;y<113;y++)for(let x=7;x<153;x++){if(!mask.data[(y*160+x)*4+3])continue;let best=100,center=null;for(const l of lobes){const v=((x-l[0])/l[2])**2+((y-l[1])/l[3])**2;if(v<best){best=v;center=l;}}const h=hash(Math.floor(x/5),Math.floor(y/4),seed);const lighting=(center[1]-y)/center[3];let level=1+(best<.65?1:0)+(lighting>.12?1:0)+(lighting>.45&&h>.5?1:0);if(h<.18)level--;r(x,y,1,1,pal[Math.max(0,Math.min(pal.length-1,level))]);}
 for(let i=0;i<310;i++){const x=Math.floor(11+hash(i,2,seed)*138),y=Math.floor(13+hash(i,3,seed)*94);if(mask.data[(y*160+x)*4+3]&&mask.data[((y+2)*160+x+3)*4+3]){const h=hash(i,4,seed);r(x,y,3,1,pal[h>.5?3:1]);r(x+1,y+1,3,1,pal[h>.5?4:2]);}}
 cached.set(key,a);return a;}
export function tileAsset(tile,bi=0,variant=0){const key=`tile-${tile}-${bi}-${variant}`;if(cached.has(key))return cached.get(key);const a=canvas(24,24),c=a.getContext('2d'),b=BIOMES[bi];let col=({1:'#765037',2:'#765037',3:'#62657b',6:'#62657b',7:'#62657b',8:'#62657b',9:'#a97843',15:'#7e8491',16:'#62657b',17:'#c9b278',18:'#a36954',19:'#c5dbe4',20:'#65503b',21:'#62657b',22:'#62657b',23:'#4b5b69',24:'#454157',25:'#69483f',26:'#a0d2df',47:'#9b5449',48:'#a89766'})[tile]||b.dirt;
 pixel(c,0,0,24,24,col);for(let i=0;i<100;i++){const h=hash(i,variant,tile+bi),x=Math.floor(hash(i,1,variant+tile)*24),y=Math.floor(hash(i,2,variant+tile)*24);pixel(c,x,y,h>.7?2:1,h>.6?2:1,shade(col,Math.floor((h-.6)*50)));}
 if([3,6,7,8,16,21,22,23,24,25].includes(tile)){for(let i=0;i<6;i++){const x=Math.floor(hash(i,4,variant)*19),y=Math.floor(hash(i,5,tile+variant)*22);pixel(c,x,y,5,1,shade(col,-23));pixel(c,x+5,y+1,3,1,shade(col,-23));pixel(c,x,y-1,4,1,shade(col,13));}}
 const ore=({6:'#c69164',7:'#c4bec0',8:'#333846',16:'#87d8dc',21:'#bdcee5',22:'#d9b35b',23:'#75d5b1',25:'#dc714c'})[tile];if(ore)for(let i=0;i<7;i++){const x=2+Math.floor(hash(i,6,variant+tile)*17),y=2+Math.floor(hash(i,7,variant+tile)*17);pixel(c,x-1,y,4,4,shade(ore,-50));pixel(c,x,y-1,4,3,ore);pixel(c,x+1,y-1,2,1,shade(ore,37));}
 if(tile===9){for(let y=0;y<24;y+=6){pixel(c,0,y,24,1,'#61452d');pixel(c,0,y+1,24,1,'#ba8d53');pixel(c,(y*3+variant*7)%20,y,1,6,'#65482e');pixel(c,3,y+3,11,1,'#99703f');}}if([15,47,48].includes(tile)){for(let y=0;y<24;y+=8){pixel(c,0,y,24,1,shade(col,-35));pixel(c,0,y+1,24,1,shade(col,18));pixel(c,(y/8%2)*12,y,1,8,shade(col,-35));}}
 if(tile===26){pixel(c,0,0,24,1,'#e6f3e5');pixel(c,0,0,1,24,'#e6f3e5');for(let i=0;i<20;i++)pixel(c,2+i,20-i,1,1,'#cdebed');}
 cached.set(key,a);return a;}
export function itemIcon(c,id,x,y,size=32){const it=ITEMS[id];if(!it)return;const key=`icon-${id}`;let a=cached.get(key);if(!a){a=canvas(32,32);const d=a.getContext('2d'),r=(x,y,w,h,col)=>pixel(d,x,y,w,h,col),col=it.color||'#bbc6d2',dark=shade(col,-60),light=shade(col,40),ink='#28303c';const type=it.icon|| (it.category==='矿石'?'ore':it.tile||it.wall?'block':'gem');
 const blade=()=>{for(let j=0;j<18;j++){r(9+j,23-j,4,3,ink);r(10+j,22-j,2,2,col);r(11+j,22-j,1,1,light);}r(8,22,7,3,'#ce9d48');r(6,26,5,3,'#835834');};
 if(type==='sword')blade();else if(['pick','axe','hammer'].includes(type)){for(let j=0;j<21;j++){r(6+j*.62,28-j,3,3,'#4c382b');r(7+j*.62,28-j,1,2,'#b88c54');}if(type==='pick'){r(9,5,16,4,ink);r(8,5,16,2,col);r(7,7,5,4,col);r(24,7,3,6,dark);r(9,4,11,1,light);}else{r(14,4,12,11,ink);r(15,5,10,8,col);r(15,5,9,1,light);if(type==='axe')r(10,7,6,7,col);}}
 else if(type==='bow'){for(let i=0;i<23;i++){const xx=17+Math.sin(i/22*Math.PI)*8;r(xx,i+4,3,2,'#563c28');r(xx,i+4,1,1,'#d3a05d');}r(17,4,1,24,'#e4ddbc');r(8,15,19,1,'#a68b61');r(27,13,3,5,'#c7d1d4');}
 else if(type==='staff'){for(let j=0;j<23;j++){r(6+j*.55,28-j,3,2,'#624936');r(7+j*.55,28-j,1,1,'#c49b69');}r(16,3,9,9,ink);r(17,4,7,7,col);r(19,4,3,3,light);r(18,11,6,2,'#dfb365');}
 else if(type==='arrow'){for(let i=0;i<21;i++)r(5+i,27-i,1,2,'#b89a65');r(22,3,6,5,col);r(4,23,6,2,'#cbbf8b');r(6,26,2,3,'#cbbf8b');}
 else if(type==='ingot'){r(4,16,24,10,ink);r(8,11,17,5,light);r(5,16,22,7,col);r(6,22,20,3,dark);r(23,13,4,9,dark);r(6,16,17,1,light);}
 else if(type==='helmet'){ellipse(d,16,15,11,11,ink);ellipse(d,16,14,9,9,col);r(10,18,12,7,ink);r(8,17,3,9,col);r(22,17,3,9,col);r(10,7,10,2,light);r(15,6,3,12,light);}
 else if(type==='armor'){r(9,6,14,22,ink);r(3,8,26,9,ink);r(4,9,24,6,col);r(10,7,12,19,col);r(13,7,6,4,ink);r(11,13,9,2,light);r(11,21,9,2,dark);r(4,9,5,2,light);r(23,9,5,2,light);}
 else if(type==='boots'){r(6,4,8,22,ink);r(18,4,8,22,ink);r(7,5,6,18,col);r(19,5,6,18,col);r(3,23,11,5,dark);r(15,23,11,5,dark);r(6,5,7,2,light);r(18,5,7,2,light);}
 else if(type==='block'){const tex=tileAsset(it.tile||9,0,id.length%5);d.drawImage(tex,5,6,22,22);r(5,6,22,1,light);if(it.wall){r(6,15,20,1,ink);r(16,6,1,9,ink);}}
 else if(type==='ore'||type==='gem'||type==='gel'){for(let i=0;i<7;i++){const px=5+hash(i,id.length)*18,py=10+hash(i,2,id.length)*14;ellipse(d,px,py,4,4,ink);ellipse(d,px,py-1,3,3,col);r(px-1,py-3,2,1,light);}}
 else if(['potion','bottle'].includes(type)){r(13,2,7,4,'#aa8350');r(12,6,8,6,'#8cbbc3');ellipse(d,16,21,9,9,'#30454e');ellipse(d,16,20,8,8,'#bfdce0');if(type==='potion'){ellipse(d,16,22,7,6,it.color||'#e56378');r(10,17,12,2,shade(it.color||'#e56378',20));}r(10,16,2,8,'#e7f4e4');r(13,8,2,5,'#ebf8e4');}
 else if(type==='seed'||type==='herb'){r(15,7,2,23,'#8a8e46');for(let i=0;i<4;i++){ellipse(d,11,8+i*4,4,2,type==='seed'?'#ddc17c':'#95c55f');ellipse(d,20,6+i*4,4,2,type==='seed'?'#cab066':'#6cab50');}}
 else if(type==='mushroom'){r(14,16,5,12,'#ddd4af');ellipse(d,16,13,12,7,'#6c3d46');ellipse(d,16,11,11,6,'#d36964');r(10,9,3,3,'#f2dfc0');r(20,10,3,2,'#f2dfc0');}
 else if(type==='berry'){for(let i=0;i<4;i++){ellipse(d,10+i%2*10,17+Math.floor(i/2)*6,5,5,'#633b51');ellipse(d,10+i%2*10,16+Math.floor(i/2)*6,4,4,'#c96582');r(9+i%2*10,14+Math.floor(i/2)*6,2,1,'#f4a899');}r(14,7,2,8,'#70904b');ellipse(d,19,8,5,2,'#91b34e');}
 else if(type==='torch'||type==='lantern'||type==='campfire'){r(14,13,4,16,'#87633b');ellipse(d,16,11,5,8,'#db743e');ellipse(d,16,11,3,6,'#efc36c');r(15,7,2,6,'#fff1b0');if(type==='lantern'){r(8,5,2,19,ink);r(23,5,2,19,ink);r(8,4,17,2,'#b1a16e');r(8,24,17,2,'#b1a16e');}if(type==='campfire'){r(4,26,24,3,'#8c6949');r(7,23,17,3,'#bc8950');}}
 else if(type==='platform'||type==='rope'||type==='fence'){if(type==='rope'){r(15,2,2,28,'#d1b07c');for(let i=3;i<30;i+=5)r(14,i,4,2,'#8c623d');}else{r(2,12,28,5,'#b48b51');r(2,12,28,1,'#dfb676');r(4,17,3,8,'#6a4e32');r(25,17,3,8,'#6a4e32');}}
 else if(type==='door'){r(8,1,16,30,ink);r(10,2,12,27,'#926c3e');r(11,3,9,10,'#b18a53');r(11,16,9,11,'#b18a53');r(18,14,3,2,'#e5bb64');}
 else if(type==='chest'){r(2,12,28,16,ink);r(4,8,24,6,'#c2914b');r(3,14,26,12,'#8d633c');r(5,15,22,2,'#c39352');r(6,9,2,17,'#c8b06d');r(24,9,2,17,'#c8b06d');r(14,14,5,7,'#efc774');r(16,16,1,3,'#5d4536');}
 else if(type==='anvil'){r(5,8,24,5,'#b1bcc5');r(2,9,5,2,'#d8ded6');r(10,13,13,9,'#697789');r(7,22,20,4,'#8b96a3');r(8,7,18,1,'#e2e3d4');}
 else if(type==='furnace'||type==='forge'){r(4,8,24,22,'#3b424c');r(7,3,18,7,'#8a8290');r(5,9,22,20,'#797782');for(let i=10;i<28;i+=6)r(5,i,22,1,'#4c4c5d');r(9,16,14,12,'#252b3b');r(11,23,10,4,'#e68a44');r(14,21,5,5,'#f3cf72');r(10,4,12,2,'#b1a59b');}
 else if(type==='chair'){r(9,4,3,24,'#b2844c');r(9,4,16,3,'#d0a05c');r(9,16,18,4,'#c29354');r(24,20,3,8,'#936b3e');r(11,8,12,2,'#82603c');}
 else if(type==='bench'||type==='table'){r(2,10,28,5,'#92673e');r(2,9,28,2,'#d1a468');r(5,15,4,14,'#806039');r(24,15,4,14,'#806039');r(8,24,17,2,'#97723e');if(type==='bench'){r(6,7,10,2,'#d8b47b');r(22,5,3,4,'#b8b8bb');}}
 else if(type==='bookcase'||type==='loom'||type==='sawmill'){r(4,3,24,27,'#765037');r(6,5,20,23,'#3f3540');for(let y=5;y<28;y+=10){r(5,y+8,22,2,'#ba8c54');for(let i=0;i<6;i++)r(7+i*3,y,2,8,['#8f6579','#91a79a','#b9a069','#768aa9'][i%4]);}if(type==='loom')r(10,6,12,20,'#d8c5a2');}
 else if(type==='alchemy'||type==='arcane'){r(3,25,26,4,'#a28b7e');r(5,23,22,2,'#d0b7a4');r(7,12,18,11,'#57516b');ellipse(d,16,12,7,7,it.color||'#859ee9');r(14,8,3,3,'#c5f2f3');}
 else if(type==='bed'){r(2,16,28,10,'#90663f');r(2,10,3,20,'#bf9458');r(26,18,3,12,'#bf9458');r(5,14,7,6,'#e3dccc');r(12,15,15,8,'#9c5060');r(13,15,13,2,'#d7847e');}
 else if(type==='shield'||type==='amulet'||type==='rune'){ellipse(d,16,16,10,13,'#685347');ellipse(d,16,15,8,11,col);r(14,7,4,17,'#f3da92');r(9,13,14,3,'#f3da92');}
 else if(type==='banner'){r(6,2,2,28,'#b68c59');r(8,3,19,22,'#557fa4');r(15,8,4,12,'#dec683');r(11,12,12,3,'#dec683');}
 else if(type==='flowerpot'){ellipse(d,16,12,8,8,'#679843');r(11,19,12,10,'#b47c55');r(9,18,16,3,'#d9a271');r(15,5,3,5,'#c9a3dc');}
 else if(type==='cloth'||type==='hide'){r(7,6,20,23,dark);r(5,4,20,23,col);r(5,4,20,2,light);for(let y=8;y<25;y+=4)r(6,y,18,1,shade(col,-16));if(type==='hide'){r(3,7,3,5,col);r(25,20,3,7,col);r(9,10,2,12,dark);r(10,11,1,10,light);}else{r(7,5,1,21,light);r(21,5,2,22,dark);}}
 else if(type==='thread'||type==='wire'){r(7,5,17,3,'#98704b');r(7,25,17,3,'#98704b');for(let j=0;j<8;j++)r(10,8+j*2,12,2,j%2?col:light);r(20,10,2,18,col);r(20,27,7,1,col);}
 else if(type==='gear'){for(let i=0;i<8;i++){const angle=i*Math.PI/4;r(14+Math.cos(angle)*10,14+Math.sin(angle)*10,5,5,col);}ellipse(d,16,16,11,11,dark);ellipse(d,16,15,9,9,col);ellipse(d,16,15,4,4,ink);r(12,8,5,1,light);}
 else if(type==='bomb'||type==='powder'){ellipse(d,16,21,10,10,ink);ellipse(d,15,20,8,8,col);r(10,14,3,6,light);r(14,9,5,4,'#684a35');r(17,6,2,5,'#c4a971');r(18,5,6,2,'#c4a971');if(type==='bomb'){r(24,2,2,5,'#ffbd67');r(22,4,6,1,'#fff0af');}}
 else if(type==='goggles'){r(2,12,28,9,'#745d3d');r(5,9,10,15,col);r(18,9,10,15,col);r(7,11,6,10,'#71b1c8');r(20,11,6,10,'#71b1c8');r(8,12,2,5,'#cfe7e6');r(21,12,2,5,'#cfe7e6');r(14,14,5,3,'#d0b97b');}
 else if(type==='grapple'){r(14,10,3,20,'#947b54');r(12,4,7,15,col);r(7,7,5,4,col);r(3,10,5,10,col);r(19,7,5,4,col);r(23,10,5,10,col);r(13,3,5,2,light);}
 else if(type==='quiver'){r(9,9,13,22,dark);r(10,9,11,20,col);r(10,11,11,3,light);for(let i=0;i<3;i++){r(11+i*4,2,1,15,'#d6c28a');r(10+i*4,2,3,4,'#e7d8b6');}r(11,25,9,2,light);}
 else if(type==='bandage'){r(5,8,23,17,'#afa38c');r(5,7,23,15,col);for(let i=0;i<6;i++)r(6+i*4,8,1,13,light);r(14,10,4,10,'#af6c66');r(10,13,12,4,'#af6c66');}
 else if(type==='tannery'){r(3,3,3,27,'#a47b4a');r(26,3,3,27,'#a47b4a');r(3,4,25,3,'#c29a5c');r(8,8,16,17,'#b99062');r(6,10,4,10,'#b99062');r(22,10,3,10,'#b99062');r(10,9,2,13,'#d3b07a');r(9,24,5,3,'#b99062');}
 else if(type==='engineeringBench'){r(2,17,28,5,'#8b704c');r(3,17,26,2,'#c8a76c');r(4,22,4,9,'#7c735e');r(25,22,4,9,'#7c735e');r(4,5,5,12,'#8b9da9');r(3,4,18,4,'#a6b7c3');r(19,7,4,8,'#8396a6');r(10,13,15,3,'#5c737b');r(11,12,3,2,'#8fc6c8');}
 else if(type==='bone'){for(let i=0;i<17;i++)r(9+i*.7,25-i,3,2,'#e1d8b7');ellipse(d,9,25,3,3,'#f4e8c4');ellipse(d,23,7,3,3,'#f4e8c4');}
 else{ellipse(d,16,20,12,8,ink);ellipse(d,16,18,11,7,it.color||'#c9a067');for(let i=0;i<5;i++)r(8+i*4,16,2,4,'#e6c995');}
 cached.set(key,a);}c.imageSmoothingEnabled=false;c.drawImage(a,Math.round(x),Math.round(y),size,size);}
export function iconURL(id){const a=canvas(48,48);itemIcon(a.getContext('2d'),id,0,0,48);return a.toDataURL();}
export function atlasCanvas(){const ids=Object.keys(ITEMS),a=canvas(16*40,Math.ceil(ids.length/16)*40),c=a.getContext('2d');ids.forEach((id,i)=>itemIcon(c,id,(i%16)*40,Math.floor(i/16)*40,32));return a;}

export function skillIconURL(cls,s,i){const key=`skill-${cls.id}-${i}`;if(cached.has(key))return cached.get(key);const a=canvas(36,36),c=a.getContext('2d'),r=(x,y,w,h,col)=>pixel(c,x,y,w,h,col),col=s.color||cls.color,light=shade(col,45);r(0,0,36,36,'#203044');for(let j=0;j<15;j++)r(hash(j,i)*34,hash(j,4+i)*34,1,1,shade(col,-45));
 if(s.heal){r(14,5,8,25,shade(col,-35));r(6,13,24,9,shade(col,-35));r(16,6,4,22,light);r(7,15,22,4,light);r(16,15,4,4,'#fff2c5');}
 else if(s.freeze){for(let j=0;j<24;j++){r(17,6+j,2,1,light);r(6+j,17,1,2,light);r(8+j*.8,8+j*.8,2,2,col);r(27-j*.8,8+j*.8,2,2,col);}r(14,14,8,8,'#d1eff8');r(17,17,2,2,'#f6fffb');}
 else if(s.shield){r(8,7,20,17,col);r(10,24,16,4,col);r(14,28,8,3,col);r(11,10,14,13,shade(col,-45));r(17,9,3,18,light);r(11,14,14,3,light);}
 else if(s.dash){for(let j=0;j<12;j++){r(8+j,7+j,4,3,light);r(8+j,28-j,4,3,col);}r(3,15,11,2,col);r(5,20,8,1,light);}
 else if(s.projectile||cls.id==='mage'||cls.id==='shaman'){for(let j=0;j<5;j++)r(3+j*3,26-j*3,12-j,2,shade(col,-20+j*8));ellipse(c,24,12,8,8,shade(col,-35));ellipse(c,24,11,6,6,col);ellipse(c,24,10,3,3,'#fff0cb');}
 else{itemIcon(c,cls.id==='ranger'?'woodBow':'ironSword',2,2,32);if(i>0){r(4,4,5,2,light);r(3,3,2,5,light);r(26,29,6,2,col);}}
 const url=a.toDataURL();cached.set(key,url);return url;}
