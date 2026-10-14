// A small, repeatable sonic vocabulary: greeting, response, and closing are
// drawn from distinct saved sources when possible. It makes no speech claim.
export function makeUtterance(clips, mood = 'curious') {
  const safe = clips.filter((clip) => clip.audio && clip.preference !== '不喜欢');
  const rank = (clip) => mood === 'calm' ? (clip.preference === '安抚' ? 0 : 1) : (clip.preference === '好奇' ? 0 : 1);
  const ordered = [...safe].sort((a, b) => rank(a) - rank(b));
  const used = new Set();
  const phrase = [];
  for (const clip of ordered) {
    const source = clip.sourceId || clip.id;
    if (used.has(source)) continue;
    phrase.push(clip);
    used.add(source);
    if (phrase.length === 3) break;
  }
  return phrase;
}
