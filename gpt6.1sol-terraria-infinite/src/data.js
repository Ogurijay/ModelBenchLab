import {registerProfessions} from './professions.js';
export const RACES = [
  {id:'human',name:'人类',faction:'alliance',home:'艾尔文森林',biome:0,skin:'#e8b58a',trait:'坚韧意志',desc:'生命上限 +20，暴风城的拓荒者。',hp:120},
  {id:'dwarf',name:'矮人',faction:'alliance',home:'丹莫罗',biome:2,skin:'#d99b72',trait:'石像血脉',desc:'采掘速度 +30%，雪山中的锻造大师。',mining:1.3},
  {id:'nightelf',name:'暗夜精灵',faction:'alliance',home:'泰达希尔',biome:3,skin:'#b393c6',trait:'月影之子',desc:'夜间移动 +20%，古老森林的守望者。',night:1.2},
  {id:'draenei',name:'德莱尼',faction:'alliance',home:'秘蓝岛',biome:3,skin:'#84a8cb',trait:'纳鲁赐福',desc:'生命缓慢恢复，跨越星海的旅人。',regen:0.7},
  {id:'orc',name:'兽人',faction:'horde',home:'杜隆塔尔',biome:1,skin:'#87a65e',trait:'血性狂怒',desc:'近战伤害 +25%，为荣耀开辟新路。',damage:1.25},
  {id:'troll',name:'巨魔',faction:'horde',home:'回音群岛',biome:0,skin:'#65a8ad',trait:'再生之躯',desc:'生命缓慢恢复，聆听先祖的低语。',regen:0.8},
  {id:'undead',name:'亡灵',faction:'horde',home:'提瑞斯法',biome:3,skin:'#a5aa88',trait:'不朽意志',desc:'饱食度消耗减半，自由意志的追寻者。',hunger:0.5},
  {id:'bloodelf',name:'血精灵',faction:'horde',home:'永歌森林',biome:4,skin:'#e5b990',trait:'奥术亲和',desc:'法力上限 +30，重建失落的辉煌。',mana:130},
];
export const FACTIONS={alliance:{name:'联盟',color:'#76b5e9',leader:'军需官 · 艾琳',enemy:'部落斥候',token:'hordeSeal'},horde:{name:'部落',color:'#e18b76',leader:'先遣官 · 洛克',enemy:'联盟巡林者',token:'allianceSeal'}};
export const CLASSES=[
 {id:'warrior',name:'战士',icon:'⚔',color:'#bd9370',desc:'贴身战斗 · 高爆发',skills:[{name:'旋风斩',cost:18,cd:5,range:3.5,damage:30},{name:'战斗怒吼',cost:25,cd:15,buff:12}]},
 {id:'mage',name:'法师',icon:'✦',color:'#80c5dc',desc:'远程奥术 · 范围冻结',skills:[{name:'奥术飞弹',cost:16,cd:2,range:10,damage:32},{name:'冰霜新星',cost:30,cd:10,range:5,damage:20,freeze:4}]},
 {id:'ranger',name:'猎人',icon:'➶',color:'#9abe79',desc:'精准射击 · 自然治愈',skills:[{name:'穿透射击',cost:14,cd:2.5,range:12,damage:30},{name:'野性复苏',cost:30,cd:15,heal:45}]},
 {id:'paladin',name:'圣骑士',icon:'✧',color:'#e5bf6c',desc:'圣光护佑 · 审判打击',skills:[{name:'圣光审判',cost:20,cd:4,range:6,damage:30},{name:'圣疗术',cost:35,cd:18,heal:65}]},
 {id:'shaman',name:'萨满',icon:'ϟ',color:'#6cbdba',desc:'元素雷霆 · 先祖祝福',skills:[{name:'闪电链',cost:22,cd:4,range:8,damage:25},{name:'先祖之灵',cost:28,cd:15,heal:45}]},
 {id:'rogue',name:'潜行者',icon:'†',color:'#d5c775',desc:'敏捷突袭 · 暗影刃舞',skills:[{name:'暗影突袭',cost:18,cd:3,range:4,damage:42},{name:'刀扇',cost:30,cd:9,range:5,damage:30}]},
];
export const BIOMES=[
 {name:'翡翠林地',grass:'#6b9845',dirt:'#725039',leaf:['#305c3b','#427848','#69974c'],sky:['#638f9e','#ced0a0'],mount:'#698b7b'},
 {name:'赤土荒原',grass:'#b2964a',dirt:'#99634a',leaf:['#786139','#93824b','#b69a52'],sky:['#a08170','#e3c496'],mount:'#a18c70'},
 {name:'霜脊雪原',grass:'#cadcda',dirt:'#686d70',leaf:['#4e7671','#7b9d91','#cee0d3'],sky:['#708fa5','#cddedf'],mount:'#879da5'},
 {name:'幽光密林',grass:'#72828c',dirt:'#575067',leaf:['#354b58','#52687a','#7b8b99'],sky:['#69758e','#b5abb3'],mount:'#68697d'},
 {name:'琥珀林海',grass:'#b79c4f',dirt:'#785342',leaf:['#835331','#aa7540','#d5a352'],sky:['#939585','#ded0a1'],mount:'#94977b'},
];
export const TILE={AIR:0,GRASS:1,DIRT:2,STONE:3,WOOD:4,LEAF:5,COPPER:6,IRON:7,COAL:8,PLANK:9,BENCH:10,FURNACE:11,TORCH:12,BED:13,CROP:14,BRICK:15,CRYSTAL:16};
export const ITEMS={
 pick:{name:'拓荒镐',icon:'pick',desc:'采集泥土、木材与石头。',tool:1}, sword:{name:'旅人短剑',icon:'sword',desc:'近战武器 · 18 伤害',damage:18},
 stonePick:{name:'石镐',icon:'pick',desc:'采掘速度提高，可采铁矿。',tool:2}, ironPick:{name:'铁镐',icon:'pick',desc:'镐力 3，可开采银矿；更深矿层需要升级。',tool:3}, ironSword:{name:'铁刃长剑',icon:'sword',damage:32,desc:'近战武器 · 32 伤害'},
 dirt:{name:'泥土',color:'#8b6547',tile:2},stone:{name:'石块',color:'#8a9293',tile:3},wood:{name:'原木',color:'#aa7847',tile:4},leaf:{name:'树叶',color:'#6b8e43',tile:5},copper:{name:'铜矿',color:'#d99560'},iron:{name:'铁矿',color:'#b6adb0'},coal:{name:'煤炭',color:'#45494c'},
 plank:{name:'木板',color:'#be8f52',tile:9},bench:{name:'工作台',icon:'bench',tile:10},furnace:{name:'熔炉',icon:'furnace',tile:11},torch:{name:'火把',icon:'torch',tile:12},bed:{name:'旅人床铺',icon:'bed',tile:13},seed:{name:'麦种',icon:'seed',tile:14},brick:{name:'石砖',color:'#899fa5',tile:15},crystal:{name:'奥术水晶',color:'#84dbe0'},
 berry:{name:'林间浆果',icon:'berry',food:18},wheat:{name:'小麦',icon:'seed'},bread:{name:'烤面包',icon:'bread',food:45},ingot:{name:'铁锭',color:'#d0d6d5'},potion:{name:'治疗药剂',icon:'potion',heal:55},allianceSeal:{name:'联盟徽记',color:'#77b9df'},hordeSeal:{name:'部落徽记',color:'#d2755e'},relic:{name:'先祖遗物',color:'#d9bc74'},coin:{name:'金币',color:'#edca69'}
};
export const DROPS={1:'dirt',2:'dirt',3:'stone',4:'wood',5:'leaf',6:'copper',7:'iron',8:'coal',9:'plank',10:'bench',11:'furnace',12:'torch',13:'bed',14:'seed',15:'brick',16:'crystal'};
export const RECIPES=[
 {id:'plank',n:4,cost:{wood:1},group:'建造'}, {id:'bench',n:1,cost:{wood:5},group:'建造'},
 {id:'torch',n:4,cost:{wood:1,coal:1},group:'建造'}, {id:'brick',n:4,cost:{stone:4},group:'建造',station:'bench'},
 {id:'bed',n:1,cost:{plank:8,leaf:4},group:'建造',station:'bench'}, {id:'furnace',n:1,cost:{stone:12},group:'建造',station:'bench'},
 {id:'stonePick',n:1,cost:{stone:8,wood:3},group:'装备',station:'bench'}, {id:'ironPick',n:1,cost:{ingot:5,wood:3},group:'装备',station:'bench'},
 {id:'ironSword',n:1,cost:{ingot:6,wood:2},group:'装备',station:'bench'}, {id:'ingot',n:1,cost:{iron:2,coal:1},group:'冶炼',station:'furnace',duration:20},
 {id:'bread',n:1,cost:{wheat:3},group:'补给'}, {id:'potion',n:1,cost:{berry:4,crystal:1},group:'补给',station:'bench'},
];
export const QUESTS={
 alliance:[{title:'暴风城的来信',text:'裂隙撕开了艾泽拉斯的边境。军需官艾琳需要你的帮助，在这里建立联盟的新前哨。',goal:'收集 8 份原木',stat:'wood',target:8,reward:{coin:12,berry:5},xp:30}, {title:'点亮边境',text:'林中传来了战鼓声。先搭起工作台，让流散的旅人有一个容身之所。',goal:'放置 1 座工作台',stat:'bench',target:1,reward:{coal:6,seed:4},xp:40},{title:'林地的阴影',text:'部落斥候正逼近我们的据点。击退他们，把敌方徽记带回营地。',goal:'击败 2 名部落斥候',stat:'factionKills',target:2,reward:{ingot:5,potion:2},xp:90},{title:'重铸誓约',text:'使用矿石重铸装备。这片无尽的边境，将成为我们新的家园。',goal:'从熔炉收取 3 块铁锭',stat:'smelt',target:3,reward:{relic:1,coin:50},xp:120}],
 horde:[{title:'为了部落',text:'大地裂隙之后，旧日道路不复存在。先遣官洛克号召你收集物资，重建氏族的营地。',goal:'收集 8 份原木',stat:'wood',target:8,reward:{coin:12,berry:5},xp:30},{title:'先祖的炉火',text:'在陌生的土地扎下根。架起工作台，让部落的旗帜在荒野中飘扬。',goal:'放置 1 座工作台',stat:'bench',target:1,reward:{coal:6,seed:4},xp:40},{title:'夺回边疆',text:'联盟巡林者越过了边界。击退他们，让敌人记住部落的意志。',goal:'击败 2 名联盟巡林者',stat:'factionKills',target:2,reward:{ingot:5,potion:2},xp:90},{title:'钢铁与荣耀',text:'真正的力量来自双手。锻造新的钢铁，以先祖之名继续远征。',goal:'从熔炉收取 3 块铁锭',stat:'smelt',target:3,reward:{relic:1,coin:50},xp:120}]
};
export const HOTBAR=['pick','sword','dirt','wood','plank','torch','bench','berry','seed','stone'];

