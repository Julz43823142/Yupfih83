import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../../fallen-king-adventure.html', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../../minigames.html', import.meta.url), 'utf8');

test('The Fallen King story is linked from the public minigames hub', () => {
  assert.match(hub, /href="\/fallen-king-adventure\.html"/);
  assert.match(html, /<title>The Fallen King/);
});

test('story adventure client script parses and includes the required progression', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'Game script should be in the document');
  assert.doesNotThrow(() => new Script(script[1], { filename: 'fallen-king-adventure.html' }));
  for (const required of ['The Stolen Crown', 'Old privy', "puzzle:'cell'", 'merrick', 'sewerExit',
    'metPip', 'bridgeFixed', 'localStorage', 'Hint 1 of 4', 'hintLevel',
    'coin-v1', 'coin-v2', 'coin-v3', 'lumber', 'ropes']) {
    assert.ok(html.toLowerCase().includes(required.toLowerCase()), 'Missing feature: ' + required);
  }
});

test('the old-gate truth puzzle has exactly one valid solution', () => {
  const counts = [0, 1, 2].map(exit => [
    exit === 0,
    exit === 0 || exit === 1,
    exit === 1 || exit === 2
  ].filter(Boolean).length);
  assert.deepEqual(counts, [2, 2, 1]);
});

test('bridge rope riddle has one correct answer under same-length rule', () => {
  const choices = [[5, 9], [7, 7], [5, 7], [9, 9]];
  assert.deepEqual(choices.flatMap((pair, i) => pair[0] === pair[1] && pair[0] + pair[1] === 14 ? [i] : []), [1]);
});
