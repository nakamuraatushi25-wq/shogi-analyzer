import { attackMap } from './attacks.ts';
import { Board, toRelative } from './board.ts';
import type { Color, Game, PieceType, Square } from './types.ts';

// 仕掛けの局面から何手後を中盤の局面として測るか
export const MIDDLE_OFFSET = 20;

export type SideMetrics = {
  // 1. 玉の周り8マスにいる自分の金銀（成駒を含む）の数
  kingGuards: number;
  // 2. 5段目より前（相手寄り）に出ている自分の駒（歩と玉以外）の数
  advanced: number;
  // 3. 初期位置から動いていない駒（歩と玉以外）の数。うち桂・香・角・飛
  unmoved: number;
  unmovedMajor: number;
  // 4. 仕掛けまでの自分の手のうち、玉と金を動かした手の割合
  defenseShare: number;
  // 5. 中盤の局面での、相手玉の周り9マスへの自分の利きの数 − 自玉の周り9マスへの相手の利きの数
  pressure: number | null;
  // 6. 仕掛けから中盤の局面までの自分の手のうち、攻めの手の割合（大森・金子の判定、玉の手は除く）
  attackShare: number | null;
  // 7. 中盤の局面までに成ったか
  promoted: boolean | null;
  // 8. 中盤の局面での持ち駒の数（歩以外 / 歩）
  handPieces: number | null;
  handPawns: number | null;
};

export type GameMetrics = { fightPly: number; sente: SideMetrics; gote: SideMetrics };

const GOLDISH = new Set<PieceType>(['GI', 'KI', 'NG', 'TO', 'NY', 'NK']);
const MINOR = new Set<PieceType>(['FU', 'KA', 'UM']);
const INITIAL: [PieceType, number, number][] = [
  ['KY', 1, 9], ['KE', 2, 9], ['GI', 3, 9], ['KI', 4, 9], ['KI', 6, 9], ['GI', 7, 9], ['KE', 8, 9], ['KY', 9, 9],
  ['HI', 2, 8], ['KA', 8, 8],
];

const colorOf = (ply: number): Color => (ply % 2 === 1 ? 'sente' : 'gote');
const manhattan = (a: Square, b: Square) => Math.abs(a.file - b.file) + Math.abs(a.rank - b.rank);

function around(sq: Square, includeSelf: boolean): Square[] {
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!includeSelf && df === 0 && dr === 0) continue;
      const f = sq.file + df;
      const r = sq.rank + dr;
      if (f >= 1 && f <= 9 && r >= 1 && r <= 9) out.push({ file: f, rank: r });
    }
  }
  return out;
}

function opening(board: Board, color: Color, ownMoves: number, defenseMoves: number) {
  const king = board.findKing(color);
  let kingGuards = 0;
  if (king) {
    for (const sq of around(king, false)) {
      const p = board.at(sq);
      if (p && p.color === color && GOLDISH.has(p.type)) kingGuards++;
    }
  }
  let advanced = 0;
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const p = board.squares[f][r];
      if (!p || p.color !== color || p.type === 'FU' || p.type === 'OU') continue;
      if (toRelative(color, { file: f, rank: r }).rank <= 5) advanced++;
    }
  }
  let unmoved = 0;
  let unmovedMajor = 0;
  for (const [type, f, r] of INITIAL) {
    const p = board.relative(color, f, r);
    if (p && p.color === color && p.type === type) {
      unmoved++;
      if (type !== 'GI' && type !== 'KI') unmovedMajor++;
    }
  }
  return { kingGuards, advanced, unmoved, unmovedMajor, defenseShare: ownMoves > 0 ? defenseMoves / ownMoves : 0 };
}

function middle(board: Board, color: Color) {
  const enemy: Color = color === 'sente' ? 'gote' : 'sente';
  const mine = attackMap(board, color);
  const theirs = attackMap(board, enemy);
  const ownKing = board.findKing(color);
  const enemyKing = board.findKing(enemy);
  let pressure = 0;
  if (enemyKing) for (const sq of around(enemyKing, true)) pressure += mine[sq.file][sq.rank];
  if (ownKing) for (const sq of around(ownKing, true)) pressure -= theirs[sq.file][sq.rank];
  const hand = board.hands[color];
  let handPieces = 0;
  for (const [type, n] of Object.entries(hand)) if (type !== 'FU') handPieces += n ?? 0;
  return { pressure, handPieces, handPawns: hand.FU ?? 0 };
}

/**
 * 仕掛けの局面（金銀以上の駒が初めて取られる直前）と、その MIDDLE_OFFSET 手後の局面で、両者の指標を測る。
 * 駒がぶつからないまま終わった局は null。
 */
export function winPatternMetrics(game: Game): GameMetrics | null {
  const board = new Board();
  let fightPly: number | null = null;
  const own = { sente: 0, gote: 0 };
  const defense = { sente: 0, gote: 0 };
  const window = { sente: { attack: 0, total: 0, promoted: false }, gote: { attack: 0, total: 0, promoted: false } };
  let atFight: Record<Color, ReturnType<typeof opening>> | null = null;
  let atMiddle: Record<Color, ReturnType<typeof middle>> | null = null;

  for (const move of game.moves) {
    const color = colorOf(move.ply);
    const target = board.at(move.to);
    if (fightPly === null && target && !MINOR.has(target.type)) {
      fightPly = move.ply;
      atFight = { sente: opening(board, 'sente', own.sente, defense.sente), gote: opening(board, 'gote', own.gote, defense.gote) };
    }
    const movedType = move.kind === 'move' ? board.at(move.from)?.type : move.piece;
    if (fightPly === null) {
      own[color]++;
      if (movedType === 'OU' || movedType === 'KI') defense[color]++;
    } else if (move.ply < fightPly + MIDDLE_OFFSET) {
      const w = window[color];
      if (move.kind === 'move' && move.promote) w.promoted = true;
      const ownKing = board.findKing(color);
      const enemyKing = board.findKing(color === 'sente' ? 'gote' : 'sente');
      if (movedType !== 'OU' && ownKing && enemyKing) {
        w.total++;
        if (manhattan(move.to, enemyKing) <= manhattan(move.to, ownKing)) w.attack++;
      }
    }
    board.apply(move);
    if (fightPly !== null && move.ply === fightPly + MIDDLE_OFFSET - 1) {
      atMiddle = { sente: middle(board, 'sente'), gote: middle(board, 'gote') };
      break;
    }
  }
  if (fightPly === null || !atFight) return null;

  const side = (color: Color): SideMetrics => ({
    ...atFight![color],
    pressure: atMiddle?.[color].pressure ?? null,
    attackShare: atMiddle && window[color].total > 0 ? window[color].attack / window[color].total : null,
    promoted: atMiddle ? window[color].promoted : null,
    handPieces: atMiddle?.[color].handPieces ?? null,
    handPawns: atMiddle?.[color].handPawns ?? null,
  });
  return { fightPly, sente: side('sente'), gote: side('gote') };
}
