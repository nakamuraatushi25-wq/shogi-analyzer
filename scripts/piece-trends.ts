// 戦型ごと・段位帯ごとに、勝ち局と負け局で各駒を動かした回数を集計する
// 使い方: node scripts/piece-trends.ts <build-index.ts で作った一覧.jsonl> <出力.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { rankBand } from '../src/ranks.ts';
import { WINDOW_PLY } from '../src/pieceCounts.ts';

type Acc = { n: number; sum: Record<string, number>; sumsq: Record<string, number> };
// view → 戦型｜飛車 → 段位帯 → win/loss
type Table = Record<string, Record<string, Record<string, Record<'win' | 'loss', Acc>>>>;

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  console.error('使い方: node scripts/piece-trends.ts <index.jsonl> <out.json>');
  process.exit(1);
}

const table: Table = {};
function add(view: string, group: string, band: string, result: 'win' | 'loss', values: Record<string, number>) {
  const g = ((table[view] ??= {})[group] ??= {});
  const b = (g[band] ??= { win: { n: 0, sum: {}, sumsq: {} }, loss: { n: 0, sum: {}, sumsq: {} } });
  const acc = b[result];
  acc.n++;
  for (const [k, v] of Object.entries(values)) {
    acc.sum[k] = (acc.sum[k] ?? 0) + v;
    acc.sumsq[k] = (acc.sumsq[k] ?? 0) + v * v;
  }
}

let games = 0;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner) continue;
  games++;
  for (const color of ['sente', 'gote'] as const) {
    const s = g[color];
    // 「矢倉（先手右四間飛車）」などの添え書きは外し、自分の飛車の位置で分ける
    const group = `${g.opening.replace(/（[先後]手[^）]*）/g, '')}｜${s.rookStyle}`;
    const band = rankBand(s.rank) ?? '段級位なし';
    const result = g.winner === color ? 'win' : 'loss';
    const rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.counts as Record<string, number>)) rates[k] = v / s.moves;
    for (const b of ['全体', band]) {
      add('全体（1手あたり）', group, b, result, rates);
      if (s.windowCounts) add(`${WINDOW_PLY}手目まで（回数）`, group, b, result, s.windowCounts);
    }
  }
}
writeFileSync(out, JSON.stringify({ games, windowPly: WINDOW_PLY, table }));
console.log(`${games}局を集計 → ${out}`);
