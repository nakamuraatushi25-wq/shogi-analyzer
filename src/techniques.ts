import { attackMap, attacksFrom } from './attacks.ts';
import { Board, toRelative } from './board.ts';
import type { Color, Game, Move, Piece, PieceType, Square } from './types.ts';

// 一般に言われる手筋を棋譜から拾う。盤を1手ずつ進め、指した手が下の決まりに当てはまれば記録する。
// 座標は指した側から見たもの（1段目が相手の一番奥）。決まりは駒の位置と利きだけで決め、エンジンの評価は使わない
export type TechniqueAt = { ply: number; name: string; file: number; rank: number };
export type TechniqueResult = {
  events: TechniqueAt[];
  // 仕掛け（歩と角以外を初めて取った手）より後の自分の手数と、そのうち持ち駒に歩がなかった手数（歩切れ）
  afterFight: number;
  pawnless: number;
};

export const TECHNIQUES = [
  '垂れ歩', '叩きの歩', '合わせの歩', '継ぎ歩', '連打の歩', '焦点の歩', '底歩', '突き捨て', '端攻め',
  'と金攻め', '位の確保', 'ふんどしの桂', '控えの桂', '桂頭の銀', '割り打ちの銀', '腹銀', '頭金', '腹金', '尻金',
  '田楽刺し', '両取り', '王手飛車', '王手角', '空き王手', '両王手', '一間竜', '自陣飛車', '自陣角', '大駒切り', '玉の早逃げ',
] as const;

// 駒の価値の目安。両取りで「取りになっているか」と大駒切りの判定に使う
const VALUE: Record<PieceType, number> = {
  FU: 1, KY: 3, KE: 4, GI: 5, KI: 6, TO: 6, NY: 6, NK: 6, NG: 6, KA: 8, HI: 10, UM: 11, RY: 12, OU: 100,
};
// ふんどし・割り打ち・田楽刺しで狙う駒
const BIG = new Set<PieceType>(['OU', 'HI', 'RY', 'KA', 'UM', 'KI', 'GI']);
const MAJOR = new Set<PieceType>(['HI', 'KA', 'RY', 'UM']);

const other = (c: Color): Color => (c === 'sente' ? 'gote' : 'sente');
const same = (a: Square, b: Square) => a.file === b.file && a.rank === b.rank;
const cheb = (a: Square, b: Square) => Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));

// 1手分の記録。直前の手を見る手筋（継ぎ歩・連打の歩）と、次の手を見る手筋（突き捨て・大駒切り）に使う
export type PlyInfo = { color: Color; to: Square; piece: PieceType; drop: boolean; captured: boolean };