// Stable numeric tile IDs preserve v1 terrain edits. New content extends the catalog.
Object.assign(TILE,{SAND:17,CLAY:18,SNOW:19,MUD:20,SILVER:21,GOLD:22,MITHRIL:23,OBSIDIAN:24,HELLSTONE:25,GLASS:26,PLATFORM:27,DOOR:28,OPEN_DOOR:29,CHEST:30,ANVIL:31,SAWMILL:32,LOOM:33,ALCHEMY:34,FORGE:35,ARCANE:36,CHAIR:37,TABLE:38,BOOKCASE:39,LANTERN:40,CAMPFIRE:41,ROPE:42,FLOWERPOT:43,BANNER:44,COOKING:45,FENCE:46,ROOF:47,GOLDBRICK:48});
export const MATERIALS=[
 {id:'copper',name:'铜',bar:'copperBar',color:'#c68c61',tier:1,tool:2,depth:6},
 {id:'iron',name:'铁',bar:'ingot',color:'#b9c5d1',tier:2,tool:3,depth:12},
 {id:'silver',name:'银',bar:'silverBar',color:'#d7dff4',tier:3,tool:4,depth:24},
 {id:'gold',name:'金',bar:'goldBar',color:'#efbe4b',tier:4,tool:5,depth:36},
 {id:'mithril',name:'秘银',bar:'mithrilBar',color:'#6de0c7',tier:5,tool:6,depth:50},
 {id:'hellstone',name:'狱岩',bar:'hellBar',color:'#f2724c',tier:6,tool:7,depth:65},
];
const block=(id,name,tile,color,extra={})=>{ITEMS[id]={name,tile,color,category:'建材',source:'采集地形 / 制作',...extra};DROPS[tile]=id;};
block('sand','沙块',17,'#d7bd82');block('clay','黏土',18,'#b07562');block('snow','雪块',19,'#d1e5f0');block('mud','淤泥',20,'#695246');
block('silver','银矿',21,'#afc2d7',{category:'矿石',tier:3});block('gold','金矿',22,'#e4b953',{category:'矿石',tier:4});block('mithril','秘银矿',23,'#62caba',{category:'矿石',tier:5});block('obsidian','黑曜石',24,'#4b4161',{category:'矿石',tier:4});block('hellstone','狱岩',25,'#c8634d',{category:'矿石',tier:6});
block('glass','玻璃',26,'#a8cedb',{transparent:true});block('platform','木平台',27,'#ae7d46',{icon:'platform',platform:true});
for(const [id,name,tile,icon,size]of[
 ['door','木门',28,'door',[1,3]],['chest','木箱',30,'chest',[2,1]],['anvil','铁砧',31,'anvil',[2,1]],['sawmill','锯木机',32,'sawmill',[3,2]],['loom','织布机',33,'loom',[2,2]],['alchemy','炼药台',34,'alchemy',[2,2]],['forge','精金熔炉',35,'forge',[3,2]],['arcane','奥术祭坛',36,'arcane',[3,2]],['chair','木椅',37,'chair',[1,2]],['table','木桌',38,'table',[3,2]],['bookcase','书架',39,'bookcase',[2,3]],['lantern','吊灯',40,'lantern',[1,1]],['campfire','营火',41,'campfire',[2,1]],['rope','绳索',42,'rope',[1,1]],['flowerpot','花盆',43,'flowerpot',[1,1]],['banner','阵营旗帜',44,'banner',[1,3]],['cooking','烹饪锅',45,'cooking',[2,2]],['fence','木栅栏',46,'fence',[1,1]]])block(id,name,tile,'#ab8050',{icon,size,category:['anvil','sawmill','loom','alchemy','forge','arcane','cooking'].includes(id)?'制作站':'家具',furniture:true});
