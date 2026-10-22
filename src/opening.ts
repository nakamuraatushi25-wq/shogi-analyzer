import { Board, toRelative, type Capture } from './board.ts';
import type { Color, Game, PieceType } from './types.ts';

// 戦法の判定に使う手数の上限。振り飛車はこの手数までに振るものとみなす
const ROOK_PLY_LIMIT = 40;
// 角交換を「序盤の角交換」とみなす手数の上限
const BISHOP_EXCHANGE_PLY_LIMIT = 30;
// 本格的な駒のぶつかりが起きないまま進んだ場合に囲いを判定する手数
const CASTLE_FALLBACK_PLY = 60;
// 駒がぶつかるのがこの手数より後なら持久戦とみなす（bioshogi が将棋ウォーズの棋譜で測った平均 42手に合わせた）
const QUICK_FIGHT_PLY = 42;

export type RookStyle =
  | '居飛車' | '右四間飛車' | '袖飛車'
  | '中飛車' | '四間飛車' | '三間飛車' | '石田流' | '向かい飛車';

export type Castle =
  | '居飛車穴熊' | '振り飛車穴熊' | '金矢倉' | '矢倉（未完成）' | '菊水矢倉' | '左美濃' | '銀冠'
  | '高美濃' | '本美濃' | '片美濃' | '美濃（未完成）' | 'カニ囲い' | '舟囲い' | '居玉' | 'その他';

export type SideOpening = {
  furibisha: boolean;
  rookStyle: RookStyle;
  castle: Castle;
  // 玉の位置（その側から見た座標）。「その他」の囲いを後で細かく分けるため残す
  king: { file: number; rank: number } | null;
  gangi: boolean;
  // 角道を歩で止めて金銀を玉の左上に集めた形（矢倉の駒組み）
  yaguraShape: boolean;
  // 横歩を取ったか（相居飛車の判定用）
  tookYokofu: boolean;
  pushedRookPawn: boolean;
};

export type Matchup = '相居飛車' | '対抗形' | '相振り飛車';

export type OpeningResult = {
  sente: SideOpening;
  gote: SideOpening;
  matchup: Matchup;
  opening: string;
  bishopExchange: boolean;
  // 囲いを判定した局面（この手数を指し終えた時点）
  castlePly: number;
};

const FURI_BY_FILE: Record<number, RookStyle> = {
  5: '中飛車', 6: '四間飛車', 7: '三間飛車', 8: '向かい飛車',
};

const SLOW_CASTLES = new Set<Castle>([
  '居飛車穴熊', '金矢倉', '矢倉（未完成）', '菊水矢倉', '左美濃', '銀冠', '高美濃', '本美濃',
]);

function colorOf(ply: number): Color {
  return ply % 2 === 1 ? 'sente' : 'gote';
}

function classifyRook(game: Game, color: Color, stopPly: number): {
  style: RookStyle; tookYokofu: boolean; pushedRookPawn: boolean;
} {
  let style: RookStyle = '居飛車';
  // 戦法は飛車の最初の一手で決める。浮き飛車や中盤の飛車の転回を振り飛車と取り違えないため
  let firstRookMove = true;
  let tookYokofu = false;
  let pushedRookPawn = false;
  let ownMoves = 0;

  const board = new Board();
  for (const move of game.moves) {
    if (move.ply > Math.min(stopPly, ROOK_PLY_LIMIT)) break;
    const mover = colorOf(move.ply);
    const kingSq = board.findKing(color);
    const capture = board.apply(move);
    if (mover !== color) continue;
    ownMoves++;
    if (move.kind !== 'move') continue;

    const from = toRelative(color, move.from);
    const to = toRelative(color, move.to);

    if (move.piece === 'FU' && to.file === 2 && to.rank === 5 && ownMoves <= 10) {
      pushedRookPawn = true;
    }
    if (move.piece !== 'HI') continue;

    if (capture && to.file === 3 && to.rank === 4) tookYokofu = true;

    if (firstRookMove) {
      firstRookMove = false;
      if (from.file === 2 && from.rank === 8 && to.rank === 8) {
        const king = kingSq ? toRelative(color, kingSq) : null;
        // 玉を左に囲ってから飛車を左へ回すのは居飛車の飛車の転回（振り飛車は玉と飛車を逆側に置く）
        const kingOnLeft = king !== null && king.file >= 6;
        if (FURI_BY_FILE[to.file] && !kingOnLeft) style = FURI_BY_FILE[to.file];
        else if (to.file === 4) style = '右四間飛車';
        else if (to.file === 3) style = '袖飛車';
      }
    } else if (style === '三間飛車' && to.file === 7 && to.rank === 6) {
      style = '石田流';
    }
  }
  return { style, tookYokofu, pushedRookPawn };
}

