export const COLS = 30, ROWS = 20, TILE = 16;
export const SAVE_KEY = 'pocket-days-gpt6-v1';
export const NEEDS = [
  { id: 'hunger', label: '饱腹', icon: 'food', color: '#99ac78', decay: .035 },
  { id: 'energy', label: '精力', icon: 'energy', color: '#b4bb7e', decay: .023 },
  { id: 'hygiene', label: '清洁', icon: 'drop', color: '#85b5af', decay: .026 },
  { id: 'bladder', label: '如厕', icon: 'bath', color: '#b2a2bb', decay: .036 },
  { id: 'fun', label: '娱乐', icon: 'game', color: '#d5ac7e', decay: .025 },
  { id: 'social', label: '社交', icon: 'heart', color: '#c599a0', decay: .021 },
];
export const WISHES = [
  { id: 'eat', label: '认真吃一顿饭', tip: '去厨房看看冰箱吧。', target: 'fridge', scene: 'home' },
  { id: 'chat', label: '认识一位新邻居', tip: '小葵正在镇中心的大树下。', target: 'neighbor', scene: 'town' },
  { id: 'work', label: '赚到第一笔零花钱', tip: '小镇的晴日咖啡正在招兼职。', target: 'cafe', scene: 'town' },
];
export const SHOP = [
  { id: 'plant', name: '一盆小绿意', desc: '客厅多一抹绿色 · 娱乐 +15', cost: 80, kind: 'plant' },
  { id: 'rug', name: '晴天格纹地毯', desc: '温暖的蜜桃色 · 娱乐衰减减缓', cost: 120, kind: 'rug' },
  { id: 'lamp', name: '月光落地灯', desc: '点亮家的夜晚 · 每日额外精力', cost: 160, kind: 'lamp' },
  { id: 'bed', name: '云朵双人床', desc: '更柔软的被子 · 小睡效果加倍', cost: 240, kind: 'bed' },
];
const object = (id, name, kind, x, y, w=1, h=1, more={}) => ({id,name,kind,x,y,w,h,solid:true,...more});
export const HOME_OBJECTS = [
  object('bed','柔软的小床','bed',5,5,3,3,{icon:'moon',description:'把疲惫留给枕头，醒来又是新的一天。'}),
  object('nightstand','床头柜','nightstand',8,5,1,1,{decor:true}),
  object('bedplant','窗边绿植','plant',4,4,1,1,{decor:true}),
  object('fridge','薄荷色冰箱','fridge',13,4,1,2,{icon:'food',description:'冰箱里总有一点令人开心的东西。'}),
  object('stove','小小料理台','stove',15,4,2,1,{icon:'food',description:'认真做饭，也是认真生活。'}),
  object('sink','厨房水槽','sink',18,4,2,1,{icon:'drop',description:'洗个手，清清爽爽地开始。'}),
  object('table','早餐桌','table',16,7,3,2,{icon:'food',description:'一杯茶，一个不必着急的上午。'}),
  object('shower','淋浴间','shower',22,4,2,2,{icon:'drop',description:'热水会把所有小烦恼冲走。'}),
  object('toilet','小马桶','toilet',24,4,1,2,{icon:'bath',description:'有些事情，确实不能等。'}),
  object('basin','洗漱台','basin',24,7,1,1,{icon:'drop',description:'镜子里的你，今天也很可爱。'}),
  object('books','生活小书架','books',4,10,1,2,{icon:'book',description:'换一个故事，换一种心情。'}),
  object('tv','复古小电视','tv',7,10,2,1,{icon:'game',description:'今天的节目是《小镇奇妙物语》。'}),
  object('sofa','鼠尾草沙发','sofa',6,13,3,1,{icon:'moon',description:'什么也不做，偶尔也很好。'}),
  object('coffee','咖啡桌','coffee',7,12,1,1,{decor:true}),
  object('desk','写作角','desk',18,11,2,1,{icon:'book',description:'把小镇的故事，写成一封远方的信。'}),
  object('plant','龟背竹','plant',24,14,1,1,{icon:'leaf',description:'新叶子又长出来了，真好。'}),
  object('exit','去镇中心','door',14,16,2,1,{solid:false,icon:'map',description:'咖啡香、新朋友和新的故事，都在门外。'}),
];
export const TOWN_OBJECTS = [
  object('cafe','晴日咖啡','cafe',4,3,7,5,{icon:'coffee',description:'咖啡店营业 08:00 — 20:00，欢迎来坐坐。'}),
  object('shop','杂货与家居小铺','shop',20,3,7,5,{icon:'bag',description:'给日常添一点新鲜感，买回喜欢的小东西。'}),
  object('neighbor','邻居 · 小葵','npc',15,10,1,1,{icon:'heart',description:'「你就是刚搬来的邻居吧？你好呀！」'}),
  object('bench','树下长椅','bench',12,6,3,1,{icon:'moon',description:'听风经过树梢，看云慢慢走远。'}),
  object('pond','月牙池塘','pond',21,12,6,4,{icon:'fish',description:'波光一闪，也许是一条鱼，也许是好运。'}),
  object('flowers','小镇花圃','flowers',4,13,5,2,{icon:'leaf',description:'替园丁照顾花圃，可以领到一点谢礼。'}),
  object('cat','橘猫 · 年糕','cat',12,13,1,1,{icon:'heart',description:'「喵。」它决定让你摸一下。'}),
  object('home','回到我的小屋','sign',14,18,2,1,{solid:false,icon:'home',description:'有灯，有床，有属于自己的小日子。'}),
];
export function objectsFor(scene) { return scene === 'town' ? TOWN_OBJECTS : HOME_OBJECTS; }
export function isWall(scene,x,y) {
  if(x<1 || y<2 || x>=29 || y>=19) return true;
  if(scene==='town') return false;
  if((y===3 || y===16) && x>=3 && x<=26) return !(y===16 && (x===14 || x===15));
  if((x===3 || x===26) && y>=3 && y<=16) return true;
  if(x===11 && y>=4 && y<=9) return y!==8;
  if(y===9 && x>=4 && x<=10) return x!==9;
  if(x===21 && y>=4 && y<=8) return y!==7;
  if(y===9 && x>=21 && x<=25) return x!==23;
  return false;
}
export function isBlocked(scene,x,y) {
  x=Math.floor(x);y=Math.floor(y);
  if(isWall(scene,x,y)) return true;
  return objectsFor(scene).some(o=>o.solid && x>=o.x && x<o.x+o.w && y>=o.y && y<o.y+o.h);
}
export function distanceTo(o,x,y) {
  return Math.hypot(Math.max(o.x-x,0,x-(o.x+o.w)),Math.max(o.y-y,0,y-(o.y+o.h)));
}
export function pathTo(scene,start,destination) {
  const sx=Math.floor(start.x),sy=Math.floor(start.y),tx=Math.floor(destination.x),ty=Math.floor(destination.y);
  if(isBlocked(scene,tx,ty)) return null;
  const queue=[[sx,sy]], visited=new Map([[`${sx},${sy}`,null]]);
  for(let cursor=0;cursor<queue.length;cursor++) {
    const [x,y]=queue[cursor];
    if(x===tx && y===ty) {
      const result=[];let k=`${x},${y}`;
      while(visited.get(k)!==null) {const [px,py]=k.split(',').map(Number);result.unshift({x:px+.5,y:py+.5});k=visited.get(k);}
      return result;
    }
    for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
      const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;
      if(!visited.has(k)&&!isBlocked(scene,nx,ny)) {visited.set(k,`${x},${y}`);queue.push([nx,ny]);}
    }
  }
  return null;
}
export function pathToObject(scene,start,o) {
  const candidates=[];
  for(let y=o.y-1;y<=o.y+o.h;y++) for(let x=o.x-1;x<=o.x+o.w;x++) {
    if(x>=o.x && x<o.x+o.w && y>=o.y && y<o.y+o.h && o.solid) continue;
    if(distanceTo(o,x+.5,y+.5)>.76 || isBlocked(scene,x,y)) continue;
    const path=pathTo(scene,start,{x,y});if(path)candidates.push(path);
  }
  return candidates.sort((a,b)=>a.length-b.length)[0]??null;
}
export function initialState() {
  return {version:1,day:1,time:8*60,money:500,scene:'home',player:{x:14.5,y:12.5,dir:'down'},needs:{hunger:76,energy:88,hygiene:82,bladder:71,fun:64,social:58},friendship:0,upgrades:[],wishes:[],lastWork:0,lastGarden:0,lastFish:-9999,journal:[{day:1,time:480,text:'搬进了梧桐巷的新家。窗外的阳光正好，一切才刚刚开始。'}]};
}
export function mood(s){return Math.round(NEEDS.reduce((sum,n)=>sum+s.needs[n.id],0)/NEEDS.length);}
export function addJournal(s,text){s.journal.unshift({day:s.day,time:s.time,text});s.journal=s.journal.slice(0,50);}
export function advance(s,minutes) {
  if(!Number.isFinite(minutes)||minutes<0)return;
  const prevDay=s.day;
  for(const n of NEEDS){const factor=n.id==='fun'&&s.upgrades.includes('rug')?.65:1;s.needs[n.id]=Math.max(0,s.needs[n.id]-n.decay*minutes*factor);}
  s.time+=minutes;
  while(s.time>=1440){s.time-=1440;s.day++;}
  if(s.day!==prevDay){addJournal(s,'新的一天开始了。兼职和花圃委托已经刷新。');if(s.upgrades.includes('lamp'))s.needs.energy=Math.min(100,s.needs.energy+10);}
}
export function rewardWish(s,id){if(s.wishes.includes(id))return false;s.wishes.push(id);s.money+=30;addJournal(s,`完成小心愿「${WISHES.find(w=>w.id===id)?.label}」，获得 §30。`);return true;}
const action=(label,detail,minutes,effect,options={})=>({label,detail,minutes,effect,seconds:3,cost:0,...options});
export function actionsFor(s,id){
  switch(id){
    case 'fridge':return [action('做一份三明治','饱腹 +40 · 20 分钟 · §12',20,{hunger:40},{cost:12,wish:'eat'}),action('吃一份免费麦片','饱腹 +18 · 10 分钟',10,{hunger:18},{wish:'eat'})];
    case 'stove':return [action('煮一碗番茄意面','饱腹 +65 · 娱乐 +10 · 40 分钟 · §25',40,{hunger:65,fun:10},{cost:25,wish:'eat'})];
    case 'table':return [action('泡茶，发一会儿呆','娱乐 +16 · 精力 +8 · 20 分钟',20,{fun:16,energy:8})];
    case 'bed':return [action('小睡一会儿',`精力 +${s.upgrades.includes('bed')?80:45} · 1 小时`,60,{energy:s.upgrades.includes('bed')?80:45},{seconds:4}),action('一觉睡到明天','醒于次日 07:00 · 精力回满',1440-s.time+420,{energy:100,hunger:-12},{seconds:5,sleep:true})];
    case 'shower':return [action('洗个热水澡','清洁 +70 · 精力 +5 · 30 分钟',30,{hygiene:70,energy:5})];
    case 'toilet':return [action('上厕所','如厕 +95 · 10 分钟',10,{bladder:95},{seconds:2})];
    case 'sink':case 'basin':return [action('洗手，整理仪容','清洁 +25 · 10 分钟',10,{hygiene:25},{seconds:2})];
    case 'tv':return [action('看一集小镇物语','娱乐 +45 · 社交 +8 · 45 分钟',45,{fun:45,social:8})];
    case 'sofa':case 'bench':return [action('坐下来歇一会儿','精力 +25 · 娱乐 +15 · 30 分钟',30,{energy:25,fun:15})];
    case 'books':return [action('读一本有趣的小说','娱乐 +35 · 30 分钟',30,{fun:35})];
    case 'desk':return [action('给远方的朋友写信','社交 +30 · 娱乐 +10 · 30 分钟',30,{social:30,fun:10})];
    case 'plant':return [action('浇水，看看新叶子','娱乐 +18 · 10 分钟',10,{fun:18})];
    case 'neighbor':return [action('聊聊小镇的日常','社交 +40 · 好感 +15 · 20 分钟',20,{social:40},{friendship:15,wish:'chat'}),action('送一份草莓蛋糕','社交 +50 · 好感 +25 · §20',15,{social:50},{cost:20,friendship:25,wish:'chat'})];
    case 'cat':return [action('摸摸年糕的脑袋','娱乐 +25 · 社交 +20 · 10 分钟',10,{fun:25,social:20},{seconds:2})];
    case 'cafe':return [action('做半天咖啡店兼职','收入 §180 · 精力 −18 · 饱腹 −15 · 4 小时',240,{energy:-18,hunger:-15,bladder:-8,social:15},{seconds:6,income:180,wish:'work',work:true}),action('买一份咖啡与可颂','饱腹 +40 · 精力 +20 · 30 分钟 · §25',30,{hunger:40,energy:20},{cost:25,wish:'eat'})];
    case 'flowers':return [action('帮园丁照料花圃','收入 §45 · 娱乐 +15 · 清洁 −12 · 45 分钟',45,{fun:15,hygiene:-12},{income:45,garden:true,wish:'work'})];
    case 'pond':return [action('借用鱼竿钓一会儿鱼','收入 §20 · 娱乐 +30 · 40 分钟',40,{fun:30},{income:20,fish:true,seconds:5})];
    default:return [];
  }
}
export function actionError(s,a){
  if(s.money<a.cost)return '零钱不够了。冰箱里还有免费麦片，花圃也有小委托。';
  if(a.work && (s.time<480 || s.time>960))return '兼职需在 08:00—16:00 开始，咖啡店 20:00 打烊。';
  if(a.work && s.lastWork===s.day)return '今天的兼职已经完成，明天再来吧。';
  if(a.work && s.needs.energy<20)return '精力不足 20，先休息一下再来兼职吧。';
  if(a.garden && s.lastGarden===s.day)return '今天的花已经照料好了，明天再来看看。';
  if(a.fish && s.day*1440+s.time-s.lastFish<60)return '鱼儿还在休息，隔一个游戏小时再来吧。';
  return null;
}
export function completeAction(s,a){
  const error=actionError(s,a);if(error)return {error};
  const actionDay=s.day;
  advance(s,a.minutes);s.money+= (a.income||0)-a.cost;
  for(const [id,amount]of Object.entries(a.effect))s.needs[id]=Math.min(100,Math.max(0,s.needs[id]+amount));
  if(a.sleep)s.needs.energy=100;
  if(a.work)s.lastWork=actionDay;
  if(a.garden)s.lastGarden=actionDay;
  if(a.fish)s.lastFish=s.day*1440+s.time;
  if(a.friendship)s.friendship=Math.min(100,s.friendship+a.friendship);
  addJournal(s,`${a.label}${a.income?`，获得 §${a.income}`:''}。${a.friendship?'与小葵又熟悉了一点。':''}`);
  const wish=a.wish?rewardWish(s,a.wish):false;
  return {wish};
}
export function buyUpgrade(s,id){const p=SHOP.find(p=>p.id===id);if(!p)return {error:'没有这件商品。'};if(s.upgrades.includes(id))return {error:'这件家具已经在家里啦。'};if(s.money<p.cost)return {error:'零钱还不够，先做个小委托吧。'};s.money-=p.cost;s.upgrades.push(id);s.needs.fun=Math.min(100,s.needs.fun+15);addJournal(s,`买了「${p.name}」，家的样子又更喜欢了一点。`);return {ok:true};}
export function readSave(raw){
  try{
    const v=JSON.parse(raw),s=initialState();if(!v || v.version!==1)return null;
    const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
    if(!finite(v.day,1,999999)||!Number.isInteger(v.day)||!finite(v.time,0,1439.9999)||!finite(v.money,0,1e9)||!['home','town'].includes(v.scene))return null;
    if(!v.player||!finite(v.player.x,1,29)||!finite(v.player.y,2,19))return null;
    if(!v.needs||NEEDS.some(n=>!finite(v.needs[n.id],0,100)))return null;
    for(const key of ['day','time','money','scene'])s[key]=v[key];
    s.player={x:v.player.x,y:v.player.y,dir:['up','down','left','right'].includes(v.player.dir)?v.player.dir:'down'};
    if(isBlocked(s.scene,s.player.x,s.player.y))s.player=s.scene==='home'?{x:14.5,y:12.5,dir:'down'}:{x:15.5,y:16.5,dir:'up'};
    s.needs=Object.fromEntries(NEEDS.map(n=>[n.id,v.needs[n.id]]));s.friendship=finite(v.friendship,0,100)?v.friendship:0;
    s.upgrades=[...new Set((Array.isArray(v.upgrades)?v.upgrades:[]).filter(id=>SHOP.some(p=>p.id===id)))];
    s.wishes=[...new Set((Array.isArray(v.wishes)?v.wishes:[]).filter(id=>WISHES.some(w=>w.id===id)))];
    for(const key of ['lastWork','lastGarden','lastFish'])if(finite(v[key],-9999,1e10))s[key]=v[key];
    if(Array.isArray(v.journal))s.journal=v.journal.filter(j=>j&&typeof j.text==='string'&&finite(j.day,1,1e6)&&finite(j.time,0,1440)).slice(0,50).map(j=>({day:j.day,time:j.time,text:j.text.slice(0,200)}));
    return s;
  }catch{return null;}
}
export function formatTime(time){return `${String(Math.floor(time/60)%24).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;}
