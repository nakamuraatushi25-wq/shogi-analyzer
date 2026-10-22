// 仕掛けの局面とその20手後の指標（src/winPatterns.ts）、定跡を外れた手数と勝ち負けの関係を表にする
// 使い方: node --max-old-space-size=4096 scripts/win-patterns.ts <build-index.ts で作った一覧.jsonl> [戦型の数=8] [最低局数=300]
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';

const [file, groupsStr, minStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/win-patterns.ts <index.jsonl> [戦型の数] [最低局数]');
  process.exit(1);
}
const maxGroups = Number(groupsStr ?? 8);
const minGames = Number(minStr ?? 300);
// この局数以上で指された手順を「定跡」とみなす
const BOOK_MIN_GAMES = 30;
const BOOK_MAX_PLY = 30;

type Bin = { label: string; test: (v: number) => boolean };
const ints = (max: number, unit = ''): Bin[] => [
  ...Array.from({ length: max }, (_, i) => ({ label: `${i}${unit}`, test: (v: number) => v === i })),
  { label: `${max}${unit}以上`, test: (v: number) => v >= max },
];
const ranges = (edges: number[], fmt: (v: number) => string): Bin[] => [
  { label: `${fmt(edges[0])}未満`, test: (v) => v < edges[0] },
  ...edges.slice(1).map((e, i) => ({ label: `${fmt(edges[i])}〜${fmt(e)}`, test: (v: number) => v >= edges[i] && v < e })),
  { label: `${fmt(edges[edges.length - 1])}以上`, test: (v) => v >= edges[edges.length - 1] },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;

type Metric = { key: string; name: string; value: (me: any, opp: any) => number | null; bins: Bin[] };
const METRICS: Metric[] = [
  { key: 'kingGuards', name: '1. 玉の周りの金銀（枚）', value: (m) => m.kingGuards, bins: ints(4, '枚') },
  { key: 'guardDiff', name: '1. 玉の周りの金銀・相手との差（枚）', value: (m, o) => m.kingGuards - o.kingGuards, bins: [
    { label: '−2枚以下', test: (v) => v <= -2 }, { label: '−1枚', test: (v) => v === -1 }, { label: '同じ', test: (v) => v === 0 },
    { label: '+1枚', test: (v) => v === 1 }, { label: '+2枚以上', test: (v) => v >= 2 }] },
  { key: 'advanced', name: '2. 5段目より前に出ている駒（枚）', value: (m) => m.advanced, bins: ints(4, '枚') },
  { key: 'unmovedMajor', name: '3. 動いていない桂・香・角・飛（枚）', value: (m) => m.unmovedMajor, bins: ints(5, '枚') },
  { key: 'defenseShare', name: '4. 仕掛けまでの玉と金の手の割合', value: (m) => m.defenseShare, bins: ranges([0.2, 0.3, 0.4, 0.5], pct) },
  { key: 'pressure', name: '5. 玉への圧力（相手玉への利き − 自玉への利き）', value: (m) => m.pressure, bins: [
    { label: '−6以下', test: (v) => v <= -6 }, { label: '−5〜−3', test: (v) => v >= -5 && v <= -3 }, { label: '−2〜−1', test: (v) => v >= -2 && v <= -1 },
    { label: '0', test: (v) => v === 0 }, { label: '+1〜+2', test: (v) => v >= 1 && v <= 2 }, { label: '+3〜+5', test: (v) => v >= 3 && v <= 5 },
    { label: '+6以上', test: (v) => v >= 6 }] },
  { key: 'attackShare', name: '6. 仕掛け後20手の攻めの手の割合', value: (m) => m.attackShare, bins: ranges([0.4, 0.5, 0.6, 0.7], pct) },
  { key: 'promoted', name: '7. 仕掛け後20手以内に成ったか', value: (m) => (m.promoted === null ? null : m.promoted ? 1 : 0), bins: [
    { label: '成っていない', test: (v) => v === 0 }, { label: '成った', test: (v) => v === 1 }] },
  { key: 'handPieces', name: '8. 仕掛け後20手の持ち駒（歩以外、枚）', value: (m) => m.handPieces, bins: ints(4, '枚') },
  { key: 'handDiff', name: '8. 持ち駒（歩以外）・相手との差（枚）', value: (m, o) => (m.handPieces === null ? null : m.handPieces - o.handPieces), bins: [
    { label: '−2枚以下', test: (v) => v <= -2 }, { label: '−1枚', test: (v) => v === -1 }, { label: '同じ', test: (v) => v === 0 },
    { label: '+1枚', test: (v) => v === 1 }, { label: '+2枚以上', test: (v) => v >= 2 }] },
];

// 一覧は大きいので、使う項目だけ残して持つ
const slim = (s: any) => ({ rank: s.rank, rookStyle: s.rookStyle, metrics: s.metrics });
const games: any[] = [];
for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (g.winner) games.push({ winner: g.winner, opening: g.opening, moves: g.moves, sente: slim(g.sente), gote: slim(g.gote) });
}

