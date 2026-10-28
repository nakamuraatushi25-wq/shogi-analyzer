import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/board.ts';
import { castleWatch, keySquares } from '../src/castleWatch.ts';
import { parseKif } from '../src/kif.ts';
import { detect, techniques, type PlyInfo } from '../src/techniques.ts';
import type { Color, Move, PieceType } from '../src/types.ts';

// 駒を置いた盤を作る。'v' で始まると後手の駒。例: ['v玉82', '銀77']
const NAMES: Record<string, PieceType> = { 歩: 'FU', 香: 'KY', 桂: 'KE', 銀: 'GI', 金: 'KI', 角: 'KA', 飛: 'HI', 玉: 'OU', と: 'TO', 馬: 'UM', 龍: 'RY' };
function board(pieces: string[]): Board {
  const b = new Board();
  b.squares = Array.from({ length: 10 }, () => Array(10).fill(null));
  for (const s of pieces) {
    const gote = s.startsWith('v');
    const [name, f, r] = [...(gote ? s.slice(1) : s)];
    b.squares[Number(f)][Number(r)] = { color: gote ? 'gote' : 'sente', type: NAMES[name] };
  }
  return b;
}
// 盤に1手指して、その手で見つかった手筋を返す
function play(b: Board, move: string, color: Color = 'sente', last?: PlyInfo, mine?: PlyInfo): string[] {
  const ply = color === 'sente' ? 1 : 2;
  const drop = /^(.)\*(\d)(\d)$/.exec(move);
  const m: Move = drop
    ? { kind: 'drop', ply, piece: NAMES[drop[1]], to: { file: Number(drop[2]), rank: Number(drop[3]) } }
    : { kind: 'move', ply, piece: b.at({ file: Number(move[0]), rank: Number(move[1]) })!.type,
      from: { file: Number(move[0]), rank: Number(move[1]) }, to: { file: Number(move[2]), rank: Number(move[3]) }, promote: move.endsWith('+') };
  const piece = m.kind === 'drop' ? m.piece : b.at(m.from)!.type;
  const target = b.at(m.to);
  if (drop) b.hands[color][m.piece] = 1;
  b.apply(m);
  return detect(b, color, m, piece, target ? target.type : null, last, mine);
}

test('歩の手筋: 垂れ歩・叩きの歩・合わせの歩・底歩・焦点の歩', () => {
  assert.deepEqual(play(board(['v角22']), '歩*24'), ['垂れ歩']);
  assert.deepEqual(play(board(['v飛82']), '歩*83'), ['叩きの歩']);
  assert.deepEqual(play(board(['v歩84']), '歩*85'), ['合わせの歩']);
  assert.deepEqual(play(board([]), '歩*49'), ['底歩']);
  // 3三には後手の桂と金が利いている。取られるところへの歩は垂れ歩にしない
  assert.deepEqual(play(board(['v桂21', 'v金43']), '歩*33'), ['焦点の歩']);
});

test('継ぎ歩と連打の歩は、直前に取られたマスの前にもう一度歩を打つ', () => {
  const sq = { file: 8, rank: 4 };
  const push: PlyInfo = { color: 'sente', to: sq, piece: 'FU', drop: false, captured: false };
  const dropped: PlyInfo = { ...push, drop: true };
  const took: PlyInfo = { color: 'gote', to: sq, piece: 'FU', drop: false, captured: true };
  assert.deepEqual(play(board(['v歩84']), '歩*85', 'sente', took, push), ['継ぎ歩']);
  assert.deepEqual(play(board(['v飛84']), '歩*85', 'sente', { ...took, piece: 'HI' }, dropped), ['連打の歩']);
});

test('桂・銀・金の手筋', () => {
  assert.deepEqual(play(board(['v金42', 'v飛62']), '桂*54'), ['ふんどしの桂']);
  assert.deepEqual(play(board(['v歩13']), '桂*26'), ['控えの桂']);
  assert.deepEqual(play(board(['v桂55']), '銀*56'), ['桂頭の銀']);
  assert.deepEqual(play(board(['v金62', 'v飛42']), '銀*51'), ['割り打ちの銀']);
  assert.deepEqual(play(board(['v玉51']), '金*52'), ['頭金']);
  assert.deepEqual(play(board(['v玉51']), '金*41'), ['腹金']);
  assert.deepEqual(play(board(['v玉52']), '金*51'), ['尻金']);
  assert.deepEqual(play(board(['歩55', '銀57']), '5756'), ['位の確保']);
});

test('大駒と香の手筋: 田楽刺し・王手飛車・両取り・一間竜・空き王手・自陣飛車', () => {
  assert.deepEqual(play(board(['v玉91', 'v角92']), '香*96'), ['田楽刺し']);
  assert.deepEqual(play(board(['v玉11', 'v飛77']), '角*44'), ['王手飛車']);
  assert.deepEqual(play(board(['v金13', 'v銀57']), '角*35'), ['両取り']);
  // 狙った駒より高い駒で、ひもの付いた駒を狙っても取りにならない
  assert.deepEqual(play(board(['v金13', 'v銀57', 'v桂21', 'v金58']), '角*35'), []);
  assert.deepEqual(play(board(['v玉82', '龍53']), '5362'), ['一間竜']);
  assert.deepEqual(play(board(['v玉51', '銀53', '飛58']), '5344'), ['空き王手']);
  assert.deepEqual(play(board([]), '飛*38'), ['自陣飛車']);
});

test('棋譜を通して、突き捨てと大駒切りは次の手まで見て決める', () => {
  const kif = `手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)
   2 ８四歩(83)
   3 ２五歩(26)
   4 ８五歩(84)
   5 ２四歩(25)
   6 同　歩(23)
   7 ２五歩打
   8 投了
`;
  const r = techniques(parseKif(kif));
  assert.deepEqual(r.sente.events.map((e) => [e.ply, e.name]), [[5, '突き捨て'], [7, '継ぎ歩']]);
  assert.deepEqual(r.gote.events, []);
});

test('囲いの急所は玉の斜め前・前・横と玉頭', () => {
  assert.deepEqual(keySquares({ file: 8, rank: 8 }).map((s) => s.file * 10 + s.rank), [77, 87, 97, 78, 98, 86]);
  assert.deepEqual(keySquares({ file: 9, rank: 9 }).map((s) => s.file * 10 + s.rank), [88, 98, 89, 97]);
});

test('守り駒が動いた手数と取られた手数を記録する', () => {
  // ▲7六歩 △3四歩 で囲いの局面とし、▲6八銀（玉の守り駒の銀が動く）
  const kif = `手合割：平手
手数----指手---------消費時間--
   1 ７六歩(77)
   2 ３四歩(33)
   3 ６八銀(79)
   4 ４二玉(51)
   5 投了
`;
  const w = castleWatch(parseKif(kif), 2)!;
  const silver = w.sente.defenders.find((d) => d.file === 7 && d.rank === 9)!;
  assert.equal(silver.moved, 3);
  assert.equal(silver.captured, null);
  assert.equal(w.gote.kingMoved, 4);
  assert.equal(w.sente.kingMoved, null);
});
