// 游戏数据表:需求、技能、职业、商店、镇民、社交行为、章节目标。
// 致敬 GBA 版模拟人生的玩法结构;人物、地名与文本均为原创。

export const TOWN_NAME = '绿钻镇';
export const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ---------------------------------------------------------------- 需求
export const MOTIVES = [
  { id: 'hunger', label: '饥饿', icon: 'hunger', decay: 5.5, sleep: 2.2, w: 1.25 },
  { id: 'comfort', label: '舒适', icon: 'comfort', decay: 3.2, sleep: -4, w: 0.8 },
  { id: 'hygiene', label: '卫生', icon: 'hygiene', decay: 3.4, sleep: 1.2, w: 0.9 },
  { id: 'bladder', label: '膀胱', icon: 'bladder', decay: 7.0, sleep: 2.8, w: 1.0 },
  { id: 'energy', label: '精力', icon: 'energy', decay: 4.6, sleep: 0, w: 1.2 },
  { id: 'fun', label: '娱乐', icon: 'fun', decay: 4.2, sleep: 0.6, w: 1.0 },
  { id: 'social', label: '社交', icon: 'social', decay: 3.0, sleep: 0.8, w: 0.9 },
  { id: 'room', label: '环境', icon: 'room', decay: 0, sleep: 0, w: 0.6 },
];

export const SKILLS = [
  { id: 'cooking', label: '烹饪', icon: 'cooking' },
  { id: 'mechanical', label: '机械', icon: 'mechanical' },
  { id: 'charisma', label: '魅力', icon: 'charisma' },
  { id: 'body', label: '体魄', icon: 'body' },
  { id: 'logic', label: '逻辑', icon: 'logic' },
  { id: 'creativity', label: '创意', icon: 'creativity' },
];
export const SKILL_XP = 100; // 每级经验
export const SKILL_MAX = 5;

// ---------------------------------------------------------------- 职业
export const CAREERS = {
  cafe: {
    name: '咖啡馆', place: 'cafe', open: 8, close: 20, game: 'cafe',
    levels: [
      { title: '洗碗工', pay: 45, req: {} },
      { title: '服务生', pay: 65, req: { cooking: 1 } },
      { title: '咖啡师', pay: 95, req: { cooking: 2, charisma: 1 } },
      { title: '主厨', pay: 140, req: { cooking: 4, charisma: 2 } },
      { title: '店长合伙人', pay: 210, req: { cooking: 5, charisma: 4 } },
    ],
  },
  garage: {
    name: '修车厂', place: 'garage', open: 8, close: 18, game: 'garage',
    levels: [
      { title: '学徒', pay: 50, req: {} },
      { title: '修理工', pay: 75, req: { mechanical: 1 } },
      { title: '技师', pay: 105, req: { mechanical: 2, body: 1 } },
      { title: '高级技师', pay: 155, req: { mechanical: 4, body: 2 } },
      { title: '车厂主管', pay: 230, req: { mechanical: 5, logic: 3 } },
    ],
  },
};

// ---------------------------------------------------------------- 家具店
// slot 对应家中摆放位置;replaces 表示升级替换已有家具
export const SHOP = [
  { id: 'plant1', name: '绿萝盆栽', price: 60, desc: '让家里有点生气。环境 +', room: 6 },
  { id: 'guitar', name: '木吉他', price: 180, desc: '弹奏提升创意,也很好玩。', room: 2 },
  { id: 'easel', name: '画架', price: 220, desc: '画画练创意,完成的画能卖钱。', room: 3 },
  { id: 'aquarium', name: '热带鱼缸', price: 260, desc: '赏鱼解闷。环境 ++', room: 12 },
  { id: 'treadmill', name: '跑步机', price: 300, desc: '在家练体魄。', room: 0 },
  { id: 'sofa2', name: '真皮沙发', price: 350, desc: '替换旧沙发,舒适恢复更快。', room: 6 },
  { id: 'bathtub', name: '按摩浴缸', price: 420, desc: '泡澡:卫生、舒适、娱乐一起涨。', room: 6 },
  { id: 'tv2', name: '大屏彩电', price: 460, desc: '替换旧电视,娱乐 ×1.6,不会坏。', room: 5 },
  { id: 'computer', name: '电脑', price: 520, desc: '玩游戏、网聊、写代码接单赚钱。', room: 3 },
  { id: 'bed2', name: '豪华双人床', price: 650, desc: '替换旧床,睡得更快更香。', room: 8 },
  { id: 'plant2', name: '琴叶榕', price: 90, desc: '再来一盆,环境 +', room: 6 },
  { id: 'deed', name: '湖景别墅地契', price: 5000, desc: '你在绿钻镇的终极梦想。需完成第三章。', room: 0, special: true },
];
export const shopItem = (id) => SHOP.find((s) => s.id === id);

