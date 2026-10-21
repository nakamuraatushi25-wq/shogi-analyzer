import type { Color, Move, Piece, PieceType, Square } from './types.ts';

const PROMOTE: Partial<Record<PieceType, PieceType>> = {
  FU: 'TO', KY: 'NY', KE: 'NK', GI: 'NG', KA: 'UM', HI: 'RY',
};
const UNPROMOTE: Partial<Record<PieceType, PieceType>> = {
  TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI',
};

export type Hand = Partial<Record<PieceType, number>>;

export type Capture = { ply: number; by: Color; captured: PieceType };

export class Board {
  // squares[file][rank]、添字0は使わない
  squares: (Piece | null)[][];
  hands: Record<Color, Hand> = { sente: {}, gote: {} };

  constructor() {
    this.squares = Array.from({ length: 10 }, () => Array<Piece | null>(10).fill(null));
    const back: PieceType[] = ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY'];
    for (let f = 1; f <= 9; f++) {
      this.squares[f][9] = { color: 'sente', type: back[9 - f] };
      this.squares[f][1] = { color: 'gote', type: back[f - 1] };
      this.squares[f][7] = { color: 'sente', type: 'FU' };
      this.squares[f][3] = { color: 'gote', type: 'FU' };
    }
    this.squares[2][8] = { color: 'sente', type: 'HI' };
    this.squares[8][8] = { color: 'sente', type: 'KA' };
    this.squares[8][2] = { color: 'gote', type: 'HI' };
    this.squares[2][2] = { color: 'gote', type: 'KA' };
  }

  at(sq: Square): Piece | null {
    return this.squares[sq.file][sq.rank];
  }

  // 指し手を盤に反映する。合法性は確認しない（棋譜は正しい前提）
  apply(move: Move): Capture | null {
    const color: Color = move.ply % 2 === 1 ? 'sente' : 'gote';
    if (move.kind === 'drop') {
      const hand = this.hands[color];
      hand[move.piece] = (hand[move.piece] ?? 1) - 1;
      this.squares[move.to.file][move.to.rank] = { color, type: move.piece };
      return null;
    }
    const piece = this.at(move.from);
    if (!piece) throw new Error(`${move.ply}手目: 移動元 ${move.from.file}${move.from.rank} に駒がありません`);
    const target = this.at(move.to);
    let capture: Capture | null = null;
    if (target) {
      const base = UNPROMOTE[target.type] ?? target.type;
      this.hands[color][base] = (this.hands[color][base] ?? 0) + 1;
      capture = { ply: move.ply, by: color, captured: target.type };
    }
    const type = move.promote ? (PROMOTE[piece.type] ?? piece.type) : piece.type;
    this.squares[move.from.file][move.from.rank] = null;
    this.squares[move.to.file][move.to.rank] = { color, type };
    return capture;
  }

  // 指定した側から見た座標で駒を返す（後手なら盤を180度回す）
  relative(color: Color, file: number, rank: number): Piece | null {
    return color === 'sente' ? this.squares[file][rank] : this.squares[10 - file][10 - rank];
  }

  findKing(color: Color): Square | null {
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        const p = this.squares[f][r];
        if (p && p.color === color && p.type === 'OU') return { file: f, rank: r };
      }
    }
    return null;
  }
}

// 指した側から見た座標に直す
export function toRelative(color: Color, sq: Square): Square {
  return color === 'sente' ? sq : { file: 10 - sq.file, rank: 10 - sq.rank };
}
