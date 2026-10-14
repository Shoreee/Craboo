// Fixed-dimensional acoustic features. 256-point DFT over at most 80 windows.
export function features(samples, sampleRate) {
  if (!samples.length) throw Error("音频为空");
  let energy = 0,
    zc = 0;
  for (let i = 0; i < samples.length; i++) {
    energy += samples[i] ** 2;
    if (i && samples[i] * samples[i - 1] < 0) zc++;
  }
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.0001) throw Error("这段声音几乎是静音，请靠近声源再试一次。");
  const n = 256,
    frames = Math.min(80, Math.max(1, Math.floor(samples.length / n)));
  let centroid = 0,
    total = 0,
    bands = [0, 0, 0],
    levels = [];
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(
      (f * Math.max(0, samples.length - n)) / Math.max(1, frames - 1),
    );
    let e = 0;
    const window = Array.from({ length: n }, (_, j) => {
      const v = samples[start + j] || 0;
      e += v * v;
      return v * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (n - 1)));
    });
    levels.push(Math.sqrt(e / n));
    for (let k = 1; k < n / 2; k++) {
      let re = 0,
        im = 0;
      for (let j = 0; j < n; j++) {
        const angle = (2 * Math.PI * k * j) / n;
        re += window[j] * Math.cos(angle);
        im -= window[j] * Math.sin(angle);
      }
      const power = re * re + im * im,
        hz = (k * sampleRate) / n;
      total += power;
      centroid += power * hz;
      bands[hz < 500 ? 0 : hz < 2500 ? 1 : 2] += power;
    }
  }
  const avg = levels.reduce((a, b) => a + b) / levels.length;
  return [
    rms,
    Math.sqrt(levels.reduce((s, v) => s + (v - avg) ** 2, 0) / levels.length),
    zc / samples.length,
    centroid / (total || 1) / (sampleRate / 2),
    ...bands.map((v) => v / (total || 1)),
  ];
}