export function detect(b: Board, color: Color, move: Move, piece: PieceType, captured: PieceType | null, last?: PlyInfo, mine?: PlyInfo): string[] {
  const out: string[] = [];
  const o = other(color);
  const { file: f, rank: r } = toRelative(color, move.to);
  const at = (ff: number, rr: number): Piece | null => (ff >= 1 && ff <= 9 && rr >= 1 && rr <= 9 ? b.relative(color, ff, rr) : null);
  const enemyAt = (ff: number, rr: number) => { const p = at(ff, rr); return p && p.color === o ? p : null; };
  const absOf = (ff: number, rr: number): Square => toRelative(color, { file: ff, rank: rr });
  const now = b.at(move.to)!;
  const drop = move.kind === 'drop';
  let enemyMap: number[][] | null = null;
  const enemyAtk = (sq: Square) => (enemyMap ??= attackMap(b, o))[sq.file][sq.rank];
  const targets = attacksFrom(b, move.to.file, move.to.rank)
    .map((sq) => ({ sq, p: b.at(sq) }))
    .filter((t): t is { sq: Square; p: Piece } => !!t.p && t.p.color === o);
  const kAbs = b.findKing(o);
  const king = kAbs ? toRelative(color, kAbs) : null;

  if (drop && piece === 'FU') {
    const ahead = enemyAt(f, r - 1);
    if (ahead) {
      // 相手が直前に前のマスで自分の歩を取っていたら、もう一度歩を打つ手。打った歩を取られたなら連打、突いた歩なら継ぎ歩
      // 自分の歩は取る手ではなく、相手の駒に当てた手に限る（継ぎ歩は相手の歩で取られたとき）
      const again = last?.captured && same(last.to, absOf(f, r - 1)) && mine?.piece === 'FU' && !mine.captured && same(mine.to, absOf(f, r - 1));
      if (again && mine!.drop) out.push('連打の歩');
      else if (again && ahead.type === 'FU') out.push('継ぎ歩');
      else if (ahead.type === 'FU') out.push('合わせの歩');
      // 自陣で相手の駒の前に打つ歩は受けなので、敵陣の駒を叩いたときだけ数える
      else if (r <= 4) out.push('叩きの歩');
    } else if (r >= 2 && r <= 4 && !at(f, r - 1) && enemyAtk(move.to) === 0) out.push('垂れ歩');
    // 相手の駒が2枚以上利いているところへの歩
    if (r <= 4 && enemyAtk(move.to) >= 2) out.push('焦点の歩');
    if (r === 9) out.push('底歩');
  }
  // 端攻め: 端の歩を相手の端の歩・香に当てる
  const edge = enemyAt(f, r - 1);
  if (!drop && piece === 'FU' && !captured && (edge?.type === 'FU' || edge?.type === 'KY') && (f === 1 || f === 9)) out.push('端攻め');
  if (!drop && piece === 'TO' && king && cheb({ file: f, rank: r }, king) <= 2
    && cheb({ file: f, rank: r }, king) < cheb(toRelative(color, move.from), king)) out.push('と金攻め');

  if (now.type === 'KE') {
    if (targets.filter((t) => BIG.has(t.p.type)).length >= 2) out.push('ふんどしの桂');
    else if (drop && targets.length === 0 && (r === 5 || r === 6)) out.push('控えの桂');
  }
  if (now.type === 'GI') {
    if (enemyAt(f, r - 1)?.type === 'KE') out.push('桂頭の銀');
    if (drop) {
      const big = targets.filter((t) => BIG.has(t.p.type));
      // 斜め後ろの利きで2枚の駒を同時に狙う
      if (big.length >= 2 && big.some((t) => toRelative(color, t.sq).rank > r)) out.push('割り打ちの銀');
    }
    if (king && r === king.rank && Math.abs(f - king.file) === 1) out.push('腹銀');
    const front = at(f, 5);
    // 位の確保: 序盤（50手目まで）に5段目の歩の後ろへ銀を上がる
    if (!drop && !captured && move.ply <= 50 && r === 6 && f >= 3 && f <= 7 && front?.color === color && front.type === 'FU') out.push('位の確保');
  }
  if (now.type === 'KI' && king) {
    if (f === king.file && r === king.rank + 1) out.push('頭金');
    else if (r === king.rank && Math.abs(f - king.file) === 1) out.push('腹金');
    else if (f === king.file && r === king.rank - 1) out.push('尻金');
  }
  if (drop && piece === 'KY') {
    // 前に相手の駒が2枚並んでいて、手前の駒が逃げると奥の駒が取れる
    const hits: Piece[] = [];
    for (let rr = r - 1; rr >= 1 && hits.length < 2; rr--) {
      const p = at(f, rr);
      if (!p) continue;
      if (p.color !== o) break;
      hits.push(p);
    }
    if (hits.length === 2 && BIG.has(hits[0].type) && BIG.has(hits[1].type)) out.push('田楽刺し');
  }

  // 両取り: 動かした駒が、銀以上の駒2枚を同時に「取り」にしている（相手の駒の方が高いか、その駒にひもがない）
  const threatened = targets.filter((t) => t.p.type === 'OU'
    || (VALUE[t.p.type] >= VALUE.GI && (VALUE[t.p.type] > VALUE[now.type] || enemyAtk(t.sq) === 0)));
  const check = threatened.some((t) => t.p.type === 'OU');
  if (check && threatened.some((t) => t.p.type === 'HI' || t.p.type === 'RY')) out.push('王手飛車');
  else if (check && threatened.some((t) => t.p.type === 'KA' || t.p.type === 'UM')) out.push('王手角');
  else if (!check && threatened.length >= 2 && now.type !== 'KE' && !(drop && now.type === 'GI')) out.push('両取り');

  // 空き王手: 動かした駒の後ろにいた自分の大駒・香が王手をかける
  if (kAbs && !drop) {
    const from = move.from;
    const df = Math.sign(from.file - kAbs.file), dr = Math.sign(from.rank - kAbs.rank);
    const aligned = from.file === kAbs.file || from.rank === kAbs.rank || Math.abs(from.file - kAbs.file) === Math.abs(from.rank - kAbs.rank);
    if (aligned && (df || dr)) {
      let sq = { file: kAbs.file + df, rank: kAbs.rank + dr };
      while (sq.file >= 1 && sq.file <= 9 && sq.rank >= 1 && sq.rank <= 9 && !b.at(sq)) sq = { file: sq.file + df, rank: sq.rank + dr };
      const p = sq.file >= 1 && sq.file <= 9 && sq.rank >= 1 && sq.rank <= 9 ? b.at(sq) : null;
      if (p && p.color === color && !same(sq, move.to) && attacksFrom(b, sq.file, sq.rank).some((x) => same(x, kAbs))) {
        out.push(check ? '両王手' : '空き王手');
      }
    }
  }
  if (now.type === 'RY' && king) {
    const gapFile = f === king.file && Math.abs(r - king.rank) === 2 && !at(f, (r + king.rank) / 2);
    const gapRank = r === king.rank && Math.abs(f - king.file) === 2 && !at((f + king.file) / 2, r);
    if (gapFile || gapRank) out.push('一間竜');
  }
  if (drop && r >= 7 && piece === 'HI') out.push('自陣飛車');
  if (drop && r >= 7 && piece === 'KA') out.push('自陣角');
  return out;
}

