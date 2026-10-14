import { AudioEngine, wav, dataURL, synthetic } from "./audio.js";
import { features } from "./features.js";
import { readiness, predict } from "./model.js";
import {
  fresh,
  care,
  reward,
  sleepSettings,
  playable,
  preferences,
} from "./state.js";
import { load, save, encode, decode } from "./storage.js";
import { makeUtterance } from "./sound-language.js";
import { detectSegments } from "./segments.js";
import { analyze, modelLabel } from "./insights.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const audio = new AudioEngine();
let profile = "personal",
  state = fresh(),
  draft = null,
  pendingImport = null,
  recording = false,
  separated = false,
  mode = "explore",
  training = false,
  trainingKey = null,
  saveQueue = Promise.resolve();
const liveSegments = new Map();
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function toast(message) {
  const host = $$("dialog[open]").at(-1) || document.body;
  host.append($("#toast"));
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
}
function error(e) {
  console.error(e);
  toast(
    e.name === "NotAllowedError"
      ? "麦克风权限未开启，可以导入音频继续。"
      : e.name === "QuotaExceededError"
        ? "本地空间不足，请导出备份并删除不需要的声音。"
        : e.message || "操作失败，请重试。",
  );
}
function on(selector, event, fn) {
  $(selector).addEventListener(event, (e) =>
    Promise.resolve()
      .then(() => fn(e))
      .catch(error),
  );
}
function persist() {
  const snapshot = structuredClone(state),
    target = profile;
  saveQueue = saveQueue.catch(() => {}).then(() => save(target, snapshot));
  saveQueue.catch(error);
  return saveQueue;
}
function say(text, detail) {
  $("#speech").textContent = "“" + text + "”";
  if (detail) $("#detail").textContent = detail;
}
function mood(name, label) {
  $("#robot").dataset.mood = name;
  $("#mood-label").textContent = label;
}
function respond(clip) {
  const p = predict(state.models.preference, clip.features),
    c = predict(state.models.category, clip.features);
  if (p && p.confidence >= 0.6) {
    mood(
      p.label === "安抚"
        ? "calm"
        : p.label === "不喜欢"
          ? "nervous"
          : "curious",
      p.label === "安抚"
        ? "被声音轻轻安抚"
        : p.label === "不喜欢"
          ? "有一点不安"
          : "好奇地竖起耳朵",
    );
    say(
      p.label === "安抚"
        ? "这个声音，让我想靠近你。"
        : p.label === "不喜欢"
          ? "这个声音有些陌生，可以陪陪我吗？"
          : "我还想再听一次，你也喜欢吗？",
      `偏好模型：${p.label} ${Math.round(p.confidence * 100)}% · 类别：${c && c.confidence >= 0.6 ? c.label : "还不确定"}`,
    );
  } else {
    mood("curious", "等待你的教导");
    say(
      "我还不太懂这个声音，可以教教我吗？",
      "模型尚未训练或置信度较低，请标注后带我学习。",
    );
  }
}
audio.onStop = () => {
  $("#playing").textContent = "声音停下了，陪伴还在。";
};
audio.onError = error;
function updateTop() {
  $("#profile-label").textContent =
    profile === "personal" ? "我们的日常 · 本地存档" : "课堂演示 · 独立存档";
  $("#growth-count").textContent = state.growth.history.length;
  $("#demo").textContent =
    profile === "personal" ? "进入课堂演示存档" : "回到我的日常";
  $("#trust").textContent = state.growth.trust;
}
function options(values, selected, empty = true) {
  return (
    (empty ? '<option value="">暂不标注</option>' : "") +
    values
      .map(
        (v) =>
          `<option ${v === selected ? "selected" : ""}>${escape(v)}</option>`,
      )
      .join("")
  );
}
function render() {
  updateTop();
  const filter = $("#filter").value;
  const clips = state.clips.filter((c) => !filter || c.preference === filter);
  const sources = new Map();
  for (const clip of clips) {
    if (!sources.has(clip.sourceId)) sources.set(clip.sourceId, []);
    sources.get(clip.sourceId).push(clip);
  }
  $("#clips").innerHTML = clips.length
    ? [...sources.values()]
        .map((group, groupIndex) => `<div class="source-group"><h3>录音 ${groupIndex + 1} · ${escape(group[0].sourceName || group[0].name)} <small>${group.length} 段</small></h3>${group.map((c) =>
            `<article class="clip"><span style="color:#89937b;font-size:24px">⌁</span><div class="clip-info"><h3>${escape(c.name)}</h3><p>${c.sourceStart == null ? '' : `${c.sourceStart.toFixed(1)}–${c.sourceEnd.toFixed(1)} 秒 · `}${c.duration.toFixed(1)} 秒 · ${escape(c.category || "待认识")} · ${escape(c.preference || "待教导")}${c.synthetic ? " · 合成示例" : ""}</p></div><div class="clip-actions"><button data-action="listen" data-id="${escape(c.id)}">试听</button><button data-action="edit" data-id="${escape(c.id)}">编辑</button><button data-action="delete" data-id="${escape(c.id)}">删除</button></div></article>`).join('')}</div>`)
        .join("")
    : '<div class="empty">这里还很安静。<br>录下一个声音，或从合成示例开始认识它。</div>';
  $("#models").innerHTML = ["category", "preference"]
    .map((key) => {
      const r = readiness(state.clips, key),
        m = state.models[key];
      return `<div class="model-card"><h3>${key === "category" ? "01 · 认识声音类别" : "02 · 理解你的偏好"}</h3><p>${
        Object.entries(r.counts)
          .map(
            ([k, n]) =>
              `${escape(k)} ${n}/3${n < 3 ? "（还缺 " + (3 - n) + " 个来源）" : ""}`,
          )
          .join(" · ") || "还没有标注样本"
      }${Object.keys(r.counts).length < 2 ? " · 至少需要两个标签" : ""}</p><p>${m ? `已训练 ${m.samples} 个片段 · ${new Date(m.trainedAt).toLocaleString()}<br>${m.accuracy === null ? "验证样本不足，未展示准确率" : `留出验证 ${(m.accuracy * 100).toFixed(0)}%（${m.validationCount} 个片段）`}` : "尚未训练 · 不会冒充已学会"}</p><button class="primary" data-train="${key}" ${!r.ready || training ? "disabled" : ""}>${training ? "正在学习…" : m ? "重新训练" : "开始学习"}</button></div>`;
    })
    .join("");
  $$('.model-card').forEach((card, index) => {
    const key = index === 0 ? 'category' : 'preference';
    const detail = document.createElement('div');
    detail.className = 'model-detail';
    detail.innerHTML = `<span>7 项声学特征：能量、动态、过零率、频谱中心与三个频段</span><span>标准化 + Softmax 分类 · 650 轮 · 本机计算</span>${trainingKey === key ? '<label>训练中 <progress id="training-progress" max="100" value="0"></progress><b id="training-percent">0%</b></label>' : ''}`;
    card.append(detail);
  });
  $("#sequence").innerHTML = state.sequence.length
    ? state.sequence
        .map((id, index) => {
          const c = state.clips.find((c) => c.id === id);
          return `<div class="clip"><span class="muted">${String(index + 1).padStart(2, "0")}</span><div class="clip-info"><h3>${escape(c.name)}</h3><p>${escape(c.category || predict(state.models.category, c.features)?.label || "待认识")}${c.preference === "不喜欢" ? " · 播放时跳过" : ""}</p></div><div class="clip-actions"><button data-order="${index}" data-direction="-1" aria-label="上移 ${escape(c.name)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-order="${index}" data-direction="1" aria-label="下移 ${escape(c.name)}" ${index === state.sequence.length - 1 ? "disabled" : ""}>↓</button><button data-remove="${index}">移除</button></div></div>`;
        })
        .join("")
    : '<div class="empty">在收藏中点击「＋序列」，把声音串在一起。</div>';
  $("#loop").checked = state.loop;
  $("#capture-summary").textContent = `已保存 ${state.clips.length} 段，来自 ${new Set(state.clips.map((clip) => clip.sourceId)).size} 次录音；${state.clips.filter((clip) => clip.category || clip.preference).length} 段有人工标注。可在「我的」按录音查看，在「学习」训练模型。`;
  const phrase = makeUtterance(state.clips, $("#robot").dataset.mood);
  $("#utterance-preview").textContent = phrase.length ? phrase.map((clip, index) => `${index + 1}. ${clip.name}`).join('  →  ') : '尚无可用声音。先录下并标注一段声音。';
  $("#history").innerHTML = state.growth.history.length
    ? state.growth.history
        .map(
          (h) =>
            `<div class="history-row"><span>${escape(h.message)}</span><time>${new Date(h.at).toLocaleDateString()}</time></div>`,
        )
        .join("")
    : '<p class="empty">第一次照料，会成为你们的第一段记忆。</p>';
}
function tab(name) {
  $$("[data-tab]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.tab === name),
  );
  ["sounds", "training", "sequence", "memories"].forEach(
    (t) => ($("#tab-" + t).hidden = t !== name),
  );
}
function openLibrary(name = "sounds") {
  render();
  tab(name);
  $("#library").showModal();
}
on("#open-library", "click", () => { location.hash = 'mine'; });
on("#open-growth", "click", () => { location.hash = 'mine'; });
$$("label.button").forEach((label) => {
  label.tabIndex = 0;
  label.setAttribute("role", "button");
  label.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      label.querySelector("input").click();
    }
  });
});
$$(".close").forEach((b) =>
  b.addEventListener("click", () => b.closest("dialog").close()),
);
$$("[data-tab]").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
on("#filter", "change", render);
function setMode(next) {
  mode = next;
  $$("[data-mode]").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === next),
  );
  ["explore", "care", "sleep"].forEach(
    (n) => ($("#" + n + "-panel").hidden = n !== next),
  );
  document.body.classList.toggle("bedtime", next === "sleep");
  if (next === "sleep") {
    say(
      "今晚，换我陪你慢慢安静下来。",
      "睡眠状态为手动模拟；声音来自你的收藏。",
    );
    mood("sleepy", "准备睡前陪伴");
  } else {
    audio.setSleep(sleepSettings.awake);
    $$("[data-sleep]").forEach((b) =>
      b.classList.toggle("selected", b.dataset.sleep === "awake"),
    );
    mood("curious", "正在好奇地听");
    say(
      next === "care"
        ? "可以轻轻摸摸我吗？"
        : "今天，可以带我认识一种新声音吗？",
      next === "care"
        ? "照料会积累信任，每 15 秒最多记住一次有效抚摸。"
        : "从一个声音开始，慢慢认识彼此。",
    );
  }
}
$$("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
function detach(value = !separated) {
  separated = value;
  $("#robot").classList.toggle("separated", separated);
  $("#detach").textContent = separated ? "穿回甲壳 ↙" : "取下甲壳 ↗";
  $("#care-detach").textContent = separated ? "帮它穿回甲壳" : "让它出来透透气";
  say(
    separated ? "没有甲壳，也想待在你身边。" : "准备好啦，一起去听听世界吧。",
    separated
      ? "毛绒身体需要你的照料，甲壳继续收藏声音。"
      : "拖动右侧甲壳可以分离，轻触则会发声。",
  );
}
on("#detach", "click", () => detach());
on("#care-detach", "click", () => detach());
async function pet() {
  const earned = care(state);
  $("#robot").classList.remove("petted");
  void $("#robot").offsetWidth;
  $("#robot").classList.add("petted");
  mood("calm", "感到安心");
  say(
    earned ? "你的温柔，我记住了。" : "嗯，待在这里就很好。",
    earned
      ? "这次照料已记录 · 亲近度 +1"
      : "慢慢来，重复抚摸不会无限增加成长值。",
  );
  if (earned) {
    await persist();
    updateTop();
  }
}
on("#pet", "click", pet);
on("#pet-hit", "click", pet);
window.addEventListener('craboo:hand-tap', async () => {
  await audio.touch();
  mood('curious', '听见轻拍');
  say('叩叩，我在这里。', '手部轻拍 · 浏览器合成触碰声');
});
let strokes = 0;
on("#pet-hit", "pointermove", (e) => {
  if (e.buttons && ++strokes % 15 === 0) pet();
});
let drag = null;
on("#shell-hit", "pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
  e.target.setPointerCapture(e.pointerId);
});
on("#shell-hit", "pointerup", async (e) => {
  if (!drag) return;
  const distance = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  drag = null;
  if (distance > 30) detach();
  else {
    await audio.touch();
    say("叩叩，我在这里。", "甲壳触摸声 · 浏览器合成音");
  }
});
on("#shell-hit", "pointercancel", () => (drag = null));
on("#shell-hit", "keydown", async (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    await audio.touch();
    say("叩叩，我在这里。");
  }
});
function wave(samples) {
  const canvas = $("#wave"),
    ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#8a9676";
  ctx.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 4) {
    let peak = 0;
    const start = Math.floor((x / canvas.width) * samples.length),
      end = Math.floor(((x + 4) / canvas.width) * samples.length);
    for (let i = start; i < end; i++)
      peak = Math.max(peak, Math.abs(samples[i]));
    const h = Math.max(1, peak * 90);
    ctx.beginPath();
    ctx.moveTo(x, 55 - h);
    ctx.lineTo(x, 55 + h);
    ctx.stroke();
  }
  if (draft) {
    const start =
      (Number($("#trim-start").value) / draft.duration) * canvas.width;
    const end = (Number($("#trim-end").value) / draft.duration) * canvas.width;
    ctx.fillStyle = "#f7f4edbb";
    ctx.fillRect(0, 0, start, canvas.height);
    ctx.fillRect(end, 0, canvas.width - end, canvas.height);
  }
}
for (const selector of ["#trim-start", "#trim-end"])
  on(selector, "input", () => {
    if (!draft) return;
    wave(draft.samples);
    try {
      const part = selection();
      $("#prediction").textContent = insightText(analyze(part.samples, part.rate, state.models, state.clips));
    } catch { $("#prediction").textContent = '调整起止位置，选择至少 0.2 秒的声音。'; }
  });
