import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invasions } from '../src/invasions.ts';
import { parseKif } from '../src/kif.ts';

test('4段目以下から敵陣に入った手を数える', () => {
  // ▲7六歩 △3四歩 ▲2二角成 △同銀 ▲5五角打 △4二玉 ▲7三角成
  const kif = `手合割：平手
手数----指手---------消費時間--
   1 ７六歩(77)
   2 ３四歩(33)
   3 ２二角成(88)
   4 同　銀(31)
   5 ５五角打
   6 ４二玉(51)
   7 ７三角成(55)
   8 投了
`;
  const r = invasions(parseKif(kif));
  assert.deepEqual(r.sente, [
    { ply: 3, file: 2, rank: 2, piece: 'KA', drop: false },
    { ply: 7, file: 7, rank: 3, piece: 'KA', drop: false },
  ]);
  assert.deepEqual(r.gote, []);
});
