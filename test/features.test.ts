import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { attackRatio, extractFeatures } from '../src/features.ts';
import { compare, summarize } from '../src/baseline.ts';
import { buildWinBaseline, reportAgainstBaseline, samplesFrom } from '../src/analyze.ts';

const kif = (moves: string[]) => ['手合割：平手', ...moves.map((m, i) => `${i + 1} ${m}`)].join('\n');

test('駒×場所×指し／打ちと金銀の上げ下げを数える', () => {
  const f = extractFeatures(parseKif(kif(['７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)', '４五角打', '投了'])));
  assert.equal(f.sente.ownMoves.all, 3);
  assert.deepEqual(f.sente.counts.all, {
    'move:FU:middle': 1,
    promote: 1, 'capture:KA': 1, 'move:UM:enemy': 1,
    'drop:KA:middle': 1,
    attack: 2, defense: 1,
  });
  assert.equal(f.gote.counts.all['up:GI:own'], 1);
  assert.equal(f.gote.counts.all['capture:UM'], 1);
  assert.equal(f.sente.rates.all['drop:KA:middle'], 1 / 3);
  assert.equal(attackRatio(f.sente, 'all'), 2 / 3);
});

test('z スコアは局数の少ないユーザーほど基準に引き寄せる', () => {
  const base = { n: 100, mean: { x: 0.1 }, std: { x: 0.05 } };
  const [d] = compare({ n: 10, mean: { x: 0.2 }, std: { x: 0 } }, base, 10);
  assert.equal(d.feature, 'x');
  assert.ok(Math.abs(d.z - 0.05 / (0.05 / Math.sqrt(10))) < 1e-9);
  assert.deepEqual(summarize([{ a: 1 }, { a: 3 }]), { n: 2, mean: { a: 2 }, std: { a: Math.SQRT2 } });
});

test('実棋譜で戦型別の勝ち局基準とユーザーの比較が動く', () => {
  const text = readFileSync(new URL('./fixtures/lishogi-sample.kif', import.meta.url), 'utf8');
  const games = splitKifGames(text).map(parseKif);
  const all = samplesFrom(games, 'middle');
  assert.equal(all.length, 10);
  const mine = samplesFrom(games, 'middle', 'KEN0057');
  assert.equal(mine.length, 5);
  const report = reportAgainstBaseline(mine, buildWinBaseline(all));
  assert.ok(report.length > 0);
  for (const r of report) assert.ok(r.deviations.every((d) => Number.isFinite(d.z)));
});