const MINOR = new Set<PieceType>(['FU', 'KA', 'UM']);

export function techniques(game: Game): Record<Color, TechniqueResult> {
  const res: Record<Color, TechniqueResult> = {
    sente: { events: [], afterFight: 0, pawnless: 0 },
    gote: { events: [], afterFight: 0, pawnless: 0 },
  };
  const board = new Board();
  const log: PlyInfo[] = [];
  let fought = false;
  const moves = game.moves;
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const color: Color = move.ply % 2 === 1 ? 'sente' : 'gote';
    const piece = move.kind === 'drop' ? move.piece : board.at(move.from)?.type;
    if (!piece) { board.apply(move); continue; }
    const target = board.at(move.to);
    const captured = target && target.color !== color ? target.type : null;
    const rel = toRelative(color, move.to);
    const add = (name: string) => res[color].events.push({ ply: move.ply, name, file: rel.file, rank: rel.rank });

    // 玉の早逃げ: 王手されていないのに、玉の周りに相手の利きがある状態で玉を動かす（仕掛けの後）。
    // 追われて逃げ続ける手や入玉を目指す手と分けるため、自陣の中での移動で、直前の自分の手が玉でないものに限る
    if (piece === 'OU' && fought && move.kind === 'move' && !captured && toRelative(color, move.to).rank >= 7 && log[i - 2]?.piece !== 'OU') {
      const m = attackMap(board, other(color));
      const k = move.from;
      let near = false;
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
        const ff = k.file + df, rr = k.rank + dr;
        if ((df || dr) && ff >= 1 && ff <= 9 && rr >= 1 && rr <= 9 && m[ff][rr] > 0) near = true;
      }
      if (m[k.file][k.rank] === 0 && near) add('玉の早逃げ');
    }

    if (fought) {
      res[color].afterFight++;
      if (!board.hands[color].FU) res[color].pawnless++;
    }
    board.apply(move);
    if (captured && !MINOR.has(captured)) fought = true;
    const info: PlyInfo = { color, to: move.to, piece, drop: move.kind === 'drop', captured: !!captured };
    for (const name of detect(board, color, move, piece, captured, log[i - 1], log[i - 2])) add(name);

    // 次の手を見る手筋
    const next = moves[i + 1], after = moves[i + 2];
    const capturedNext = next && same(next.to, move.to);
    if (piece === 'FU' && move.kind === 'move' && !captured && capturedNext) {
      // 突き捨て: 相手の駒の前に突いた歩を取らせ、取り返さない
      const ahead = board.relative(color, rel.file, rel.rank - 1);
      if (ahead && ahead.color !== color && !(after && same(after.to, move.to))) add('突き捨て');
    }
    // 大駒切り: 飛角で自分より安い駒を取り、すぐ取り返される
    if (MAJOR.has(piece) && captured && VALUE[captured] < VALUE[piece] && capturedNext) add('大駒切り');
    log.push(info);
  }
  return res;
}
