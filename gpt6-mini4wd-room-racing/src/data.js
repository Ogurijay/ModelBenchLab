// Reference identities and dimensions: docs/car-reference-research.md. Physics values are estimates.
export const CARS = [
 {id:'cyclone',name:'旋风冲锋',en:'CYCLONE MAGNUM',shape:'magnum',color:'#ffffff',accent:'#233fbc',trim:'#e12c36',wheel:'#15c757',glass:'#181d29',number:'01',style:'AR · 后置马达',chassis:'AR',length:155,width:97,weight:132,gear:3.5,cg:17,desc:'白色流线车壳、蓝色独立前轮罩、红色闪电与荧光绿五辐轮。'},
 {id:'hurricane',name:'飓风音速号',en:'HURRICANE SONIC',shape:'sonic',color:'#ffffff',accent:'#e52837',trim:'#167960',wheel:'#efd035',glass:'#181d29',number:'02',style:'AR · 后置马达',chassis:'AR',length:155,width:97,weight:136,gear:3.5,cg:16,desc:'白底红绿涂装，跨接前轮罩的前翼与宽幅后翼。'},
 {id:'triangle',name:'新三角剑',en:'NEO-TRIDAGGER ZMC',shape:'dagger',color:'#30353d',accent:'#f45124',trim:'#f5bf27',wheel:'#d32629',glass:'#c2a34a',number:'03',style:'Super-I · 后置马达',chassis:'Super-I',length:132,width:90,weight:128,gear:4,cg:16,desc:'枪灰色三叉车头，橙红火焰、金色分割座舱与高架尾翼。'},
 {id:'evolution',name:'进化者',en:'PROTO-SABER EVOLUTION',shape:'evo',color:'#66549d',accent:'#e02d32',trim:'#c6cbd0',wheel:'#b4bdc6',glass:'#d1d9df',number:'04',style:'AR · 后置马达',chassis:'AR',length:155,width:97,weight:142,gear:3.5,cg:18,desc:'紫色全覆车壳，银色金属座舱、红色火焰与双尖鼻。'},
 {id:'cobra',name:'极速眼镜蛇',en:'SPIN COBRA',shape:'cobra',color:'#2247a6',accent:'#ffd537',trim:'#ed4932',wheel:'#b18b40',glass:'#202630',number:'05',style:'Super-II · 后置马达',chassis:'Super-II',length:150,width:97,weight:139,gear:4,cg:17,desc:'蓝色弧形全覆车壳，黄红火焰、银色中央蛇背与铜金轮毂。'},
 {id:'spider',name:'蜘蛛王',en:'BEAK SPIDER',shape:'spider',color:'#111722',accent:'#167ddd',trim:'#e73632',wheel:'#151a20',glass:'#c8a841',number:'06',style:'Super-II · 后置马达',chassis:'Super-II',length:150,width:97,weight:140,gear:4,cg:18,stockDiameter:24,desc:'黑色车壳与蓝银蜘蛛网，金色座舱、白色轮胎、三层阶梯尾翼。'},
 {id:'giant',name:'巨无霸',en:'BROCKEN GIGANT',shape:'giant',color:'#e0242f',accent:'#1d222a',trim:'#c7cdd4',wheel:'#edd330',glass:'#125092',number:'07',style:'FM-A · 前置马达',chassis:'FM-A',length:156,width:97,weight:152,gear:3.5,cg:15,frontMotor:true,desc:'红黑裂纹车壳，前置马达脊罩、银色管架与夹住轮胎的外护翼。'},
 {id:'devil',name:'魔鬼司令',en:'RAY STINGER',shape:'devil',color:'#d2d7de',accent:'#dd252f',trim:'#242630',wheel:'#f0f1ec',glass:'#161b24',number:'08',style:'Super-II · 后置马达',chassis:'Super-II',length:150,width:97,weight:137,gear:4,cg:16,desc:'银色三叉尖鼻、黑色座舱、四个金色喷口和单片中央竖鳍。'},
];
export const PARTS = {
 shell:{name:'车壳',en:'BODY',detail:'减轻上部重量能降低重心。保留车型的经典轮廓和涂装。',options:[{name:'原厂彩绘 ABS 车壳',hint:'经典涂装',mass:0},{name:'轻量彩绘车壳',hint:'减重 6 g · 重心降低 1 mm',mass:-6,cg:-1},{name:'强化彩绘车壳',hint:'增重 4 g · 刚性提高',mass:4,cg:.5}]},
 chassis:{name:'底盘',en:'CHASSIS',detail:'四个轮子通过齿轮与传动轴连接。巨无霸保持前置马达布局。',options:[{name:'原厂四驱底盘',hint:'原车型马达布局',mass:0,color:'#31343b'},{name:'强化 ABS 底盘',hint:'增重 5 g · 稳定支撑',mass:5,color:'#474c58'},{name:'轻量镂空底盘',hint:'减重 7 g · 落地容错降低',mass:-7,color:'#22262c'}]},
 motor:{name:'马达',en:'MOTOR',detail:'持续供电。高转速需要搭配刹车与导轮，单纯追求极速容易飞出赛道。',options:[{name:'标准马达',hint:'12,000 rpm · 入门平衡型',rpm:12000,torque:.0048,current:.65,color:'#bcc1c6'},{name:'高转速马达',hint:'22,000 rpm · 跳台风险高',rpm:22000,torque:.0062,current:1.7,color:'#cf4140'},{name:'高扭矩马达',hint:'16,000 rpm · 爬坡与起步',rpm:16000,torque:.008,current:1.1,color:'#d4b954'}]},
 gears:{name:'齿轮与传动轴',en:'DRIVETRAIN',detail:'固定齿比，比赛中不能换挡。3.5:1 偏极速，5:1 偏扭矩。',options:[{name:'原厂固定齿比',hint:'依底盘采用 3.5:1 / 4:1',ratio:0,color:'#e0b44d'},{name:'高速齿轮 3.5:1',hint:'较高极速 · 起步扭矩较低',ratio:3.5,color:'#74c2bd'},{name:'扭矩齿轮 5:1',hint:'降低极速 · 提高起步扭矩',ratio:5,color:'#c771b4'}]},
 tires:{name:'轮毂与轮胎',en:'WHEELS',detail:'小直径偏加速，大直径偏极速；硬胎减少弯道擦地损失，低反弹胎帮助落地。',options:[{name:'原厂轮组 · 依车型轮径',hint:'24 / 26 mm · 原厂轮毂配色',diameter:26,grip:.85,rolling:.032,bounce:.38,color:null},{name:'24 mm 超硬低反弹胎',hint:'降低极速 · 减少落地弹跳',diameter:24,grip:.72,rolling:.023,bounce:.18,color:'#33353a'},{name:'31 mm 大径软胎',hint:'提高极速 · 弹跳与弯道损失增大',diameter:31,grip:1,rolling:.045,bounce:.54,color:'#22242a'}]},
 rollers:{name:'导轮与支架',en:'ROLLERS',detail:'导轮贴着 50 mm 高护墙被动转向。轴承减少擦墙损失，双层导轮提高抗倾翻能力。',options:[{name:'原厂塑料导轮',hint:'97 mm 整车宽 · 普通轴承',width:97,friction:.105,limit:75,mass:0,color:null},{name:'19 mm 铝合金轴承导轮',hint:'104 mm 整车宽 · 低擦墙损失',width:104,friction:.045,limit:94,mass:5,color:'#bdc6cf'},{name:'双层导轮与碳板',hint:'104 mm 整车宽 · 抗倾翻加强',width:104,friction:.055,limit:125,mass:9,color:'#dab355'}]},
 brake:{name:'刹车海绵',en:'BRAKE',detail:'海绵在上坡接触赛道，发车后自动减速。厚海绵缩短飞行距离，也损失上坡速度。',options:[{name:'原厂滑条 · 无海绵',hint:'平路速度快 · 高速跳台风险高',strength:0,mass:0,color:'#383b42'},{name:'1 mm 蓝色刹车海绵',hint:'中等上坡制动 · 间隙 2 mm',strength:1.8,mass:2,color:'#559cde'},{name:'2 mm 粉色刹车海绵',hint:'强上坡制动 · 间隙 1 mm',strength:3.6,mass:3,color:'#e56e9d'}]},
 dampers:{name:'质量阻尼器',en:'MASS DAMPERS',detail:'铜质砝码消耗落地能量，减少弹跳，但增加整车重量。',options:[{name:'无质量阻尼器',hint:'轻量 · 落地较易弹跳',mass:0,damping:0},{name:'双侧铜质阻尼器',hint:'+8 g · 减少落地弹跳',mass:8,damping:.5},{name:'前后阻尼器组',hint:'+14 g · 稳定跳台落地',mass:14,damping:.78}]},
 battery:{name:'两节 AA 电池',en:'BATTERIES',detail:'两节 AA 电池，容量、电压与重量存在取舍。模拟参数使用负载估计值。',options:[{name:'两节碱性 AA',hint:'2.7 V 负载估值 · 1,200 mAh',voltage:2.7,capacity:1200,mass:0,color:'#d3a34e'},{name:'两节竞赛 Ni-MH',hint:'2.5 V 负载估值 · 1,900 mAh',voltage:2.5,capacity:1900,mass:7,color:'#64a489'},{name:'两节轻量 Ni-MH',hint:'2.4 V 负载估值 · 950 mAh',voltage:2.4,capacity:950,mass:-5,color:'#db774a'}]},
};
export const STAT_NAMES=['极速','加速','稳定','续航'];
export const VENUES=[
 {id:'bedroom',name:'放学后的模型社',en:'AFTER SCHOOL',tag:'木地板活动室 · 午后阳光',wall:'#ddd8cd',floor:'#b58a5e',accent:'#e84636',light:'#fff0d5',grip:1,ambient:25},
 {id:'club',name:'模型竞技俱乐部',en:'RACING CLUB',tag:'大型室内赛场 · 专业练习',wall:'#afb8bb',floor:'#8a8f8d',accent:'#167c8b',light:'#e9f3ff',grip:1,ambient:22},
 {id:'night',name:'深夜改装工场',en:'NIGHT WORKSHOP',tag:'室内工场 · 灯带照明',wall:'#303c4b',floor:'#414752',accent:'#e85d44',light:'#c9ddff',grip:1,ambient:20},
];
export const TRACKS=[
 {id:'classic',name:'放学后 · 长程技术赛',en:'GRAND CIRCUIT',level:'均衡型',desc:'长直线、八个弯道、波浪段、双跳台与立体换道桥。',points:[[-7,4.5],[7,4.5],[7,-4.5],[-7,-4.5],[-7,-1.5],[4,-1.5],[4,1.5],[-7,1.5]],radius:.88,jumps:true},
 {id:'speed',name:'疾风 · 高速耐力赛',en:'HYPER ENDURANCE',level:'高速型',desc:'超长折返直线、大半径回转与换道桥，适合调试动力组合。',points:[[-9,5.6],[9,5.6],[9,-5.6],[-9,-5.6],[-9,-1.9],[5.3,-1.9],[5.3,1.9],[-9,1.9]],radius:1.02,jumps:false},
 {id:'cross',name:'ZMC · 双层立交赛',en:'ZMC CROSSOVER',level:'技术型',desc:'两翼长程回环、分层中央立交、陡坡跳台与换道桥。',points:[[-8.6,5.8],[-2.9,5.8],[2.9,-5.8],[8.6,-5.8],[8.6,5.8],[2.9,5.8],[-2.9,-5.8],[-8.6,-5.8]],radius:1.05,jumps:true,crossover:true},
];
export const defaultBuild=()=>Object.fromEntries(Object.keys(PARTS).map(k=>[k,0]));
export function normalizeBuild(raw={}){if(!raw||typeof raw!=='object')raw={};return Object.fromEntries(Object.keys(PARTS).map(k=>[k,Number.isInteger(raw[k])&&PARTS[k].options[raw[k]]?raw[k]:0]));}
export function getSetup(car,raw={}){
 const b=normalizeBuild(raw),p=Object.fromEntries(Object.keys(PARTS).map(k=>[k,PARTS[k].options[b[k]]]));
 const mass=car.weight+Object.values(p).reduce((s,o)=>s+(o.mass||0),0),ratio=p.gears.ratio||car.gear,diameter=b.tires===0?(car.stockDiameter||26):p.tires.diameter;
 const speed=p.motor.rpm/60/ratio*Math.PI*diameter/1000*(p.battery.voltage/2.7)*.91;
 return {build:b,parts:p,mass,ratio,diameter,topSpeed:speed,acceleration:p.motor.torque*ratio/(diameter/2000)/(mass/1000),width:b.rollers===0?car.width:p.rollers.width,height:car.shape==='dagger'?46:car.shape==='spider'?43:40,length:b.brake||b.rollers?Math.max(car.length,154):car.length,cg:car.cg+(p.shell.cg||0),capacity:p.battery.capacity,cornerLoss:p.rollers.friction,cornerLimit:p.rollers.limit*(17/(car.cg+(p.shell.cg||0))),brake:p.brake.strength,bounce:p.tires.bounce*(1-p.dampers.damping),current:p.motor.current};
}
export function getStats(car,b={}){const s=getSetup(car,b);return [s.topSpeed*15,s.acceleration*7,s.cornerLimit*.72+(1-s.bounce)*20,s.capacity/24].map(n=>Math.round(Math.max(15,Math.min(125,n))));}
export const topSpeed=stats=>stats[0]/15;
export function inspectCar(car,b={}){const s=getSetup(car,b),reasons=[];if(s.width>=105)reasons.push('宽度必须小于 105 mm');if(s.length>=165)reasons.push('长度必须小于 165 mm');if(s.height>=70)reasons.push('高度必须小于 70 mm');if(s.mass<90)reasons.push('含电池质量至少 90 g');return {legal:reasons.length===0,reasons,...s};}
export function validateCustomCar(raw,existing=[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('赛车数据必须是 JSON 对象。');
 const name=String(raw.name||'').trim();if(!name||name.length>18)throw new Error('赛车名称需要 1–18 个字符。');
 if(!/^#[\da-f]{6}$/i.test(raw.color||''))throw new Error('车身颜色需要 #RRGGBB 格式。');
 if(existing.length>=16)throw new Error('车库最多可保存 16 辆拓展赛车。');
 const base=CARS.find(c=>c.shape===raw.shape)||CARS[0];
 return {...base,id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,en:'CUSTOM MACHINE',color:raw.color,accent:/^#[\da-f]{6}$/i.test(raw.accent||'')?raw.accent:base.accent,number:'EX',style:`${base.chassis} · 专属涂装`,desc:`基于${base.name}的自定义涂装，采用同一套配件调校规则。`,custom:true};
}
