import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSegments, StreamSegmenter } from '../src/segments.js';
import { readiness, train } from '../src/model.js';
import { synthetic } from '../src/audio.js';
import { features } from '../src/features.js';
import { analyze } from '../src/insights.js';

const rate = 16000;
function recording() {
  const samples = new Float32Array(rate * 5);
  for (const [begin, end, hz] of [[1, 2, 440], [3, 4, 800]])
    for (let i = begin * rate; i < end * rate; i++)
      samples[i] = Math.sin(i * hz * 2 * Math.PI / rate) * 0.13;
  return samples;
}

test('long recording is divided at silence without overlapping candidates', () => {
  const parts = detectSegments(recording(), rate);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].start < 1 && parts[0].end > 2);
  assert.ok(parts[1].start < 3 && parts[1].end > 4);
  assert.ok(parts[0].end <= parts[1].start);
});

test('streaming chunks produce the same two candidate sounds', () => {
  const detector = new StreamSegmenter(rate);
  const samples = recording();
  const parts = [];
  for (let i = 0; i < samples.length; i += 777)
    parts.push(...detector.push(samples.subarray(i, i + 777)));
  parts.push(...detector.flush());
  assert.equal(parts.length, 2);
  assert.ok(parts.every((part) => part.samples.length > rate));
});

test('slices of one recording count as one training source', () => {
  const clips = Array.from({ length: 6 }, (_, index) => ({
    sourceId: index < 3 ? 'same-recording' : `other-${index}`,
    category: index < 3 ? '轻敲' : '摩擦',
  }));
  assert.equal(readiness(clips, 'category').ready, false);
  assert.equal(readiness(clips, 'category').counts['轻敲'], 1);
});

test('a trained category model estimates a new segment while preference remains untrained', () => {
  const clips = [];
  for (const kind of ['轻敲', '摩擦'])
    for (let index = 0; index < 3; index++) {
      const sound = synthetic(kind, index + 1);
      clips.push({ sourceId: `${kind}-${index}`, category: kind,
        features: features(sound.samples, sound.rate) });
    }
  const model = train(clips, 'category');
  const sound = synthetic('轻敲', 9);
  const result = analyze(sound.samples, sound.rate, { category: model, preference: null }, clips);
  assert.equal(result.category.label, '轻敲');
  assert.equal(result.preference, null);
});
