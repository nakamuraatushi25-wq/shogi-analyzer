import { Board, toRelative } from './board.ts';
import type { Color, Game, PieceType } from './types.ts';

// 駒が敵陣（その側から見て1〜3段目）に入った手。盤上で4段目以下から入った手と、敵陣に打った手を数え、
// 敵陣の中での移動は数えない。piece は動かす前の種類、drop は打って入ったか
export type InvasionAt = { ply: number; file: number; rank: number; piece: PieceType; drop: boolean };

export function invasions(game: Game): Record<Color, InvasionAt[]> {
  const out: Record<Color, InvasionAt[]> = { sente: [], gote: [] };
  const board = new Board();
  for (const move of game.moves) {
    const color: Color = move.ply % 2 === 1 ? 'sente' : 'gote';
    const to = toRelative(color, move.to);
    const piece = move.kind === 'drop' ? move.piece : board.at(move.from)?.type;
    const fromRank = move.kind === 'move' ? toRelative(color, move.from).rank : null;
    board.apply(move);
    if (!piece || to.rank > 3 || (fromRank !== null && fromRank <= 3)) continue;
    out[color].push({ ply: move.ply, file: to.file, rank: to.rank, piece, drop: move.kind === 'drop' });
  }
  return out;
}
