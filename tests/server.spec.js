import { test, expect } from '@playwright/test';
import { createMatch, moveMatch, packMatch, restoreMatch } from '../server/match.js';

test('server rejects invalid and out-of-turn moves without mutating the game', () => {
  const match = createMatch('chess');
  const before = packMatch(match);
  expect(() => moveMatch(match, 1, { from: { r: 6, c: 4 }, to: { r: 4, c: 4 } })).toThrow();
  expect(() => moveMatch(match, 0, { from: { r: 6, c: 4 }, to: { r: 0, c: 4 } })).toThrow();
  expect(packMatch(match)).toEqual(before);
  moveMatch(match, 0, { from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
  expect(match.revision).toBe(1);
  const restored = restoreMatch(JSON.parse(JSON.stringify(packMatch(match, false))));
  expect(restored.data.fen()).toBe(match.data.fen());
  expect(restored.data.history()).toEqual(['e4']);
});

test('unrevealed military identities never appear in public snapshots', () => {
  const match = createMatch('junqi', 'flip');
  expect(packMatch(match).data.board.flat().every((p) => Object.keys(p).join() === 'revealed')).toBe(true);
  moveMatch(match, 0, { kind: 'flip', to: { r: 0, c: 0 } });
  const snapshot = packMatch(match);
  expect(snapshot.data.board.flat().filter((p) => p.type)).toHaveLength(1);
  expect(snapshot.remaining).toEqual({ red: 18, black: 18 });
});
