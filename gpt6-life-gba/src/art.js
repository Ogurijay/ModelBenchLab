import { TILE, HOME_OBJECTS, TOWN_OBJECTS, isWall, mood } from './model.js';

const C={grass:'#94aa77',grassLight:'#9fb781',grassDark:'#839e68',outline:'#6d7255',wood:'#b58c62',woodDark:'#97724f',cream:'#f0e7ce',white:'#fff4da',floor:'#dfc397',floorLine:'#d0ad80',wall:'#efe4c8',wallSide:'#c7b894',leaf:'#648855',leafLight:'#86a165',leafDark:'#4f7550',pink:'#d69d8e',blue:'#91b4b3'};
let ctx;
const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const line=(x,y,w,c)=>r(x,y,w,1,c);
const text=(s,x,y,c='#9b9779',size=6)=>{ctx.fillStyle=c;ctx.font=`${size}px Consolas, monospace`;ctx.fillText(s,Math.round(x),Math.round(y));};
const hash=(x,y,seed=0)=>{const v=Math.sin(x*127.1+y*311.7+seed*73.1)*43758.5453;return v-Math.floor(v);};
function shadow(x,y,w,h=4){r(x+2,y,w-2,h,'#6e775d33');r(x+4,y+h,w-6,2,'#6e775d20');}
function outline(x,y,w,h,fill,edge=C.outline){r(x,y,w,h,edge);r(x+1,y+1,w-2,h-2,fill);}
function ellipsePixel(x,y,w,h,color){r(x+3,y,w-6,h,color);r(x,y+3,w,h-6,color);r(x+1,y+1,w-2,h-2,color);}
function flower(x,y,color='#e8c993'){r(x,y+1,1,5,'#6e8b56');r(x-2,y+3,2,1,'#6e8b56');r(x-2,y-1,5,2,color);r(x-1,y-2,3,4,color);r(x,y-1,1,1,'#eedea8');}
function grass(scene){
  r(0,0,480,320,C.grass);
  for(let y=0;y<320;y+=16)for(let x=0;x<480;x+=16){const v=hash(x,y);r(x,y,16,16,v>.78?'#98ae7a':v<.2?'#90a774':C.grass);for(let i=0;i<3;i++){const a=x+Math.floor(hash(x+i,y,2)*13),b=y+Math.floor(hash(x,y+i,5)*13);r(a,b,1,2,'#869e6a');r(a+2,b-1,1,2,'#a6ba83');}}
  if(scene==='home'){
    for(let y=274;y<320;y+=9)for(let x=208;x<272;x+=16)outline(x+(y%2?4:0),y,14,8,'#d7c49b','#c9b68e');
    for(let x=25;x<455;x+=25)fence(x,27);for(let y=56;y<310;y+=22){fence(20,y,true);fence(452,y,true);}
    for(let x=34;x<206;x+=11){flower(x,302+(x%3)*2,x%2?'#dfac9a':'#eadab0');}for(let x=294;x<445;x+=13)flower(x,297+x%7,x%2?'#d7b6be':'#f2dfab');
    tree(22,105,.85);tree(455,93,.85);bush(36,204,24);bush(432,238,27);tree(43,287,.8);tree(433,293,.85);
    r(61,282,49,13,'#78925d');r(65,279,43,12,'#af9e70');for(let i=0;i<5;i++){r(69+i*8,283,4,6,'#8d7754');flower(71+i*8,280,'#e4bd8e');}
    // Mailbox, boots and small stones in the front garden.
    r(288,282,3,13,C.woodDark);outline(281,274,16,10,'#7a9692');r(282,275,13,2,'#a6c1b0');r(296,273,2,7,'#c58374');
    r(180,287,9,4,'#c4baa0');r(180,286,6,2,'#ddd1b4');r(308,311,8,3,'#b4b69a');
  }else{
    r(0,152,480,34,'#d5c59b');r(222,0,37,320,'#d5c59b');r(31,133,145,20,'#d5c59b');r(345,124,66,29,'#d5c59b');
    for(let i=0;i<380;i++){const x=Math.floor(hash(i,8)*480),y=Math.floor(hash(i,12)*320);if((y>153&&y<183)||(x>224&&x<257)){r(x,y,2,1,'#c5b68c');}}
    line(0,151,221,'#b6b78b');line(260,151,220,'#b6b78b');line(0,186,480,'#b6b78b');
    for(let x=10;x<480;x+=25)fence(x,25);tree(26,122,1.1);tree(278,95,1.45);tree(435,145,.9);tree(30,264,1.15);tree(301,287,1.0);tree(444,300,1.1);
    for(let i=0;i<25;i++)flower(28+Math.floor(hash(i,7)*420),200+Math.floor(hash(i,9)*80),i%2?'#e3bda2':'#dedcb1');
    bush(183,112,24);bush(296,127,31);bush(155,267,31);bush(391,299,30);
    lampPost(187,152);lampPost(299,157);
    text('SUNNY SQUARE',185,200,'#9ba077',6);
  }
}
function fence(x,y,vertical=false){
  if(vertical){r(x,y,3,25,'#baad83');r(x-1,y,5,7,'#e1d3ab');r(x-1,y+19,5,7,'#e1d3ab');r(x+1,y+2,1,4,'#f0e1b7');}
  else{r(x,y+5,25,3,'#cabb90');r(x+2,y,4,15,'#decda4');r(x+3,y,2,12,'#efe0b5');r(x+16,y,4,15,'#decda4');r(x+17,y,2,12,'#efe0b5');}
}
function bush(x,y,w){shadow(x,y+12,w,4);ellipsePixel(x,y,w,15,C.leafDark);ellipsePixel(x+1,y-4,w-3,16,C.leaf);r(x+5,y-5,w-14,3,C.leafLight);for(let i=0;i<w/4;i++)r(x+4+i*4,y+(i%2)*4,3,2,'#88a16a');}
function tree(x,y,scale=1){
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);shadow(-18,1,42,6);r(-4,-27,8,30,'#826947');r(-2,-25,3,25,'#a18352');r(-8,0,6,3,'#826947');r(2,0,7,3,'#826947');r(-10,-17,8,4,'#826947');
  ellipsePixel(-25,-45,49,25,'#557949');ellipsePixel(-28,-58,55,29,'#648a51');ellipsePixel(-20,-71,40,31,'#709457');ellipsePixel(-11,-79,23,27,'#7e9d5d');ellipsePixel(-23,-61,25,24,'#82a260');ellipsePixel(0,-56,23,20,'#719553');
  r(-15,-70,12,3,'#93af6e');r(-22,-52,11,3,'#94ae6f');r(7,-60,10,3,'#8fac66');r(1,-42,12,3,'#86a55d');r(-8,-30,7,2,'#456f49');ctx.restore();
}
function windowAt(x,y,w=25){
  shadow(x,y+22,w,3);outline(x,y,w,24,'#f8ebd1','#a9906b');outline(x+3,y+2,w-6,18,'#a7cbd0','#c4af89');r(x+5,y+4,w-10,7,'#b5d5d2');r(x+6,y+4,2,11,'#d5e5d5');r(x+w-10,y+5,2,9,'#cce2d5');r(x+Math.floor(w/2),y+2,2,18,'#f7eccf');r(x+3,y+11,w-6,2,'#f7eccf');r(x+1,y,3,18,'#fff0cf');r(x+w-4,y,3,18,'#fff0cf');r(x-2,y+22,w+4,3,'#ceb994');
}
function homeBase(s){
  shadow(49,266,385,9);r(46,48,389,224,'#9f9975');r(48,48,384,219,C.floor);
  for(let y=64;y<263;y+=10){line(49,y,382,C.floorLine);for(let x=49+(y%20?16:0);x<432;x+=32)r(x,y-9,1,9,'#d1b087');}
  // Quiet bedroom and checkerboard bathroom floors.
  r(64,64,112,80,'#d4bf9e');for(let y=66;y<144;y+=10){line(64,y,112,'#c8b18e');for(let x=64+(y%20?16:0);x<176;x+=32)r(x,y-2,1,10,'#c8b18e');}
  r(352,64,64,80,'#d4e1d9');for(let y=64;y<144;y+=8)for(let x=352;x<416;x+=8){r(x,y,7,7,((x+y)/8)%2?'#d5e0d6':'#e6e9d8');}
  // Kitchen tiles, rugs and a little spilled sunlight.
  r(198,64,137,34,'#ddd8b3');for(let y=65;y<98;y+=8)for(let x=199;x<335;x+=8)r(x,y,7,7,(x+y)%16?'#e5dfbd':'#d7d4af');
  rug(84,181,77,47,s.upgrades.includes('rug')?'#cf9d88':'#b5bd93');rug(92,126,44,14,'#cbb2a9');rug(352,112,23,14,'#a6bdad');rug(216,246,48,14,'#b0ac82');
  ctx.globalAlpha=.18;r(95,76,22,38,'#fff8d3');r(113,88,12,29,'#fff8d3');r(287,76,23,28,'#fff8d3');ctx.globalAlpha=1;
  // Cutaway walls retain a low front sill so the character remains visible.
  for(let y=3;y<=16;y++)for(let x=3;x<=26;x++){
    const wall=isWall('home',x,y)||(x===21&&y>=4&&y<=8&&y!==7);
    if(!wall)continue;
    const front=y===16,py=y*16-(front?0:8),height=front?7:24;
    r(x*16,py,16,height,C.wallSide);r(x*16,py,16,front?4:16,C.wall);r(x*16,py,16,3,'#f8efd4');line(x*16,py+height-2,16,'#b7a985');
    if(x===3||x===26)r(x*16,py,3,height,'#f6edd2');
  }
  // Door arches in the two interior walls.
  r(176,119,16,3,'#baa880');r(177,117,14,2,'#e9ddbd');r(336,103,16,3,'#baa880');
  windowAt(93,42,34);windowAt(282,42,32);windowAt(378,42,23);
  // Pictures and a clock on the wall.
  outline(149,47,14,18,'#ede0bb','#a88a62');r(151,50,10,12,'#bbcfad');r(153,55,6,7,'#8eaa80');r(157,52,3,3,'#f2d59a');
  outline(252,46,12,12,'#f4e8c8','#b49a73');r(257,49,1,4,'#8c8d6c');r(258,52,3,1,'#8c8d6c');
  text('BEDROOM',100,155,'#b39e7f');text('LIVING ROOM',77,244,'#ad976d');text('KITCHEN',265,153,'#b29b75');
  // A reading chair beside the writing desk.
  outline(300,197,13,12,'#a8b3a0','#87937b');r(299,196,15,3,'#c2c9ad');r(301,209,2,4,C.woodDark);r(310,209,2,4,C.woodDark);
  if(s.upgrades.includes('plant'))furniture('plant',277,221,16,16,s);
  if(s.upgrades.includes('lamp'))furniture('lamp',173,211,16,16,s);
  // A tiny pair of slippers by the entrance.
  r(267,246,4,7,'#a09a79');r(273,246,4,7,'#a09a79');r(267,246,4,2,'#c3bda0');r(273,246,4,2,'#c3bda0');
}
function rug(x,y,w,h,color){outline(x,y,w,h,color,'#a29873');r(x+2,y+2,w-4,h-4,'#ece0b6');r(x+4,y+4,w-8,h-8,color);for(let a=x+8;a<x+w-6;a+=8)r(a,y+5,1,h-10,'#e6debb66');for(let b=y+8;b<y+h-5;b+=7)line(x+5,b,w-10,'#e6debb66');for(let a=x+3;a<x+w;a+=4){r(a,y-2,1,2,'#d9ca9e');r(a,y+h,1,2,'#d9ca9e');}}
function furniture(kind,x,y,w,h,s={upgrades:[]},time=0){
  switch(kind){
    case 'bed':{
      const upgrade=s.upgrades.includes('bed'),blanket=upgrade?'#a1b7be':'#d2a08a';shadow(x,y+h-1,w,5);outline(x-1,y-5,w+2,h+5,'#a3825c','#806c4d');r(x,y-5,w,5,'#c4a274');r(x+3,y,w-6,h-4,'#f2e8c9');r(x+4,y+3,17,10,'#fff4d9');r(x+25,y+3,17,10,'#fff4d9');line(x+6,y+11,13,'#dbccab');line(x+27,y+11,13,'#dbccab');r(x+3,y+16,w-6,h-20,blanket);r(x+3,y+14,w-6,5,upgrade?'#cbd9cf':'#e9c5a5');for(let i=0;i<3;i++)r(x+8+i*13,y+23,2,15,upgrade?'#b8cbd1':'#e1b599');line(x+3,y+h-6,w-6,upgrade?'#809ca6':'#b88978');r(x,y+h-1,4,4,'#806c4d');r(x+w-4,y+h-1,4,4,'#806c4d');break;
    }
    case 'nightstand':shadow(x,y+15,16);outline(x,y+1,16,14,'#ae885f');r(x-1,y-2,18,5,'#d5b07f');r(x+6,y+6,4,2,'#e8d4a4');r(x+8,y-10,2,8,'#7f8063');r(x+4,y-12,10,6,'#f3dda8');r(x+5,y-13,8,2,'#f8e7bd');break;
    case 'fridge':shadow(x,y+30,17);outline(x,y-6,16,38,'#92b5a5','#677f6d');r(x+1,y-5,14,3,'#c5d8b8');r(x+2,y-1,12,11,'#aec9b2');r(x+2,y+12,12,17,'#a4c2ac');line(x+1,y+10,14,'#668a78');r(x+11,y+2,2,5,'#e9e4bd');r(x+11,y+16,2,7,'#e9e4bd');r(x+4,y+16,4,4,'#e5d79c');r(x+5,y+17,2,1,'#c69171');break;
    case 'stove':shadow(x,y+15,w);outline(x,y-5,w,22,'#cdbfa1','#8f8971');r(x,y-5,w,10,'#eee0c0');r(x+3,y-3,8,6,'#677768');r(x+21,y-3,8,6,'#677768');r(x+5,y-2,4,3,'#a3a791');r(x+23,y-2,4,3,'#a3a791');outline(x+4,y+7,24,7,'#657c70','#a8987b');r(x+5,y+8,21,1,'#94a291');r(x+5,y+4,3,2,'#877d68');r(x+24,y+4,3,2,'#877d68');r(x+18,y-6,10,3,'#957c55');r(x+20,y-9,6,4,'#b79a64');r(x+23,y-12,2,3,'#eee6c966');break;
    case 'sink':shadow(x,y+15,w);outline(x,y-5,w,21,'#c6b190','#8f8971');r(x-1,y-6,w+2,10,'#eee3c3');outline(x+7,y-4,19,6,'#a1b7af','#7d9589');r(x+10,y-3,14,2,'#c3d6c8');r(x+19,y-10,2,7,'#80978c');r(x+15,y-10,6,2,'#a0b4a2');line(x+16,y+6,1,'#8a7d62');r(x+5,y+7,7,2,'#8e876a');r(x+22,y+7,7,2,'#8e876a');break;
    case 'table':shadow(x,y+23,w);r(x+3,y+13,3,16,C.woodDark);r(x+w-6,y+13,3,16,C.woodDark);outline(x-1,y-5,w+2,26,'#b99466',C.woodDark);r(x,y-5,w,22,'#dfbd8a');line(x+2,y+1,w-4,'#e9cf9e');r(x+21,y-4,7,20,'#f0e2b5');r(x+23,y-4,3,20,'#b6bc96');ellipsePixel(x+6,y+2,11,9,'#f5e8c8');r(x+9,y+4,5,4,'#dab06d');r(x+33,y+3,7,6,'#fff1d0');r(x+34,y+3,4,3,'#937b56');r(x+40,y+5,2,3,'#eadabb');break;
    case 'shower':shadow(x,y+31,w);outline(x,y-7,w,39,'#bad0c6','#819c91');r(x+2,y-5,w-4,33,'#d6e2d0');r(x+2,y+25,w-4,5,'#edecda');r(x+3,y-4,2,28,'#eef2d7');r(x+16,y-5,2,31,'#9eb8a7');r(x+18,y-3,11,25,'#b8d2c899');r(x+22,y-1,2,6,'#7d9b92');r(x+19,y+4,7,2,'#809b8c');r(x+15,y+12,2,6,'#758d7d');for(let i=0;i<4;i++)r(x+20+(i%2)*4,y+8+i*3,1,2,'#dceadd');break;
    case 'toilet':shadow(x,y+30,16);outline(x+2,y-3,12,16,'#e7e5d3','#9baa93');r(x+3,y-3,10,3,'#f5f0d8');r(x+10,y+3,3,2,'#a6b19a');ellipsePixel(x+1,y+10,14,14,'#f7edda');ellipsePixel(x+4,y+12,8,8,'#9ab9ad');r(x+5,y+14,6,4,'#bdd5c5');r(x+5,y+24,7,5,'#d4dcc7');break;
    case 'basin':outline(x,y-4,16,20,'#b6c3ad','#7e9985');r(x-1,y-6,18,10,'#eeebd3');ellipsePixel(x+3,y-4,11,7,'#aac3b3');r(x+8,y-8,2,7,'#889f8f');r(x+5,y+7,7,2,'#8a9a7f');outline(x+1,y-23,14,13,'#bdd8cc','#a3b598');r(x+3,y-21,2,7,'#edf0d3');break;
    case 'books':shadow(x,y+h-1,w);outline(x,y-9,w,h+9,'#97784f','#7d704f');for(let row=0;row<3;row++){r(x+1,y-7+row*12,w-2,10,'#816c4d');const cols=['#a6bca5','#d1aa82','#b0a7ab','#e1cd96'];for(let j=0;j<4;j++){r(x+2+j*3,y-5+row*12,2,7-j%2,cols[(j+row)%4]);r(x+2+j*3,y-1+row*12,2,1,'#edddba');}line(x,y+4+row*12,w,'#c4a579');}break;
    case 'tv':shadow(x,y+15,w);outline(x,y+5,w,11,'#b2946a','#8b7955');r(x+2,y+6,w-4,2,'#d9b983');r(x+4,y+10,8,3,'#977e57');r(x+21,y+10,7,3,'#977e57');outline(x+2,y-13,27,19,'#b5bba0','#667a65');outline(x+4,y-11,20,14,'#729d98','#536f67');r(x+6,y-9,16,9,'#a8c2af');r(x+6,y-4,16,4,'#859b70');r(x+12,y-7,6,4,'#d9c696');r(x+8,y-8,3,2,'#ecdfac');r(x+25,y-7,2,2,'#73826b');r(x+25,y-2,2,3,'#7b886e');r(x+14,y-16,2,3,'#6a775d');r(x+11,y-18,3,2,'#6a775d');r(x+16,y-19,4,2,'#6a775d');break;
    case 'sofa':shadow(x,y+16,w);outline(x,y-10,w,27,'#7e987b','#657f66');r(x+3,y-11,w-6,12,'#a4b597');line(x+5,y-9,w-10,'#c0cbae');r(x+5,y+2,w-10,11,'#adc09d');r(x+w/2,y+1,1,11,'#88a083');r(x-2,y-3,8,16,'#91ac8c');r(x+w-6,y-3,8,16,'#91ac8c');r(x-1,y-3,6,2,'#bdc9a7');r(x+w-5,y-3,6,2,'#bdc9a7');r(x+9,y-5,10,10,'#e9d7a8');r(x+11,y-3,6,6,'#f1e1b8');r(x+4,y+16,3,3,'#807856');r(x+w-7,y+16,3,3,'#807856');break;
    case 'coffee':shadow(x-4,y+13,26);r(x-1,y+7,3,8,C.woodDark);r(x+16,y+7,3,8,C.woodDark);outline(x-6,y-2,28,12,'#cba77b',C.woodDark);r(x-4,y-1,24,8,'#e3c695');r(x,y+1,7,5,'#c0b4bd');r(x+1,y+1,5,1,'#ece1c8');r(x+12,y,4,5,'#f3e7c6');r(x+13,y,2,2,'#8e7954');break;
    case 'desk':shadow(x,y+16,w);r(x+1,y+5,3,13,C.woodDark);r(x+w-4,y+5,3,13,C.woodDark);outline(x-1,y-2,w+2,12,'#b8976a',C.woodDark);r(x,y-2,w,8,'#dfc18b');r(x+3,y-1,13,6,'#f5e7c7');line(x+5,y,8,'#b4b5a1');line(x+5,y+2,6,'#b4b5a1');r(x+17,y+1,2,6,'#9d7962');r(x+25,y-7,2,9,'#7f8766');r(x+21,y-10,10,5,'#bbc09a');r(x+23,y-11,6,2,'#d9d7ae');break;
    case 'plant':shadow(x,y+15,16);r(x+4,y+4,10,11,'#ac8263');r(x+3,y+3,12,4,'#cca27b');r(x+5,y+14,8,2,'#8b7455');r(x+8,y-6,2,12,'#617f52');ellipsePixel(x-1,y-7,10,6,'#789959');ellipsePixel(x+9,y-10,9,6,'#658c55');ellipsePixel(x+3,y-15,8,10,'#86a061');r(x+7,y-13,2,7,'#9db270');r(x+12,y-8,4,1,'#97ad69');break;
    case 'lamp':shadow(x,y+15,16);ellipsePixel(x+2,y+12,13,4,'#999476');r(x+8,y-13,2,28,'#8d876a');r(x,y-21,19,11,'#dbcc9b');r(x+3,y-25,13,5,'#e9dcb0');r(x+2,y-20,15,7,'#f4e3b0');line(x,y-10,19,'#c3b585');break;
    case 'door':r(x,y,32,5,'#c5b287');line(x,y,32,'#ead8aa');r(x+2,y+5,28,2,'#b4a17b');break;
  }
}
function building(x,y,w,h,kind){
  const cafe=kind==='cafe';shadow(x-5,y+h-2,w+10,7);outline(x,y+5,w,h-5,'#e9dcc0','#968a68');r(x+2,y+20,w-4,h-24,'#eaddc5');
  for(let k=0;k<4;k++)line(x+2,y+28+k*9,w-4,'#ded0af');
  const roof=cafe?'#b57c67':'#88957e',roofLight=cafe?'#cc9479':'#a5ad8e';r(x-5,y-17,w+10,25,roof);r(x-2,y-22,w+4,8,roofLight);r(x+2,y-25,w-4,6,roofLight);for(let k=0;k<5;k++){line(x-4,y-14+k*5,w+8,cafe?'#a26e5d':'#7c8972');for(let xx=x+(k%2)*9;xx<x+w;xx+=18)r(xx,y-14+k*5,1,5,cafe?'#a6725f':'#7e8b71');}line(x-7,y+6,w+14,'#796d53');r(x-5,y+7,w+10,3,cafe?'#d29c7c':'#a9b292');
  windowAt(x+8,y+26,26);windowAt(x+w-35,y+26,26);
  outline(x+w/2-11,y+34,22,40,'#899c8b','#948464');r(x+w/2-9,y+36,18,17,'#bad2ba');r(x+w/2-8,y+37,2,12,'#e2e7c5');r(x+w/2+5,y+58,3,2,'#ead8a5');
  r(x-2,y+18,w+4,10,cafe?'#e6b991':'#c2ccaa');for(let xx=x;xx<x+w;xx+=13)r(xx,y+18,7,10,cafe?'#fbebc8':'#eee8c8');r(x-2,y+28,w+4,3,cafe?'#b58a6a':'#97a181');
  outline(x+w/2-23,y+3,46,12,'#f3e5c3','#b7a17a');text(cafe?'SUNNY CAFE':'LITTLE GOODS',x+w/2-(cafe?18:21),y+11,cafe?'#977258':'#7f8b69',6);
  r(x+w/2-14,y+h-3,28,7,'#cfbb94');line(x+w/2-14,y+h+3,28,'#b8a67f');
  furniture('plant',x+5,y+h-15,16,16);furniture('plant',x+w-20,y+h-15,16,16);
  if(cafe){outline(x+w+8,y+h-25,15,21,'#697e65','#967d57');text('OPEN',x+w+9,y+h-15,'#eadfc0',5);line(x+w+10,y+h-11,10,'#b2c097');r(x+w+8,y+h-4,2,4,'#947957');r(x+w+21,y+h-4,2,4,'#947957');}
}
function lampPost(x,y){shadow(x-3,y,12);r(x,y-32,3,35,'#7b7c60');r(x-4,y-33,11,10,'#f2dfa6');r(x-5,y-35,13,3,'#848368');r(x-2,y-31,2,6,'#fff0b9');r(x-3,y+2,9,3,'#7b7c60');}
function pond(x,y,w,h,t){
  ellipsePixel(x-4,y-4,w+8,h+8,'#79996b');ellipsePixel(x,y,w,h,'#c3c09a');ellipsePixel(x+3,y+3,w-6,h-6,'#75a7a2');ellipsePixel(x+5,y+5,w-10,h-10,'#8cbdb4');
  for(let i=0;i<13;i++){const px=x+9+hash(i,5)*(w-22),py=y+9+hash(i,4)*(h-20);line(px+Math.sin(t*.8+i)*2,py,4+hash(i,9)*5,i%2?'#a9d0bc':'#6d9f9a');}
  ellipsePixel(x+15,y+17,11,6,'#779c69');r(x+20,y+16,2,3,'#d9b6ad');ellipsePixel(x+62,y+40,14,7,'#7fa473');line(x+69,y+40,5,'#b6bd85');for(let i=0;i<6;i++){r(x-4+i*3,y+35+i%3,1,14,'#6c8b59');r(x-4+i*3,y+34+i%3,2,5,'#9c9863');}
  r(x-14,y+h-12,14,6,'#ad9063');r(x-14,y+h-7,3,7,'#8d7957');r(x-4,y+h-7,3,7,'#8d7957');
}
function townObject(o,t){const x=o.x*16,y=o.y*16,w=o.w*16,h=o.h*16;
  if(o.kind==='cafe'||o.kind==='shop')building(x,y,w,h,o.kind);
  if(o.kind==='pond')pond(x,y,w,h,t);
  if(o.kind==='bench'){shadow(x,y+15,w);r(x+3,y+5,3,14,'#707d5c');r(x+w-6,y+5,3,14,'#707d5c');for(let i=0;i<3;i++){r(x,y-5+i*4,w,3,'#bca071');line(x+1,y-5+i*4,w-2,'#d5bd8b');}r(x,y+8,w,5,'#a48b62');r(x+5,y-6,3,15,'#7e8460');r(x+w-8,y-6,3,15,'#7e8460');}
  if(o.kind==='flowers'){outline(x-2,y-2,w+4,h+4,'#b3a17a','#897f5c');r(x,y,w,h,'#a69069');for(let a=0;a<8;a++)for(let b=0;b<3;b++)flower(x+5+a*10,y+6+b*9,['#edc297','#e8d1af','#ce9fa4'][(a+b)%3]);}
  if(o.kind==='sign'){r(x+15,y-14,3,30,'#947e56');outline(x+1,y-14,30,16,'#eee0b8','#a39167');text('HOME',x+5,y-4,'#8a8d67',7);text('↓',x+12,y+11,'#677c51',9);}
  if(o.kind==='npc'){character(ctx,x+8,y+12,'down',false,t,'neighbor');text('小葵',x-1,y-21,'#fff6d3',8);}
  if(o.kind==='cat'){shadow(x,y+12,19);r(x+1,y+3,15,8,'#bb8554');r(x+4,y,10,11,'#d5a669');r(x+3,y-2,3,6,'#c4945e');r(x+12,y-2,3,6,'#c4945e');r(x+5,y-1,1,2,'#dfb894');r(x+13,y-1,1,2,'#dfb894');r(x+6,y+5,1,2,'#695e46');r(x+11,y+5,1,2,'#695e46');r(x+8,y+8,2,1,'#88664c');r(x+2,y+11,3,2,'#e1bb83');r(x+11,y+11,3,2,'#e1bb83');r(x+16,y+3,4,3,'#d0a06a');r(x+19,y+(Math.sin(t*3)>0?0:1),2,5,'#d0a06a');}
}
const sprite=[
  '....hhhhhh....','...hHHHHHHh...','..hHHHHHHHHh..','..hHHHHHHHHh..','..hHHHhhhhhh..','..hssSsssSsh..','..hs.sss.ssh..','...ssssssss...','....sspsss....','.....ssss.....','...wwwsswww...','..wwwoowooww..','..swwooooows..','..sswoooooss..','...sboooobs...','....bbbbbb....','....boooob....','....bb..bb....','....bb..bb....','....dd..dd....',
];
export function character(context,x,y,dir='down',moving=false,t=0,variant='player'){
  const prev=ctx;ctx=context;const step=moving?Math.sin(t*12):0;shadow(x-7,y-1,15,3);const colors={h:variant==='player'?'#75583f':'#6c5a4a',H:variant==='player'?'#aa774e':'#96785c',s:'#e8bc92',S:'#cf9d78',p:'#b47c69',w:variant==='player'?'#f4e8c9':'#dda88f',o:variant==='player'?'#839f99':'#b37d72',b:variant==='player'?'#638481':'#986c64',d:'#655f4d'};
  let px=Math.round(x-7),py=Math.round(y-20+(moving&&step>0?-1:0));
  for(let row=0;row<sprite.length;row++)for(let col=0;col<14;col++){
    const char=sprite[row][col];if(char==='.')continue;
    if(dir==='up'&&row>=5&&row<=8){r(px+col,py+row,1,1,row<8?colors.H:colors.h);continue;}
    if((dir==='left'&&col>=11)||(dir==='right'&&col<=2))continue;
    const bob=row>16&&moving?(col<7?Math.round(step):Math.round(-step)):0;r(px+col,py+row+bob,1,1,colors[char]);
  }
  if(dir==='down'){r(px+4,py+6,1,2,'#4f5140');r(px+9,py+6,1,2,'#4f5140');}if(dir==='left')r(px+3,py+6,1,2,'#4f5140');if(dir==='right')r(px+10,py+6,1,2,'#4f5140');
  ctx=prev;
}
function diamond(x,y,color='#8eae67'){
  r(x-1,y,2,2,'#e4ebba');r(x-2,y+2,4,2,color);r(x-3,y+4,6,2,color);r(x-2,y+6,4,2,color);r(x-1,y+8,2,2,color);r(x-1,y+2,1,5,'#c8dc94');r(x+1,y+4,2,2,'#6e9354');
}
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d',{alpha:false});this.context.imageSmoothingEnabled=false;this.ground=document.createElement('canvas');this.ground.width=480;this.ground.height=320;this.groundContext=this.ground.getContext('2d',{alpha:false});this.cache='';}
  draw(s,visual={}){
    const t=visual.time||0,key=s.scene+':'+s.upgrades.join(',');ctx=this.context;
    if(key!==this.cache){ctx=this.groundContext;grass(s.scene);if(s.scene==='home')homeBase(s);this.cache=key;}
    ctx=this.context;ctx.drawImage(this.ground,0,0);
    if(visual.destination){const {x,y}=visual.destination;const color='#f5e7bc';r(x*16-6,y*16-3,4,1,color);r(x*16-6,y*16-3,1,3,color);r(x*16+2,y*16+3,4,1,color);r(x*16+5,y*16,1,3,color);}
    const objects=s.scene==='home'?HOME_OBJECTS:TOWN_OBJECTS;
    const entities=objects.map(o=>({depth:o.y+o.h,draw:()=>{if(s.scene==='home')furniture(o.kind,o.x*16,o.y*16,o.w*16,o.h*16,s,t);else townObject(o,t);}}));
    entities.push({depth:s.player.y+.25,draw:()=>{character(ctx,s.player.x*16,s.player.y*16+4,s.player.dir,visual.moving,t);diamond(Math.round(s.player.x*16),Math.round(s.player.y*16-31+Math.sin(t*2)*1.3),mood(s)>55?'#8eae67':mood(s)>25?'#d7bb64':'#c38774');}});
    entities.sort((a,b)=>a.depth-b.depth).forEach(e=>e.draw());
    if(s.scene==='home'){r(176,141,16,3,'#b9a37a');r(177,139,14,2,'#e9ddbd');}
    if(visual.hover){const o=visual.hover,x=o.x*16,y=(o.y+o.h)*16;ctx.strokeStyle='#fff4c9';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(x-2,y-o.h*16-3,o.w*16+4,o.h*16+5);ctx.setLineDash([]);}
    const night=s.time>1080?Math.min(.4,(s.time-1080)/700):s.time<420?.4:s.time<480?(480-s.time)/150:0;
    if(night){r(0,0,480,320,`rgba(39,54,84,${night})`);if(s.scene==='home'){r(97,45,26,16,`rgba(255,221,148,${night*.7})`);if(s.upgrades.includes('lamp')){ctx.globalAlpha=night;ellipsePixel(157,181,48,48,'#f3db9444');ellipsePixel(167,186,29,30,'#f3db9444');ctx.globalAlpha=1;}}}
    // Small, slow ambient details. Never obscure interactive objects.
    if(!visual.reducedMotion){for(let i=0;i<4;i++){const x=40+i*115+Math.sin(t*.4+i)*7,y=s.scene==='home'?286+Math.cos(t*.3+i)*9:208+Math.cos(t*.3+i)*14;r(x,y,1,1,'#f0e5b7');r(x+(Math.sin(t*8)>0?2:-2),y-1,2,1,'#eae4b9');}}
    if(visual.near&&!visual.action){const o=visual.near;const label=o.name;ctx.font='7px "Microsoft YaHei",sans-serif';const width=ctx.measureText(label).width+20,x=Math.min(480-width-7,Math.max(7,(o.x+o.w/2)*16-width/2)),y=Math.max(28,o.y*16-24);r(x,y,width,14,'#fcf5ddd9');ctx.fillStyle='#667c52';ctx.fillText(label,x+5,y+10);text('E',x+width-10,y+10,'#8c9d74',7);}
  }
}
export function drawPortrait(canvas){const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;ctx=c;r(0,0,48,48,'#dcd7c4');r(0,30,48,18,'#afb797');r(5,5,2,2,'#efeddd');r(38,9,3,3,'#f1e8d2');r(8,35,2,2,'#d0d3b2');c.save();c.translate(1,-7);c.scale(2,2);character(c,12,27,'down',false,0);c.restore();}
export function drawShopPreview(canvas,kind){ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,48,40);if(kind==='rug')rug(4,9,40,25,'#cf9d88');else if(kind==='bed'){ctx.save();ctx.scale(.67,.67);furniture('bed',10,8,48,48,{upgrades:['bed']});ctx.restore();}else furniture(kind,kind==='plant'?16:13,23,16,16,{upgrades:[]});}
