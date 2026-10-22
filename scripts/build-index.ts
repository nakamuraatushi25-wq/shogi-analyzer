// 集めた棋譜を1局1行の一覧（JSON Lines）にする。戦型・囲い・段級位・勝敗・駒ごとの回数を入れておき、
// 以降の集計で棋譜を読み直さずに済むようにする
// 使い方: node scripts/build-index.ts <lishogi-data のディレクトリ> <出力.jsonl>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { classifyOpening } from '../src/opening.ts';
import { countPieceMoves, WINDOW_PLY } from '../src/pieceCounts.ts';
import { parsePlayer } from '../src/players.ts';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('使い方: node scripts/build-index.ts <dir> <out.jsonl>');
  process.exit(1);
}

const lines: string[] = [];
const seen = new Set<string>();
let skipped = 0;
for (const file of readdirSync(`${dir}/players`).sort()) {
  for (const kif of splitKifGames(readFileSync(`${dir}/players/${file}`, 'utf8'))) {
    const url = /^場所[：:](.*)$/m.exec(kif)?.[1].trim() ?? '';
    if (url && seen.has(url)) continue;
    seen.add(url);
    try {
      const game = parseKif(kif);
      const o = classifyOpening(game);
      const full = countPieceMoves(game);
      const window = game.moves.length > WINDOW_PLY ? countPieceMoves(game, WINDOW_PLY) : null;
      const side = (color: 'sente' | 'gote') => {
        const player = parsePlayer(game.headers[color === 'sente' ? '先手' : '後手']);
        return {
          name: player.name, rank: player.rank,
          rookStyle: o[color].rookStyle, castle: o[color].castle,
          moves: full[color].moves, counts: full[color].counts,
          windowCounts: window?.[color].counts ?? null,
        };
      };
      lines.push(JSON.stringify({
        url, start: game.headers['開始日時'] ?? null, timeControl: game.headers['持ち時間'] ?? null,
        plies: game.moves.length, winner: game.result.winner, reason: game.result.reason,
        opening: o.opening, matchup: o.matchup, bishopExchange: o.bishopExchange,
        sente: side('sente'), gote: side('gote'),
      }));
    } catch {
      // lishogi の別ルール（どうぶつしょうぎ等）の局は盤面が合わず読めない
      skipped++;
    }
  }
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${lines.length}局を書き出し（読めなかった局 ${skipped}）→ ${out}`);
