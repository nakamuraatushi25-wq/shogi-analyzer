import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureSquares } from '../src/captures.ts';
import { parseKif } from '../src/kif.ts';

test('駒を取ったマスを取った側から見た座標で記録する', () => {
  const g = parseKif(['手合割：平手', '1 ７六歩(77)', '2 ３四歩(33)', '3 ２二角成(88)', '4 同　銀(31)', '5 投了'].join('\n'));
  const c = captureSquares(g);
  // 先手は2二で角を取り、後手は2二（後手から見ると8八）で馬を取り返した
  assert.deepEqual(c.sente, [{ ply: 3, file: 2, rank: 2, by: 'KA', captured: 'KA' }]);
  assert.deepEqual(c.gote, [{ ply: 4, file: 8, rank: 8, by: 'GI', captured: 'UM' }]);
});