// ---------------------------------------------------------------- 镇民
// likes / dislikes: 社交行为 id;schedule: [起始小时, 结束小时, 地图, 区域(格)]
export const NPCS = {
  jed: {
    name: '老杰叔', title: '热心房东', romance: false,
    look: { skin: '#e8b080', hair: '#a8a8b0', hairStyle: 1, shirt: '#c84020', pants: '#304878', shoes: '#4a2a10' },
    likes: ['joke', 'chat'], dislikes: ['prank'], voice: 0.8,
    schedule: [[7, 12, 'town', [2, 9, 17, 13]], [12, 18, 'town', [26, 20, 38, 25]], [18, 22, 'cafe', [6, 5, 11, 8]]],
    bio: '把你接到镇上的老房东,爱讲冷笑话,自称"绿钻镇活地图"。',
  },
  lily: {
    name: '莉莉', title: '咖啡馆店长', romance: true,
    look: { skin: '#f8d0a8', hair: '#783818', hairStyle: 2, shirt: '#f080a8', pants: '#784020', skirt: true, shoes: '#783818' },
    likes: ['compliment', 'gift', 'chat'], dislikes: ['prank', 'joke'], voice: 1.35,
    schedule: [[7, 20, 'cafe', [3, 2, 3, 2], true], [20, 23, 'town', [24, 10, 40, 13]]],
    bio: '咖啡馆的老板娘,温柔细心,梦想把小店开成镇上的地标。',
  },
  max: {
    name: '阿强', title: '修车厂老板', romance: false,
    look: { skin: '#c88858', hair: '#282830', hairStyle: 0, shirt: '#3870d8', pants: '#383838', shoes: '#202020' },
    likes: ['joke', 'prank', 'chat'], dislikes: ['compliment'], voice: 0.7,
    schedule: [[8, 18, 'garage', [8, 5, 11, 6]], [18, 22, 'gym', [5, 4, 9, 6]]],
    bio: '嗓门大、手艺好,最讨厌拍马屁,喜欢恶作剧。',
  },
  mia: {
    name: '米娅', title: '健身教练', romance: true,
    look: { skin: '#e8b080', hair: '#e8c040', hairStyle: 3, shirt: '#48a848', pants: '#303848', skirt: false, shoes: '#f0f0f0' },
    likes: ['hug', 'compliment', 'joke'], dislikes: ['ask'], voice: 1.25,
    schedule: [[6, 14, 'gym', [4, 4, 9, 6]], [14, 20, 'town', [25, 19, 39, 24]]],
    bio: '活力四射的健身教练,相信流汗能解决一切烦恼。',
  },
  gao: {
    name: '高博士', title: '退休科学家', romance: false,
    look: { skin: '#f8d0a8', hair: '#383838', hairStyle: 0, shirt: '#f0f0f0', pants: '#806040', shoes: '#382818' },
    likes: ['chat', 'ask'], dislikes: ['joke', 'hug'], voice: 1.0,
    schedule: [[9, 17, 'town', [26, 21, 29, 23]], [17, 21, 'cafe', [6, 5, 11, 8]]],
    bio: '在公园棋桌边研究"社交的数学模型",下棋从不让子。',
  },
  rosa: {
    name: '罗莎奶奶', title: '退休教师', romance: false,
    look: { skin: '#e8b080', hair: '#e0e0e8', hairStyle: 2, shirt: '#8850c0', pants: '#8850c0', skirt: true, shoes: '#382818' },
    likes: ['chat', 'compliment', 'gift', 'hug'], dislikes: ['prank'], voice: 1.15,
    schedule: [[8, 18, 'town', [27, 25, 33, 26]]],
    bio: '每天在公园喂鸽子,认识镇上每一个人,也最爱操心。',
  },
  wang: {
    name: '汪老板', title: '家具店老板', romance: false,
    look: { skin: '#f8d0a8', hair: '#282830', hairStyle: 1, shirt: '#f0c030', pants: '#383838', shoes: '#202020' },
    likes: ['gift', 'compliment'], dislikes: ['prank', 'hug'], voice: 0.9,
    schedule: [[9, 21, 'shop', [2, 2, 2, 2], true]],
    bio: '精明的家具店老板,口头禅是"便宜没好货"。',
  },
};

