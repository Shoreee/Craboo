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
    <div class="hero-copy"><span class="hero-kicker">CRABOO / 具身声音伙伴</span><h1>把世界的声音，<br><em>慢慢听成陪伴。</em></h1><p>会移动，也会回应。认识它，从一件件部件开始。</p><a class="hero-explore" href="#home" data-scroll-assembly>向下探索结构 <b>↘</b></a></div>
    <div class="hero-product"><span class="hero-product-index">01 / 产品形态</span><div id="hero-canvas" aria-label="Craboo 三维产品概念画面"></div><span class="hero-product-caption">白色外壳 · 双层旋转 · 六足行走</span></div>
    <div class="hero-grid"><a class="hero-card hero-card-shell" href="#home" data-scroll-assembly><img src="assets/craboo-shell.png" alt="Craboo 双层甲壳细节"><span><b>01 / 结构</b><strong>从零开始装配 ↗</strong></span></a><a class="hero-card hero-card-plush" href="#companion"><img src="assets/craboo-plush.png" alt="Craboo 毛绒陪伴形态"><span><b>02 / 陪伴</b><strong>靠近一点 ↗</strong></span></a><a class="hero-card hero-card-sound" href="#simulation"><span class="hero-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span><b>03 / 聆听</b><strong>让声音流动 ↗</strong></span></a></div>
  </div>
  <div class="assembly"><div class="assembly-visual" id="assembly-visual"><div id="assembly-canvas" aria-label="Craboo 产品逐步装配的三维展示"></div><svg id="assembly-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path></path><circle r="5"></circle></svg><div class="assembly-readout"><span id="assembly-number">00 / 05</span><span id="assembly-progress"><i></i></span><span id="assembly-status">模型载入中…</span></div></div>
    <div class="assembly-chapters">
      <article class="assembly-chapter" data-assembly="0"><span class="step-index">00 / 印象</span><h2>把好奇，<br>装进一只小小的身体。</h2><p>一个会移动、会收听，也会与你回应的伙伴。</p></article>
      <article class="assembly-chapter" data-assembly="1"><span class="step-index">01 / 行走</span><h2>六只足，<br>交替撑起每一步。</h2><p>每只足由水平转向、抬落和足端弯折三个关节组成。</p><div class="assembly-detail"><span class="detail-line"></span><strong>三自由度 × 六足</strong><small>交替三足步态 · 仓库拟合步态参数</small></div><div class="joint-widget" aria-label="单足三关节运动示意"><span class="joint-axis">水平转向</span><div class="joint-leg"><i></i><i></i><i></i></div><span class="joint-axis">抬落 / 弯折</span></div></article>
      <article class="assembly-chapter" data-assembly="2"><span class="step-index">02 / 身体</span><h2>结构归位，<br>为探索留出空间。</h2><p>主体连接行走机构、收音部件与上壳。</p><div class="assembly-detail"><span class="detail-line"></span><strong>主体承载</strong><small>内部结构和外壳一起运动</small></div></article>
      <article class="assembly-chapter" data-assembly="3"><span class="step-index">03 / 聆听</span><h2>向世界伸出<br>自己的耳朵。</h2><p>两侧可展开的部件承载触碰与收音想象。</p><div class="assembly-detail"><span class="detail-line"></span><strong>侧部展开</strong><small>声音进入后，由浏览器实时切段与分析</small></div></article>
      <article class="assembly-chapter" data-assembly="4"><span class="step-index">04 / 表情</span><h2>听见以后，<br>给你一个回应。</h2><p>脸部会随触碰、声音和姿态改变表情。</p><div class="assembly-detail"><span class="detail-line"></span><strong>情绪反馈</strong><small>响应当前交互与学习结果</small></div></article>
      <article class="assembly-chapter" data-assembly="5"><span class="step-index">05 / 甲壳</span><h2>两层上壳，<br>各自沿轴旋转。</h2><p>它们不是绕身体公转。装配完成，Craboo 开始行动。</p><div class="assembly-detail"><span class="detail-line"></span><strong>独立转轴 × 2</strong><small>定时与转速可在仿真页调节</small></div></article>
    </div></div><div class="home-finale"><span>CRABOO / COMPLETE</span><h2>一起，去听世界。</h2><div><a href="#companion">走近它的陪伴形态 ↗</a><a href="#simulation">看它走进桌面 ↗</a></div></div>`;

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
toolbar.insertAdjacentHTML('beforeend', '<div class="drive-modes"><button id="sim-auto" class="secondary" type="button">自动寻找</button><button id="sim-manual" class="secondary selected" type="button">手动控制</button></div><div id="key-guide"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>前后 / 转向</span></div>');
field.querySelector('.field-heading h2').textContent = '让 Craboo 动起来';
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
learning.innerHTML = '<div class="page-heading"><span>04 / 学习</span><h1>教它认识<br>你的声音。</h1><p>为不同来源的片段标注类别与偏好，再在本机训练两个小型模型。</p></div><div class="learning-path"><div><b>01</b><strong>从「我的」试听并标注</strong><small>同一次录音的多个裁剪片段，训练时只算一个来源。</small></div><div><b>02</b><strong>样本足够后开始学习</strong><small>每个模型至少两个标签，每个标签至少三个独立来源。</small></div><div><b>03</b><strong>用在陪伴与仿真中</strong><small>新声音会显示预测；低置信度仍请你判断。</small></div></div>';
move(learning, ['#tab-training']);
learning.querySelector('#tab-training').hidden = false;
learning.querySelector('#tab-training > .muted:first-child').remove();

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
take('.brand').href = '#home';
take('footer').innerHTML = '<span>Craboo © 2026</span><nav><a href="#home">产品</a><a href="#companion">陪伴</a><a href="#simulation">仿真</a><a href="#mine">我的</a><a href="#learning">学习</a></nav><button id="open-growth" class="text-button">本机交互演示 <span id="growth-count">0</span></button>';
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


