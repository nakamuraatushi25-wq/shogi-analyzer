import { attackMap } from './attacks.ts';
import { Board, toRelative } from './board.ts';
import type { Color, Game, PieceType, Square } from './types.ts';

// 囲いの急所への利きと、守り駒が崩れる順番を記録する。
// 急所は、囲いを組み終えた局面（src/opening.ts の castlePly）の玉の位置から決める:
// 玉の斜め前・真ん前・横の5マスと、玉頭（2つ前）の1マス。矢倉なら7七・8七・9七・7八・9八・8六、美濃なら1七・2七・3七・1八・3八・2六
// 守り駒は、その局面で玉から2マス以内にいる自分の金銀
export type Defender = { type: PieceType; file: number; rank: number; moved: number | null; captured: number | null };
export type CastleWatch = {
  // 囲いの局面の玉の位置（自分側から見た座標）
  king: Square;
  // 急所のマス（自分側から見た座標）
  key: Square[];
  // 囲いの局面から SAMPLE_OFFSETS 手後ごとの [手数, 急所への相手の利きの合計, 自分の利きの合計]
  samples: [number, number, number][];
  // 急所のどこかで相手の利きが自分の利きを初めて上回った手数
  outnumbered: number | null;
  defenders: Defender[];
  // 囲いを組んだ後に玉が初めて動いた手数
  kingMoved: number | null;
};

// 囲いの局面はふつう仕掛けの直前なので、仕掛けからの手数で見ることになる
export const SAMPLE_OFFSETS = [1, 10, 20, 30, 40];

export function keySquares(king: Square): Square[] {
  const { file: f, rank: r } = king;
  return [[f - 1, r - 1], [f, r - 1], [f + 1, r - 1], [f - 1, r], [f + 1, r], [f, r - 2]]
    .filter(([ff, rr]) => ff >= 1 && ff <= 9 && rr >= 1 && rr <= 9)
    .map(([file, rank]) => ({ file, rank }));
}

export function castleWatch(game: Game, castlePly: number): Record<Color, CastleWatch> | null {
  const board = new Board();
  const moves = game.moves;
  let i = 0;
  for (; i < moves.length && moves[i].ply <= castlePly; i++) board.apply(moves[i]);
  const setup = (color: Color) => {
    const k = board.findKing(color);
    if (!k) return null;
    const king = toRelative(color, k);
    const key = keySquares(king);
    // 盤上の座標（筋*10+段）→ 守り駒
    const where = new Map<number, Defender>();
    const defenders: Defender[] = [];
    for (let f = 1; f <= 9; f++) for (let r = 1; r <= 9; r++) {
      const p = board.squares[f][r];
      if (!p || p.color !== color || (p.type !== 'KI' && p.type !== 'GI')) continue;
      const rel = toRelative(color, { file: f, rank: r });
      if (Math.max(Math.abs(rel.file - king.file), Math.abs(rel.rank - king.rank)) > 2) continue;
      const d: Defender = { type: p.type, file: rel.file, rank: rel.rank, moved: null, captured: null };
      defenders.push(d);
      where.set(f * 10 + r, d);
    }
    const w: CastleWatch = { king, key, samples: [], outnumbered: null, defenders, kingMoved: null };
    return { w, where, keyAbs: key.map((s) => toRelative(color, s)) };
  };
  const s = setup('sente'), g = setup('gote');
  if (!s || !g) return null;
  const sides = { sente: s, gote: g };

  let si = 0;
  for (; i < moves.length; i++) {
    const move = moves[i];
    const color: Color = move.ply % 2 === 1 ? 'sente' : 'gote';
    const opp = sides[color === 'sente' ? 'gote' : 'sente'];
    const mine = sides[color];
    const toKey = move.to.file * 10 + move.to.rank;
    const lost = opp.where.get(toKey);
    if (lost) { lost.captured = move.ply; opp.where.delete(toKey); }
    if (move.kind === 'move') {
      const fromKey = move.from.file * 10 + move.from.rank;
      const d = mine.where.get(fromKey);
      if (d) {
        d.moved ??= move.ply;
        mine.where.delete(fromKey);
        mine.where.set(toKey, d);
      }
      if (mine.w.kingMoved === null && board.at(move.from)?.type === 'OU') mine.w.kingMoved = move.ply;
    }
    board.apply(move);

    const sample = si < SAMPLE_OFFSETS.length && move.ply === castlePly + SAMPLE_OFFSETS[si];
    const needOutnumbered = s.w.outnumbered === null || g.w.outnumbered === null;
    if (!sample && !needOutnumbered) continue;
    const maps = { sente: attackMap(board, 'sente'), gote: attackMap(board, 'gote') };
    for (const c of ['sente', 'gote'] as const) {
      const side = sides[c];
      const em = maps[c === 'sente' ? 'gote' : 'sente'], om = maps[c];
      let atk = 0, def = 0, over = false;
      for (const sq of side.keyAbs) {
        atk += em[sq.file][sq.rank];
        def += om[sq.file][sq.rank];
        if (em[sq.file][sq.rank] > om[sq.file][sq.rank]) over = true;
      }
      if (over && side.w.outnumbered === null) side.w.outnumbered = move.ply;
      if (sample) side.w.samples.push([move.ply, atk, def]);
    }
    if (sample) si++;
  }
  return { sente: s.w, gote: g.w };
}
