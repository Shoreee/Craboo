const labels = [
  ['音量', 'Level'], ['起伏', 'Variation'], ['纹理', 'Texture'],
  ['音色亮度', 'Brightness'], ['低频', 'Low'], ['中频', 'Mid'], ['高频', 'High'],
];

export function renderFeatureComparison(target, clips, language = 'zh') {
  const en = language === 'en';
  const valid = clips.filter((clip) => Array.isArray(clip.features) && clip.features.length === 7);
  const latest = valid.at(-1);
  const title = en ? 'What the model hears' : '模型听见的区别';
  const lead = en ? 'Compare the latest saved clip with your archive average.' : '最近保存的一段声音，与存档中的平均表现对照。';
  const empty = en ? 'Save a sound clip to reveal its acoustic fingerprint.' : '保存一段声音后，这里会显示它的声学轮廓。';
  const rows = latest ? labels.map(([zh, english], i) => {
    const values = valid.map((clip) => Number(clip.features[i]) || 0);
    const max = Math.max(...values, 0.0001);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const latestWidth = Math.max(2, Math.round(values.at(-1) / max * 100));
    const meanWidth = Math.max(2, Math.round(mean / max * 100));
    return `<div class="feature-row"><span>${en ? english : zh}</span><div class="feature-track"><i class="feature-average" style="width:${meanWidth}%"></i><i class="feature-latest" style="width:${latestWidth}%"></i></div></div>`;
  }).join('') : `<p class="feature-empty">${empty}</p>`;
  target.innerHTML = `<div class="feature-intro"><span>07 / ${en ? 'ACOUSTIC SIGNALS' : '声学信号'}</span><h3>${title}</h3><p>${lead}</p><div class="feature-legend"><span><i></i>${en ? 'Archive mean' : '存档平均'}</span><span><i></i>${en ? 'Latest clip' : '最近片段'}</span></div></div><div class="feature-chart">${rows}</div><div class="feature-process"><span>${en ? 'Audio' : '声音'}</span><b>→</b><span>${en ? '7 features' : '7 项特征'}</span><b>→</b><span>${en ? 'Normalize' : '标准化'}</span><b>→</b><span>${en ? 'Sound & preference models' : '类别与偏好模型'}</span></div>`;
}
