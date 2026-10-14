// Keep the existing interaction modules mounted while presenting each direction as its own view.
const main = document.querySelector('main');
const take = (selector) => document.querySelector(selector);
const move = (target, selectors) => selectors.forEach((selector) => {
  const element = take(selector);
  if (element) target.append(element);
});

const home = document.createElement('section');
home.id = 'page-home';
home.className = 'page home-page';
home.innerHTML = `
  <div class="hero-intro">
    <div class="hero-veil" aria-hidden="true"></div>
    <canvas class="hero-flow" id="hero-flow" aria-hidden="true"></canvas>
    <div class="hero-type hero-type-back" aria-hidden="true"><span>T</span><span>A</span><span>D</span><span>A</span></div>
    <div class="hero-copy"><span class="hero-kicker">01 / A COMPANION IN MOTION</span><h1>Listen.<br>Move.<br><em>Remember.</em></h1><p>A small companion that learns the sounds you love.</p><a class="hero-explore" href="#home" data-scroll-assembly>EXPLORE THE DESIGN <b>↘</b></a></div>
    <div class="hero-card-rail" aria-label="Product stories">
      <article class="hero-card hero-card-scene"><img src="assets/tada-sleep.webp" alt="At rest, surrounded by familiar sounds"><div><span>01 / REST</span><strong>Sounds that stay<br>close.</strong></div></article>
      <article class="hero-card hero-card-detail"><img src="assets/tada-hand.webp" alt="Detachable soft hand detail"><div><span>02 / FORM</span><strong>A softer way<br>to connect.</strong></div></article>
      <article class="hero-card hero-card-scene"><img src="assets/tada-focus.webp" alt="Quiet focus at the desk"><div><span>03 / FOCUS</span><strong>Alongside your<br>everyday.</strong></div></article>
      <article class="hero-card hero-card-detail"><img src="assets/tada-face.webp" alt="Face and illuminated eyes detail"><div><span>04 / EXPRESSION</span><strong>Eyes that<br>answer back.</strong></div></article>
      <article class="hero-card hero-card-scene"><img src="assets/tada-field.webp" alt="Collecting sounds outdoors"><div><span>05 / EXPLORE</span><strong>Take the world<br>in.</strong></div></article>
      <article class="hero-card hero-card-detail"><img src="assets/tada-feet.webp" alt="Six soft feet detail"><div><span>06 / MOVEMENT</span><strong>Made to<br>move.</strong></div></article>
    </div>
    <div class="hero-product"><div id="hero-canvas" role="button" tabindex="0" aria-label="Drag to rotate TADA; click to watch the film"></div></div>
    <div class="hero-vignette" aria-hidden="true"></div>
    <video id="hero-film-video" data-src="assets/tada-film.mp4" poster="assets/tada-film-poster.jpg" preload="none" playsinline aria-label="TADA product film"></video>
    <button id="hero-film-exit" type="button" aria-label="Close film">← <span>BACK</span></button>
    <button id="hero-film-play" type="button" aria-label="Play film"><span aria-hidden="true">▶</span><small>PLAY THE FILM</small></button>
    <div class="hero-type hero-type-front" aria-hidden="true"><span>T</span><span>A</span><span>D</span><span>A</span></div>
    <div class="hero-foot"><span>DRAG TO ROTATE <b>↔</b></span><div class="hero-rail-controls"><button type="button" data-card-step="-1" aria-label="Previous story">←</button><span>SWIPE THE STORIES</span><button type="button" data-card-step="1" aria-label="Next story">→</button></div><span>SCROLL TO ASSEMBLE ↓</span></div>
  </div>
  <div class="assembly"><div class="assembly-visual" id="assembly-visual"><div id="assembly-canvas" aria-label="TADA 产品逐步装配的三维展示"></div><svg id="assembly-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path></path><circle r="5"></circle></svg><div class="assembly-readout"><span id="assembly-number">00 / 05</span><span id="assembly-progress"><i></i></span><span id="assembly-status">模型载入中…</span></div></div>
    <div class="assembly-chapters">
      <article class="assembly-chapter" data-assembly="0"><span class="step-index">00 / 印象</span><h2>把好奇，<br>装进一只小小的身体。</h2><p>一个会移动、会收听，也会与你回应的伙伴。</p></article>
      <article class="assembly-chapter" data-assembly="1"><span class="step-index">01 / 行走</span><h2>六只足，<br>交替撑起每一步。</h2><p>每只足由水平转向、抬落和足端弯折三个关节组成。</p><div class="assembly-detail"><span class="detail-line"></span><strong>三自由度 × 六足</strong><small>交替三足步态 · 仓库拟合步态参数</small></div><div class="joint-widget" aria-label="单足三关节运动示意"><span class="joint-axis">水平转向</span><div class="joint-leg"><i></i><i></i><i></i></div><span class="joint-axis">抬落 / 弯折</span></div></article>
      <article class="assembly-chapter" data-assembly="2"><span class="step-index">02 / 身体</span><h2>结构归位，<br>为探索留出空间。</h2><p>主体连接行走机构、收音部件与上壳。</p><div class="assembly-detail"><span class="detail-line"></span><strong>主体承载</strong><small>内部结构和外壳一起运动</small></div></article>
      <article class="assembly-chapter" data-assembly="3"><span class="step-index">03 / 聆听</span><h2>向世界伸出<br>自己的耳朵。</h2><p>两侧可展开的部件承载触碰与收音想象。</p><div class="assembly-detail"><span class="detail-line"></span><strong>侧部展开</strong><small>声音进入后，由浏览器实时切段与分析</small></div></article>
      <article class="assembly-chapter" data-assembly="4"><span class="step-index">04 / 表情</span><h2>听见以后，<br>给你一个回应。</h2><p>脸部会随触碰、声音和姿态改变表情。</p><div class="assembly-detail"><span class="detail-line"></span><strong>情绪反馈</strong><small>响应当前交互与学习结果</small></div></article>
      <article class="assembly-chapter" data-assembly="5"><span class="step-index">05 / 甲壳</span><h2>两层上壳，<br>各自沿轴旋转。</h2><p>它们不是绕身体公转。装配完成，TADA 开始行动。</p><div class="assembly-detail"><span class="detail-line"></span><strong>独立转轴 × 2</strong><small>定时与转速可在仿真页调节</small></div></article>
    </div></div><div class="home-finale"><span>TADA / COMPLETE</span><h2>一起，去听世界。</h2><div><a href="#companion">走近它的陪伴形态 ↗</a><a href="#simulation">看它走进桌面 ↗</a></div></div>`;

