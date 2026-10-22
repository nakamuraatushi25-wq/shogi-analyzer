// 囲いごとに「取った駒」「敵陣に入った駒」の種類と勝ち負けの関係を表にする
// 駒の種類ごとに、上限の手数までにその駒を取った（入った）局と取らなかった局の勝率の差を出す。
// 段位帯ごとに差をとってから局数で重みをつけて平均するので、段位帯の勝率の偏りは差に入らない
// 使い方: node scripts/castle-pieces.ts <build-index.ts で作った一覧.jsonl> [手数の上限=60] [囲いの数=10] [最低局数=300]
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';

const [file, plyStr, castlesStr, minStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/castle-pieces.ts <index.jsonl> [手数の上限] [囲いの数] [最低局数]');
  process.exit(1);
}
const maxPly = Number(plyStr ?? 60);
const maxCastles = Number(castlesStr ?? 10);
const minGames = Number(minStr ?? 300);

// 成駒は元の駒にまとめる
const BASE: Record<string, string> = { TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI' };
const base = (p: string) => BASE[p] ?? p;
const PIECES = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];
const NAMES: Record<string, string> = { HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' };
const FEATURES = [
  ...PIECES.map((p) => ({ key: `cap:${p}`, label: `${NAMES[p]}を取った` })),
  ...PIECES.map((p) => ({ key: `inv:${p}`, label: `${NAMES[p]}が盤上から敵陣に入った` })),
  ...PIECES.map((p) => ({ key: `drop:${p}`, label: `${NAMES[p]}を敵陣に打った` })),
];
const BANDS = [...RANK_BANDS, '段級位なし'];

type Cell = { win: number; loss: number };
// 視点（自分の囲い／相手の囲い）→ 囲い → 段位帯 → 特徴 → あり/なし
type Stat = { games: Cell; feats: Record<string, { yes: Cell; no: Cell }> };
const table: Record<string, Record<string, Record<string, Stat>>> = { 自分の囲い: {}, 相手の囲い: {} };

const add = (persp: string, castle: string, band: string, present: Set<string>, r: 'win' | 'loss') => {
  const st = (((table[persp][castle] ??= {})[band]) ??= { games: { win: 0, loss: 0 }, feats: {} });
  st.games[r]++;
  for (const f of FEATURES) {
    const c = (st.feats[f.key] ??= { yes: { win: 0, loss: 0 }, no: { win: 0, loss: 0 } });
    c[present.has(f.key) ? 'yes' : 'no'][r]++;
  }
};

for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner) continue;
  for (const color of ['sente', 'gote'] as const) {
    const me = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    const present = new Set<string>();
    for (const [ply, , captured] of me.captures) if (ply <= maxPly) present.add(`cap:${base(captured)}`);
    for (const [ply, , piece, drop] of me.invasions) if (ply <= maxPly) present.add(`${drop ? 'drop' : 'inv'}:${base(piece)}`);
    const r = g.winner === color ? 'win' : 'loss';
    const band = rankBand(me.rank) ?? '段級位なし';
    for (const castle of [me.castle, 'すべて']) add('自分の囲い', castle, band, present, r);
    for (const castle of [opp.castle, 'すべて']) add('相手の囲い', castle, band, present, r);
  }
}

const n = (c: Cell) => c.win + c.loss;
const p = (c: Cell) => c.win / n(c);
// 段位帯ごとの差（あり − なし）を局数で重みづけして平均する。z はその差を標準誤差で割ったもの
function adjusted(byBand: Record<string, Stat>, key: string) {
  let wsum = 0, diff = 0, varsum = 0, yes = 0, all = 0;
  for (const b of BANDS) {
    const c = byBand[b]?.feats[key];
    if (!c) continue;
    all += n(c.yes) + n(c.no);
    yes += n(c.yes);
    if (n(c.yes) < 30 || n(c.no) < 30) continue;
    const w = n(c.yes) + n(c.no);
    const py = p(c.yes), pn = p(c.no);
    wsum += w;
    diff += w * (py - pn);
    varsum += w * w * ((py * (1 - py)) / n(c.yes) + (pn * (1 - pn)) / n(c.no));
  }
  if (!wsum) return null;
  return { diff: diff / wsum, z: diff / Math.sqrt(varsum), yes, all };
}
const fmt = (a: ReturnType<typeof adjusted>) => {
  if (!a || a.yes < minGames || a.all - a.yes < minGames) return '・';
  const pt = Math.round(a.diff * 1000) / 10;
  return `${pt >= 0 ? '+' : ''}${pt.toFixed(1)}${Math.abs(a.z) >= 3 ? '' : '（?）'}`;
};
const total = (byBand: Record<string, Stat>) => Object.values(byBand).reduce((s, st) => s + n(st.games), 0);

console.log(`# 囲いごとの「取った駒」「敵陣に入った駒」と勝率（${maxPly}手目まで）\n`);
console.log('数字は「その駒を取った（入った）局の勝率 − そうでない局の勝率」（ポイント、段位帯の偏りを除いたもの）。');
console.log(`（?）は |z| < 3 で偶然の範囲。・はあり・なしのどちらかが ${minGames} 局未満。\n`);
for (const persp of ['自分の囲い', '相手の囲い']) {
  const castles = Object.entries(table[persp])
    .sort(([a, x], [b, y]) => (a === 'すべて' ? -1 : b === 'すべて' ? 1 : total(y) - total(x)))
    .slice(0, maxCastles + 1);
  console.log(`## ${persp}別\n`);
  console.log(`| | ${castles.map(([c, t]) => `${c}（${total(t)}）`).join(' | ')} |`);
  console.log(`|---|${castles.map(() => '---').join('|')}|`);
  console.log(`| （勝率） | ${castles.map(([, t]) => `${Math.round((Object.values(t).reduce((s, st) => s + st.games.win, 0) / total(t)) * 100)}%`).join(' | ')} |`);
  for (const f of FEATURES) {
    console.log(`| ${f.label} | ${castles.map(([, t]) => fmt(adjusted(t, f.key))).join(' | ')} |`);
  }
  console.log(`\n### ${persp}別：その駒を取った（入った）局の割合\n`);
  console.log(`| | ${castles.map(([c]) => c).join(' | ')} |`);
  console.log(`|---|${castles.map(() => '---').join('|')}|`);
  for (const f of FEATURES) {
    console.log(`| ${f.label} | ${castles.map(([, t]) => { const a = adjusted(t, f.key); return a ? `${Math.round((a.yes / a.all) * 100)}%` : '・'; }).join(' | ')} |`);
  }
  console.log('');
}
