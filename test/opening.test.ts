import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { classifyOpening } from '../src/opening.ts';

function kif(moves: string[]): string {
  return ['手合割：平手', ...moves.map((m, i) => `${i + 1} ${m}`)].join('\n');
}

test('四間飛車・本美濃 vs 居飛車穴熊', () => {
  const g = parseKif(kif([
    '７六歩(77)', '３四歩(33)', '６八飛(28)', '８四歩(83)', '４八玉(59)', '８五歩(84)',
    '７七角(88)', '４二玉(51)', '３八玉(48)', '３二玉(42)', '２八玉(38)', '３三角(22)',
    '３八銀(39)', '１二香(11)', '５八金(69)', '２二玉(32)', '１六歩(17)', '１一玉(22)', '投了',
  ]));
  const r = classifyOpening(g);
  assert.equal(r.matchup, '対抗形');
  assert.equal(r.sente.rookStyle, '四間飛車');
  assert.equal(r.sente.castle, '本美濃');
  assert.equal(r.gote.castle, '居飛車穴熊');
  assert.equal(r.opening, '四間飛車 vs 居飛車持久戦');
  assert.deepEqual(g.result, { winner: 'gote', reason: '投了' });
});

test('角換わり', () => {
  const r = classifyOpening(parseKif(kif([
    '２六歩(27)', '８四歩(83)', '２五歩(26)', '８五歩(84)', '７八金(69)', '３二金(41)',
    '７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)', '投了',
  ])));
  assert.equal(r.bishopExchange, true);
  assert.equal(r.opening, '角換わり');
});

test('横歩取り', () => {
  const r = classifyOpening(parseKif(kif([
    '７六歩(77)', '３四歩(33)', '２六歩(27)', '８四歩(83)', '２五歩(26)', '８五歩(84)',
    '７八金(69)', '３二金(41)', '２四歩(25)', '同　歩(23)', '同　飛(28)', '２三歩打', '３四飛(24)', '投了',
  ])));
  assert.equal(r.opening, '横歩取り');
});

test('相振り飛車：石田流 vs 中飛車', () => {
  const r = classifyOpening(parseKif(kif([
    '７六歩(77)', '３四歩(33)', '７五歩(76)', '５二飛(82)', '７八飛(28)', '５四歩(53)', '７六飛(78)', '投了',
  ])));
  assert.equal(r.matchup, '相振り飛車');
  assert.equal(r.sente.rookStyle, '石田流');
  assert.equal(r.gote.rookStyle, '中飛車');
});

test('lishogi の実棋譜5局', () => {
  const text = readFileSync(new URL('./fixtures/lishogi-sample.kif', import.meta.url), 'utf8');
  const games = splitKifGames(text).map(parseKif);
  assert.equal(games.length, 5);
  const got = games.map((g) => [g.headers['場所'].slice(-8), classifyOpening(g).opening, g.result.winner]);
  assert.deepEqual(got, [
    ['4E1MAU0Z', '石田流 vs 居飛車急戦', 'gote'],
    ['0PtL5b8b', '矢倉（先手右四間飛車）', 'gote'],
    ['F9z06xAh', '角換わり（先手袖飛車）', 'sente'],
    ['bbIKWyCX', '矢倉', 'gote'],
    ['AeIFLeBo', '矢倉', 'gote'],
  ]);
});