// ---------------------------------------------------------------- 社交行为
export const SOCIALS = [
  { id: 'chat', label: '聊天', icon: 'chat', base: 0.8, gain: 4, loss: 2, social: 18, min: -100 },
  { id: 'joke', label: '讲笑话', icon: 'joke', base: 0.6, gain: 7, loss: 5, social: 16, min: -20, skill: 'charisma' },
  { id: 'compliment', label: '夸赞', icon: 'compliment', base: 0.65, gain: 7, loss: 4, social: 14, min: 0, skill: 'charisma' },
  { id: 'hug', label: '拥抱', icon: 'hug', base: 0.65, gain: 9, loss: 8, social: 22, min: 35 },
  { id: 'flirt', label: '调情', icon: 'flirt', base: 0.55, gain: 10, loss: 9, social: 20, min: 50, romance: true, skill: 'charisma' },
  { id: 'kiss', label: '亲吻', icon: 'kiss', base: 0.7, gain: 14, loss: 12, social: 28, min: 70, romance: true, needCrush: true },
  { id: 'gift', label: '送礼物 §30', icon: 'gift', base: 0.95, gain: 9, loss: 0, social: 12, min: -100, cost: 30 },
  { id: 'prank', label: '恶作剧', icon: 'prank', base: 0.35, gain: 6, loss: 12, social: 10, min: -100 },
  { id: 'ask', label: '打听消息', icon: 'ask', base: 0.85, gain: 2, loss: 2, social: 10, min: -100 },
];

export function relTier(v, romance) {
  if (romance) return '恋人';
  if (v <= -40) return '死对头';
  if (v < 0) return '不和';
  if (v < 10) return '陌生人';
  if (v < 40) return '熟人';
  if (v < 70) return '朋友';
  return '好朋友';
}

// ---------------------------------------------------------------- 章节目标
// check(G) 由 sim.js 注入的游戏状态读取器调用
export const CHAPTERS = [
  {
    title: '第一章 · 初来乍到',
    intro: '先在绿钻镇站稳脚跟:打个招呼、洗个澡、做顿饭,再去找份工作。',
    reward: 150,
    goals: [
      { text: '和老杰叔打个招呼', check: (g) => g.rel('jed') > 0 },
      { text: '在家洗个澡', check: (g) => g.flag('showered') },
      { text: '用灶台做一顿饭', check: (g) => g.flag('cooked') },
      { text: '完成一次打工(咖啡馆或修车厂)', check: (g) => g.flag('worked') },
    ],
  },
  {
    title: '第二章 · 安家落户',
    intro: '认识镇上的人,学点手艺,把小屋布置得像个家。',
    reward: 300,
    goals: [
      { text: '与 3 位镇民关系达到熟人', check: (g) => g.countRel(10) >= 3 },
      { text: '烹饪技能达到 2 级', check: (g) => g.skill('cooking') >= 2 },
      { text: '从家具店买一件家具', check: (g) => g.ownedCount() >= 1 },
      { text: '手头存款达到 §600', check: (g) => g.money() >= 600 },
    ],
  },
  {
    title: '第三章 · 小镇红人',
    intro: '交到真心朋友,在工作上闯出名堂。',
    reward: 600,
    goals: [
      { text: '与一位镇民成为好朋友', check: (g) => g.countRel(70) >= 1 },
      { text: '任一职业升到第 3 级', check: (g) => g.bestCareer() >= 3 },
      { text: '魅力技能达到 3 级', check: (g) => g.skill('charisma') >= 3 },
      { text: '体魄技能达到 2 级', check: (g) => g.skill('body') >= 2 },
    ],
  },
  {
    title: '第四章 · 梦想之家',
    intro: '找到心上人,攒钱买下湖边的那栋别墅!',
    reward: 0,
    goals: [
      { text: '和某人确立恋人关系', check: (g) => g.hasLover() },
      { text: '技能总等级达到 14', check: (g) => g.skillTotal() >= 14 },
      { text: '买下湖景别墅地契', check: (g) => g.owned('deed') },
    ],
  },
];

