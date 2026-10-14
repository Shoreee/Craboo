const FRAME_SECONDS = 0.02;
const MIN_SECONDS = 0.24;
const MAX_SECONDS = 12;

export function rms(samples) {
  let energy = 0;
  for (const value of samples) energy += value * value;
  return Math.sqrt(energy / Math.max(1, samples.length));
}

export class StreamSegmenter {
  constructor(rate) {
    this.rate = rate;
    this.frameSize = Math.max(1, Math.round(rate * FRAME_SECONDS));
    this.preFrames = Math.ceil(0.14 / FRAME_SECONDS);
    this.hangFrames = Math.ceil(0.26 / FRAME_SECONDS);
    this.maxFrames = Math.ceil(MAX_SECONDS / FRAME_SECONDS);
    this.noise = 0.003;
    this.offset = 0;
    this.pending = new Float32Array(0);
    this.preroll = [];
    this.frames = [];
    this.quiet = 0;
    this.loud = 0;
    this.startFrame = 0;
  }

  push(chunk) {
    const joined = new Float32Array(this.pending.length + chunk.length);
    joined.set(this.pending);
    joined.set(chunk, this.pending.length);
    const results = [];
    let index = 0;
    while (index + this.frameSize <= joined.length) {
      results.push(...this.frame(joined.slice(index, index + this.frameSize)));
      index += this.frameSize;
    }
    this.pending = joined.slice(index);
    return results;
  }

  frame(samples) {
    const level = rms(samples);
    const threshold = Math.max(0.008, this.noise * 3.2);
    const loud = level > threshold;
    const results = [];
    if (!this.frames.length) {
      if (!loud) this.noise = 0.98 * this.noise + 0.02 * level;
      this.preroll.push(samples);
      if (this.preroll.length > this.preFrames + 3) this.preroll.shift();
      this.loud = loud ? this.loud + 1 : 0;
      if (this.loud >= 3) {
        this.frames = this.preroll;
        this.startFrame = Math.max(0, this.offset - this.frames.length + 1);
        this.preroll = [];
        this.quiet = 0;
      }
    } else {
      this.frames.push(samples);
      this.quiet = loud ? 0 : this.quiet + 1;
      if (this.quiet >= this.hangFrames || this.frames.length >= this.maxFrames)
        results.push(...this.flush());
    }
    this.offset++;
    this.last = { level, noise: this.noise, threshold, active: Boolean(this.frames.length) };
    return results;
  }

  flush() {
    if (!this.frames.length) return [];
    const frames = this.frames;
    this.frames = [];
    this.loud = 0;
    this.quiet = 0;
    const samples = new Float32Array(frames.length * this.frameSize);
    frames.forEach((frame, index) => samples.set(frame, index * this.frameSize));
    const start = this.startFrame * this.frameSize / this.rate;
    this.preroll = [];
    if (samples.length / this.rate < MIN_SECONDS || rms(samples) < 0.006) return [];
    return [{ start, end: start + samples.length / this.rate, samples, rate: this.rate, level: rms(samples) }];
  }
}

export function detectSegments(samples, rate) {
  const detector = new StreamSegmenter(rate);
  const segments = [];
  const chunkSize = Math.max(detector.frameSize, Math.round(rate / 2));
  for (let index = 0; index < samples.length; index += chunkSize)
    segments.push(...detector.push(samples.subarray(index, index + chunkSize)));
  segments.push(...detector.flush());
  return segments.map(({ start, end, level }) => ({ start, end: Math.min(end, samples.length / rate), level }));
}
