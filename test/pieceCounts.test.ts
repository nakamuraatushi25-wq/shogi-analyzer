import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKif } from '../src/kif.ts';
import { countPieceMoves } from '../src/pieceCounts.ts';
import { rankBand } from '../src/ranks.ts';

function kif(moves: string[]): string {
  return ['手合割：平手', ...moves.map((m, i) => `${i + 1} ${m}`)].join('\n');
}

test('駒ごとに動かした回数と打った回数を数え、成駒は元の駒に含める', () => {
  const g = parseKif(kif([
    '７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)', '４五角打', '投了',
  ]));
  const c = countPieceMoves(g);
  assert.deepEqual(c.sente, { moves: 3, counts: { 'move:FU': 1, 'move:KA': 1, 'drop:KA': 1 } });
  assert.deepEqual(c.gote, { moves: 2, counts: { 'move:FU': 1, 'move:GI': 1 } });
  assert.equal(countPieceMoves(g, 2).sente.moves, 1);
});

test('段級位を段位帯に分ける', () => {
  assert.equal(rankBand('7級'), '6級以下');
  assert.equal(rankBand('1級'), '5〜1級');
  assert.equal(rankBand('初段'), '初段〜二段');
  assert.equal(rankBand('四段'), '三段〜四段');
  assert.equal(rankBand('六段'), '五段以上');
  assert.equal(rankBand(null), null);
});
