// capture-trends.ts の集計から、駒を取ったマス別の勝率を戦型ごとに表にする
// 使い方: node scripts/capture-report.ts <集計.json> [段位帯=全体] [戦型の数=10] [マスごとの最低局数=200]
import { readFileSync } from 'node:fs';

const [file, band = '全体', groupsStr, minStr] = process.argv.slice(2);
const maxGroups = Number(groupsStr ?? 10);
const minGames = Number(minStr ?? 200);
const data = JSON.parse(readFileSync(file, 'utf8'));
const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

type Cell = { win: number; loss: number };
const name = (sq: number) => `${Math.floor(sq / 10)}${KANJI[sq % 10]}`;

// その戦型全体の勝率と比べた z 値（局数が多いほど、同じ差でも大きくなる）
function z(cell: Cell, base: number) {
  const n = cell.win + cell.loss;
  return (cell.win / n - base) / Math.sqrt((base * (1 - base)) / n);
}

const groups = Object.entries(data.table as Record<string, Record<string, any>>)
  .filter(([, b]) => b[band])
  .sort(([, a], [, b]) => b[band].win + b[band].loss - (a[band].win + a[band].loss))
  .slice(0, maxGroups);

for (const [group, bands] of groups) {
  const st = bands[band];
  const total = st.win + st.loss;
  const base = st.win / total;
  console.log(`\n## ${group}（${band}、${total}局、勝率${(base * 100).toFixed(1)}%）\n`);

  console.log(`最初に駒を取ったマス別の勝率（自分側から見た座標。下が自陣。${minGames}局未満は「・」、*は全体の勝率との差が偶然では説明しにくいもの）\n`);
  console.log('| 段＼筋 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (let rank = 1; rank <= 9; rank++) {
    const cells: string[] = [];
    for (let f = 9; f >= 1; f--) {
      const c: Cell | undefined = st.first[f * 10 + rank];
      if (!c || c.win + c.loss < minGames) cells.push('・');
      else cells.push(`${Math.round((c.win / (c.win + c.loss)) * 100)}%${Math.abs(z(c, base)) >= 3 ? '*' : ''}`);
    }
    console.log(`| ${KANJI[rank]} | ${cells.join(' | ')} |`);
  }

  const any = Object.entries(st.any as Record<string, Cell>)
    .map(([sq, c]) => ({ sq: Number(sq), c, n: c.win + c.loss }))
    .filter((x) => x.n >= minGames)
    .map((x) => ({ ...x, rate: x.c.win / x.n, z: z(x.c, base), share: x.n / total }))
    .filter((x) => Math.abs(x.z) >= 3)
    .sort((a, b) => b.z - a.z);
  const fmt = (x: (typeof any)[number]) => `${name(x.sq)} ${(x.rate * 100).toFixed(0)}%（${(x.share * 100).toFixed(0)}%の局）`;
  console.log(`\n${data.maxPly}手目までにそのマスで駒を取った局の勝率`);
  console.log(`- 高い: ${any.filter((x) => x.z > 0).slice(0, 5).map(fmt).join('、') || 'なし'}`);
  console.log(`- 低い: ${any.filter((x) => x.z < 0).slice(-5).reverse().map(fmt).join('、') || 'なし'}`);
}
