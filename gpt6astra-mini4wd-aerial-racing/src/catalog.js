export const CARS = [
  {id:'cyclone',name:'旋风冲锋',en:'CYCLONE MAGNUM',driver:'星马豪',sku:'19412',chassis:'SUPER TZ',size:[147,90,41],body:'#f5f3e7',accent:'#004bb4',wheel:'#55a22e',canopy:'#111923',mass:132,description:'白色分叉车鼻、独立蓝色前翼，后肩红色闪电与高位横翼。',features:['楔形前轮导流罩，轮胎后半外露','宽白色鼻翼包围蓝色中轴','低长黑座舱与白色顶桥','后肩红色闪电、蓝色侧面','白色尾翼端板与黄色 MAGNUM'],family:'rear'},
  {id:'hurricane',name:'飓风音速号',en:'HURRICANE SONIC',driver:'星马烈',sku:'19415',chassis:'SUPER TZ',size:[146,90,40],body:'#f1efdf',accent:'#da1834',wheel:'#e5c634',canopy:'#11131c',mass:134,description:'红白绿配色，前端黑色弯翼与后肩六片橙色襟翼。',features:['前端黑色下凹连接翼','红色楔形前轮罩、绿色裙边','白色宽大平直后肩','左右各三片橙色襟翼','大面积红色尾翼、蓝色 SONIC'],family:'rear'},
  {id:'dagger',name:'新三角剑',en:'NEO-TRIDAGGER ZMC',driver:'鹰羽龙',sku:'19409',chassis:'SUPER 1',size:[132,90,46],body:'#292c32',accent:'#ef3e20',wheel:'#cc2631',canopy:'#b99144',mass:126,description:'石墨灰车壳、低平阶梯鼻槽，金色座舱与火焰涂装。',features:['前轮明显外露，三叉宽扁前缘','前半身 U 形三级阶梯槽','金色多面长座舱','石墨色大拱后轮罩','红黄火焰、黑色宽尾翼'],family:'rear'},
  {id:'evolution',name:'进化者',en:'PROTO-SABER EVOLUTION',driver:'J',sku:'19302 · 95568',sourceSku:'95568',chassis:'REAL MINI 4WD',size:[131,78,40],body:'#4d3c98',accent:'#ed3535',wheel:'#dce1e4',canopy:'#d7e6ef',mass:131,description:'紫色双槽前鼻，透明机械舱、连续座舱框与长侧尾翼。',features:['车头两条贯穿深槽与三叉短鼻','无色透明罩下的银色机械','座舱前框连入长侧翼端板','黄色双圆灯与红色火焰','银色涡轮轮毂、胎面枝状纹'],family:'real',adaptation:true},
  {id:'cobra',name:'极速眼镜蛇',en:'SPIN COBRA',driver:'三国藤吉',sku:'19301',chassis:'REAL MINI 4WD',size:[127,86,37],body:'#034fba',accent:'#ffc817',wheel:'#e3e7ec',canopy:'#e2edf0',mass:133,description:'蓝色弧面车头，眼镜蛇扇形侧翼、透明机械舱和银色百叶。',features:['圆弧前铲与两枚椭圆大灯','前盖银色双列三层进气片','窄腰两侧展开扇形膜翼','细长透明座舱、银色内部机构','蓝黄红火焰、银色多孔轮毂'],family:'real',adaptation:true},
  {id:'spider',name:'蜘蛛王',en:'BEAK SPIDER',driver:'冲田海',sku:'19408',chassis:'SUPER 1',size:[132,90,40],body:'#10171c',accent:'#159ee8',wheel:'#c42537',canopy:'#b99950',mass:129,description:'宽扁黑色前壳、蓝白蛛网，金舱与带百叶的高位分体尾翼。',features:['宽曲面前铲与两侧红色梯形灯','贯穿前壳的蓝白双线蛛网','窄长金色座舱','红色后肩尖角纹、外露绿色齿箱','纵向脊梁贯穿百叶双尾翼'],family:'rear'},
  {id:'gigant',name:'巨无霸',en:'BROCKEN GIGANT',driver:'近藤源',sku:'19411',chassis:'SUPER FM',size:[144,90,38],body:'#db1627',accent:'#191a21',wheel:'#e4bc23',canopy:'#074999',mass:143,description:'红色厚重方头、外露前置马达、蓝色大座舱与银色侧护管。',features:['方形分离车头与黄色横条格栅','前轴后方外露的前置马达','宽高蓝色多面座舱','银色前后侧护管与尾部双管','黑色锯齿虎纹，无横向高尾翼'],family:'front'},
  {id:'stinger',name:'魔鬼司令',en:'RAY STINGER',driver:'土方令',sku:'19413',chassis:'SUPER 1',size:[132,90,38],body:'#abb1bc',accent:'#dac38a',wheel:'#c62a38',canopy:'#11161d',mass:130,description:'银色尖鼻、弯月前轮罩，后肩四枚金色喷口与分节软管。',features:['尖锐中央银色鼻脊、前端红色双眼','向前延伸的弯月形轮罩','长黑色后舱与银色中尾鳍','后肩四枚朝前的金色圆喷口','两侧分节金管、黑色裂纹涂装'],family:'rear'},
];

