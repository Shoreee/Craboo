import { features } from './features.js';
import { predict } from './model.js';

const scales = [0.1, 0.05, 0.15, 0.3, 0.5, 0.5, 0.5];

export function analyze(samples, rate, models, clips = []) {
  const vector = features(samples, rate);
  const category = predict(models.category, vector);
  const preference = predict(models.preference, vector);
  const rated = clips.filter((clip) => clip.preference && Array.isArray(clip.features));
  const nearest = rated.map((clip) => ({
    clip,
    distance: Math.sqrt(vector.reduce((sum, value, i) =>
      sum + ((value - clip.features[i]) / scales[i]) ** 2, 0)),
  })).sort((a, b) => a.distance - b.distance)[0] || null;
  return {
    vector, category, preference, nearest,
    level: vector[0], brightness: vector[3],
    texture: vector[2] > 0.12 ? '颗粒较多' : vector[4] > 0.55 ? '偏低沉' : '较平滑',
  };
}

export function modelLabel(result) {
  if (!result) return '模型尚未训练';
  return result.confidence < 0.6
    ? `暂不确定（最高为 ${result.label} ${Math.round(result.confidence * 100)}%）`
    : `${result.label} ${Math.round(result.confidence * 100)}%（模型估计）`;
}
