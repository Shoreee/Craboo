import { StreamSegmenter, rms } from './segments.js';

export class LiveAudioCapture {
  constructor(onFrame, onSegment) {
    this.onFrame = onFrame;
    this.onSegment = onSegment;
    this.active = false;
  }

  async start(processing) {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
      throw Error('实时切段需要支持 AudioWorklet 的 HTTPS 或 localhost 浏览器。');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing,
    } });
    try {
      this.context = new AudioContext();
      await this.context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
      this.detector = new StreamSegmenter(this.context.sampleRate);
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.context, 'craboo-pcm');
      this.silent = this.context.createGain();
      this.silent.gain.value = 0;
      this.source.connect(this.worklet).connect(this.silent).connect(this.context.destination);
      this.active = true;
      this.worklet.port.onmessage = ({ data }) => {
        if (!this.active) return;
        const segments = this.detector.push(data.pcm);
        this.onFrame({ ...this.detector.last, level: rms(data.pcm) });
        segments.forEach(this.onSegment);
      };
      if (this.context.state === 'suspended') await this.context.resume();
    } catch (error) { this.stop(); throw error; }
  }

  stop() {
    if (this.active) this.detector.flush().forEach(this.onSegment);
    this.active = false;
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.silent?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close();
    this.stream = this.context = this.source = this.worklet = this.silent = null;
  }
}
