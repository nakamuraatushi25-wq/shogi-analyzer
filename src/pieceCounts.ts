import { Board } from './board.ts';
import type { Color, Game, PieceType } from './types.ts';

// 成駒は元の駒として数える（と→歩、馬→角、龍→飛 など）
const BASE: Record<PieceType, PieceType> = {
  FU: 'FU', KY: 'KY', KE: 'KE', GI: 'GI', KI: 'KI', KA: 'KA', HI: 'HI', OU: 'OU',
  TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI',
};

// 序中盤として比べる手数。これより短い局は序中盤の集計から外す
export const WINDOW_PLY = 60;

export const PIECE_NAMES_JA: Record<string, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
};

export type PieceCounts = {
  // 自分が指した手数
  moves: number;
  // `move:<駒>` 盤上の駒を動かした回数 / `drop:<駒>` 打った回数
  counts: Record<string, number>;
};

/**
 * 先手・後手それぞれが、どの駒を何回動かし、何回打ったかを数える。
 * maxPly を渡すと、その手数までだけを数える（勝ち負けで総手数が違う影響を避けるため）。
 */
export function countPieceMoves(game: Game, maxPly = Number.POSITIVE_INFINITY): Record<Color, PieceCounts> {
  const out: Record<Color, PieceCounts> = { sente: { moves: 0, counts: {} }, gote: { moves: 0, counts: {} } };
  const board = new Board();
  for (const move of game.moves) {
    if (move.ply > maxPly) break;
    const side = out[move.ply % 2 === 1 ? 'sente' : 'gote'];
    const type = move.kind === 'drop' ? move.piece : (board.at(move.from)?.type ?? move.piece);
    const key = `${move.kind === 'drop' ? 'drop' : 'move'}:${BASE[type]}`;
    side.counts[key] = (side.counts[key] ?? 0) + 1;
    side.moves++;
    board.apply(move);
  }
  return out;
}