block('roof','红瓦',47,'#b66352');block('goldBrick','镶金砖',48,'#a69461');DROPS[29]='door';
Object.assign(ITEMS,{
 woodWall:{name:'木背景墙',wall:1,color:'#805639',category:'背景墙'},stoneWall:{name:'石背景墙',wall:2,color:'#677486',category:'背景墙'},brickWall:{name:'砖背景墙',wall:3,color:'#906451',category:'背景墙'},glassWall:{name:'玻璃背景墙',wall:4,color:'#89c7d2',category:'背景墙'},
 hammer:{name:'木锤',icon:'hammer',category:'工具',hammer:true,desc:'拆除背景墙，不破坏前景方块。'},axe:{name:'伐木斧',icon:'axe',tool:2,category:'工具'},
 gel:{name:'凝胶',icon:'gel',color:'#6fb9f0',category:'掉落',source:'史莱姆掉落'},silk:{name:'丝绸',icon:'cloth',color:'#e9d8bc',category:'材料'},fiber:{name:'植物纤维',icon:'seed',color:'#91b05f',category:'材料',source:'砍树与采草'},leather:{name:'皮革',icon:'hide',color:'#b58356',category:'掉落',source:'野生生物与斥候掉落'},bone:{name:'骨头',icon:'bone',color:'#e3d8b2',category:'掉落',source:'夜间怪物掉落'},herb:{name:'日光草',icon:'herb',color:'#97c34e',category:'材料',source:'地表花草 / 成熟作物'},mushroom:{name:'蘑菇',icon:'mushroom',color:'#cb6658',category:'材料',source:'泥土与地下采掘'},bottle:{name:'玻璃瓶',icon:'bottle',color:'#b3d6d6',category:'材料'},manaPotion:{name:'法力药水',icon:'potion',color:'#7389ee',mana:65,category:'药剂'},regenPotion:{name:'再生药剂',icon:'potion',color:'#e68c6b',regen:60,category:'药剂'},ironPotion:{name:'铁肤药剂',icon:'potion',color:'#b6bcb8',shield:60,category:'药剂'},speedPotion:{name:'迅捷药剂',icon:'potion',color:'#e3ca63',speed:60,category:'药剂'},stew:{name:'香草炖菜',icon:'bowl',food:80,heal:20,category:'食物'},arrow:{name:'木箭',icon:'arrow',category:'弹药'},fireArrow:{name:'燃烧箭',icon:'arrow',color:'#ffb363',category:'弹药'},woodBow:{name:'木弓',icon:'bow',damage:14,ranged:true,ammo:'arrow',category:'武器'},apprenticeStaff:{name:'学徒法杖',icon:'staff',damage:20,ranged:true,manaCost:4,color:'#95b2ff',category:'武器'},rune:{name:'奥术符文',icon:'rune',color:'#8ed8ed',category:'材料'},amulet:{name:'星辉护符',icon:'amulet',slot:'accessory',manaBonus:30,category:'饰品'},boots:{name:'疾风长靴',icon:'boots',slot:'accessory',speedBonus:.22,category:'饰品'},shield:{name:'守卫纹章',icon:'shield',slot:'accessory',defense:5,category:'饰品'},
});
const recipe=(id,n,cost,station,group='建造',duration)=>RECIPES.push({id,n,cost,station,group,duration});
for(const [id,n,cost,station,group]of[
 ['platform',2,{wood:1},null,'建造'],['woodWall',4,{wood:1},'bench','背景墙'],['stoneWall',4,{stone:1},'bench','背景墙'],['brickWall',4,{brick:1},'bench','背景墙'],['glassWall',4,{glass:1},'bench','背景墙'],['hammer',1,{wood:6},'bench','工具'],['axe',1,{wood:4,stone:5},'bench','工具'],['door',1,{wood:6},'bench','家具'],['chest',1,{wood:8,ingot:2},'bench','家具'],['chair',1,{wood:4},'bench','家具'],['table',1,{wood:8},'bench','家具'],['campfire',1,{wood:6,torch:2},null,'家具'],['rope',10,{fiber:2},'bench','建造'],['anvil',1,{ingot:5},'bench','制作站'],['sawmill',1,{wood:10,ingot:3},'anvil','制作站'],['loom',1,{wood:12},'sawmill','制作站'],['alchemy',1,{wood:8,bottle:3},'bench','制作站'],['cooking',1,{ingot:5,wood:3},'anvil','制作站'],['forge',1,{stone:25,goldBar:5,obsidian:5},'anvil','制作站'],['arcane',1,{mithrilBar:6,crystal:8,rune:2},'forge','制作站'],['silk',1,{fiber:5},'loom','材料'],['bookcase',1,{plank:12,silk:3},'sawmill','家具'],['lantern',1,{ingot:2,torch:1},'anvil','家具'],['flowerpot',1,{clay:3,herb:1},'bench','家具'],['banner',1,{silk:5,wood:2},'loom','家具'],['fence',4,{wood:1},'sawmill','家具'],['roof',4,{clay:3},'furnace','建造'],['goldBrick',4,{stone:4,goldBar:1},'furnace','建造'],['glass',2,{sand:4},'furnace','材料'],['bottle',3,{glass:1},'furnace','材料'],['woodBow',1,{wood:10,fiber:2},'bench','武器'],['arrow',25,{wood:1,stone:1},'bench','弹药'],['fireArrow',25,{arrow:25,torch:1},'bench','弹药'],['apprenticeStaff',1,{wood:5,crystal:2},'anvil','武器'],['rune',1,{crystal:3,goldBar:1},'alchemy','材料'],['manaPotion',1,{bottle:1,herb:2,crystal:1},'alchemy','补给'],['regenPotion',1,{bottle:1,herb:2,mushroom:1},'alchemy','补给'],['ironPotion',1,{bottle:1,herb:1,iron:1},'alchemy','补给'],['speedPotion',1,{bottle:1,herb:1,fiber:3},'alchemy','补给'],['stew',1,{mushroom:2,herb:1,berry:2},'cooking','补给'],['amulet',1,{goldBar:4,crystal:4},'anvil','饰品'],['boots',1,{leather:5,silk:3},'loom','饰品'],['shield',1,{ingot:6,wood:5},'anvil','饰品']])recipe(id,n,cost,station,group);
