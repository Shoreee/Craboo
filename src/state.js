export const preferences = ["安抚", "好奇", "不喜欢"];
export function fresh() {
  return {
    version: 1,
    clips: [],
    categories: ["轻敲", "摩擦", "流水", "环境声"],
    models: { category: null, preference: null },
    sequence: [],
    loop: true,
    growth: { trust: 0, careCount: 0, lastCare: 0, rewards: [], history: [] },
  };
}
export function care(state, now = Date.now()) {
  if (now - state.growth.lastCare < 15000) return false;
  state.growth.lastCare = now;
  state.growth.careCount++;
  reward(state, "care:" + Math.floor(now / 15000), "你轻轻安抚了 Craboo", 1);
  return true;
}
export function reward(state, id, message, points = 2) {
  if (state.growth.rewards.includes(id)) return false;
  state.growth.rewards.push(id);
  state.growth.trust = Math.min(100, state.growth.trust + points);
  state.growth.history.unshift({ at: Date.now(), message });
  state.growth.history = state.growth.history.slice(0, 40);
  return true;
}
export const sleepSettings = {
  awake: { gain: 0.65, gap: 0.2, density: 1 },
  drowsy: { gain: 0.38, gap: 2, density: 0.75 },
  asleep: { gain: 0.18, gap: 5, density: 0.5 },
};
export function playable(state, predict) {
  return state.sequence
    .map((id) => state.clips.find((c) => c.id === id))
    .filter(
      (c) =>
        c &&
        c.preference !== "不喜欢" &&
        (!predict ||
          predict(state.models.preference, c.features)?.label !== "不喜欢"),
    );
}
