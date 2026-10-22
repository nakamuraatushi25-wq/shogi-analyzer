import { Board, toRelative } from './board.ts';
import type { Color, Game, PieceType } from './types.ts';

// 駒を取った手。マスは取った側から見た座標（後手なら盤を180度回す）で、相手の駒は取られる前の種類
export type CaptureAt = { ply: number; file: number; rank: number; captured: PieceType };

export function captureSquares(game: Game): Record<Color, CaptureAt[]> {
  const out: Record<Color, CaptureAt[]> = { sente: [], gote: [] };
  const board = new Board();
  for (const move of game.moves) {
    const target = board.at(move.to);
    const capture = board.apply(move);
    if (!capture || !target) continue;
    const sq = toRelative(capture.by, move.to);
    out[capture.by].push({ ply: move.ply, file: sq.file, rank: sq.rank, captured: target.type });
  }
  return out;
}
