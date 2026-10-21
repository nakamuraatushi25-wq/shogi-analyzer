import { Board, toRelative } from './board.ts';
import type { Color, Game, PieceType, Square } from './types.ts';

// 指した側から見た段で 1-3 段目＝敵陣、4-6 段目＝中段、7-9 段目＝自陣
export type Zone = 'enemy' | 'middle' | 'own';
export type Phase = 'all' | 'early' | 'middle' | 'late';

export const PHASES: Phase[] = ['all', 'early', 'middle', 'late'];

// 特徴量名 → 1手あたりの頻度（その局面区間で自分が指した手数で割った値）
export type FeatureVector = Record<string, number>;

export type SideFeatures = {
  color: Color;
  ownMoves: Record<Phase, number>;
  // 割る前の回数
  counts: Record<Phase, Record<string, number>>;
  rates: Record<Phase, FeatureVector>;
};

export type GameFeatures = { sente: SideFeatures; gote: SideFeatures; plies: number };

function zoneOf(sq: Square): Zone {
  return sq.rank <= 3 ? 'enemy' : sq.rank <= 6 ? 'middle' : 'own';
}

function manhattan(a: Square, b: Square): number {
  return Math.abs(a.file - b.file) + Math.abs(a.rank - b.rank);
}

// 総手数を3等分して序盤・中盤・終盤に分ける（大森・金子 2015 と同じ区切り）
function phaseOf(ply: number, total: number): Exclude<Phase, 'all'> {
  const third = total / 3;
  return ply <= third ? 'early' : ply <= third * 2 ? 'middle' : 'late';
}

function emptySide(color: Color): SideFeatures {
  const z = () => ({ all: 0, early: 0, middle: 0, late: 0 });
  return {
    color,
    ownMoves: z(),
    counts: { all: {}, early: {}, middle: {}, late: {} },
    rates: { all: {}, early: {}, middle: {}, late: {} },
  };
}

/**
 * 1局から、先手・後手それぞれの特徴量を数える。
 *
 * 特徴量（すべて自分の手だけを数える）:
 * - `move:<駒>:<場所>`   その駒を盤上で動かした回数（行き先の場所）。成った手は成駒として数える
 * - `drop:<駒>:<場所>`   その駒を打った回数
 * - `up:<GI|KI>:<場所>` / `down:<GI|KI>:<場所>`  金銀を上げた・引いた回数（移動元の場所）
 * - `capture:<取った駒>` 駒を取った回数
 * - `promote`            成った回数
 * - `attack` / `defense` 動かした駒が相手玉に近ければ攻め、自玉に近ければ受け（同じなら攻め、玉の手は数えない）
 * 位置の特徴量は 澤・伊藤 (GPW2012)、攻め／受けは 大森・金子 (GPW2015) にならった。
 */
export function extractFeatures(game: Game): GameFeatures {
  const total = game.moves.length;
  const sides: Record<Color, SideFeatures> = { sente: emptySide('sente'), gote: emptySide('gote') };
  const board = new Board();

  for (const move of game.moves) {
    const color: Color = move.ply % 2 === 1 ? 'sente' : 'gote';
    const enemy: Color = color === 'sente' ? 'gote' : 'sente';
    const side = sides[color];
    const phase = phaseOf(move.ply, total);
    const keys: string[] = [];

    const ownKing = board.findKing(color);
    const enemyKing = board.findKing(enemy);
    const to = toRelative(color, move.to);

    let movedType: PieceType;
    if (move.kind === 'drop') {
      movedType = move.piece;
      keys.push(`drop:${move.piece}:${zoneOf(to)}`);
    } else {
      const from = toRelative(color, move.from);
      const before = board.at(move.from);
      movedType = before?.type ?? move.piece;
      if (move.promote) keys.push('promote');
      if ((movedType === 'GI' || movedType === 'KI') && from.rank !== to.rank) {
        keys.push(`${to.rank < from.rank ? 'up' : 'down'}:${movedType}:${zoneOf(from)}`);
      }
      const target = board.at(move.to);
      if (target && target.color === enemy) keys.push(`capture:${target.type}`);
    }

    board.apply(move);
    const after = board.at(move.to);
    if (move.kind === 'move' && after) keys.push(`move:${after.type}:${zoneOf(to)}`);

    if (movedType !== 'OU' && ownKing && enemyKing) {
      const dOwn = manhattan(move.to, ownKing);
      const dEnemy = manhattan(move.to, enemyKing);
      keys.push(dEnemy <= dOwn ? 'attack' : 'defense');
    }

    for (const p of ['all', phase] as const) {
      side.ownMoves[p]++;
      const c = side.counts[p];
      for (const k of keys) c[k] = (c[k] ?? 0) + 1;
    }
  }

  for (const side of Object.values(sides)) {
    for (const p of PHASES) {
      const n = side.ownMoves[p];
      const rates: FeatureVector = {};
      for (const [k, v] of Object.entries(side.counts[p])) rates[k] = n > 0 ? v / n : 0;
      side.rates[p] = rates;
    }
  }
  return { sente: sides.sente, gote: sides.gote, plies: total };
}

// 攻めの手の割合（0〜1）。攻め／受けのどちらにも数えない玉の手は除く
export function attackRatio(side: SideFeatures, phase: Phase = 'middle'): number | null {
  const a = side.counts[phase].attack ?? 0;
  const d = side.counts[phase].defense ?? 0;
  return a + d > 0 ? a / (a + d) : null;
}