// 10. 定跡（BOOK_MIN_GAMES 局以上で指された手順）を外れた手数。手順を手数ごとにハッシュして数える
function hashes(moves: string[]): number[] {
  const out: number[] = [];
  let h = 0;
  for (const m of moves.slice(0, BOOK_MAX_PLY)) {
    for (let i = 0; i < m.length; i++) h = (Math.imul(h ^ m.charCodeAt(i), 2654435761) + 0x9e3779b9) >>> 0;
    h = (Math.imul(h, 40503) + m.length) >>> 0;
    out.push(h * 64 + out.length);
  }
  return out;
}
const bookCount = new Map<number, number>();
for (const g of games) for (const h of hashes(g.moves)) bookCount.set(h, (bookCount.get(h) ?? 0) + 1);
function leftBookAt(g: any): number | null {
  const hs = hashes(g.moves);
  for (let i = 0; i < hs.length; i++) if ((bookCount.get(hs[i]) ?? 0) < BOOK_MIN_GAMES) return i + 1;
  return null;
}

type Cell = { win: number; loss: number; sum: number; sumsq: number };
type Acc = Record<string, { win: Cell; loss: Cell; bins: Record<string, { win: number; loss: number }> }>;
const table: Record<string, Record<string, Acc>> = {};
const add = (acc: Acc, key: string, v: number, bin: string | null, r: 'win' | 'loss') => {
  const a = (acc[key] ??= { win: { win: 0, loss: 0, sum: 0, sumsq: 0 }, loss: { win: 0, loss: 0, sum: 0, sumsq: 0 }, bins: {} });
  a[r].win++;
  a[r].sum += v;
  a[r].sumsq += v * v;
  if (bin) (a.bins[bin] ??= { win: 0, loss: 0 })[r]++;
};

const NOVELTY = '10. 定跡を外れた手番と手数';
const noveltyBins = ['自分が先に外れた|1〜10手', '自分が先に外れた|11〜20手', '自分が先に外れた|21〜30手', '相手が先に外れた|1〜10手', '相手が先に外れた|11〜20手', '相手が先に外れた|21〜30手', '30手まで定跡どおり'];

for (const g of games) {
  const left = leftBookAt(g);
  for (const color of ['sente', 'gote'] as const) {
    const me = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    const r = g.winner === color ? 'win' : 'loss';
    const group = `${g.opening.replace(/（[先後]手[^）]*）/g, '')}｜${me.rookStyle}`;
    const band = rankBand(me.rank) ?? '段級位なし';
    for (const [grp, b] of [[group, '全体'], [group, band], ['すべての戦型', '全体'], ['すべての戦型', band]]) {
      const acc = ((table[grp] ??= {})[b] ??= {});
      if (me.metrics && opp.metrics) {
        for (const m of METRICS) {
          const v = m.value(me.metrics, opp.metrics);
          if (v === null) continue;
          add(acc, m.key, v, m.bins.find((x) => x.test(v))?.label ?? null, r);
        }
      }
      let nb: string;
      if (left === null) nb = '30手まで定跡どおり';
      else {
        const who = (left % 2 === 1) === (color === 'sente') ? '自分が先に外れた' : '相手が先に外れた';
        nb = `${who}|${left <= 10 ? '1〜10手' : left <= 20 ? '11〜20手' : '21〜30手'}`;
      }
      add(acc, NOVELTY, left ?? 31, nb, r);
    }
  }
}