const companion = document.createElement('section');
companion.id = 'page-companion';
companion.className = 'page interior-page companion-page';
companion.innerHTML = '<div class="page-heading"><span>01 / 陪伴</span><h1>靠近一点，<br>它会回应你。</h1><p>摸摸身体，轻拍甲壳，再把一个声音交给它。</p></div><div class="hand-tools" role="group" aria-label="手势方式"><button id="hand-pet" class="selected" type="button">轻抚</button><button id="hand-tap" type="button">轻拍</button><span>在机器人身上移动手并按下</span></div>';
move(companion, ['#stage', '.conversation', '.modes', '#action-panel']);
const speechFlow = document.createElement('div');
speechFlow.className = 'speech-flow';
speechFlow.innerHTML = '<div><span>它怎样用你的声音回应</span><strong>选择声音片段 → 组合成一段回应</strong><small>这是声音拼接演示；不会把录音转换成有语义的人声。</small></div><div id="utterance-preview" aria-live="polite">尚无可用声音。先录下并标注一段声音。</div>';
companion.querySelector('.conversation').append(speechFlow);
const hand = document.createElement('img');
hand.id = 'interaction-hand';
hand.src = 'assets/interaction-hand.svg';
hand.alt = '';
hand.setAttribute('aria-hidden', 'true');
companion.querySelector('#stage').append(hand);

