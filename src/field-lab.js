import { LiveAudioCapture } from './live-audio.js';

const $ = (id) => document.getElementById(id);
const bars = Array.from({ length: 42 }, () => {
  const bar = document.createElement('span');
  $('live-stream').append(bar);
  return bar;
});
let lastFrame = 0;
const monitor = new LiveAudioCapture(({ level: raw, noise, threshold, active }) => {
  const now = performance.now();
  if (now - lastFrame < 90) return;
  lastFrame = now;
  const level = Math.min(100, Math.round(raw * 350));
  $('live-level').textContent = `${level}%`;
  $('live-bar').style.width = `${level}%`;
  bars.push(bars.shift());
  $('live-stream').append(bars.at(-1));
  bars.at(-1).style.height = `${Math.max(8, level)}%`;
  bars.at(-1).classList.toggle('active', active);
  const state = active ? '正在划分声音片段' : '正在等待高于环境底噪的声音';
  $('live-state').textContent = state;
  $('live-response').textContent = `输入 ${level}% · 底噪 ${Math.round(noise * 350)}% · 切段阈值 ${Math.round(threshold * 350)}%`;
  window.dispatchEvent(new CustomEvent('craboo:ambient', { detail: { level } }));
}, (segment) => window.dispatchEvent(new CustomEvent('craboo:live-segment', { detail: segment })));
$('live-toggle').addEventListener('click', async () => {
  if (monitor.active) {
    monitor.stop();
    $('live-toggle').textContent = '开启实时聆听';
    $('live-state').textContent = '尚未开始聆听';
    $('live-response').textContent = '开启后会实时划分声音片段。';
    $('live-level').textContent = '0%';
    $('live-bar').style.width = '0%';
    bars.forEach((bar) => { bar.style.height = '8%'; bar.classList.remove('active'); });
    return;
  }
  try {
    await monitor.start($('noise-filter').checked);
    $('live-toggle').textContent = '停止实时聆听';
  } catch (error) {
    $('live-response').textContent = error.name === 'NotAllowedError' ? '麦克风权限未开启。' : error.message || '无法开启麦克风；请使用 localhost 或 HTTPS。';
  }
});
window.addEventListener('pagehide', () => monitor.stop());

const shellLabels = ['上层 · 探索', '第二层 · 陪伴'];
const shellHost = $('shell-rotors');
shellLabels.forEach((label, index) => {
  const row = document.createElement('div');
  row.className = 'rotor-row';
  row.innerHTML = `<div class="rotor rotor-${index + 1}" aria-hidden="true"><span></span></div><label>${label}<select aria-label="${label}转速"><option value="0">静止</option><option value="1">缓慢</option><option value="2">快速</option></select></label><label>定时停止 <select aria-label="${label}定时停止"><option value="0">不限时</option><option value="30">30 秒</option><option value="60">1 分钟</option></select></label><small class="rotor-status">静止</small>`;
  const [speed, duration] = row.querySelectorAll('select');
  let timer;
  function update() {
    clearTimeout(timer);
    const value = Number(speed.value);
    row.querySelector('.rotor').style.animationDuration = value ? `${value === 1 ? 8 : 3}s` : '';
    row.querySelector('.rotor').classList.toggle('turning', Boolean(value));
    row.querySelector('.rotor-status').textContent = value ? `旋转中${duration.value === '0' ? '' : ` · ${duration.value} 秒后停止`}` : '静止';
    window.dispatchEvent(new CustomEvent('craboo:shell', { detail: { index, speed: value } }));
    if (value && Number(duration.value)) timer = setTimeout(() => { speed.value = '0'; update(); }, Number(duration.value) * 1000);
  }
  speed.addEventListener('change', update);
  duration.addEventListener('change', update);
  shellHost.append(row);
});
