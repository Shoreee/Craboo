const pairs = [
  ['产品','Product'],['陪伴','Companion'],['仿真','Simulation'],['我的','My Sounds'],['学习','Learning'],['视角','VIEW'],['机器人','Robot'],['桌面','Table'],['房间','Room'],['重置','Reset'],['启动仿真','Start'],['移动 / 转向','Move / turn'],['降噪','Noise reduction'],['试听并标注','Listen & label'],['训练模型','Train models'],['陪伴与仿真','Companion & Simulation'],
  ['01 / 会行动的伙伴','01 / A COMPANION IN MOTION'],['聆听。','Listen.'],['行动。','Move.'],['记住。','Remember.'],
  ['一只慢慢学会你喜欢的声音的小伙伴。','A small companion that learns the sounds you love.'],['探索设计','EXPLORE THE DESIGN'],['拖动旋转','DRAG TO ROTATE'],['一个身体 · 双层上壳 · 六只足','ONE BODY. TWO SHELLS. SIX LEGS.'],['下滑装配 ↓','SCROLL TO ASSEMBLE ↓'],
  ['滑动故事卡片','SWIPE THE STORIES'],['贴近你的声音','Sounds that stay'],['身边。','close.'],['更柔软的','A softer way'],['连接方式。','to connect.'],['陪伴每个','Alongside your'],['日常。','everyday.'],['会回应你的','Eyes that'],['眼睛。','answer back.'],['把世界','Take the world'],['听进来。','in.'],['为行动','Made to'],['而生。','move.'],
  ['00 / 印象','00 / FIRST LOOK'],['01 / 行走','01 / WALK'],['02 / 身体','02 / BODY'],['03 / 聆听','03 / LISTEN'],['04 / 表情','04 / EXPRESSION'],['05 / 甲壳','05 / SHELLS'],
  ['把好奇，','Curiosity,'],['装进一只小小的身体。','in a small body.'],['一个会移动、会收听，也会与你回应的伙伴。','A companion that moves, listens and responds.'],
  ['六只足，','Six legs.'],['交替撑起每一步。','One step at a time.'],['每只足由水平转向、抬落和足端弯折三个关节组成。','Each leg turns, lifts and bends through three joints.'],['三自由度 × 六足','3 DOF × 6 LEGS'],['交替三足步态 · 仓库拟合步态参数','Alternating tripod gait · fitted parameters'],
  ['结构归位，','Body in place.'],['为探索留出空间。','Room to explore.'],['主体连接行走机构、收音部件与上壳。','The body connects the legs, listening parts and shells.'],['主体承载','CORE FRAME'],['内部结构和外壳一起运动','The frame and shell move together.'],
  ['向世界伸出','Reach out'],['自己的耳朵。','to the world.'],['两侧可展开的部件承载触碰与收音想象。','The side parts open for touch and listening.'],['侧部展开','SIDE PARTS'],['声音进入后，由浏览器实时切段与分析','Sound is segmented and analyzed in the browser.'],
  ['听见以后，','After listening,'],['给你一个回应。','a response.'],['脸部会随触碰、声音和姿态改变表情。','Its eyes respond to touch, sound and posture.'],['情绪反馈','EXPRESSION'],['响应当前交互与学习结果','Driven by interaction and learning.'],
  ['两层上壳，','Two upper shells.'],['各自沿轴旋转。','Each turns on its own axis.'],['它们不是绕身体公转。装配完成，TADA 开始行动。','Both rotate independently. Once assembled, TADA starts moving.'],['独立转轴 × 2','2 INDEPENDENT AXES'],['定时与转速可在仿真页调节','Set timing and speed in Simulation.'],
  ['查看爆炸结构 ↗','EXPLODE VIEW ↗'],['合上部件 ↙','ASSEMBLE ↙'],['一起，去听世界。','Listen to the world together.'],['走近它的陪伴形态 ↗','MEET THE COMPANION ↗'],['看它走进桌面 ↗','EXPLORE THE SIMULATION ↗'],
  ['01 / 陪伴','01 / COMPANION'],['靠近一点，','Come closer.'],['它会回应你。','It responds.'],['摸摸身体，轻拍甲壳，再把一个声音交给它。','Touch its body, tap the shell, and share a sound.'],['轻抚','Pet'],['轻拍','Tap'],['在机器人身上移动手并按下','Move your hand over TADA and press.'],
  ['它怎样用你的声音回应','HOW IT SPEAKS WITH YOUR SOUNDS'],['选择声音片段 → 组合成一段回应','Choose clips → build a response'],['这是声音拼接演示；不会把录音转换成有语义的人声。','This demo combines clips; it does not synthesize semantic speech.'],['尚无可用声音。先录下并标注一段声音。','No sounds yet. Record and label one first.'],
  ['02 / 具身探索','02 / EXPLORATION'],['在桌面上，','On the table,'],['真实地试一次。','put it to the test.'],['MuJoCo 实时物理场景 · 触摸、扰动、行走与聆听。','Live MuJoCo physics · touch, push, walk and listen.'],['自动寻找','Auto explore'],['手动控制','Manual control'],['前后 / 转向','Forward / turn'],['让 TADA 动起来','Move with TADA'],['实时聆听','Live listening'],['麦克风 → 波形 → 临时切段 → 可保存的候选声音','Mic → waveform → segments → saved candidates'],
  ['03 / 我的','03 / MY SOUNDS'],['留住听见过的。','Keep what you heard.'],['每次录音按来源整理，片段可单独试听、改名和标注。','Recordings are grouped by source; clips can be played, named and labeled.'],['声音存档','Sound archive'],['＋ 添加合成示例','＋ Add sample sounds'],
  ['04 / 学习','04 / LEARNING'],['教它认识','Teach it'],['你的声音。','your sounds.'],['为不同来源的片段标注类别与偏好，再在本机训练两个小型模型。','Label sounds and preferences, then train two local models.'],['从「我的」试听并标注','Play and label sounds in My Sounds'],['同一次录音的多个裁剪片段，训练时只算一个来源。','Clips from one recording count as one source.'],['样本足够后开始学习','Train when you have enough examples'],['每个模型至少两个标签，每个标签至少三个独立来源。','Each model needs two labels and three sources per label.'],['用在陪伴与仿真中','Use in Companion and Simulation'],['新声音会显示预测；低置信度仍请你判断。','New sounds show predictions; review low confidence results.'],
  ['播放声音存档','Play sound archive'],['BACK','返回'],['PLAY THE FILM','播放影片'],['本机交互演示','Local demo'],['还没有声音在播放','Nothing playing'],['音量','Volume'],['停止 ■','Stop ■'],['模型载入中…','Loading model…'],['整体印象','First look'],['足部装配','Leg assembly'],['主体装配','Body assembly'],['收音部件','Listening parts'],['表情反馈','Expression'],['装配完成','Assembled'],['三维模型载入失败','3D model failed to load'],
  ['转向','Turn'],['抬落','Lift'],['足端','Foot'],['下承托','Lower support'],['主体','Body'],['左侧','Left'],['右侧','Right'],['面板','Face'],['内衬','Liner'],['前壳','Front shell'],['中壳','Middle shell'],['后壳','Rear shell']
];
const dictionary = new Map();
for (const [zh,en] of pairs) { dictionary.set(zh,{zh,en}); dictionary.set(en,{zh,en}); }
const original = new WeakMap();
const roots = [document.querySelector('header'),...document.querySelectorAll('.page'),document.querySelector('footer'),document.querySelector('.player-bar')].filter(Boolean);
let language = localStorage.getItem('craboo-language') === 'zh' ? 'zh' : 'en';
window.crabooLanguage = () => language;
window.crabooTranslate = (value) => dictionary.get(value)?.[language] ?? value;
function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = language === 'en' ? 'TADA · Listen, Move, Remember' : 'TADA · 一起，慢慢长大';
  document.querySelector('#lang-toggle').textContent = language === 'en' ? '中文' : 'EN';
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('script,style,textarea,#live-events,#tab-sounds,#tab-memories,#tab-training')) continue;
      const text = node.textContent.trim();
      if (!text) continue;
      const source = original.get(node) ?? text;
      const pair = dictionary.get(source) ?? dictionary.get(text);
      if (!pair) continue;
      original.set(node, source);
      const space = node.textContent.match(/^\s*/)[0];
      const trail = node.textContent.match(/\s*$/)[0];
      node.textContent = space + pair[language] + trail;
    }
  }
}
document.querySelector('#lang-toggle').addEventListener('click', () => {
  language = language === 'en' ? 'zh' : 'en';
  localStorage.setItem('craboo-language', language);
  applyLanguage();
  window.dispatchEvent(new Event('craboo:language'));
});
window.addEventListener('hashchange', applyLanguage);
window.addEventListener('craboo:language', applyLanguage);
applyLanguage();