const simulation = document.createElement('section');
simulation.id = 'page-simulation';
simulation.className = 'page interior-page simulation-page';
simulation.innerHTML = '<div class="page-heading"><span>02 / 具身探索</span><h1>在桌面上，<br>真实地试一次。</h1><p>MuJoCo 实时物理场景 · 触摸、扰动、行走与聆听。</p></div>';
move(simulation, ['.field-lab']);
const field = simulation.querySelector('.field-lab');
field.querySelector('.form-note')?.remove();
field.querySelector('.model-view')?.remove();
const toolbar = field.querySelector('.sim-toolbar');
toolbar.querySelectorAll('label').forEach((item) => item.remove());
const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons = {
  play: icon('<path d="m8 5 11 7-11 7V5Z"/>'),
  reset: icon('<path d="M4 11a8 8 0 1 1 2.4 6"/><path d="M4 4v7h7"/>'),
  robot: icon('<rect x="5" y="7" width="14" height="12" rx="4"/><path d="M12 4v3M9 13h.01M15 13h.01M8 19v2m8-2v2"/>'),
  desk: icon('<path d="M3 10h18M5 10v10m14-10v10M4 7h16v3H4z"/>'),
  room: icon('<path d="M3 20V5l9-3 9 3v15M3 20h18M8 8v5m8-5v5"/>'),
  auto: icon('<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="4"/>'),
  manual: icon('<path d="M12 3v18M3 12h18m-9-9-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3"/>')
};
toolbar.innerHTML = `<div class="sim-toolbar-main"><div class="sim-transport"><button id="sim-toggle" class="secondary" type="button">${icons.play}<span>启动仿真</span></button><button id="sim-reset" class="secondary" type="button">${icons.reset}<span>重置</span></button></div><div class="drive-modes"><button id="sim-auto" class="secondary" type="button">${icons.auto}<span>自动寻找</span></button><button id="sim-manual" class="secondary selected" type="button">${icons.manual}<span>手动控制</span></button></div></div><div class="sim-toolbar-views"><span class="sim-toolbar-label">视角</span><div><button data-sim-view="robot" class="secondary" type="button">${icons.robot}<span>机器人</span></button><button data-sim-view="desk" class="secondary" type="button">${icons.desk}<span>桌面</span></button><button data-sim-view="room" class="secondary" type="button">${icons.room}<span>房间</span></button></div><div id="key-guide"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动 / 转向</span></div></div>`;
field.querySelector('.field-heading h2').textContent = '让 TADA 动起来';
field.querySelector('.field-screen > p:last-child').textContent = '拖动画面旋转视角；点击它可触摸；Ctrl + 拖动施加外力。上面两层壳可以分别拖动旋转。自动模式按仿真物体坐标选目标，不代表真实视觉感知。';
field.querySelector('.field-controls').insertAdjacentHTML('afterbegin', '<div class="live-head"><span>实时聆听</span><small>麦克风 → 波形 → 临时切段 → 可保存的候选声音</small></div>');
const leg = take('.leg-study');
leg?.remove();

const mine = document.createElement('section');
mine.id = 'page-mine';
mine.className = 'page interior-page data-page';
mine.innerHTML = '<div class="page-heading"><span>03 / 我的</span><h1>留住听见过的。</h1><p>每次录音按来源整理，片段可单独试听、改名和标注。</p></div><div class="data-grid"><div class="data-main"></div><aside class="data-side"></aside></div>';
move(mine.querySelector('.data-main'), ['#tab-sounds']);
move(mine.querySelector('.data-side'), ['#tab-memories']);
mine.querySelector('#tab-memories').hidden = false;
mine.querySelector('#tab-sounds .section-title p').textContent = '声音存档';
mine.querySelector('#tab-sounds #sample').textContent = '＋ 添加合成示例';

const learning = document.createElement('section');
learning.id = 'page-learning';
learning.className = 'page interior-page data-page';
learning.innerHTML = '<div class="page-heading"><span>04 / 学习</span><h1>教它认识<br>你的声音。</h1><p>为不同来源的片段标注类别与偏好，再在本机训练两个小型模型。</p></div><div class="learning-path"><div><b>01</b><strong>试听并标注</strong></div><div><b>02</b><strong>训练模型</strong></div><div><b>03</b><strong>陪伴与仿真</strong></div></div>';
move(learning, ['#tab-training']);
learning.querySelector('#tab-training').hidden = false;
learning.querySelector('#tab-training > .muted:first-child').remove();
learning.querySelector('#tab-training > .muted:last-child')?.remove();
learning.querySelector('#models').insertAdjacentHTML('afterend', '<section id="feature-comparison" class="feature-comparison" aria-label="声音特征对照"></section>');