// ---------------------------------------------------------------- 对话文本
export const LINES = {
  jed: {
    greet: ['哟,年轻人!今天过得怎么样?', '绿钻镇的空气不错吧?', '有事尽管找我老杰!'],
    chat: ['我年轻时可是镇上的舞王。', '咖啡馆的莉莉做的拿铁一绝。', '修车厂的阿强嘴硬心软。', '别忘了看看邮箱,账单可不等人。', '冰箱空了就去咖啡馆吃,或者打电话叫披萨。'],
    ask: ['想赚钱?咖啡馆和修车厂都招人,早八点后去柜台问问。', '家具店的汪老板收画,画得越好卖得越贵。', '公园湖边能钓鱼,钓到的鱼可以卖给咖啡馆。'],
    joke: ['哈哈哈!好小子,比我的冷笑话还冷!', '……这个我得记下来讲给罗莎听。'],
  },
  lily: {
    greet: ['欢迎光临~今天想喝点什么?', '你来啦!', '外面热吗?进来坐坐吧。'],
    chat: ['我每天五点就起来烤面包。', '要是能把咖啡馆开成连锁店就好了。', '你喜欢甜的还是苦的?'],
    ask: ['咖啡馆一直缺人手,想来打工就跟我说~', '听说高博士又在研究什么奇怪的公式。', '升咖啡师要会点烹饪,还要会和客人聊天哦。'],
    joke: ['呃……哈哈?', '这个笑话,我听不太懂……'],
  },
  max: {
    greet: ['嘿!别挡着我的千斤顶!', '哟,稀客!', '车坏了?还是来找活干?'],
    chat: ['发动机的声音就是我的摇滚乐。', '昨天有人把我的扳手涂成粉色,肯定是米娅!', '修车靠手感,手感靠练。'],
    ask: ['修车厂缺学徒,工资日结,来不来?', '书架上的机械书多看看,手艺长得快。', '我听说汪老板店里进了台大彩电。'],
    joke: ['哈!这个好!再来一个!', '笑死我了,哈哈哈!'],
  },
  mia: {
    greet: ['嗨!今天练了吗?', '来,深呼吸——!', '状态不错嘛!'],
    chat: ['每天跑五公里,心情超好!', '多运动、早点睡,比什么补品都有用。', '公园的空气最适合拉伸了。'],
    ask: ['健身房的器械随便用,练体魄最快。', '想升职?体魄好的人干活不累。', '心情不好的时候,去公园坐坐会好很多。'],
    joke: ['哈哈哈!你好好笑!', '噗——不行了,肚子都笑痛了!'],
  },
  gao: {
    greet: ['根据我的计算,你会在这个时间出现。', '嗯?啊,是你。', '你知道社交关系可以用矩阵表示吗?'],
    chat: ['我正在证明"友谊守恒定律"。', '下棋是逻辑的体操。', '咖啡因的半衰期是五小时,别喝太晚。'],
    ask: ['逻辑技能高的人写代码能接到更贵的单子。', '镇民各有喜好:讨厌的互动会让关系倒退。', '想交朋友?多聊天,先建立信任,再拥抱。'],
    joke: ['……这在统计上并不好笑。', '我不理解这个笑点。'],
  },
  rosa: {
    greet: ['哎呀,好孩子,吃饭了没有?', '来来来,陪奶奶坐会儿。', '今天的鸽子特别多呢。'],
    chat: ['我教了四十年书,镇上一半人都是我学生。', '老杰年轻时可调皮了。', '睡前喝杯热牛奶,睡得香。'],
    ask: ['莉莉那孩子喜欢别人夸她,也喜欢小礼物。', '阿强刀子嘴豆腐心,讲笑话他最开心。', '米娅那丫头不喜欢别人打听她的私事。'],
    joke: ['呵呵呵,你这孩子。', '哎哟,笑得我假牙都要掉了。'],
  },
  wang: {
    greet: ['欢迎光临!随便看,随便挑!', '便宜没好货,好货不便宜!', '又来逛啦?'],
    chat: ['那张豪华双人床卖得最好。', '湖边那栋别墅,地契在我手里哦。', '生意难做啊……'],
    ask: ['有画可以卖给我,创意越高价越好。', '鱼缸和盆栽能让家里环境变好,心情也好。', '别墅地契五千块,一分不能少。'],
    joke: ['哈,讲笑话不能打折啊。', '呵呵。买点什么吧?'],
  },
};

export const STORY = {
  intro: [
    ['jed', '哟!你就是新来的吧?欢迎来到绿钻镇!'],
    ['jed', '我是老杰,这一片的房东。北边那栋红屋顶的小房子,从今天起就是你的家了。'],
    ['jed', '生活嘛,无非吃喝拉撒睡,再加上赚钱、交朋友。头顶那颗绿钻会告诉你心情好不好。'],
    ['jed', '有空过来跟我打个招呼(走到我面前按 A),我给你讲讲镇上的规矩。'],
  ],
  chapterDone: [
    ['jed', '干得漂亮!你在绿钻镇越来越像样了。'],
  ],
  ending: [
    ['jed', '湖景别墅的地契……你真的做到了!'],
    ['jed', '还记得你刚下车时那副紧张的样子吗?现在全镇都认识你了。'],
    ['jed', '去吧,搬进你的梦想之家。生活还会继续——这才是最好玩的部分。'],
  ],
};