for(const m of MATERIALS){
 ITEMS[m.id]={...ITEMS[m.id],category:'矿石',color:m.color,source:`地下 ${m.depth} 格及更深矿脉`};
 ITEMS[m.bar]={name:m.name+'锭',icon:'ingot',color:m.color,category:'金属',tier:m.tier};
 if(m.bar!=='ingot')recipe(m.bar,1,{[m.id]:3,coal:1},m.tier>=5?'forge':'furnace','冶炼',8+m.tier*2);
 for(const [suffix,label,icon,extra,cost]of[
 ['Pick','镐','pick',{tool:m.tool},5],['Sword','阔剑','sword',{damage:18+m.tier*8},6],['Bow','战弓','bow',{damage:18+m.tier*7,ranged:true,ammo:'arrow'},6],['Helm','头盔','helmet',{slot:'head',defense:m.tier*2},5],['Armor','胸甲','armor',{slot:'body',defense:m.tier*3},8],['Greaves','护腿','boots',{slot:'legs',defense:m.tier*2},6]]){
  const id=m.id+suffix;ITEMS[id]={...ITEMS[id],name:m.name+label,icon,color:m.color,tier:m.tier,category:extra.slot?'护甲':extra.tool?'工具':'武器',...extra};
  const old=RECIPES.find(r=>r.id===id);if(old){old.station='anvil';old.cost={[m.bar]:cost,wood:extra.slot?0:2};delete old.cost.wood;if(!extra.slot)old.cost.wood=2;}else recipe(id,1,{[m.bar]:cost,...(!extra.slot?{wood:2}:{})},m.tier>=5?'forge':'anvil',extra.slot?'护甲':extra.tool?'工具':'武器');
 }
}
ITEMS.astralStaff={name:'星界法杖',icon:'staff',color:'#c5a2ff',ranged:true,manaCost:8,damage:85,category:'武器',tier:6};recipe('astralStaff',1,{rune:5,mithrilBar:8,crystal:12},'arcane','武器');
ITEMS.bench.size=[2,1];ITEMS.furnace.size=[2,2];ITEMS.bed.size=[3,1];ITEMS.bench.category=ITEMS.furnace.category='制作站';ITEMS.bed.category='家具';ITEMS.potion.category='药剂';
for(const [id,it]of Object.entries(ITEMS)){it.id=id;it.category??=it.tool?'工具':it.damage?'武器':it.food?'食物':it.tile?'建材':'材料';it.rarity??=it.tier>=5?'史诗':it.tier>=3?'稀有':'普通';it.source??=RECIPES.some(r=>r.id===id)?'制作':'探索与采集';}
export const STATIONS=['bench','furnace','anvil','sawmill','loom','alchemy','cooking','forge','arcane'];
export const SOLID_TILES=new Set([1,2,3,6,7,8,9,15,16,17,18,19,20,21,22,23,24,25,26,28,47,48]);
export const SKILL_EXTRAS={
 warrior:[{name:'盾墙',cost:25,cd:18,shield:8,unlock:3},{name:'剑刃风暴',cost:40,cd:16,range:5,damage:85,unlock:6}],
 mage:[{name:'烈焰箭',cost:24,cd:4,projectile:true,damage:52,color:'#ffac56',unlock:3},{name:'暴风雪',cost:48,cd:18,range:8,damage:70,freeze:6,unlock:6}],
 ranger:[{name:'连珠箭',cost:25,cd:6,projectile:true,damage:25,multi:3,unlock:3},{name:'箭雨',cost:45,cd:16,range:10,damage:82,unlock:6}],
 paladin:[{name:'圣光屏障',cost:24,cd:16,shield:10,unlock:3},{name:'奉献',cost:45,cd:15,range:6,damage:70,heal:25,unlock:6}],
 shaman:[{name:'熔岩爆裂',cost:22,cd:5,projectile:true,damage:48,color:'#ef885a',unlock:3},{name:'雷霆震击',cost:42,cd:16,range:9,damage:75,freeze:3,unlock:6}],
 rogue:[{name:'暗影步',cost:20,cd:8,dash:5,shield:2,unlock:3},{name:'死亡莲华',cost:40,cd:13,range:6,damage:90,unlock:6}],
};
for(const cls of CLASSES){cls.skills[0].unlock=1;cls.skills[1].unlock=1;cls.skills.push(...SKILL_EXTRAS[cls.id]);}
export const TALENTS=[{id:'power',name:'武器精通',desc:'每级增加 12% 武器伤害',max:5},{id:'arcana',name:'奥术研习',desc:'每级增加 15% 技能伤害，最大法力 +5',max:5},{id:'vitality',name:'坚韧体魄',desc:'每级增加 12 生命上限',max:5},{id:'industry',name:'匠人专注',desc:'每级增加 15% 采掘速度',max:5}];

registerProfessions(ITEMS,RECIPES,STATIONS,DROPS,TILE);