const library = take('#library');
if (library) library.hidden = true;
take('.intro')?.remove();
if (take('.eyebrow')) take('.eyebrow').hidden = true;
main.prepend(home, companion, simulation, mine, learning);
home.querySelectorAll('[data-scroll-assembly]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); home.querySelector('.assembly').scrollIntoView({ behavior: 'smooth' }); }));
home.querySelectorAll('.assembly-chapter').forEach((chapter, index) => {
  if (!index) return;
    chapter.querySelector('.assembly-detail')?.insertAdjacentHTML('beforeend', '<button class="explode-toggle" type="button" aria-pressed="false">查看爆炸结构 ↗</button>');
});
take('.player-bar').classList.add('global-player');
take('#open-library').textContent = '我的 ↗';
const header = take('header');
header.querySelector('.header-note').remove();
header.insertBefore(Object.assign(document.createElement('nav'), {className: 'site-nav', innerHTML: '<a href="#home" data-page-link="home">产品</a><a href="#companion" data-page-link="companion">陪伴</a><a href="#simulation" data-page-link="simulation">仿真</a><a href="#mine" data-page-link="mine">我的</a><a href="#learning" data-page-link="learning">学习</a>'}), take('#open-library'));
header.insertBefore(Object.assign(document.createElement('button'), {id: 'lang-toggle', type: 'button', textContent: '中文', title: 'Switch language'}), take('#open-library'));
take('.brand').href = '#home';
take('footer').innerHTML = '<div class="footer-brand"><img src="assets/tada-mark.svg" alt="" /><strong>TADA</strong><span>© 2026</span></div><nav><a href="#home" data-page-link="home">产品</a><a href="#companion" data-page-link="companion">陪伴</a><a href="#simulation" data-page-link="simulation">仿真</a><a href="#mine" data-page-link="mine">我的</a><a href="#learning" data-page-link="learning">学习</a></nav><div class="footer-links"><a href="https://github.com/Shoreee/Craboo" target="_blank" rel="noopener noreferrer" aria-label="TADA GitHub repository">GitHub ↗</a><img src="assets/tongji-dni-logo.png" alt="同济大学设计创意学院" /></div>';
document.querySelector('.capture-flow')?.remove();
take('#capture-summary').textContent = '录音结束后可试听自动裁出的候选片段，并决定哪些值得保存。';
take('#save-selected').textContent = '保存勾选的片段';
take('#save-clip').textContent = '保存，并教给它';

function route() {
  const name = location.hash.replace('#', '') || 'home';
  const next = ['home','companion','simulation','mine','learning'].includes(name) ? name : 'home';
  document.querySelectorAll('.page').forEach((page) => { page.hidden = page.id !== `page-${next}`; });
  document.querySelectorAll('[data-page-link]').forEach((link) => link.classList.toggle('active', link.dataset.pageLink === next));
  document.body.dataset.page = next;
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event('craboo:page'));
  if (next === 'simulation' && !window.tadaSimulationLoad) {
    take('#sim-status').textContent = '正在载入仿真引擎…';
    window.tadaSimulationLoad = import(new URL('src/simulation.js', document.baseURI).href).catch((error) => {
      take('#sim-status').textContent = `仿真载入失败：${error.message}`;
      window.tadaSimulationLoad = null;
    });
  }
}
window.addEventListener('hashchange', route);
route();

let gesture = 'pet';
const stage = take('#stage');
for (const name of ['pet', 'tap']) take(`#hand-${name}`).addEventListener('click', () => {
  gesture = name;
  take('#hand-pet').classList.toggle('selected', name === 'pet');
  take('#hand-tap').classList.toggle('selected', name === 'tap');
});
stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect();
  hand.style.left = `${event.clientX - rect.left}px`;
  hand.style.top = `${event.clientY - rect.top}px`;
});
stage.addEventListener('pointerenter', () => hand.classList.add('visible'));
stage.addEventListener('pointerleave', () => hand.classList.remove('visible'));
stage.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#robot')) return;
  hand.classList.remove('doing');
  void hand.offsetWidth;
  hand.classList.add('doing');
});
stage.addEventListener('click', (event) => {
  if (gesture !== 'tap' || event.target.id !== 'pet-hit') return;
  event.stopPropagation();
  window.dispatchEvent(new Event('craboo:hand-tap'));
}, true);