function effect(a: Acc[string]) {
  const m = (c: Cell) => ({ mean: c.sum / c.win, v: (c.sumsq - c.win * (c.sum / c.win) ** 2) / (c.win - 1) });
  const w = m(a.win);
  const l = m(a.loss);
  const pooled = Math.sqrt(((a.win.win - 1) * w.v + (a.loss.win - 1) * l.v) / (a.win.win + a.loss.win - 2));
  return { win: w.mean, loss: l.mean, d: pooled > 0 ? (w.mean - l.mean) / pooled : 0 };
}
const rate = (c?: { win: number; loss: number }) => (c && c.win + c.loss >= minGames ? `${Math.round((c.win / (c.win + c.loss)) * 100)}%` : '・');
const PCT_KEYS = new Set(['defenseShare', 'attackShare', 'promoted']);
const fmtNum = (key: string, v: number) => (PCT_KEYS.has(key) ? `${Math.round(v * 100)}%` : v.toFixed(2));

const all = table['すべての戦型'];
const bands = ['全体', ...RANK_BANDS].filter((b) => all[b]);
console.log('# すべての戦型\n');
console.log('## 勝ち局と負け局の平均\n');
console.log('| 指標 | 勝ち局の平均 | 負け局の平均 | d |');
console.log('|---|---|---|---|');
for (const m of METRICS) {
  const e = effect(all['全体'][m.key]);
  console.log(`| ${m.name} | ${fmtNum(m.key, e.win)} | ${fmtNum(m.key, e.loss)} | ${e.d >= 0 ? '+' : ''}${e.d.toFixed(2)} |`);
}
for (const m of [...METRICS.map((x) => ({ key: x.key, name: x.name, labels: x.bins.map((b) => b.label) })), { key: NOVELTY, name: NOVELTY, labels: noveltyBins }]) {
  console.log(`\n## ${m.name}：値ごとの勝率（段位帯別）\n`);
  console.log(`| 値 | ${bands.join(' | ')} |`);
  console.log(`|---|${bands.map(() => '---').join('|')}|`);
  // 段位帯ごとに集めた選手の偏りで勝率の水準が違うので、その帯の平均勝率を並べておく
  console.log(`| （この帯の平均） | ${bands.map((b) => { const a = all[b][m.key]; return a ? rate({ win: a.win.win, loss: a.loss.win }) : '・'; }).join(' | ')} |`);
  for (const label of m.labels) console.log(`| ${label} | ${bands.map((b) => rate(all[b][m.key]?.bins[label])).join(' | ')} |`);
}

const groups = Object.entries(table)
  .filter(([g]) => g !== 'すべての戦型')
  .sort(([, a], [, b]) => {
    const n = (t: any) => (t['全体'][NOVELTY].win.win ?? 0) + (t['全体'][NOVELTY].loss.win ?? 0);
    return n(b) - n(a);
  })
  .slice(0, maxGroups);
console.log('\n# 戦型ごとの差（d、勝ち局の平均 − 負け局の平均を標準偏差で割ったもの）\n');
console.log(`| 指標 | ${groups.map(([g]) => g).join(' | ')} |`);
console.log(`|---|${groups.map(() => '---').join('|')}|`);
for (const m of METRICS) {
  console.log(`| ${m.name} | ${groups.map(([, t]) => { const a = t['全体'][m.key]; return a ? `${effect(a).d >= 0 ? '+' : ''}${effect(a).d.toFixed(2)}` : '・'; }).join(' | ')} |`);
}
