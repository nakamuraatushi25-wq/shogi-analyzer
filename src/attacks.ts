import type { Board } from './board.ts';
import type { Color, PieceType } from './types.ts';

// 駒の動き。[筋の変化, 前方向への変化] で、前は先手なら段が減る向き
type Step = [number, number];
const GOLD: Step[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
const KING: Step[] = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG: Step[] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const ORTHO: Step[] = [[0, 1], [-1, 0], [1, 0], [0, -1]];

const STEPS: Record<PieceType, Step[]> = {
  FU: [[0, 1]], KY: [], KE: [[-1, 2], [1, 2]], GI: [[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]],
  KI: GOLD, TO: GOLD, NY: GOLD, NK: GOLD, NG: GOLD, OU: KING,
  KA: [], HI: [], UM: ORTHO, RY: DIAG,
};
const SLIDES: Partial<Record<PieceType, Step[]>> = {
  KY: [[0, 1]], KA: DIAG, UM: DIAG, HI: ORTHO, RY: ORTHO,
};

/** 各マスにその側の駒がいくつ利いているか。添字は [筋][段]（盤上の座標そのまま） */
export function attackMap(board: Board, color: Color): number[][] {
  const map = Array.from({ length: 10 }, () => Array<number>(10).fill(0));
  const forward = color === 'sente' ? -1 : 1;
  const inside = (f: number, r: number) => f >= 1 && f <= 9 && r >= 1 && r <= 9;
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const p = board.squares[f][r];
      if (!p || p.color !== color) continue;
      for (const [df, dr] of STEPS[p.type]) {
        const tf = f + df;
        const tr = r + dr * forward;
        if (inside(tf, tr)) map[tf][tr]++;
      }
      for (const [df, dr] of SLIDES[p.type] ?? []) {
        let tf = f + df;
        let tr = r + dr * forward;
        while (inside(tf, tr)) {
          map[tf][tr]++;
          if (board.squares[tf][tr]) break;
          tf += df;
          tr += dr * forward;
        }
      }
    }
  }
  return map;
}
