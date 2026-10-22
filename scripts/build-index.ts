// 集めた棋譜を1局1行の一覧（JSON Lines）にする。戦型・囲い・段級位・勝敗・駒ごとの回数・駒を取ったマス・
// 仕掛けの局面の指標・序盤の手順を入れておき、
// 以降の集計で棋譜を読み直さずに済むようにする
// 使い方: node scripts/build-index.ts <lishogi-data のディレクトリ> <出力.jsonl>
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { captureSquares } from '../src/captures.ts';
import { classifyOpening } from '../src/opening.ts';
import { countPieceMoves, WINDOW_PLY } from '../src/pieceCounts.ts';
import { parsePlayer } from '../src/players.ts';
import type { Move } from '../src/types.ts';
import { winPatternMetrics } from '../src/winPatterns.ts';

// 序盤の手順として残す手数（定跡を外れた手数の集計用）
const OPENING_PLIES = 40;

// 指し手を短い文字列にする（例: 7776、2822+、P*45）
const moveKey = (m: Move) =>
  m.kind === 'drop' ? `${m.piece}*${m.to.file}${m.to.rank}` : `${m.from.file}${m.from.rank}${m.to.file}${m.to.rank}${m.promote ? '+' : ''}`;

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('使い方: node scripts/build-index.ts <dir> <out.jsonl>');
  process.exit(1);
}

// 全局を文字列で持つとメモリが足りなくなるので、選手のファイルごとに書き足す
writeFileSync(out, '');
let written = 0;
const seen = new Set<string>();
let skipped = 0;
for (const file of readdirSync(`${dir}/players`).sort()) {
  const lines: string[] = [];
  for (const kif of splitKifGames(readFileSync(`${dir}/players/${file}`, 'utf8'))) {
    const url = /^場所[：:](.*)$/m.exec(kif)?.[1].trim() ?? '';
    if (url && seen.has(url)) continue;
    seen.add(url);
    try {
      const game = parseKif(kif);
      const o = classifyOpening(game);
      const full = countPieceMoves(game);
      const window = game.moves.length > WINDOW_PLY ? countPieceMoves(game, WINDOW_PLY) : null;
      const captures = captureSquares(game);
      const metrics = winPatternMetrics(game);
      const side = (color: 'sente' | 'gote') => {
        const player = parsePlayer(game.headers[color === 'sente' ? '先手' : '後手']);
        return {
          name: player.name, rank: player.rank,
          rookStyle: o[color].rookStyle, castle: o[color].castle,
          moves: full[color].moves, counts: full[color].counts,
          windowCounts: window?.[color].counts ?? null,
          // 駒を取った手: [手数, 筋*10+段（自分側から見た座標）, 取られた駒, 取った駒]
          captures: captures[color].map((c) => [c.ply, c.file * 10 + c.rank, c.captured, c.by]),
          // 仕掛けの局面とその20手後の指標（src/winPatterns.ts）。駒がぶつからなかった局は null
          metrics: metrics?.[color] ?? null,
        };
      };
      lines.push(JSON.stringify({
        url, start: game.headers['開始日時'] ?? null, timeControl: game.headers['持ち時間'] ?? null,
        plies: game.moves.length, winner: game.result.winner, reason: game.result.reason,
        opening: o.opening, matchup: o.matchup, bishopExchange: o.bishopExchange,
        fightPly: metrics?.fightPly ?? null,
        moves: game.moves.slice(0, OPENING_PLIES).map(moveKey),
        sente: side('sente'), gote: side('gote'),
      }));
    } catch {
      // lishogi の別ルール（どうぶつしょうぎ等）の局は盤面が合わず読めない
      skipped++;
    }
  }
  if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
  written += lines.length;
}
console.log(`${written}局を書き出し（読めなかった局 ${skipped}）→ ${out}`);
