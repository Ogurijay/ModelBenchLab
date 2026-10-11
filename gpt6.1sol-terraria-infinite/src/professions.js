export const PROFESSIONS=[
 {id:'smithing',name:'锻造',icon:'anvil',color:'#db9d63',desc:'熔炼矿石，打造武器与重甲',tracks:['冶炼','武器','护甲','工具']},
 {id:'leatherworking',name:'制皮',icon:'leather',color:'#c99770',desc:'处理兽皮，制作游猎护具',tracks:['皮料','游猎装备','野外补给']},
 {id:'tailoring',name:'裁缝',icon:'silk',color:'#b8a5df',desc:'纺纱织布，缝制法袍与饰品',tracks:['纺织','法术衣装','装饰']},
 {id:'engineering',name:'工程',icon:'gear',color:'#80bfd1',desc:'装配机械、炸药与探险工具',tracks:['零件','爆破','探险装置']},
 {id:'alchemy',name:'炼金',icon:'potion',color:'#92bd76',desc:'提炼草药，调配战斗药剂',tracks:['药剂','精炼']},
 {id:'woodworking',name:'木工',icon:'bench',color:'#c9ad78',desc:'加工建材，建造工坊与居所',tracks:['建材','家具','设施']},
 {id:'cooking',name:'烹饪',icon:'stew',color:'#e0b573',desc:'野外食粮与恢复料理',tracks:['口粮','料理']},
 {id:'enchanting',name:'附魔',icon:'rune',color:'#93b5e8',desc:'凝聚水晶，灌注奥术器物',tracks:['符文','奥术器物']},
];
export const RANKS=[{name:'学徒',xp:0},{name:'熟练',xp:40},{name:'专家',xp:120},{name:'大师',xp:240}];
export function professionLevel(xp=0){return RANKS.reduce((level,r,i)=>xp>=r.xp?i:level,0);}
export function professionProgress(xp=0){const level=professionLevel(xp),next=RANKS[level+1];return {level,name:RANKS[level].name,next:next?.xp||300,progress:next?(xp-RANKS[level].xp)/(next.xp-RANKS[level].xp):1};}
export function registerProfessions(ITEMS,RECIPES,STATIONS,DROPS,TILE){
 const add=(id,name,icon,color,extra={})=>ITEMS[id]={id,name,icon,color,rarity:'普通',category:'材料',source:'专业制作',...extra};
 add('tannery','鞣皮架','tannery','#ad8151',{tile:49,size:[3,2],furniture:true,category:'制作站'});
 add('engineeringBench','工程台','engineeringBench','#8cacb2',{tile:50,size:[3,2],furniture:true,category:'制作站'});
 TILE.TANNERY=49;TILE.ENGINEERING_BENCH=50;DROPS[49]='tannery';DROPS[50]='engineeringBench';STATIONS.push('tannery','engineeringBench');
 for(const row of [['treatedLeather','熟化皮革','hide','#c49968'],['curedLeather','硬化兽皮','hide','#7f6852'],['thread','纺线','thread','#d9cead'],['linen','亚麻布','cloth','#dbcfae'],['runeCloth','符文布','cloth','#a68ac7'],['copperWire','铜线','wire','#d79557'],['gear','铁齿轮','gear','#a8b9c8'],['powder','爆破火药','powder','#a6a2a0'],['steel','淬火钢锭','ingot','#a4c2d9'],['essence','奥术精华','rune','#9bcced']])add(...row);
 for(const [prefix,name,color,defense,bonus]of [
  ['scout','斥候','#a88052',2,{rangedBonus:.03}],['stalker','追猎','#687e56',4,{rangedBonus:.06,speedBonus:.02}],
  ['linen','亚麻','#bbb4cf',1,{manaBonus:8,manaRegen:.2}],['runic','符文','#9180b2',3,{manaBonus:15,skillBonus:.04}],
 ])for(const [suffix,label,icon,slot,mult]of [['Hood','兜帽','helmet','head',1],['Vest',prefix==='linen'||prefix==='runic'?'法袍':'皮甲','armor','body',2],['Boots','长靴','boots','legs',1]])add(prefix+suffix,name+label,icon,color,{category:'护甲',slot,defense:defense*mult,...bonus,rarity:defense>=3?'稀有':'普通'});
 add('quiver','猎手箭袋','quiver','#b89a62',{slot:'accessory',rangedBonus:.15,category:'饰品',desc:'远程武器伤害 +15%'});
 add('goggles','勘探目镜','goggles','#d0b777',{slot:'accessory',sightBonus:5,miningBonus:.12,category:'饰品',desc:'探索视野 +5 格，采掘速度 +12%'});
 add('grapple','机械抓钩','grapple','#aab6ba',{gadget:'grapple',category:'工具',desc:'对准 10 格内实体地形按 F，向锚点牵引；不会穿过墙体。'});
 add('bomb','采掘炸弹','bomb','#b49b72',{gadget:'bomb',category:'消耗品',desc:'按 F 引爆身边 2 格内普通地层；高级矿石和家具受到保护。角色自身也会受伤。'});
 add('fieldKit','野战绷带','bandage','#d7cbb0',{heal:70,category:'药剂'});
 add('feast','丰收炖菜','bowl','#bc8156',{food:100,heal:50,category:'食物'});
 add('elixir','浓缩法力药剂','potion','#a69ae2',{mana:120,category:'药剂'});
 add('focus','霜纹护符','amulet','#a3d4eb',{slot:'accessory',skillBonus:.15,manaRegen:1,category:'饰品',desc:'技能伤害与治疗 +15%，每秒额外恢复 1 法力'});
 add('steelSword','淬火长剑','sword','#bbd2de',{damage:62,category:'武器',rarity:'稀有'});
 add('steelArmor','淬火胸甲','armor','#a5b7c5',{slot:'body',defense:16,category:'护甲',rarity:'稀有'});
 // Existing recipes remain available, while becoming part of a real profession ledger.
 for(const r of RECIPES){const it=ITEMS[r.id];let p='woodworking',track='建材';
  if(['ingot','copperBar','silverBar','goldBar','mithrilBar','hellBar','glass','bottle'].includes(r.id)){p='smithing';track='冶炼';}
  else if(['anvil','forge','cooking'].includes(r.id)||it.tier&&['武器','工具','护甲'].includes(it.category)){p='smithing';track=it.category==='护甲'?'护甲':it.category==='武器'?'武器':'工具';}
  else if(['silk','boots','banner'].includes(r.id)){p='tailoring';track=r.id==='silk'?'纺织':r.id==='boots'?'法术衣装':'装饰';}
  else if(r.id==='rune'||r.id==='arcane'||['astralStaff','apprenticeStaff','amulet'].includes(r.id)){p='enchanting';track=r.id==='rune'?'符文':'奥术器物';}
  else if(it.category==='药剂'||r.id.endsWith('Potion')||r.id==='alchemy'){p='alchemy';track='药剂';}
  else if(it.food){p='cooking';track=r.id==='bread'?'口粮':'料理';}
  else if(it.category==='制作站')track='设施';else if(it.furniture||r.id==='bed')track='家具';
  r.profession=p;r.track=track;r.rank=0;r.profXp=2+(r.duration?2:0)+(it.tier||0);
 }
 const recipe=(id,cost,station,profession,track,rank=0,n=1)=>RECIPES.push({id,n,cost,station,profession,track,rank,profXp:4+rank*4,group:ITEMS[id].category});
 recipe('tannery',{wood:12,leather:3},'bench','woodworking','设施');
 recipe('engineeringBench',{wood:12,ingot:4},'anvil','smithing','工具');
 recipe('treatedLeather',{leather:3,fiber:2},'tannery','leatherworking','皮料');
 recipe('curedLeather',{treatedLeather:2,herb:2},'tannery','leatherworking','皮料',1);
 recipe('thread',{fiber:3},'loom','tailoring','纺织',0,2);
 recipe('linen',{thread:3},'loom','tailoring','纺织');
 recipe('runeCloth',{silk:2,thread:2,essence:1},'loom','tailoring','纺织',1);
 for(const [prefix,material,profession,track,rank]of [['scout','treatedLeather','leatherworking','游猎装备',0],['stalker','curedLeather','leatherworking','游猎装备',2],['linen','linen','tailoring','法术衣装',0],['runic','runeCloth','tailoring','法术衣装',2]])for(const [suffix,n]of [['Hood',3],['Vest',5],['Boots',3]])recipe(prefix+suffix,{[material]:n,fiber:2},profession==='tailoring'?'loom':'tannery',profession,track,rank);
 recipe('quiver',{curedLeather:4,thread:3},'tannery','leatherworking','游猎装备',1);
 recipe('fieldKit',{leather:1,linen:1,herb:1},'tannery','leatherworking','野外补给',0,2);
 recipe('copperWire',{copperBar:1},'engineeringBench','engineering','零件',0,4);
 recipe('gear',{ingot:1},'engineeringBench','engineering','零件',0,2);
 recipe('powder',{coal:2,gel:1},'engineeringBench','engineering','爆破',0,3);
 recipe('bomb',{powder:2,ingot:1,thread:1},'engineeringBench','engineering','爆破',1,3);
 recipe('goggles',{gear:3,copperWire:6,glass:4,leather:2},'engineeringBench','engineering','探险装置',1);
 recipe('grapple',{gear:5,copperWire:8,rope:15},'engineeringBench','engineering','探险装置',2);
 recipe('steel',{ingot:3,coal:2},'forge','smithing','冶炼',1);
 recipe('steelSword',{steel:6,treatedLeather:2},'anvil','smithing','武器',2);
 recipe('steelArmor',{steel:10,linen:3},'anvil','smithing','护甲',2);
 recipe('essence',{crystal:2,herb:1},'alchemy','enchanting','符文');
 recipe('focus',{essence:4,silverBar:4,rune:2},'arcane','enchanting','奥术器物',2);
 recipe('elixir',{manaPotion:2,essence:1},'alchemy','alchemy','精炼',1);
 recipe('feast',{stew:1,berry:3,wheat:2},'cooking','cooking','料理',1);
 for(const it of Object.values(ITEMS)){if(!it.desc&&it.slot){const stats=[it.defense&&`防御 +${it.defense}`,it.rangedBonus&&`远程伤害 +${Math.round(it.rangedBonus*100)}%`,it.manaBonus&&`最大法力 +${it.manaBonus}`,it.manaRegen&&`法力恢复 +${it.manaRegen}/秒`,it.speedBonus&&`移动速度 +${Math.round(it.speedBonus*100)}%`,it.skillBonus&&`技能效果 +${Math.round(it.skillBonus*100)}%`].filter(Boolean);it.desc=stats.join(' · ');}}
}
