export const ANIMALS = [
  ['corgi','奶油柯基','短腿也能打全场','#df984b','#fff1d0','dog'],
  ['cat','桃桃猫','把混乱踩在爪下','#d4b9ad','#fff5df','cat'],
  ['rabbit','棉花兔','耳朵很长，脾气很短','#efdbcc','#fff9f0','rabbit'],
  ['panda','饭团熊猫','一拳一口饭','#f1ecd9','#242c3b','panda'],
  ['duck','柠檬鸭','嘎嘎就是战斗宣言','#f9d454','#fff4ad','duck'],
  ['shark','泡泡鲨','陆地也在营业','#668bb0','#e1ebef','shark'],
  ['fox','枫糖狐','聪明一点，摔轻一点','#d86940','#ffe7bf','fox'],
  ['otter','团子獭','抓住了就不撒手','#916e55','#e9caa4','otter'],
  ['dino','青柠龙','体型小，梦想很大','#81ad72','#cfde9b','dino'],
  ['bear','可可熊','拥抱有一点点重','#97765e','#e8cba3','bear'],
  ['pig','蜜桃猪','弹性十足的选手','#eda0a6','#f6c6c1','pig'],
  ['tiger','布丁虎','条纹是冠军的标记','#e6a247','#f4dfb7','tiger'],
  ['penguin','墨墨企鹅','冰上优雅，岸上随缘','#344556','#eff3ed','penguin'],
  ['unicorn','星糖独角兽','魔法不如一记头槌','#ddd0ec','#faf2e3','unicorn'],
  ['raccoon','灰灰浣熊','顺手牵走你的平底锅','#9298a0','#dcd6c8','raccoon'],
  ['dog','牛奶汪','今天也是好狗狗','#f0e3c6','#a38368','dog'],
].map(([id,name,tag,color,accent,kind])=>({id,name,tag,color,accent,kind}));
export const TEAM_COLORS = ['#5fc4d2','#f18d74','#af98e3','#f0cf56','#9ac58e','#d990b7','#8aa2d7','#b7987b'];
export const MODES = [
  {id:'last',name:'最后的毛球',en:'LAST STAND',tag:'经典淘汰',desc:'打晕、抱起、扔出去。最后站着的队伍拿下奖杯。',color:'#f4ba40',maps:['temple','submarine','plane','blizzard','wind','blackhole','bridge','river','ice','castle','conveyor','ring','sharks']},
  {id:'score',name:'团队抢分',en:'TEAM SCORE',tag:'目标争夺',desc:'球赛、运糖、添煤、投石与街机。配合比拳头更重要。',color:'#6ac6ba',maps:['soccer','hockey','football','basket','candy','train','arcade','trebuchet','balloon']},
  {id:'smash',name:'爪力全开',en:'SMASH',tag:'能力卡乱斗',desc:'每回合选一张爪力卡，叠加天赋，越打越离谱。',color:'#b69add',maps:['temple','ring','ice','conveyor']},
  {id:'mutator',name:'如果这样呢',en:'WHAT IF?',tag:'变异规则',desc:'低重力、巨兽、超级速度、炸弹雨，轮流改写规则。',color:'#ea95ae',maps:['ring','temple','ice']},
  {id:'kart',name:'毛球卡丁车',en:'PAW KART',tag:'漂移道具赛',desc:'三圈冲线。漂移攒加速，道具改变名次。',color:'#81b3dd',maps:['coast','city','candyroad']},
  {id:'trainDuel',name:'终点决斗',en:'FINAL DESTINATION',tag:'列车淘汰',desc:'在疾驰的列车上战斗，躲避横梁和脱落的车厢。',color:'#bd9270',maps:['duel']},
  {id:'pirate',name:'黑帆对决',en:'BLACK SAILS',tag:'舰船攻防',desc:'装填大炮、击穿敌船、修复船体，也能跳帮肉搏。',color:'#789eaf',maps:['pirate']},
  {id:'crisis',name:'太空危机',en:'CRISIS',tag:'身份推理',desc:'船员完成维修，潜伏者制造破坏。报告、讨论、投票。',color:'#a197bd',maps:['station']},
  {id:'cabin',name:'四季小屋',en:'THE CABIN',tag:'钓鱼与桌游',desc:'暂时放下拳头。钓鱼、出牌、收集图鉴，享受慢时光。',color:'#afba90',maps:['winter','spring','summer','autumn']},
  {id:'training',name:'毛球训练营',en:'TRAINING',tag:'操作教学',desc:'分步练习拳脚、抓取、举起、投掷和攀爬。',color:'#bdc4cc',maps:['gym']},
];
const arena = (id,name,kind,tip,w=12,d=10)=>({id,name,kind,tip,w,d});
export const MAPS = [
  arena('temple','青岚古寺','gas','毒雾会从四周收缩，向中心转移。'),
  arena('submarine','风暴潜艇','sink','甲板不断下沉，注意不断升高的海水。',15,6),
  arena('plane','云端机翼','plane','机翼逐渐结冰，疾风会将你带走。',17,5),
  arena('blizzard','最后一簇火','cold','靠近篝火保暖，熄灭的篝火不再安全。'),
  arena('wind','巨扇车间','wind','躲到挡风墙后，或按 F 暂时关闭风机。',13,9),
  arena('blackhole','引力实验室','blackhole','红色预警后黑洞开启，离中心远一点。'),
  arena('bridge','摇摇吊桥','bridge','木板会依次断裂。抓紧剩下的桥面。',18,4),
  arena('river','急流峡谷','wave','洪峰来之前向高处躲避。',14,8),
  arena('ice','薄荷浮冰','ice','浮冰受踩踏会破裂，保持移动。'),
  arena('castle','南瓜城堡','collapse','地板逐圈崩塌，安全区越来越小。'),
  arena('conveyor','快递大作战','belt','传送带会突然换向，小心尽头的深渊。',14,10),
  arena('ring','毛球擂台','ring','中央擂台。比赛后期边缘会通电。'),
  arena('sharks','鲨口余生','shark','红色区域标记鲨鱼的下一次撞击。',14,7),
  arena('soccer','毛球世界杯','soccer','把足球踢进对手球门。',20,13),
  arena('hockey','冰上碰碰','hockey','冰面低摩擦，冰球更快。',20,13),
  arena('football','闪电橄榄球','football','抱起球并冲入对手达阵区。',20,13),
  arena('basket','灌篮高手','basket','抓球、举起、投向高处篮筐。',18,12),
  arena('candy','糖果搬运工','candy','把中央的糖果搬回己方区域。',18,12),
  arena('train','煤球快车','train','抓煤投入己方火炉，推动列车率先抵达。',20,12),
  arena('arcade','街机风云','arcade','在己方街机旁按 F 收集星星，别被打断。',17,11),
  arena('trebuchet','投石大乱斗','trebuchet','把石弹运到投石器，按 F 攻击对方城堡。',20,13),
  arena('balloon','气球争夺战','balloon','控制中央气球，按住 F 为己方充气。',17,12),
  arena('duel','铁道终点','duel','躲过警示横梁，车厢会在后半场脱落。',20,5),
  arena('pirate','黑帆海湾','pirate','F 装填开炮或修船，先击沉敌船。',22,13),
  arena('station','星环空间站','station','F 维修终端或报告倒地者，R 发起紧急会议。',19,15),
  ...['winter','spring','summer','autumn'].map((x,i)=>arena(x,['冬日小屋','春日小屋','夏日小屋','秋日小屋'][i],'cabin','靠近钓鱼码头或桌游桌按 F。',20,16)),
  arena('gym','软垫训练馆','gym','按操作提示完成训练；训练中可随时重置。',14,12),
  arena('coast','海风环岛','kart','宽阔海岸赛道。蓝色漂移火花积攒加速。',50,42),
  arena('city','霓虹港湾','kart','连续弯道，注意路边的道具箱。',48,44),
  arena('candyroad','糖霜山谷','kart','高速外环与收紧的内弯。',52,46),
];
export const WEAPONS = [
  {id:'bat',name:'球棒',damage:40,power:9,reach:2.1,color:'#b3804b',type:'melee'},
  {id:'pan',name:'平底锅',damage:48,power:10,reach:1.9,color:'#434957',type:'melee'},
  {id:'hammer',name:'大锤',damage:65,power:13,reach:2.1,color:'#d78074',type:'melee',slow:1.4},
  {id:'lollipop',name:'棒棒糖',damage:38,power:8,reach:2.4,color:'#ed85ae',type:'melee'},
  {id:'nunchuck',name:'双节棍',damage:28,power:6,reach:2.2,color:'#f4c647',type:'melee',slow:.65},
  {id:'shovel',name:'铲子',damage:42,power:10,reach:2.6,color:'#88a5b1',type:'melee'},
  {id:'freeze',name:'冰冻枪',damage:16,power:3,reach:15,color:'#8ce5ef',type:'freeze',ammo:8},
  {id:'taser',name:'电击枪',damage:55,power:4,reach:12,color:'#d6b9fc',type:'taser',ammo:6},
  {id:'crossbow',name:'吸盘弩',damage:28,power:10,reach:18,color:'#b49c76',type:'crossbow',ammo:8},
  {id:'bomb',name:'炸弹',damage:100,power:22,reach:5,color:'#343b49',type:'bomb'},
  {id:'spinach',name:'菠菜罐头',damage:0,power:0,reach:0,color:'#88b883',type:'food'},
  {id:'banana',name:'香蕉皮',damage:12,power:3,reach:1,color:'#fbdc66',type:'banana'},
];
export const PERKS = [
  ['strong','大力出奇迹','伤害与投掷力量 +35%','✊'],['speed','风一样的毛球','移动速度 +25%','➤'],
  ['stamina','耐力选手','体力消耗减半','∞'],['jump','月球漫步','跳跃高度 +45%','↑'],
  ['armor','软软护甲','受到的伤害降低 30%','⬡'],['recover','打个盹','眩晕恢复速度翻倍','☀'],
  ['vampire','饼干补给','命中后恢复体力','♥'],['blast','起床气','被击晕时震开周围敌人','✦'],
  ['ice','冰冰爪','拳脚使对手减速','❄'],['heavy','稳如饭团','被击退距离减半','◆'],
  ['reach','长臂高手','拳脚攻击距离 +40%','↗'],['regen','呼吸回满','意识恢复速度加倍','↻'],
].map(([id,name,desc,icon])=>({id,name,desc,icon}));
export const COSTUMES = [
  {id:'classic',name:'原味毛球',price:0},{id:'scarf',name:'俱乐部围巾',price:100},{id:'cap',name:'棒球小队',price:180},
  {id:'crown',name:'小小冠军',price:320},{id:'glasses',name:'度假墨镜',price:220},{id:'pirate',name:'海盗船长',price:350},
  {id:'flower',name:'花园派对',price:150},{id:'space',name:'太空远行',price:450},
];
export const FISH = [
  ['silver','银鳞鱼',20,1],['carp','锦鲤',40,1.15],['bass','青背鲈',60,1.3],['salmon','日落鲑',90,1.45],
  ['puffer','团团河豚',120,1.6],['ray','小蝠鲼',180,1.85],['gold','金色传说',300,2.1],['ice','冰晶鱼',240,2],
].map(([id,name,price,difficulty])=>({id,name,price,difficulty}));
export const ACHIEVEMENTS = [
  ['first','开门红','赢得第一场比赛','wins',1,100],['fighter','小拳拳','累计命中 50 次','hits',50,100],
  ['thrower','空中飞球','累计投掷 20 次','throws',20,120],['champ','派对常客','完成 10 场比赛','matches',10,200],
  ['angler','钓鱼佬','成功钓起 5 条鱼','fish',5,150],['racer','弯道高手','完成 3 场赛车','races',3,150],
  ['cards','好牌在手','赢得一局桌游','cards',1,150],['survivor','淘汰专家','累计淘汰 15 名对手','kos',15,200],
].map(([id,name,desc,key,target,reward])=>({id,name,desc,key,target,reward}));
export const byId = (list,id)=>list.find(x=>x.id===id) ?? list[0];
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export function rng(seed=12345) { let s=seed>>>0; return ()=>{ s+=0x6d2b79f5; let t=Math.imul(s^s>>>15,1|s); t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296; }; }
export const EMPTY_INPUT = ()=>({x:0,z:0,run:false,jump:false,punch:false,kick:false,head:false,grab:false,throw:false,interact:false,emote:false});
