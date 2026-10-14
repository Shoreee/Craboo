export const FEATURE_VERSION = 1;
export function readiness(clips, key) {
  const groups = new Map();
  for (const c of clips) {
    if (!c[key]) continue;
    if (!groups.has(c[key])) groups.set(c[key], new Set());
    groups.get(c[key]).add(c.sourceId);
  }
  const counts = Object.fromEntries([...groups].map(([k, v]) => [k, v.size]));
  return {
    counts,
    ready: groups.size >= 2 && Object.values(counts).every((n) => n >= 3),
  };
}
export function splitGroups(rows, key) {
  const validationIds = new Set();
  const labels = [...new Set(rows.map((c) => c[key]))];
  for (const label of labels) {
    const ids = [
      ...new Set(rows.filter((c) => c[key] === label).map((c) => c.sourceId)),
    ].sort();
    if (ids.length < 5) return { train: rows, validation: [] };
    validationIds.add(ids.at(-1));
  }
  return {
    train: rows.filter((c) => !validationIds.has(c.sourceId)),
    validation: rows.filter((c) => validationIds.has(c.sourceId)),
  };
}
function fit(rows, key, onProgress = () => {}) {
  const labels = [...new Set(rows.map((c) => c[key]))].sort(),
    d = rows[0].features.length;
  const mean = Array(d).fill(0),
    scale = Array(d).fill(0);
  for (const r of rows)
    r.features.forEach((v, j) => (mean[j] += v / rows.length));
  for (const r of rows)
    r.features.forEach(
      (v, j) => (scale[j] += (v - mean[j]) ** 2 / rows.length),
    );
  scale.forEach((v, j) => (scale[j] = Math.sqrt(v) || 1));
  const xs = rows.map((r) => [
    ...r.features.map((v, j) => (v - mean[j]) / scale[j]),
    1,
  ]);
  const weights = labels.map(() => Array(d + 1).fill(0));
  for (let epoch = 0; epoch < 650; epoch++) {
    const grad = weights.map((w) => w.map(() => 0));
    xs.forEach((x, i) => {
      const logits = weights.map((w) => w.reduce((s, v, j) => s + v * x[j], 0)),
        m = Math.max(...logits),
        ex = logits.map((v) => Math.exp(v - m)),
        sum = ex.reduce((a, b) => a + b);
      weights.forEach((w, k) => {
        const err = ex[k] / sum - Number(rows[i][key] === labels[k]);
        w.forEach((_, j) => (grad[k][j] += (err * x[j]) / rows.length));
      });
    });
    weights.forEach((w, k) =>
      w.forEach(
        (v, j) => (w[j] -= 0.08 * (grad[k][j] + (j < d ? 0.008 * v : 0))),
      ),
    );
    if ((epoch + 1) % 50 === 0) onProgress(epoch + 1, 650);
  }
  return {
    featureVersion: FEATURE_VERSION,
    labels,
    mean,
    scale,
    weights,
    key,
    trainedAt: Date.now(),
    samples: rows.length,
  };
}
export function predict(model, features) {
  if (!model) return null;
  const x = [
    ...features.map((v, j) => (v - model.mean[j]) / model.scale[j]),
    1,
  ];
  const logits = model.weights.map((w) =>
      w.reduce((s, v, j) => s + v * x[j], 0),
    ),
    max = Math.max(...logits),
    p = logits.map((v) => Math.exp(v - max)),
    sum = p.reduce((a, b) => a + b);
  const index = p.indexOf(Math.max(...p));
  return { label: model.labels[index], confidence: p[index] / sum };
}
export function train(clips, key, onProgress) {
  const rows = clips.filter((c) => c[key]);
  if (!readiness(rows, key).ready)
    throw Error("至少需要两个标签，每个标签三个独立录音。");
  const { train: training, validation } = splitGroups(rows, key);
  let accuracy = null;
  if (validation.length) {
    const candidate = fit(training, key);
    accuracy =
      validation.filter((c) => predict(candidate, c.features).label === c[key])
        .length / validation.length;
  }
  return { ...fit(rows, key, onProgress), accuracy, validationCount: validation.length };
}