function classifyCastle(board: Board, color: Color, furibisha: boolean): {
  castle: Castle; king: SideOpening['king']; gangi: boolean; yaguraShape: boolean;
} {
  const has = (type: PieceType, file: number, rank: number) => {
    const p = board.relative(color, file, rank);
    return p !== null && p.color === color && p.type === type;
  };
  const kingSq = board.findKing(color);
  const king = kingSq ? toRelative(color, kingSq) : null;
  const gangi = has('GI', 6, 7) && has('GI', 4, 7);
  const yaguraShape = has('FU', 6, 6) && (has('GI', 7, 7) || has('GI', 6, 7)) && has('KI', 7, 8);
  const k = (f: number, r: number) => king !== null && king.file === f && king.rank === r;

  let castle: Castle = 'その他';
  if (k(9, 9)) castle = '居飛車穴熊';
  else if (k(1, 9)) castle = '振り飛車穴熊';
  else if (k(8, 8) && has('GI', 7, 7) && has('KI', 7, 8)) castle = has('KI', 6, 7) ? '金矢倉' : '矢倉（未完成）';
  else if (k(8, 9) && has('GI', 8, 8) && has('KI', 7, 8)) castle = '菊水矢倉';
  // 左美濃は片美濃を左右反転した形（玉8八・銀7八・金6九）
  else if (k(8, 8) && has('GI', 7, 8) && has('KI', 6, 9)) castle = '左美濃';
  else if ((k(8, 8) && has('GI', 8, 7)) || (k(2, 8) && has('GI', 2, 7) && has('KI', 3, 8))) castle = '銀冠';
  else if (k(2, 8) && has('GI', 3, 8) && has('KI', 4, 7)) castle = '高美濃';
  else if (k(2, 8) && has('GI', 3, 8) && has('KI', 4, 9)) castle = has('KI', 5, 8) ? '本美濃' : '片美濃';
  else if (k(6, 9) && has('KI', 7, 8) && has('GI', 6, 8) && has('KI', 5, 8)) castle = 'カニ囲い';
  // 舟囲いは玉7八・金5八に、左の金銀が初期位置付近に残った形
  else if (k(7, 8) && has('KI', 5, 8) && (has('KI', 6, 9) || has('GI', 7, 9) || has('GI', 6, 8))) castle = '舟囲い';
  else if (k(5, 9)) castle = '居玉';
  else if (furibisha && king !== null && king.file <= 3 && king.rank >= 8) castle = '美濃（未完成）';
  return { castle, king, gangi, yaguraShape };
}

// 金銀以上の駒がぶつかり合った最初の手。そこまでを「駒組み」とみなす
function firstFightPly(captures: Capture[]): number | null {
  const minor = new Set<PieceType>(['FU', 'KA', 'UM']);
  const c = captures.find((x) => !minor.has(x.captured));
  return c ? c.ply : null;
}

export function classifyOpening(game: Game): OpeningResult {
  const board = new Board();
  const captures: Capture[] = [];
  for (const move of game.moves) {
    const c = board.apply(move);
    if (c) captures.push(c);
  }

  const bishopTrades = captures.filter(
    (c) => c.ply <= BISHOP_EXCHANGE_PLY_LIMIT && (c.captured === 'KA' || c.captured === 'UM'),
  );
  const bishopExchange = bishopTrades.some((c) => c.by === 'sente') && bishopTrades.some((c) => c.by === 'gote');

  const fight = firstFightPly(captures);
  const castlePly = Math.min(fight !== null ? fight - 1 : CASTLE_FALLBACK_PLY, game.moves.length, CASTLE_FALLBACK_PLY);
  const snapshot = new Board();
  for (const move of game.moves) {
    if (move.ply > castlePly) break;
    snapshot.apply(move);
  }

  const rookStop = fight ?? Number.POSITIVE_INFINITY;
  const side = (color: Color): SideOpening => {
    const rook = classifyRook(game, color, rookStop);
    const furibisha = FURI_STYLES.has(rook.style);
    const castle = classifyCastle(snapshot, color, furibisha);
    return {
      furibisha,
      rookStyle: rook.style,
      castle: castle.castle,
      king: castle.king,
      gangi: castle.gangi,
      yaguraShape: castle.yaguraShape,
      tookYokofu: rook.tookYokofu,
      pushedRookPawn: rook.pushedRookPawn,
    };
  };
  const sente = side('sente');
  const gote = side('gote');

  const matchup: Matchup =
    sente.furibisha && gote.furibisha ? '相振り飛車'
      : sente.furibisha || gote.furibisha ? '対抗形'
        : '相居飛車';

  return { sente, gote, matchup, opening: nameOpening(matchup, sente, gote, bishopExchange, fight), bishopExchange, castlePly };
}

const FURI_STYLES = new Set<RookStyle>(['中飛車', '四間飛車', '三間飛車', '石田流', '向かい飛車']);

function nameOpening(
  matchup: Matchup, sente: SideOpening, gote: SideOpening, bishopExchange: boolean, fight: number | null,
): string {
  if (matchup === '相振り飛車') return '相振り飛車';

  if (matchup === '対抗形') {
    const [furi, ibi] = sente.furibisha ? [sente, gote] : [gote, sente];
    // 居飛車側が堅い囲いを組み終えていれば持久戦。囲いを判定できなくても、戦いが遅ければ持久戦
    const slow = SLOW_CASTLES.has(ibi.castle) || fight === null || fight > QUICK_FIGHT_PLY;
    const tempo = slow ? '持久戦' : '急戦';
    const furiName = bishopExchange ? `角交換${furi.rookStyle}` : furi.rookStyle;
    return `${furiName} vs 居飛車${tempo}`;
  }

  // 右四間飛車・袖飛車は戦型名に添える（例：矢倉（先手右四間飛車））
  const tags = (['sente', 'gote'] as const)
    .filter((c) => (c === 'sente' ? sente : gote).rookStyle !== '居飛車')
    .map((c) => `${c === 'sente' ? '先手' : '後手'}${(c === 'sente' ? sente : gote).rookStyle}`);
  const withTags = (base: string) => (tags.length ? `${base}（${tags.join('・')}）` : base);

  if (sente.tookYokofu || gote.tookYokofu) return '横歩取り';
  if (bishopExchange) return withTags('角換わり');
  const yagura = (s: SideOpening) =>
    s.castle === '矢倉（未完成）' || s.castle === '金矢倉' || s.castle === '菊水矢倉' || s.yaguraShape;
  if (yagura(sente) || yagura(gote)) return withTags('矢倉');
  if (sente.gangi || gote.gangi) return withTags('雁木');
  if (sente.pushedRookPawn && gote.pushedRookPawn) return withTags('相掛かり');
  return withTags('相居飛車（その他）');
}
