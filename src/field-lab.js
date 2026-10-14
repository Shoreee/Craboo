const $ = (id) => document.getElementById(id);

// This monitor never stores samples. The browser's capture processing is optional.
class LiveMonitor {
  async start(processing) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing,
    } });
    try {
      this.context = new AudioContext();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.active = true;
      this.tick();
    } catch (error) { this.stop(); throw error; }
  }
  tick() {
    if (!this.active) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const rms = Math.sqrt(this.buffer.reduce((sum, x) => sum + x * x, 0) / this.buffer.length);
    const level = Math.min(100, Math.round(rms * 350));
    $('live-level').textContent = `${level}%`;
    $('live-bar').style.width = `${level}%`;
    const state = level < 7 ? '安静地陪着你' : level < 30 ? '听见身边的小声音' : '周围有些热闹';
    $('live-state').textContent = state;
    $('live-response').textContent = level < 7 ? '我在这里，静静等你。' : level < 30 ? '我听到了，再靠近一点好吗？' : '声音有点大，我们慢一点。';
    if (this.lastLevel !== level) window.dispatchEvent(new CustomEvent('craboo:ambient', { detail: { level } }));
    this.lastLevel = level;
    this.frame = requestAnimationFrame(() => this.tick());
  }
  stop() {
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.context?.close();
    this.stream = this.source = this.context = null;
  }
}

const monitor = new LiveMonitor();
$('live-toggle').addEventListener('click', async () => {
  if (monitor.active) {
    monitor.stop();
    $('live-toggle').textContent = '开启实时聆听';
    $('live-state').textContent = '尚未开始聆听';
    $('live-response').textContent = '开启后，环境音量会影响它的陪伴状态。';
    $('live-level').textContent = '0%';
    $('live-bar').style.width = '0%';
    return;
  }
  try {
    await monitor.start($('noise-filter').checked);
    $('live-toggle').textContent = '停止实时聆听';
  } catch (error) {
    $('live-response').textContent = error.name === 'NotAllowedError' ? '麦克风权限未开启。' : '无法开启麦克风；请使用 localhost 或 HTTPS。';
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