export const PARTS = {
  motor:{name:'马达',part:'motor',unit:'rpm',options:[{name:'标准 130',rpm:15800,torque:.008,mass:17,heat:1},{name:'扭力强化',rpm:23200,torque:.013,mass:18,heat:1.1},{name:'疾速竞赛',rpm:30500,torque:.012,mass:18,heat:1.35}]},
  gear:{name:'传动齿轮',part:'gear',unit:'齿比',options:[{name:'爬坡 5:1',ratio:5,mass:3},{name:'均衡 4:1',ratio:4,mass:3},{name:'高速 3.5:1',ratio:3.5,mass:3}]},
  tire:{name:'轮胎',part:'wheels',unit:'摩擦系数',options:[{name:'经典黑色橡胶',grip:.85,roll:.042,mass:14,radius:.013},{name:'高抓地软胎',grip:1.18,roll:.050,mass:16,radius:.013},{name:'低阻硬胎',grip:.65,roll:.025,mass:12,radius:.013}]},
  roller:{name:'导轮',part:'rollers',unit:'接触阻力',options:[{name:'经典塑胶导轮',drag:.15,stability:1,mass:5},{name:'双层轴承导轮',drag:.085,stability:1.32,mass:7},{name:'轻量铝导轮',drag:.065,stability:1.15,mass:5}]},
  brake:{name:'刹车片',part:'brake',unit:'制动力',options:[{name:'基础底护片',force:.09,mass:2},{name:'蓝色海绵刹车',force:.24,mass:3},{name:'红色强刹',force:.43,mass:4}]},
  battery:{name:'电池',part:'battery',unit:'电压',options:[{name:'NiMH 2.4V',voltage:2.4,capacity:950,mass:26},{name:'碱性 3.0V',voltage:3,capacity:750,mass:29},{name:'高放电 2.6V',voltage:2.6,capacity:1100,mass:27}]},
  chassis:{name:'底盘',part:'chassis',unit:'质量',options:[{name:'经典 ABS',mass:26,stiffness:1},{name:'加强纤维',mass:24,stiffness:1.2},{name:'轻量镂空',mass:20,stiffness:.88}]},
  body:{name:'车壳',part:'shell',unit:'质量',options:[{name:'经典原版',mass:15,downforce:1},{name:'轻量车壳',mass:11,downforce:.96},{name:'空气导流强化',mass:17,downforce:1.15}]},
};
export function standardBuild(){return {motor:1,gear:1,tire:0,roller:0,brake:0,battery:0,chassis:0,body:0};}
export function recommendedBuild(){return {...standardBuild(),tire:1,roller:1};}
export function resolveBuild(car,config){
  const parts=Object.fromEntries(Object.entries(PARTS).map(([k,p])=>[k,p.options[Math.max(0,Math.min(p.options.length-1,Number(config[k])||0))]]));
  const mass=(Object.values(parts).reduce((s,p)=>s+(p.mass||0),0)+17+(car.mass-130))/1000;
  return {...parts,mass,vFree:parts.motor.rpm*(parts.battery.voltage/2.4)*Math.PI*2*parts.tire.radius/60/parts.gear.ratio};
}
export const COURSES=[
  {id:'aerial',name:'天穹双环',en:'SKYLINE DOUBLE LOOP',tag:'360° × 2',note:'双垂直环道 · 连环 S 弯 · 高架回旋',level:'立体竞速',laps:3},
  {id:'helix',name:'螺旋登峰',en:'HELIX ASCENT',tag:'立体回旋',note:'螺旋爬升 · 高空长桥 · 连续倾斜弯',level:'抓地挑战',laps:3},
  {id:'technical',name:'连弯试验场',en:'TECHNICAL CIRCUIT',tag:'技术赛道',note:'连续反向弯 · 坡桥交叉 · 机械换道',level:'调校试跑',laps:4},
];
export const VENUES=[{id:'club',name:'四驱俱乐部',color:'#d6d8d6'},{id:'night',name:'夜间训练室',color:'#1d2c40'},{id:'workshop',name:'木作工坊',color:'#b89e7c'}];