$$("[data-stop]").forEach((button) =>
  button.addEventListener("click", () => audio.stop()),
);
function predictionText(f) {
  return ["category", "preference"]
    .map((key) => {
      const p = predict(state.models[key], f);
      return (
        (key === "category" ? "声音类别" : "个人偏好") +
        "：" +
        (!p
          ? "尚未训练"
          : p.confidence < 0.6
            ? "还不确定，请教教我"
            : `${p.label}（${Math.round(p.confidence * 100)}%，模型估计）`)
      );
    })
    .join(" · ");
}
function insightText(result) {
  return `音量 ${Math.round(result.level * 1000) / 10}% · 音色 ${result.texture} · 类别：${modelLabel(result.category)} · 偏好：${modelLabel(result.preference)}`;
}
function tinyWave(samples) {
  return Array.from({ length: 28 }, (_, index) => {
    let peak = 0;
    const begin = Math.floor(index * samples.length / 28);
    const end = Math.floor((index + 1) * samples.length / 28);
    for (let i = begin; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return `<i style="height:${Math.max(8, Math.min(100, peak * 180))}%"></i>`;
  }).join('');
}
function renderSegments() {
  const segments = draft?.segments || [];
  $("#segment-status").textContent = draft?.analyzing
    ? `正在分析 ${segments.length}/${draft.totalCandidates} 个候选片段…`
    : segments.length
    ? `从 ${draft.duration.toFixed(1)} 秒录音中找到 ${segments.length} 个候选片段；根据活动音量与停顿划分，可继续手动调整。`
    : '没有找到明显高于底噪的片段；仍可手动调整下面的起止位置。';
  $("#save-selected").disabled = draft?.analyzing || !segments.length;
  $("#segment-list").innerHTML = segments.map((segment, index) => `<article class="segment-card ${draft.activeSegment === index ? 'selected' : ''}" data-segment="${index}">
    <div class="segment-main"><label><input type="checkbox" data-segment-check="${index}" ${segment.checked ? 'checked' : ''}> 片段 ${index + 1} · ${segment.start.toFixed(1)}–${segment.end.toFixed(1)} 秒</label><button class="secondary" data-segment-preview="${index}">试听</button><button class="secondary" data-segment-use="${index}">手动微调</button></div>
    <div class="segment-wave" aria-hidden="true">${tinyWave(segment.samples)}</div>
    <p>${insightText(segment.insight)}</p>
    <p>${segment.insight.nearest ? `声学上最接近已标注的「${escape(segment.insight.nearest.clip.name)}」（${escape(segment.insight.nearest.clip.preference)}）；这只是特征距离，仍需你判断。` : '还没有已标注声音可做相似比较。'}</p>
    <div class="segment-labels"><label>类别 <select data-segment-category="${index}">${options(state.categories, segment.category)}</select></label><label>你的偏好 <select data-segment-preference="${index}">${options(preferences, segment.preference)}</select></label></div>
  </article>`).join('');
}
function useSegment(index) {
  const segment = draft.segments[index];
  draft.activeSegment = index;
  $("#trim-start").value = segment.start.toFixed(2);
  $("#trim-end").value = segment.end.toFixed(2);
  $("#clip-name").value = segment.name;
  $("#clip-category").value = segment.category;
  $("#clip-preference").value = segment.preference;
  $("#prediction").textContent = insightText(segment.insight);
  wave(draft.samples);
  renderSegments();
}
on('#segment-list', 'change', (event) => {
  const target = event.target;
  const index = Number(target.dataset.segmentCheck ?? target.dataset.segmentCategory ?? target.dataset.segmentPreference);
  if (!Number.isInteger(index) || !draft?.segments[index]) return;
  const segment = draft.segments[index];
  if (target.dataset.segmentCheck !== undefined) segment.checked = target.checked;
  if (target.dataset.segmentCategory !== undefined) segment.category = target.value;
  if (target.dataset.segmentPreference !== undefined) segment.preference = target.value;
});
on('#segment-list', 'click', async (event) => {
  const use = event.target.closest('[data-segment-use]');
  const preview = event.target.closest('[data-segment-preview]');
  if (use) useSegment(Number(use.dataset.segmentUse));
  if (preview) {
    const segment = draft.segments[Number(preview.dataset.segmentPreview)];
    await audio.play([{ audio: await dataURL(wav(segment.samples, draft.rate)), name: `片段 ${Number(preview.dataset.segmentPreview) + 1}` }]);
  }
});
async function openEditor(
  blob,
  name = "新的小声音",
  existing = null,
  syntheticFlag = false,
) {
  const decoded = await audio.decode(blob);
  const f = features(decoded.samples, decoded.rate);
  draft = {
    ...decoded,
    sourceName: existing?.sourceName || name,
    sourceId:
      existing?.sourceId ||
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            await wav(decoded.samples, decoded.rate).arrayBuffer(),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
    existing,
    synthetic: existing?.synthetic || syntheticFlag,
  };
  const candidates = detectSegments(decoded.samples, decoded.rate);
  draft.segments = [];
  draft.totalCandidates = candidates.length;
  draft.analyzing = true;
  $("#clip-name").value = name;
  $("#trim-start").value = 0;
  $("#trim-end").value = decoded.duration.toFixed(2);
  $("#trim-end").max = decoded.duration;
  $("#trim-start").max = decoded.duration;
  $("#clip-category").innerHTML = options(state.categories, existing?.category);
  $("#clip-preference").value = existing?.preference || "";
  $("#prediction").textContent = predictionText(f);
  wave(decoded.samples);
  renderSegments();
  $("#editor").showModal();
  const current = draft;
  for (const [index, segment] of candidates.entries()) {
    if (draft !== current || !$("#editor").open) break;
    const samples = decoded.samples.slice(Math.floor(segment.start * decoded.rate), Math.floor(segment.end * decoded.rate));
    draft.segments.push({ ...segment, samples, checked: true, name: `${name} · 片段 ${index + 1}`,
      category: '', preference: '', insight: analyze(samples, decoded.rate, state.models, state.clips) });
    renderSegments();
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  if (draft === current) { draft.analyzing = false; renderSegments(); }
  respond({ features: f });
}
function selection() {
  const start = Number($("#trim-start").value),
    end = Number($("#trim-end").value);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > draft.duration + 0.015 ||
    end - start < 0.2
  )
    throw Error("请选择至少 0.2 秒、且在音频长度以内的片段。");
  const samples = draft.samples.slice(
    Math.floor(start * draft.rate),
    Math.min(draft.samples.length, Math.floor(end * draft.rate)),
  );
  return { samples, rate: draft.rate, duration: samples.length / draft.rate };
}
on("#audio-file", "change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) throw Error("音频文件需小于 30 MB。");
  await openEditor(file, file.name.replace(/\.[^.]+$/, ""));
});
on("#record", "click", async () => {
  if (recording) {
    audio.stopRecording();
    return;
  }
  recording = true;
  $("#record").textContent = "■ 结束录音";
  say(
    "我在听，把声音轻轻带给我。",
    "正在真实录音 · 最长 60 秒，结束后可试听与裁剪",
  );
  try {
    const blob = await audio.record($("#record-noise").checked);
    await openEditor(blob, "今天听到的小声音");
  } finally {
    recording = false;
    $("#record").textContent = "● 录下一段声音";
  }
});
on("#sound-speak", "click", async () => {
  const phrase = makeUtterance(state.clips, $("#robot").dataset.mood);
  if (!phrase.length) throw Error("先采集或导入一个愿意让它使用的声音。 ");
  say("我用你带来的声音回应你。", `声音语言 · ${phrase.map((clip) => clip.name).join(" → ")} · 声音序列不包含语义合成`);
  await audio.play(phrase, false);
});
on("#preview", "click", async () => {
  const part = selection();
  await audio.play(
    [{ audio: await dataURL(wav(part.samples, part.rate)), name: "选段试听" }],
    false,
    (c) => ($("#playing").textContent = "正在试听 · " + c.name),
  );
});
on("#save-clip", "click", async () => {
  const button = $("#save-clip");
  button.disabled = true;
  try {
    if (state.clips.length >= 500 && !draft.existing)
      throw Error("最多收藏 500 段声音，请先整理收藏。");
    const part = selection(),
      name = $("#clip-name").value.trim();
    if (!name) throw Error("给这段声音起个名字吧。");
    const f = features(part.samples, part.rate),
      clip = {
        id: draft.existing?.id || crypto.randomUUID(),
        sourceId: draft.sourceId,
        sourceName: draft.sourceName,
        sourceStart: (draft.existing?.sourceStart || 0) + Number($("#trim-start").value),
        sourceEnd: (draft.existing?.sourceStart || 0) + Number($("#trim-end").value),
        name,
        audio: await dataURL(wav(part.samples, part.rate)),
        duration: part.duration,
        features: f,
        category: $("#clip-category").value,
        preference: $("#clip-preference").value,
        synthetic: draft.synthetic,
        createdAt: draft.existing?.createdAt || Date.now(),
      };
    const before = structuredClone(state);
    const i = state.clips.findIndex((c) => c.id === clip.id);
    if (i < 0) state.clips.push(clip);
    else state.clips[i] = clip;
    if (clip.category || clip.preference)
      reward(
        state,
        "teach:" + clip.sourceId,
        "一起认识了「" + clip.name + "」",
      );
    try {
      await persist();
    } catch (e) {
      state = before;
      throw e;
    }
    audio.stop();
    $("#editor").close();
    render();
    respond(clip);
    toast("声音已收藏，标注已保存。");
  } finally {
    button.disabled = false;
  }
});
on('#save-selected', 'click', async () => {
  const chosen = draft.segments.filter((segment) => segment.checked);
  if (!chosen.length) throw Error('请先勾选要收藏的片段。');
  if (state.clips.length + chosen.length > 500) throw Error('收藏上限为 500 段，请减少勾选数量。');
  const button = $('#save-selected');
  button.disabled = true;
  const before = structuredClone(state);
  try {
    const createdAt = Date.now();
    for (const segment of chosen) {
      const clip = {
        id: crypto.randomUUID(), sourceId: draft.sourceId, sourceName: draft.sourceName,
        sourceStart: (draft.existing?.sourceStart || 0) + segment.start,
        sourceEnd: (draft.existing?.sourceStart || 0) + segment.end,
        name: segment.name, audio: await dataURL(wav(segment.samples, draft.rate)),
        duration: segment.samples.length / draft.rate, features: segment.insight.vector,
        category: segment.category, preference: segment.preference,
        synthetic: draft.synthetic, createdAt,
      };
      state.clips.push(clip);
      if (clip.category || clip.preference)
        reward(state, 'teach:' + clip.sourceId, `一起认识了「${clip.name}」`);
    }
    await persist();
    audio.stop();
    $('#editor').close();
    render();
    toast(`已收藏 ${chosen.length} 段；同一次录音的片段只算一个训练来源。`);
  } catch (error) { state = before; throw error; }
  finally { button.disabled = false; }
});
let liveCount = 0;
window.addEventListener('craboo:live-segment', ({ detail }) => {
  try {
    const insight = analyze(detail.samples, detail.rate, state.models, state.clips);
    const id = crypto.randomUUID();
    liveSegments.set(id, detail);
    while (liveSegments.size > 5) liveSegments.delete(liveSegments.keys().next().value);
    const host = $('#live-events');
    if (!liveCount) host.innerHTML = '';
    liveCount++;
    const item = document.createElement('article');
    item.className = 'live-event';
    item.innerHTML = `<div><strong>片段 ${liveCount}</strong><span>${detail.start.toFixed(1)}–${detail.end.toFixed(1)} 秒</span></div><div class="segment-wave" aria-hidden="true">${tinyWave(detail.samples)}</div><p>${insightText(insight)}</p><p>${insight.nearest ? `接近已标注的「${escape(insight.nearest.clip.name)}」 · 偏好 ${escape(insight.nearest.clip.preference)}（声学距离）` : '暂无已标注声音可比较'}</p><button class="secondary" data-live-id="${id}">试听、标注并收藏</button>`;
    host.prepend(item);
    while (host.children.length > 5) host.lastElementChild.remove();
  } catch (error) { console.warn('实时片段分析失败', error); }
});
on('#live-events', 'click', async (event) => {
  const id = event.target.closest('[data-live-id]')?.dataset.liveId;
  if (!id) return;
  const segment = liveSegments.get(id);
  if (!segment) throw Error('该片段已从临时内存移除，请重新聆听。');
  await openEditor(wav(segment.samples, segment.rate), `实时片段 ${id.slice(0, 4)}`);
});
on("#sample", "click", async () => {
  const kinds = state.categories.filter((c) =>
      ["轻敲", "摩擦", "流水", "环境声"].includes(c),
    ),
    kind = kinds[state.clips.length % kinds.length] || "轻敲",
    s = synthetic(kind, Date.now() >>> 0);
  await openEditor(wav(s.samples, s.rate), kind + " · 合成示例", null, true);
});
on("#clips", "click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const clip = state.clips.find((c) => c.id === b.dataset.id);
  if (!clip) return;
  if (b.dataset.action === "listen") {
    await audio.play([clip], false, (c) => {
      $("#playing").textContent = "正在播放 · " + c.name;
      respond(c);
    });
  }
  if (b.dataset.action === "edit")
    await openEditor(await (await fetch(clip.audio)).blob(), clip.name, clip);
  if (b.dataset.action === "add") {
    state.sequence.push(clip.id);
    await persist();
    render();
    toast("已保存声音");
  }
  if (b.dataset.action === "delete") {
    if (
      !confirm(
        "删除「" +
          clip.name +
          "」及其序列引用？已训练模型仍保留，重新训练后更新。",
      )
    )
      return;
    audio.stop();
    state.clips = state.clips.filter((c) => c.id !== clip.id);
    state.sequence = state.sequence.filter((id) => id !== clip.id);
    await persist();
    render();
  }
});
function runTraining(key, clips) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./train-worker.js", import.meta.url), {
      type: "module",
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(Error("训练超时，请减少样本后重试。"));
    }, 60000);
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) {
        const percentage = Math.round(data.progress * 100);
        if ($('#training-progress')) $('#training-progress').value = percentage;
        if ($('#training-percent')) $('#training-percent').textContent = `${percentage}%`;
        return;
      }
      clearTimeout(timeout);
      worker.terminate();
      data.error ? reject(Error(data.error)) : resolve(data.model);
    };
    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(Error(e.message || "训练失败"));
    };
    worker.postMessage({ key, clips });
  });
}
on("#models", "click", async (e) => {
  const key = e.target.closest("[data-train]")?.dataset.train;
  if (!key || training) return;
  training = true;
  trainingKey = key;
  render();
  try {
    const m = await runTraining(key, structuredClone(state.clips));
    state.models[key] = m;
    reward(
      state,
      "training:" +
        key +
        ":" +
        state.clips
          .filter((c) => c[key])
          .map((c) => c.id + ":" + c[key])
          .sort()
          .join("|"),
      key === "category"
        ? "Craboo 学会了辨认新的声音"
        : "Craboo 更懂你的声音偏好了",
      4,
    );
    await persist();
    toast("真实训练完成，模型已保存");
    say(
      "原来是这样，我又懂你一点了。",
      "模型已更新。可以导入一个新声音，看看它学会了什么。",
    );
  } finally {
    training = false;
    trainingKey = null;
    render();
  }
});
on("#category-form", "submit", async (e) => {
  e.preventDefault();
  const value = $("#new-category").value.trim();
  if (!value || state.categories.includes(value)) return;
  if (state.categories.length >= 50) throw Error("最多支持 50 个类别。");
  state.categories.push(value);
  await persist();
  $("#new-category").value = "";
  toast("类别已添加，编辑声音时可选择");
});
on("#sequence", "click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.remove !== undefined)
    state.sequence.splice(Number(b.dataset.remove), 1);
  else if (b.dataset.order !== undefined) {
    const i = Number(b.dataset.order),
      j = i + Number(b.dataset.direction);
    if (j >= 0 && j < state.sequence.length)
      [state.sequence[i], state.sequence[j]] = [
        state.sequence[j],
        state.sequence[i],
      ];
  }
  await persist();
  render();
});
on("#loop", "change", async (e) => {
  state.loop = e.target.checked;
  await persist();
});
on("#recompose", "click", async () => {
  const groups = new Map();
  for (const c of playable(state, predict)) {
    const p = predict(state.models.category, c.features),
      key = c.category || (p && p.confidence >= 0.6 ? p.label : "未分类");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c.id);
  }
  const sequence = [];
  while ([...groups.values()].some((g) => g.length))
    for (const g of groups.values()) if (g.length) sequence.push(g.shift());
  state.sequence = sequence;
  await persist();
  render();
  toast("已按类别交错排列，并排除不喜欢的声音");
});
async function playSequence() {
  const clips = playable(state, predict);
  await audio.play(clips, state.loop, (c) => {
    $("#playing").textContent = "正在陪伴 · " + c.name;
    if (mode !== "sleep") respond(c);
  });
  if (mode === "sleep") mood("sleepy", "轻轻陪着你");
}
on("#play-sequence", "click", playSequence);
on("#bedtime", "click", playSequence);
on("#stop", "click", () => audio.stop());
on("#volume", "input", (e) => audio.setVolume(Number(e.target.value)));
$$("[data-sleep]").forEach(
  (b) =>
    (b.onclick = () => {
      $$("[data-sleep]").forEach((x) =>
        x.classList.toggle("selected", x === b),
      );
      audio.setSleep(sleepSettings[b.dataset.sleep]);
      say(
        b.dataset.sleep === "asleep"
          ? "嘘，好好休息，我在。"
          : b.dataset.sleep === "drowsy"
            ? "把今天的声音，慢慢放轻。"
            : "还有一点时间，我们一起听。",
        "手动模拟睡眠 · 音量平滑变化，间隔从下一段开始调整",
      );
      mood("sleepy", b.textContent + "陪伴中");
    }),
);
on("#export", "click", () => {
  const blob = new Blob([encode(state)], { type: "application/json" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `craboo-${profile}-${new Date().toISOString().slice(0, 10)}.craboo.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("完整存档已导出");
});
on("#archive-file", "change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (training || recording) throw Error("请先结束录音或训练。");
  if (file.size > 180 * 1024 * 1024) throw Error("存档不能超过 180 MB。");
  const imported = decode(await file.text());
  for (const c of imported.clips) {
    await audio.decode(await (await fetch(c.audio)).blob());
  }
  pendingImport = imported;
  $("#import-summary").textContent =
    `包含 ${imported.clips.length} 段声音、${Object.values(imported.models).filter(Boolean).length} 个模型、${imported.growth.history.length} 条成长记录。将恢复到${profile === "personal" ? "个人" : "演示"}档案。`;
  $("#import-confirm").showModal();
});
on("#confirm-import", "click", async () => {
  if (!pendingImport) return;
  await saveQueue.catch(() => {});
  await save(profile, pendingImport);
  state = pendingImport;
  pendingImport = null;
  audio.stop();
  $("#import-confirm").close();
  render();
  toast("记忆已恢复");
});
on("#demo", "click", async () => {
  if (training || recording) throw Error("请先结束录音或训练。");
  $("#demo").disabled = true;
  try {
    await persist();
    const next = profile === "personal" ? "demo" : "personal";
    let target = await load(next);
    if (!target) {
      target = fresh();
      if (next === "demo") {
        toast("正在生成独立合成样本并真实训练…");
        for (const [k, kind] of ["轻敲", "摩擦", "流水", "环境声"].entries()) {
          for (let n = 0; n < 5; n++) {
            const s = synthetic(kind, 177 + k * 100 + n * 37),
              id = crypto.randomUUID();
            target.clips.push({
              id,
              sourceId: id,
              name: kind + " " + (n + 1) + " · 合成示例",
              audio: await dataURL(wav(s.samples, s.rate)),
              duration: s.duration,
              features: features(s.samples, s.rate),
              category: kind,
              preference: ["好奇", "不喜欢", "安抚", "安抚"][k],
              synthetic: true,
              createdAt: Date.now(),
            });
          }
        }
        for (const key of ["category", "preference"])
          target.models[key] = await runTraining(key, target.clips);
        target.sequence = target.clips
          .filter((c) => c.preference !== "不喜欢")
          .filter((_, i) => i % 3 === 0)
          .map((c) => c.id);
        reward(target, "demo-init", "合成课堂示例已完成真实训练", 8);
      }
      await save(next, target);
    }
    audio.stop();
    profile = next;
    state = target;
    render();
    say(
      next === "demo" ? "这些是课堂练习的小声音。" : "回到我们自己的日常啦。",
      next === "demo"
        ? "独立演示档案 · 全部为合成样本，模型确实经过训练。"
        : "个人声音与成长已恢复。",
    );
    toast(next === "demo" ? "已进入独立课堂演示存档" : "已回到个人存档");
  } finally {
    $("#demo").disabled = false;
  }
});
window.addEventListener("pagehide", () => {
  audio.stop();
  audio.stopRecording();
});
try {
  state = (await load(profile)) || fresh();
  render();
} catch (e) {
  error(e);
  render();
  say(
    "本地记忆暂时无法打开。",
    "请检查浏览器存储设置；当前操作可能无法持久保存。",
  );
}

