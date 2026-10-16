export const CITY_Y=8;
export const WATER_Y=4.8;
export const coords={
 cityY:CITY_Y,waterY:WATER_Y,seaY:0,harborY:1.6,
 gate:{x:63,z:93,w:12,h:34},heroes:{x:42,z:58,w:15,length:60},
 trade:{x:0,z:0,r:22},cathedral:{x:-70,z:-92,w:36,d:55,h:60},
 square:{x:-66,z:-53,w:45,d:32},mage:{x:-99,z:49,r:8,h:42},
 old:{x:72,z:-34,w:65,d:65},dwarven:{x:15,z:-128,w:75,d:70},
 keep:{x:123,z:-152,w:70,d:65,h:50},lion:{x:-126,z:-26,w:45,d:30},
 harbor:{x:-207,z:-152,w:160},embassy:{x:-37,z:-205},lake:{x:33,z:-211},
 // All building placements use these rectangles; streets and canal buffers remain free.
 plots:[
  {zone:'trade',x:-23,z:3,w:11,d:13,rot:Math.PI/2},{zone:'trade',x:23,z:0,w:12,d:15,rot:-Math.PI/2},
  {zone:'trade',x:-18,z:26,w:10,d:12,rot:Math.PI},{zone:'trade',x:0,z:31,w:12,d:12,rot:Math.PI},
  {zone:'trade',x:29,z:24,w:11,d:12,rot:Math.PI},{zone:'trade',x:-19,z:-22,w:11,d:12,rot:0},
  {zone:'trade',x:1,z:-25,w:12,d:13,rot:0},{zone:'trade',x:24,z:-23,w:10,d:12,rot:0},
  {zone:'cathedral',x:-101,z:-48,w:10,d:12,rot:Math.PI/2},{zone:'cathedral',x:-36,z:-55,w:10,d:12,rot:-Math.PI/2},
  {zone:'cathedral',x:-102,z:-70,w:10,d:12,rot:Math.PI/2},{zone:'cathedral',x:-37,z:-81,w:11,d:12,rot:-Math.PI/2},
  {zone:'mage',x:-125,z:37,w:10,d:11,rot:Math.PI/2},{zone:'mage',x:-74,z:39,w:10,d:11,rot:-Math.PI/2},
  {zone:'mage',x:-122,z:68,w:11,d:12,rot:Math.PI/2},{zone:'mage',x:-79,z:71,w:12,d:12,rot:Math.PI},
  {zone:'mage',x:-100,z:85,w:11,d:12,rot:Math.PI},{zone:'mage',x:-98,z:17,w:10,d:12,rot:0},
  {zone:'old',x:52,z:-17,w:10,d:12,rot:Math.PI/2},{zone:'old',x:78,z:-16,w:10,d:13,rot:-Math.PI/2},
  {zone:'old',x:54,z:-43,w:11,d:12,rot:Math.PI/2},{zone:'old',x:80,z:-44,w:12,d:13,rot:-Math.PI/2},
  {zone:'old',x:59,z:-68,w:11,d:12,rot:0},{zone:'old',x:84,z:-69,w:11,d:12,rot:0},
  {zone:'old',x:104,z:-16,w:11,d:12,rot:0},{zone:'old',x:109,z:-45,w:12,d:12,rot:-Math.PI/2},
  {zone:'dwarven',x:-7,z:-109,w:12,d:14,rot:0},{zone:'dwarven',x:15,z:-109,w:12,d:14,rot:0},
  {zone:'dwarven',x:36,z:-107,w:13,d:14,rot:0},{zone:'dwarven',x:-8,z:-143,w:13,d:13,rot:Math.PI},
  {zone:'dwarven',x:17,z:-150,w:14,d:14,rot:Math.PI},{zone:'dwarven',x:40,z:-146,w:11,d:13,rot:Math.PI},
  {zone:'harbor',x:-181,z:-114,w:12,d:13,rot:Math.PI/2},{zone:'harbor',x:-183,z:-144,w:12,d:13,rot:Math.PI/2},
  {zone:'harbor',x:-184,z:-175,w:12,d:13,rot:Math.PI/2},{zone:'embassy',x:-37,z:-205,w:22,d:16,rot:0}
 ],
 // Non-overlapping land plates leave canals between districts.
 land:[[-4,3,82,80],[-71,-75,90,103],[-100,51,81,98],[81,-40,87,93],[17,-131,84,73],[122,-149,104,92],[-133,-29,44,52],[-52,-184,139,45],[72,-202,125,36]],
 // Irregular connected extensions replace oversized interior water basins.
 landExtensions:[
  {id:'central-streets',surface:'paving',points:[[-28,-96],[27,-96],[27,-79],[22,-71],[27,-62],[22,-53],[-8,-53],[-16,-58],[-28,-58]]},
  {id:'southeast-courtyard',surface:'paving',points:[[74,5],[149,5],[160,16],[154,61],[142,73],[118,79],[92,71],[76,55],[70,32]]},
  {id:'mage-garden-peninsula',surface:'grass',points:[[-61,52],[-28,52],[-10,58],[6,62],[18,78],[29,95],[-61,95]]}
 ],
 bridges:[{a:[-42,0],b:[-59,0],w:10},{a:[-21,-37],b:[-42,-37],w:10},{a:[37,-42],b:[44,-42],w:10},{a:[0,-37],b:[0,-55],w:10},{a:[-71,2],b:[-71,-29],w:10},{a:[102,-85],b:[102,-103],w:12},{a:[-115,-35],b:[-119,-35],w:10}],
 routes:[[[63,127],[63,93],[42,58],[20,36],[0,12]],[[0,0],[-28,-37],[-66,-53]],[[0,0],[-51,0],[-71,0],[-99,49]],[[0,-2],[37,-42],[66,-42]],[[0,-2],[0,-80],[0,-94],[15,-128]],[[66,-42],[102,-92],[123,-114]],[[15,-128],[-40,-174],[-37,-205]]]
};
// Back streets are arranged as deliberate terraces and courtyard edges, not random scatter.
// Each candidate is checked against existing footprints and doorway approaches before admission.
const infill=[];
function row(zone,positions,rot=0,w=8,d=9){for(const [x,z] of positions)infill.push({zone,x,z,w,d,rot,infill:true,h:7.8+(infill.length%6)*.8});}
row('trade',[[-36,-28],[-36,-12],[-36,18],[-36,33]],Math.PI/2,7,8);
row('trade',[[33,-10],[33,11]],-Math.PI/2,7,8);
row('trade',[[-31,37],[-16,37]],Math.PI,8,8);
row('mage',[[-134,15],[-134,53],[-134,85]],Math.PI/2,8,9);
row('mage',[[-65,17],[-65,58],[-65,86]],-Math.PI/2,8,9);
row('mage',[[-120,94],[-83,94],[-66,94]],Math.PI,8,8);
row('mage',[[-118,8],[-81,8]],0,8,8);
row('old',[[47,-80],[70,-80],[101,-80],[118,-80]],0,8,9);
row('old',[[44,-2],[63,-2],[89,-2],[117,-2]],Math.PI,8,9);
row('old',[[118,-28],[118,-61]],-Math.PI/2,8,8);
row('dwarven',[[-19,-102],[-19,-123],[-19,-156]],Math.PI/2,7,8);
row('dwarven',[[52,-104],[52,-124],[52,-160]],-Math.PI/2,7,8);
row('dwarven',[[-10,-126],[32,-128]],0,8,9);
row('cathedral',[[-108,-94],[-108,-116]],Math.PI/2,8,10);
row('cathedral',[[-32,-101],[-32,-120],[-32,-33]],-Math.PI/2,8,10);
row('cathedral',[[-103,-30],[-83,-30]],Math.PI,8,8);
row('north',[[-110,-193],[-92,-193],[-74,-193],[-10,-193]],0,10,11);
row('north',[[-110,-172],[-92,-172],[-74,-172],[-54,-172],[-10,-172],[8,-172]],Math.PI,10,11);
const footprint=p=>{const turn=Math.abs(Math.sin(p.rot))>.5;return {l:p.x-(turn?p.d:p.w)/2,r:p.x+(turn?p.d:p.w)/2,t:p.z-(turn?p.w:p.d)/2,b:p.z+(turn?p.w:p.d)/2};};
const overlaps=(a,b,pad=0)=>a.l<b.r+pad&&a.r>b.l-pad&&a.t<b.b+pad&&a.b>b.t-pad;
const doorBuffer=p=>{const reach=p.d/2+2.8,near=p.d/2-.2,dx=Math.sin(p.rot),dz=Math.cos(p.rot),x1=p.x+dx*near,z1=p.z+dz*near,x2=p.x+dx*reach,z2=p.z+dz*reach;return {l:Math.min(x1,x2)-1.8,r:Math.max(x1,x2)+1.8,t:Math.min(z1,z2)-1.8,b:Math.max(z1,z2)+1.8};};
const landmarkReserves=[[-70,-92,52,74],[-99,49,24,24],[123,-152,78,76],[-126,-26,44,32],[17,-166,11,13]].map(([x,z,w,d])=>({l:x-w/2,r:x+w/2,t:z-d/2,b:z+d/2}));
function segmentCrossesRect(a,b,r,pad){
 let lo=0,hi=1;
 for(const [axis,min,max] of [[0,r.l-pad,r.r+pad],[1,r.t-pad,r.b+pad]]){
  const delta=b[axis]-a[axis];
  if(Math.abs(delta)<1e-8){if(a[axis]<min||a[axis]>max)return false;continue;}
  const p=(min-a[axis])/delta,q=(max-a[axis])/delta;
  lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return false;
 }
 return true;
}
const streetSegments=coords.routes.flatMap(route=>route.slice(1).map((b,i)=>[route[i],b]));
for(const p of infill){
 const a=footprint(p);
 if(!coords.land.some(([x,z,w,d])=>a.l>x-w/2+.65&&a.r<x+w/2-.65&&a.t>z-d/2+.65&&a.b<z+d/2-.65))continue;
 if(landmarkReserves.some(r=>overlaps(a,r,1)))continue;
 if(streetSegments.some(([u,v])=>segmentCrossesRect(u,v,a,4.5)))continue;
 if(coords.plots.some(q=>overlaps(a,footprint(q),1.9)||overlaps(a,doorBuffer(q),.5)||overlaps(doorBuffer(p),footprint(q),.5)))continue;
 coords.plots.push(p);
}
// New rows face deliberately connected streets; preserve all earlier placements.
const extensionPlots=[
 {zone:'cathedral',x:-15,z:-66,rot:Math.PI/2},{zone:'cathedral',x:-15,z:-84,rot:Math.PI/2},
 {zone:'trade',x:15,z:-65,rot:-Math.PI/2},{zone:'trade',x:15,z:-84,rot:-Math.PI/2},
 {zone:'old',x:83,z:22,rot:Math.PI/2},{zone:'old',x:83,z:40,rot:Math.PI/2},{zone:'old',x:90,z:55,rot:Math.PI/2},
 {zone:'old',x:139,z:22,rot:-Math.PI/2},{zone:'old',x:139,z:40,rot:-Math.PI/2},{zone:'old',x:139,z:59,rot:-Math.PI/2},
 {zone:'old',x:105,z:16,rot:0},{zone:'old',x:121,z:16,rot:0},
 {zone:'old',x:108,z:65,rot:Math.PI},{zone:'old',x:124,z:65,rot:Math.PI}
];
for(const [i,p] of extensionPlots.entries())coords.plots.push({...p,w:8,d:9,h:9+(i%4)*1.1,infill:true,extension:true});
coords.routes.push([[89,3],[93,18],[101,32],[113,44],[121,57]],[[93,31],[136,31]],[[96,51],[135,51]],[[-60,68],[-39,68],[-18,75],[10,86]]);
export const destinations=[
 {id:'heroes',name:'英雄谷',en:'VALLEY OF HEROES',x:75,z:113,look:[42,17,58],desc:'穿过蓝顶城门与英雄石像，联盟之都就在前方。'},
 {id:'trade',name:'贸易区',en:'TRADE DISTRICT',x:5,z:15,look:[0,14,-10],desc:'白石拱廊、金蓝旗帜与热闹街巷，汇聚在城心。'},
 {id:'cathedral',name:'教堂广场',en:'CATHEDRAL SQUARE',x:-66,z:-40,look:[-70,30,-92],desc:'圣光照亮玫瑰窗，喷泉与钟塔守望广场。'},
 {id:'mage',name:'法师区',en:'MAGE QUARTER',x:-99,z:72,look:[-99,34,49],desc:'紫蓝尖顶环抱静谧庭园，奥术塔高悬星环。'},
 {id:'old',name:'旧城区',en:'OLD TOWN',x:66,z:-20,look:[66,15,-60],desc:'暖色屋顶与狭窄巷道，藏着军营和训练场。'},
 {id:'dwarven',name:'矮人区',en:'DWARVEN DISTRICT',x:12,z:-127,look:[36,20,-150],desc:'炉火、铜管与石拱矿道，铁砧声仍在回响。'},
 {id:'keep',name:'暴风要塞',en:'STORMWIND KEEP',x:123,z:-111,look:[123,28,-151],desc:'沿着王家蓝毯进入王座厅，石柱托起高阔穹顶。'},
 {id:'lion',name:'狮眠之地',en:'LION’S REST',x:-125,z:-13,look:[-135,19,-29],desc:'纪念碑面向大海，花园铭记联盟的国王。'},
 {id:'harbor',name:'暴风城港口',en:'STORMWIND HARBOR',x:-199,z:-112,look:[-230,12,-143],desc:'从高城下行，驶向远方的船只在码头静候。'}
];
export function groundHeight(x,z){
 if(x < -169) return 1.6;
 return CITY_Y;
}
