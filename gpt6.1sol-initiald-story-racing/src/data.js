export const CARS = [
  { id:'ae86', name:'AE86 Trueno', driver:'周董', color:'#eeeae0', trail:'#ffffff', drive:'FR', power:130, max:47, accel:9.8, grip:4.8, turn:0.94, strength:2, stars:[3,5,5], note:'轻。下坡之王。', shape:'hatch' },
  { id:'ae85', name:'阿木的 AE85', driver:'阿木', color:'#efe7cd', trail:'#ffc68a', drive:'FR', power:83, max:36, accel:7, grip:5, turn:0.8, strength:1, stars:[2,3,2], note:'是85，不是86。', shape:'hatch' },
  { id:'wuling', name:'五菱宏光', driver:'人民的车', color:'#ede9df', trail:'#fadb71', drive:'FR', power:100, max:38, accel:7.2, grip:4.1, turn:0.85, strength:1, stars:[2,3,3], note:'动力不详，遇强则强。', shape:'van' },
  { id:'gtr', name:'R32 GT-R', driver:'六叔', color:'#232832', trail:'#ff3a4e', drive:'AWD', power:280, max:56, accel:12, grip:6.7, turn:0.75, strength:4, stars:[5,3,2], note:'四驱信仰。急弯会推头。', shape:'coupe', unlock:6 },
  { id:'evo', name:'三菱 EVO', driver:'刘教练', color:'#d4d5df', trail:'#b797ff', drive:'AWD', power:260, max:53, accel:13, grip:6.4, turn:0.8, strength:4, stars:[4,4,3], note:'冲动加速，爱撞墙。', shape:'sedan', unlock:8 },
  { id:'evo3', name:'EVO III', driver:'山鸡哥', color:'#252630', trail:'#c69bff', drive:'AWD', power:270, max:54, accel:12, grip:5.8, turn:0.88, strength:5, stars:[4,4,4], note:'全能型。不是每场比赛都能赢。', shape:'sedan', unlock:9 },
  { id:'fc', name:'RX-7 FC', driver:'陈老师', color:'#eeeff3', trail:'#9bdcff', drive:'FR', power:205, max:51, accel:10.8, grip:5.2, turn:0.99, strength:5, stars:[4,5,4], note:'理论的尽头，是那一个弯。', shape:'fc', unlock:11 },
  { id:'benz', name:'奔驰豪华轿车', driver:'钞能力大叔', color:'#161e28', trail:'#f5cc65', drive:'FR', power:350, max:68, accel:14, grip:5.4, turn:0.7, strength:8, stars:[5,2,1], note:'撞墙不减速。根本没在比赛。', shape:'luxury', unlock:12 }
];
export const carById = id => CARS.find(c=>c.id===id) || CARS[0];
export const TRACKS = [{id:'downhill',name:'秋名山下坡',note:'4.3公里的青春，压缩成一段山路。',weather:'night'}, {id:'uphill',name:'秋名山上坡',note:'马力会回答这个问题。',weather:'dusk'}, {id:'rain',name:'雨夜秋名山',note:'每一个弯，都要更温柔。',weather:'rain'}, {id:'highway',name:'出山国道',note:'当这条路不再有弯。',weather:'dawn'}];
export const MODES = [{id:'duel',name:'单挑'}, {id:'chase',name:'追逐赛'}, {id:'time',name:'计时赛'}, {id:'tofu',name:'豆腐挑战'}, {id:'battle',name:'神车混战'}];
const l=(who,text,mood='normal')=>({who,text,mood});
export const CHAPTERS = [
  { id:0, title:'一秒钟有多长', type:'scene', weather:'night', motive:'在一个弯里，看见自己的以后。', lines:[l('陈老师','一秒钟，有多长？'),l('六叔','够我过一个弯。南边归我，北边归你。','smile'),l('陈老师','那就先从秋名开始。')] },
  { id:1, title:'送豆腐', type:'tofu', weather:'dawn', car:'ae86', motive:'四点了，豆腐还得送。', lines:[l('秋生叔','钥匙在桌上。杯子里的水，不许洒。'),l('周董','……知道了。','silent'),l('秋生叔','入弯先松一点。车头过去，屁股还没过去。醉话？你记着。')] },
  { id:2, title:'暑假前', type:'scene', weather:'day', motive:'想见她，又假装没看见。', lines:[l('阿木','暑假我就买86。秋名山车神舍我其谁！','smile'),l('夏树','拓海，周末一起去海边，好吗？','smile'),l('周董','……嗯。'),l('旁白','校门口停下一辆奔驰。她上车了。只有两秒。','silent')] },
  { id:3, title:'加油站踢馆', type:'race', weather:'dusk', car:'ae85', opponent:'gtr', forced:'ae85', motive:'阿木想证明，自己也能成为车神。', lines:[l('阿B','你买的到底是什么车？'),l('阿木','是85，不是86……只差一个数字嘛。','smile'),l('六叔','那就上山。四驱不会说谎。')] },
  { id:4, title:'深夜的86', type:'race', weather:'night', car:'ae86', opponent:'gtr', motive:'只是想早点回去睡觉。', lines:[l('周董','后面的车一直闪灯……要超就超啊。'),l('六叔','豆腐车？我就不信了。'),l('周董','明天还要四点起床。','silent')] },
  { id:5, title:'豆腐店的交易', type:'scene', weather:'dusk', motive:'赢了，就能借车去海边。', lines:[l('六叔','星期六，秋名山。'),l('陈老师','我想看一看，你是怎么过弯的。'),l('夏树','我们说好的，海边。','smile'),l('秋生叔','赢了，车借你。油自己加。')] },
  { id:6, title:'86上山了', type:'race', weather:'night', car:'ae86', opponent:'gtr', gutter:true, motive:'为了那一天的海。', lines:[l('阿B','那辆86，终于上山了。'),l('秋生叔','沟在弯内侧。让内侧的轮子进去，别让整台车进去。'),l('六叔','四驱就是我的信仰。')] },
  { id:7, title:'海滩', type:'scene', weather:'day', quiet:true, art:'beach', motive:'这一次，不用赶路。', lines:[l('夏树','你总是很安静。可是跟你在一起，我很开心。','smile'),l('夏树','我喜欢你，拓海。','smile'),l('周董','……我也是。','silent'),l('旁白','海浪一遍遍地上岸。没有人说话。','silent')] },
  { id:8, title:'刘教练', type:'race', weather:'night', car:'ae86', opponent:'evo', qte:true, motive:'想保住那辆借来的车，也想保住日常。', lines:[l('刘教练','先热身！本草纲目！跟我踢！','smile'),l('阿木','赛前毽子操？哥你这个版本是不是装错了？','smile'),l('周董','……赶紧跑吧。')] },
  { id:9, title:'山鸡哥', type:'race', weather:'rain', car:'ae86', opponent:'evo3', forced:'engine', motive:'以为踩住油门，就能留住所有东西。', lines:[l('山鸡哥','你打败了我的人。现在，轮到我。'),l('周董','……来吧。'),l('旁白','雨下得很大。引擎今天的声音，有点不一样。','silent')], after:[l('阿木','我在酒店门口，看见夏树了。她和一个开奔驰的……','silent'),l('周董','别说了。','silent')] },
  { id:10, title:'沉默', type:'scene', weather:'rain', quiet:true, art:'garage', motive:'有些父亲，不会说安慰的话。', lines:[l('旁白','秋生叔没有问输赢。','silent'),l('旁白','车库的灯，亮了一整夜。旧引擎被拆了下来。','silent'),l('秋生叔','车好了。','silent')] },
  { id:11, title:'秋名山车神', type:'race', weather:'night', car:'ae86', opponent:'fc', gutter:true, motive:'想知道自己还能抓住什么。', lines:[l('陈老师','先讲物理。轮胎的抓地预算，不能同时花在加速和转弯上。'),l('阿木','老师，考试重点划一下？','smile'),l('陈老师','下一个弯。每一个弯。'),l('周董','那就跑一次。')] },
  { id:12, title:'奔驰', type:'finale', weather:'dawn', car:'ae86', opponent:'benz', quiet:true, motive:'你什么都没想，一脚油门。', lines:[l('旁白','封神后的第二天。凌晨，还是要送豆腐。','silent'),l('旁白','山脚有一辆奔驰。副驾驶，是夏树。','silent'),l('周董','……','silent')] },
  { id:13, title:'你考虑一下', type:'scene', weather:'dawn', quiet:true, art:'projectd', motive:'明天，还是会到来。', lines:[l('陈老师','我要组一支车队。Project D。你考虑一下。'),l('旁白','白色FC停在豆腐店门口。','silent'),l('周董','……哎哟，不错哦。','smile'),l('旁白','拓海把水杯放好，发动了86。','silent')] }
];
export const DANMAKU = {
  normal:['86上山了','前方高能','这条路我熟','他只是想回去睡觉','四点了，该送豆腐了'],
  drift:['这是物理外挂吧','车头：我先走了','反打！反打！','轮胎：我有自己的想法','完美漂移！'],
  pass:['别眨眼！','排水渠过弯！','对方正在重新连接','秋名山车神'],
  wuling:['人民需要什么，五菱就造什么','车不行，别怪路不平','专业防水补漏','动力不详，遇强则强','七座满载，申请出战'],
  gtr:['四驱信仰开始推头','六叔：我怎么在外侧？'],
  evo:['山鸡哥yyds','刘教练开始贴墙毽子操'],
  crowned:['秋名山车神','秋名山车神','86上山了']
};
