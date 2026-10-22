import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackMap } from '../src/attacks.ts';
import { Board } from '../src/board.ts';
import { parseKif } from '../src/kif.ts';
import { winPatternMetrics } from '../src/winPatterns.ts';

function kif(moves: string[]): string {
  return ['手合割：平手', ...moves.map((m, i) => `${i + 1} ${m}`)].join('\n');
}

test('初期配置の利き：2七には飛車だけ、7七には角と桂が利く', () => {
  const m = attackMap(new Board(), 'sente');
  assert.equal(m[2][7], 1);
  assert.equal(m[7][7], 2);
  assert.equal(m[5][1], 0);
  assert.equal(attackMap(new Board(), 'gote')[3][3], 2); // 後手の角と桂
});

test('歩と角しか取り合っていない局は仕掛けの局面がない', () => {
  assert.equal(winPatternMetrics(parseKif(kif(['７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)', '投了']))), null);
});

test('仕掛けの局面で玉の周りの金銀・前に出た駒・動いていない駒を数える', () => {
  const m = winPatternMetrics(parseKif(kif([
    '７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)', '５五角打', '４二玉(51)', '２二角成(55)', '投了',
  ])));
  assert.ok(m);
  assert.equal(m.fightPly, 7);
  assert.equal(m.sente.kingGuards, 2);
  assert.equal(m.sente.advanced, 1);
  assert.equal(m.sente.unmoved, 9);
  assert.equal(m.sente.unmovedMajor, 5);
  assert.equal(m.sente.defenseShare, 0);
  assert.equal(m.gote.kingGuards, 1);
  assert.equal(m.gote.defenseShare, 1 / 3);
  // 20手後まで続いていないので、中盤の指標はない
  assert.equal(m.sente.pressure, null);
});
