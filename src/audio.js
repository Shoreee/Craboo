export function wav(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(b);
  const text = (offset, s) =>
    [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, b.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) =>
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true),
  );
  return new Blob([b], { type: "audio/wav" });
}
export function dataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
export class AudioEngine {
  constructor() {
    this.sources = new Set();
    this.token = 0;
    this.volume = 0.65;
    this.sleep = { gain: 0.65, gap: 0.2, density: 1 };
  }
  async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * this.sleep.gain;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }
  async decode(blob) {
    const ctx = await this.ready();
    const b = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (b.duration > 60) throw Error("请导入不超过 60 秒的片段。");
    const samples = new Float32Array(b.length);
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < samples.length; i++)
        samples[i] += d[i] / b.numberOfChannels;
    }
    return { samples, rate: b.sampleRate, duration: b.duration };
  }
  setVolume(v) {
    this.volume = v;
    this.applyGain();
  }
  setSleep(s) {
    this.sleep = s;
    this.applyGain();
  }
  applyGain() {
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.volume * this.sleep.gain,
        this.context.currentTime,
        0.7,
      );
  }
  stop() {
    this.token++;
    clearTimeout(this.timer);
    for (const node of this.sources) {
      try {
        node.stop();
      } catch {}
    }
    this.sources.clear();
    this.onStop?.();
  }
  async play(clips, loop = false, onClip = () => {}) {
    this.stop();
    if (!clips.length) throw Error("先收藏一些喜欢的声音，并加入重组序列。");
    const token = this.token;
    await this.ready();
    if (token !== this.token) return;
    let index = 0;
    const next = async () => {
      if (token !== this.token) return;
      try {
        const clip = clips[index],
          buffer = await this.context.decodeAudioData(
            await (await fetch(clip.audio)).arrayBuffer(),
          );
        if (token !== this.token) return;
        const node = this.context.createBufferSource(),
          gain = this.context.createGain();
        node.buffer = buffer;
        node.connect(gain);
        gain.connect(this.master);
        const now = this.context.currentTime,
          duration = buffer.duration,
          fade = Math.min(0.4, duration / 3);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + fade);
        gain.gain.setValueAtTime(1, now + duration - fade);
        gain.gain.linearRampToValueAtTime(0, now + duration);
        this.sources.add(node);
        node.onended = () => {
          this.sources.delete(node);
          node.disconnect();
          gain.disconnect();
          if (!this.sources.size && !loop && index >= clips.length)
            this.onStop?.();
        };
        node.start();
        onClip(clip);
        index++;
        if (index < clips.length || loop) {
          index %= clips.length;
          const spacing =
            this.sleep.gap + duration * (1 / this.sleep.density - 1);
          this.timer = setTimeout(
            next,
            Math.max(30, (duration - fade + spacing) * 1000),
          );
        }
      } catch (e) {
        if (token === this.token) {
          this.stop();
          this.onError?.(e);
        }
      }
    };
    await next();
  }
  async touch() {
    await this.ready();
    const o = this.context.createOscillator(),
      g = this.context.createGain(),
      now = this.context.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(360, now);
    o.frequency.exponentialRampToValueAtTime(180, now + 0.25);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    o.connect(g);
    g.connect(this.master);
    this.sources.add(o);
    o.onended = () => {
      this.sources.delete(o);
      o.disconnect();
      g.disconnect();
    };
    o.start();
    o.stop(now + 0.36);
  }
  async record(processing = true) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("录音需要 localhost 或 HTTPS，以及支持麦克风的浏览器。");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: processing,
        noiseSuppression: processing,
        autoGainControl: processing,
      },
    });
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    this.recorder = recorder;
    const chunks = [];
    this.recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = (e) => {
        stream.getTracks().forEach((t) => t.stop());
        reject(e.error);
      };
      recorder.onstop = () => {
        clearTimeout(this.recordTimer);
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType }));
      };
    });
    recorder.start();
    this.recordTimer = setTimeout(() => this.stopRecording(), 59000);
    return this.recording;
  }
  stopRecording() {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }
}
export function synthetic(kind, seed = 1) {
  const rate = 16000,
    samples = new Float32Array(rate * 2.5);
  let prev = 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate,
      n = random();
    prev = 0.94 * prev + 0.06 * n;
    const edge = Math.min(1, t * 8, (2.5 - t) * 8);
    samples[i] =
      edge *
      (kind === "轻敲"
        ? Math.sin(2 * Math.PI * (200 + (seed % 15)) * t) *
          Math.exp(-(t % 0.45) * 48) *
          0.45
        : kind === "摩擦"
          ? n * 0.12 * (0.5 + 0.5 * Math.sin(t * 8))
          : kind === "流水"
            ? prev * 0.9 + Math.sin(t * 1700) * 0.035
            : prev * 0.25 + Math.sin(t * 400) * 0.04);
  }
  return { samples, rate, duration: 2.5 };
}
