// 駒を取った手数・場所・駒の組み合わせと勝ち負けの関係を表にする
// 使い方: node scripts/capture-timing.ts <build-index.ts で作った一覧.jsonl> [戦型の数=6] [最低局数=300]
import { readFileSync } from 'node:fs';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';

const [file, groupsStr, minStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/capture-timing.ts <index.jsonl> [戦型の数] [最低局数]');
  process.exit(1);
}
const maxGroups = Number(groupsStr ?? 6);
const minGames = Number(minStr ?? 300);
// 駒の組み合わせを数える手数の上限（終盤の寄せを含めないため）
const PAIR_MAX_PLY = 60;

const NAMES: Record<string, string> = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '成香', NK: '成桂', NG: '成銀', UM: '馬', RY: '龍',
};
const BUCKETS = ['1〜20手', '21〜40手', '41〜60手', '61〜80手', '81〜100手', '101手〜'];
const ZONES = ['敵陣', '中段', '自陣'];
const bucketOf = (ply: number) => BUCKETS[Math.min(5, Math.floor((ply - 1) / 20))];
const zoneOf = (sq: number) => ZONES[Math.floor(((sq % 10) - 1) / 3)];

type Cell = { win: number; loss: number };
type Stat = { games: Cell; byPly: Record<string, Cell>; first: Record<string, Cell>; pairs: Record<string, Cell> };
const newStat = (): Stat => ({ games: { win: 0, loss: 0 }, byPly: {}, first: {}, pairs: {} });
const bump = (m: Record<string, Cell>, k: string, r: 'win' | 'loss') => {
  (m[k] ??= { win: 0, loss: 0 })[r]++;
};

// 戦型｜飛車 → 段位帯 → 集計。'すべての戦型' には全局を入れる
const table: Record<string, Record<string, Stat>> = {};

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner) continue;
  for (const color of ['sente', 'gote'] as const) {
    const s = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    const r = g.winner === color ? 'win' : 'loss';
    const group = `${g.opening.replace(/（[先後]手[^）]*）/g, '')}｜${s.rookStyle}`;
    const caps = s.captures as [number, number, string, string][];
    const oppFirst = (opp.captures as [number][])[0]?.[0] ?? Infinity;
    const myFirst = caps[0]?.[0] ?? Infinity;

    const keysPly = new Set(caps.map(([ply, sq]) => `${bucketOf(ply)}|${zoneOf(sq)}`));
    const keysPair = new Set(
      caps.filter(([ply]) => ply <= PAIR_MAX_PLY).map(([, sq, captured, by]) => `${NAMES[by]}で${NAMES[captured]}を取る（${zoneOf(sq)}）`),
    );
    // 先に駒を取ったのはどちらか、そして盤上で最初の取り合いが何手目に起きたか
    const firstPly = Math.min(myFirst, oppFirst);
    const firstKey = firstPly === Infinity ? '駒の取り合いなし' : `${myFirst < oppFirst ? '自分が先に取った' : '相手が先に取った'}|${bucketOf(firstPly)}`;

    for (const [grp, band] of [[group, '全体'], [group, rankBand(s.rank) ?? '段級位なし'], ['すべての戦型', '全体'], ['すべての戦型', rankBand(s.rank) ?? '段級位なし']]) {
      const st = ((table[grp] ??= {})[band] ??= newStat());
      st.games[r]++;
      for (const k of keysPly) bump(st.byPly, k, r);
      for (const k of keysPair) bump(st.pairs, k, r);
      bump(st.first, firstKey, r);
    }
  }
}

const rate = (c: Cell | undefined) => (c && c.win + c.loss >= minGames ? `${((c.win / (c.win + c.loss)) * 100).toFixed(0)}%` : '・');

function plyTable(st: Stat) {
  console.log('| 何手目に取ったか | ' + ZONES.map((z) => `${z}で取った局の勝率`).join(' | ') + ' |');
  console.log('|---|' + ZONES.map(() => '---').join('|') + '|');
  for (const b of BUCKETS) console.log(`| ${b} | ${ZONES.map((z) => rate(st.byPly[`${b}|${z}`])).join(' | ')} |`);
}

function firstTable(st: Stat) {
  console.log('| 最初の取り合いが起きた手数 | 自分が先に取った局の勝率 | 相手が先に取った局の勝率 |');
  console.log('|---|---|---|');
  for (const b of BUCKETS.slice(0, 4)) {
    console.log(`| ${b} | ${rate(st.first[`自分が先に取った|${b}`])} | ${rate(st.first[`相手が先に取った|${b}`])} |`);
  }
}

function pairList(st: Stat) {
  const base = st.games.win / (st.games.win + st.games.loss);
  const items = Object.entries(st.pairs)
    .map(([k, c]) => ({ k, c, n: c.win + c.loss }))
    .filter((x) => x.n >= minGames)
    .map((x) => ({ ...x, p: x.c.win / x.n, z: (x.c.win / x.n - base) / Math.sqrt((base * (1 - base)) / x.n) }))
    .filter((x) => Math.abs(x.z) >= 3)
    .sort((a, b) => b.p - a.p);
  const total = st.games.win + st.games.loss;
  const fmt = (x: (typeof items)[number]) => `${x.k} ${(x.p * 100).toFixed(0)}%（${((x.n / total) * 100).toFixed(0)}%の局）`;
  console.log(`- 勝率が高い: ${items.filter((x) => x.z > 0).slice(0, 6).map(fmt).join('、') || 'なし'}`);
  console.log(`- 勝率が低い: ${items.filter((x) => x.z < 0).reverse().slice(0, 6).map(fmt).join('、') || 'なし'}`);
}

const all = table['すべての戦型'];
console.log('# すべての戦型\n\n## 何手目にどこで取ったか（段位帯別）\n');
for (const band of ['全体', ...RANK_BANDS]) {
  if (!all[band]) continue;
  const st = all[band];
  console.log(`### ${band}（${st.games.win + st.games.loss}件、勝率${((st.games.win / (st.games.win + st.games.loss)) * 100).toFixed(1)}%）\n`);
  plyTable(st);
  console.log('');
}
console.log('## どちらが先に駒を取ったか（段位帯別）\n');
for (const band of ['全体', ...RANK_BANDS]) {
  if (!all[band]) continue;
  console.log(`### ${band}\n`);
  firstTable(all[band]);
  console.log('');
}
console.log(`## ${PAIR_MAX_PLY}手目までの駒の組み合わせ\n`);
pairList(all['全体']);

const groups = Object.entries(table)
  .filter(([g]) => g !== 'すべての戦型')
  .sort(([, a], [, b]) => b['全体'].games.win + b['全体'].games.loss - (a['全体'].games.win + a['全体'].games.loss))
  .slice(0, maxGroups);
for (const [group, bands] of groups) {
  const st = bands['全体'];
  const n = st.games.win + st.games.loss;
  console.log(`\n# ${group}（${n}件、勝率${((st.games.win / n) * 100).toFixed(1)}%）\n`);
  plyTable(st);
  console.log('');
  firstTable(st);
  console.log(`\n${PAIR_MAX_PLY}手目までの駒の組み合わせ`);
  pairList(st);
}
