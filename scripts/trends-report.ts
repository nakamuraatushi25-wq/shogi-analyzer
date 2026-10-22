// piece-trends.ts の集計結果から、勝ち局と負け局で差の大きい駒を戦型・段位帯ごとに表にする
// 使い方: node scripts/trends-report.ts <集計.json> [最低局数=200] [上位件数=5]
import { readFileSync } from 'node:fs';
import { PIECE_NAMES_JA } from '../src/pieceCounts.ts';
import { RANK_BANDS } from '../src/ranks.ts';

type Acc = { n: number; sum: Record<string, number>; sumsq: Record<string, number> };
type Stat = { key: string; win: number; loss: number; d: number; t: number };

const [file, minStr, topStr] = process.argv.slice(2);
const minGames = Number(minStr ?? 200);
const top = Number(topStr ?? 5);
const data = JSON.parse(readFileSync(file, 'utf8'));

function label(key: string): string {
  const [kind, piece] = key.split(':');
  return `${PIECE_NAMES_JA[piece]}${kind === 'drop' ? '打' : ''}`;
}

// 平均と標準偏差（局に1回も出ない駒は0回として扱う）
function moments(acc: Acc, key: string) {
  const mean = (acc.sum[key] ?? 0) / acc.n;
  const variance = Math.max(0, ((acc.sumsq[key] ?? 0) - acc.n * mean * mean) / (acc.n - 1));
  return { mean, variance };
}

// 効果量 d（勝ち−負けを、合わせた標準偏差で割る）と Welch の t
export function compareAcc(win: Acc, loss: Acc): Stat[] {
  const keys = new Set([...Object.keys(win.sum), ...Object.keys(loss.sum)]);
  const stats: Stat[] = [];
  for (const key of keys) {
    const w = moments(win, key);
    const l = moments(loss, key);
    const pooled = Math.sqrt(((win.n - 1) * w.variance + (loss.n - 1) * l.variance) / (win.n + loss.n - 2));
    const se = Math.sqrt(w.variance / win.n + l.variance / loss.n);
    if (pooled === 0 || se === 0) continue;
    stats.push({ key, win: w.mean, loss: l.mean, d: (w.mean - l.mean) / pooled, t: (w.mean - l.mean) / se });
  }
  return stats.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
}

const fmt = (v: number, view: string) => (view.includes('回数') ? v.toFixed(2) : (v * 100).toFixed(1) + '%');

for (const [view, groups] of Object.entries(data.table) as [string, any][]) {
  console.log(`\n# ${view}\n`);
  const ordered = Object.entries(groups).sort(
    ([, a]: any, [, b]: any) => b['全体'].win.n + b['全体'].loss.n - (a['全体'].win.n + a['全体'].loss.n),
  );
  for (const [group, bands] of ordered as [string, any][]) {
    const all = bands['全体'];
    if (all.win.n < minGames || all.loss.n < minGames) continue;
    console.log(`## ${group}（勝ち${all.win.n}・負け${all.loss.n}）\n`);
    console.log('| 段位帯 | 勝ち/負け | 差の大きい駒（勝ち局 vs 負け局、d） |');
    console.log('|---|---|---|');
    for (const band of ['全体', ...RANK_BANDS]) {
      const b = bands[band];
      if (!b || b.win.n < minGames || b.loss.n < minGames) continue;
      const cells = compareAcc(b.win, b.loss)
        .filter((s) => Math.abs(s.t) >= 3)
        .slice(0, top)
        .map((s) => `${label(s.key)} ${fmt(s.win, view)} vs ${fmt(s.loss, view)}（${s.d >= 0 ? '+' : ''}${s.d.toFixed(2)}）`);
      console.log(`| ${band} | ${b.win.n}/${b.loss.n} | ${cells.join('、') || '目立った差なし'} |`);
    }
    console.log('');
  }
}
