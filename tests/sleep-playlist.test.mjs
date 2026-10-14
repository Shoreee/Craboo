import test from 'node:test';
import assert from 'node:assert/strict';
import { playable } from '../src/state.js';

test('sleep playback uses saved clips even when the old sequence is empty', () => {
  const clips = [
    { id: 'one', audio: 'data:audio/wav;base64,AA==', preference: '' },
    { id: 'two', audio: 'data:audio/wav;base64,AA==', preference: '安抚' },
    { id: 'three', audio: 'data:audio/wav;base64,AA==', preference: '不喜欢' },
  ];
  assert.deepEqual(playable({ clips, sequence: [] }).map((clip) => clip.id), ['two', 'one']);
  assert.deepEqual(playable({ clips, sequence: ['one'] }).map((clip) => clip.id), ['two', 'one']);
});

test('a saved archive still plays when every clip is marked disliked', () => {
  const clips = [
    { id: 'a', audio: 'data:audio/wav;base64,AA==', preference: '不喜欢' },
    { id: 'b', audio: 'data:audio/wav;base64,AA==', preference: '不喜欢' },
  ];
  assert.deepEqual(playable({ clips, sequence: [] }).map((clip) => clip.id), ['a', 'b']);
  assert.deepEqual(playable({ clips }).map((clip) => clip.id), ['a', 'b']);
});
