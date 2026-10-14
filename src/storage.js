import { preferences } from "./state.js";
let db;
function database() {
  return (db ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("craboo", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("profiles");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function load(profile) {
  const d = await database();
  return new Promise((resolve, reject) => {
    const r = d.transaction("profiles").objectStore("profiles").get(profile);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function save(profile, state) {
  const d = await database();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put(state, profile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("存储失败"));
  });
}
export function validate(s) {
  if (
    s?.version !== 1 ||
    !Array.isArray(s.clips) ||
    s.clips.length > 500 ||
    !Array.isArray(s.categories) ||
    s.categories.length > 50 ||
    !s.categories.every(
      (x) => typeof x === "string" && x.length > 0 && x.length <= 40,
    ) ||
    !s.models ||
    !Array.isArray(s.sequence) ||
    typeof s.loop !== "boolean"
  )
    throw Error("存档结构或版本无效");
  const ids = new Set();
  for (const c of s.clips) {
    if (
      typeof c.id !== "string" ||
      c.id.length > 100 ||
      ids.has(c.id) ||
      typeof c.sourceId !== "string" ||
      c.sourceId.length > 100 ||
      typeof c.name !== "string" ||
      c.name.length > 100 ||
      typeof c.audio !== "string" ||
      !/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/.test(c.audio) ||
      !Number.isFinite(c.duration) ||
      c.duration <= 0 ||
      c.duration > 60 ||
      !Array.isArray(c.features) ||
      c.features.length !== 7 ||
      !c.features.every(Number.isFinite) ||
      (c.category && !s.categories.includes(c.category)) ||
      (c.preference && !preferences.includes(c.preference))
    )
      throw Error("声音数据无效");
    ids.add(c.id);
  }
  if (!s.sequence.every((id) => ids.has(id)))
    throw Error("序列引用不存在的声音");
  for (const key of ["category", "preference"]) {
    const m = s.models[key];
    if (!m) continue;
    if (
      m.featureVersion !== 1 ||
      m.key !== key ||
      !Number.isFinite(m.samples) ||
      m.samples < 1 ||
      !Number.isFinite(m.trainedAt) ||
      !Number.isFinite(m.validationCount) ||
      !(
        m.accuracy === null ||
        (Number.isFinite(m.accuracy) && m.accuracy >= 0 && m.accuracy <= 1)
      ) ||
      !Array.isArray(m.labels) ||
      m.labels.length < 2 ||
      !m.labels.every((l) =>
        (key === "category" ? s.categories : preferences).includes(l),
      ) ||
      !Array.isArray(m.mean) ||
      m.mean.length !== 7 ||
      !m.mean.every(Number.isFinite) ||
      !Array.isArray(m.scale) ||
      m.scale.length !== 7 ||
      !m.scale.every((v) => Number.isFinite(v) && v > 0) ||
      !Array.isArray(m.weights) ||
      m.weights.length !== m.labels.length ||
      !m.weights.every(
        (w) => Array.isArray(w) && w.length === 8 && w.every(Number.isFinite),
      )
    )
      throw Error("模型数据无效");
  }
  const g = s.growth;
  if (
    !g ||
    !Number.isFinite(g.trust) ||
    g.trust < 0 ||
    g.trust > 100 ||
    !Number.isFinite(g.lastCare) ||
    !Number.isFinite(g.careCount) ||
    !Array.isArray(g.rewards) ||
    !g.rewards.every((x) => typeof x === "string") ||
    !Array.isArray(g.history) ||
    !g.history.every(
      (x) => Number.isFinite(x.at) && typeof x.message === "string",
    )
  )
    throw Error("养成数据无效");
  return s;
}
export function encode(state) {
  return JSON.stringify(validate(state));
}
export function decode(text) {
  return validate(JSON.parse(text));
}
