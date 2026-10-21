import type { Color, Game, GameResult, Move, PieceType, Square } from './types.ts';

const ZEN_DIGITS = '０１２３４５６７８９';
const KANJI_DIGITS = '〇一二三四五六七八九';

const PIECE_NAMES: Record<string, PieceType> = {
  歩: 'FU', 香: 'KY', 桂: 'KE', 銀: 'GI', 金: 'KI', 角: 'KA', 飛: 'HI', 玉: 'OU', 王: 'OU',
  と: 'TO', 成香: 'NY', 杏: 'NY', 成桂: 'NK', 圭: 'NK', 成銀: 'NG', 全: 'NG',
  馬: 'UM', 龍: 'RY', 竜: 'RY',
};

const TERMINAL = ['詰み', '投了', '切れ負け', '時間切れ', '反則負け','千日手', '持将棋', '中断'];
const DRAWS = new Set(['千日手', '持将棋', '中断']);

function digit(ch: string): number {
  const z = ZEN_DIGITS.indexOf(ch);
  if (z >= 0) return z;
  const k = KANJI_DIGITS.indexOf(ch);
  if (k >= 0) return k;
  const a = Number(ch);
  if (Number.isInteger(a)) return a;
  throw new Error(`数字として読めません: ${ch}`);
}

// "７六歩(77)" / "同　銀(57)" / "４五歩打" / "５七角成(13)" / "６七成銀(66)" / "３三桂不成(45)"
const MOVE_RE = /^(?:([１-９1-9])([一二三四五六七八九１-９1-9])|同[\s　]*)(成香|成桂|成銀|[歩香桂銀金角飛玉王と杏圭全馬龍竜])(不成|成)?(打)?(?:\((\d)(\d)\))?/;

export function parseMove(text: string, ply: number, prevTo: Square | null): Move {
  const m = MOVE_RE.exec(text);
  if (!m) throw new Error(`指し手として読めません (${ply}手目): ${text}`);
  let to: Square;
  if (m[1]) {
    to = { file: digit(m[1]), rank: digit(m[2]) };
  } else {
    if (!prevTo) throw new Error(`「同」の前に指し手がありません (${ply}手目)`);
    to = prevTo;
  }
  const piece = PIECE_NAMES[m[3]];
  if (m[5]) return { kind: 'drop', ply, to, piece };
  if (!m[6]) throw new Error(`移動元がありません (${ply}手目): ${text}`);
  return {
    kind: 'move',
    ply,
    from: { file: Number(m[6]), rank: Number(m[7]) },
    to,
    piece,
    promote: m[4] === '成',
  };
}

function moverOf(ply: number): Color {
  return ply % 2 === 1 ? 'sente' : 'gote';
}

export function parseKif(text: string): Game {
  const headers: Record<string, string> = {};
  const moves: Move[] = [];
  let result: GameResult = { winner: null, reason: null };
  let prevTo: Square | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('*') || line.startsWith('&')) continue;

    const header = /^([^：:]+)[：:](.*)$/.exec(line);
    if (header && !/^\d/.test(line)) {
      headers[header[1].trim()] = header[2].trim();
      continue;
    }

    const row = /^(\d+)\s+(.+)$/.exec(line);
    if (!row) continue;
    const ply = Number(row[1]);
    const body = row[2];

    const terminal = TERMINAL.find((t) => body.startsWith(t));
    if (terminal) {
      // 終局行の手番の側が、詰まされた・投了した・時間が切れた側
      const loser = moverOf(ply);
      result = {
        winner: DRAWS.has(terminal) ? null : loser === 'sente' ? 'gote' : 'sente',
        reason: terminal,
      };
      break;
    }

    const move = parseMove(body, ply, prevTo);
    moves.push(move);
    prevTo = move.to;
  }

  return { headers, moves, result };
}

// lishogi の一括エクスポートのように複数局が連結された KIF を局ごとに分ける
export function splitKifGames(text: string): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^開始日時[：:]/.test(line.trim()) && current.some((l) => /^\s*\d+\s/.test(l))) {
      chunks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => /^\s*\d+\s/.test(l))) chunks.push(current.join('\n'));
  return chunks;
}
