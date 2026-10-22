// 戦型ごとに、駒を取ったマス（自分側から見た座標）と勝ち負けの関係を集計する
// 使い方: node scripts/capture-trends.ts <build-index.ts で作った一覧.jsonl> <出力.json> [手数の上限=60]
import { readFileSync, writeFileSync } from 'node:fs';
import { rankBand } from '../src/ranks.ts';

type Cell = { win: number; loss: number };
type GroupStat = {
  win: number;
  loss: number;
  // その側が最初に駒を取ったマス別の勝ち・負け局数
  first: Record<number, Cell>;
  // 上限の手数までに一度でも駒を取ったマス別の勝ち・負け局数（同じ局で同じマスは1回）
  any: Record<number, Cell>;
};

const [file, out, maxPlyStr] = process.argv.slice(2);
if (!file || !out) {
  console.error('使い方: node scripts/capture-trends.ts <index.jsonl> <out.json> [maxPly]');
  process.exit(1);
}
const maxPly = Number(maxPlyStr ?? 60);

const table: Record<string, Record<string, GroupStat>> = {};
const bump = (m: Record<number, Cell>, sq: number, key: 'win' | 'loss') => {
  (m[sq] ??= { win: 0, loss: 0 })[key]++;
};

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner) continue;
  for (const color of ['sente', 'gote'] as const) {
    const s = g[color];
    // 「矢倉（先手右四間飛車）」などの添え書きは外し、自分の飛車の位置で分ける
    const group = `${g.opening.replace(/（[先後]手[^）]*）/g, '')}｜${s.rookStyle}`;
    const key = g.winner === color ? 'win' : 'loss';
    const captures = (s.captures as [number, number, string][]).filter(([ply]) => ply <= maxPly);
    for (const band of ['全体', rankBand(s.rank) ?? '段級位なし']) {
      const st = ((table[group] ??= {})[band] ??= { win: 0, loss: 0, first: {}, any: {} });
      st[key]++;
      if (captures.length > 0) bump(st.first, captures[0][1], key);
      for (const sq of new Set(captures.map(([, sq]) => sq))) bump(st.any, sq, key);
    }
  }
}
writeFileSync(out, JSON.stringify({ maxPly, table }));
console.log(`集計しました → ${out}`);
