// 囲いごとに「勝ちやすい要素」「負けやすい要素」を洗い出す。
// 上限の手数までに起きたこと（取った・取られた駒と場所、敵陣・自陣に入った駒と場所、最初のぶつかり、どちらが先か、何手目か）を
// 要素として局ごとに数え、その要素があった局となかった局の勝率の差を囲いごとに出す。
// 上限の手数より前に終わった局は、要素が結果そのもの（寄せ）になってしまうので除く。
// 偶然の差を拾わないよう、棋譜を URL で2つに分け、両方で同じ向きに出た要素だけを残す
// 使い方: node scripts/castle-events.ts <build-index.ts で作った一覧.jsonl> [手数の上限=60] [囲いの数=10] [最低局数=300] [各向きの件数=10]
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { gameEvents } from '../src/gameEvents.ts';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';

const [file, plyStr, castlesStr, minStr, topStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/castle-events.ts <index.jsonl> [手数の上限] [囲いの数] [最低局数] [各向きの件数]');
  process.exit(1);
}
const maxPly = Number(plyStr ?? 60);
const maxCastles = Number(castlesStr ?? 10);
const minGames = Number(minStr ?? 300);
const top = Number(topStr ?? 10);

type Cell = { win: number; loss: number };
// 囲い → 半分（0/1/全体=2） → 段位帯 → 要素 → あり（なしは全局から引く）
type Group = { games: Cell[][]; feats: Record<string, Cell[][]> };
const BANDS = [...RANK_BANDS, '段級位なし'];
const newCells = () => [0, 1, 2].map(() => BANDS.map(() => ({ win: 0, loss: 0 })));
const tables: Record<string, Record<string, Group>> = { 自分の囲い: {}, 相手の囲い: {} };
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2; };
let used = 0;

for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner || g.plies <= maxPly) continue;
  used++;
  const half = hash(g.url);
  for (const color of ['sente', 'gote'] as const) {
    const me = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    const ev = gameEvents(me, opp, maxPly);
    const r = g.winner === color ? 'win' : 'loss';
    const b = BANDS.indexOf(rankBand(me.rank) ?? '段級位なし');
    for (const [persp, castle] of [['自分の囲い', me.castle], ['相手の囲い', opp.castle], ['自分の囲い', 'すべて']]) {
      const grp = (tables[persp][castle] ??= { games: newCells(), feats: {} });
      for (const h of [half, 2]) grp.games[h][b][r]++;
      for (const e of ev) {
        const f = (grp.feats[e] ??= newCells());
        for (const h of [half, 2]) f[h][b][r]++;
      }
    }
  }
}

const n = (c: Cell) => c.win + c.loss;
// 段位帯ごとの差（あり − なし）を局数で重みづけして平均する
function adjusted(grp: Group, feat: string, h: number) {
  let wsum = 0, diff = 0, varsum = 0, yes = 0, all = 0;
  BANDS.forEach((_, b) => {
    const y = grp.feats[feat][h][b];
    const t = grp.games[h][b];
    const no = { win: t.win - y.win, loss: t.loss - y.loss };
    yes += n(y);
    all += n(t);
    if (n(y) < 30 || n(no) < 30) return;
    const py = y.win / n(y), pn = no.win / n(no), w = n(t);
    wsum += w;
    diff += w * (py - pn);
    varsum += w * w * ((py * (1 - py)) / n(y) + (pn * (1 - pn)) / n(no));
  });
  if (!wsum || yes < minGames || all - yes < minGames) return null;
  return { diff: diff / wsum, z: diff / Math.sqrt(varsum), se: Math.sqrt(varsum) / wsum, share: yes / all };
}
const total = (grp: Group) => grp.games[2].reduce((s, c) => s + n(c), 0);
const pt = (v: number) => `${v >= 0 ? '+' : ''}${(Math.round(v * 1000) / 10).toFixed(1)}`;

const overall = tables['自分の囲い']['すべて'];
console.log(`# 囲いごとの勝ちやすい要素・負けやすい要素（${maxPly}手目まで、${maxPly}手を超えて続いた ${used} 局）\n`);
console.log('差は「その要素があった局の勝率 − なかった局の勝率」（ポイント、段位帯の偏りを除いたもの）。');
console.log('全体で |z| ≥ 3、かつ棋譜を2つに分けた両方で同じ向き・|z| ≥ 2 の要素だけを載せる。');
console.log('「全局」はすべての囲いを合わせた差。「この囲いで特に出る要素」は全局との差が |z| ≥ 3 のもの。\n');
for (const persp of ['自分の囲い', '相手の囲い']) {
  const groups = Object.entries(tables[persp])
    .filter(([c]) => c !== 'すべて' || persp === '自分の囲い')
    .sort(([a, x], [b, y]) => (a === 'すべて' ? -1 : b === 'すべて' ? 1 : total(y) - total(x)))
    .slice(0, maxCastles + (persp === '自分の囲い' ? 1 : 0));
  console.log(`## ${persp}別\n`);
  for (const [castle, grp] of groups) {
    const rows = Object.keys(grp.feats)
      .map((f) => ({ f, all: adjusted(grp, f, 2), a: adjusted(grp, f, 0), b: adjusted(grp, f, 1), base: overall.feats[f] ? adjusted(overall, f, 2) : null }))
      .filter((x) => x.all && x.a && x.b && Math.abs(x.all.z) >= 3 && Math.sign(x.a.diff) === Math.sign(x.b.diff) && Math.abs(x.a.z) >= 2 && Math.abs(x.b.z) >= 2)
      .sort((x, y) => y.all!.diff - x.all!.diff);
    const baseCol = (x: (typeof rows)[number]) => (x.base ? pt(x.base.diff) : '・');
    console.log(`### ${castle}（${total(grp)}）\n`);
    console.log('| 向き | 要素 | 差 | 全局 | 半分A | 半分B | あった局の割合 |');
    console.log('|---|---|---|---|---|---|---|');
    const show = [...rows.filter((x) => x.all!.diff > 0).slice(0, top), ...rows.filter((x) => x.all!.diff < 0).slice(-top)];
    for (const x of show) {
      console.log(`| ${x.all!.diff > 0 ? '勝ちやすい' : '負けやすい'} | ${x.f} | ${pt(x.all!.diff)} | ${baseCol(x)} | ${pt(x.a!.diff)} | ${pt(x.b!.diff)} | ${Math.round(x.all!.share * 100)}% |`);
    }
    if (castle !== 'すべて') {
      const special = rows
        .filter((x) => x.base && Math.abs(x.all!.diff - x.base.diff) / Math.hypot(x.all!.se, x.base.se) >= 3)
        .sort((x, y) => Math.abs(y.all!.diff - y.base!.diff) - Math.abs(x.all!.diff - x.base!.diff))
        .slice(0, top);
      if (special.length) {
        console.log(`\n この囲いで特に出る要素（全局より強い・弱い、または向きが逆）\n`);
        console.log('| 要素 | 差 | 全局 | あった局の割合 |');
        console.log('|---|---|---|---|');
        for (const x of special) console.log(`| ${x.f} | ${pt(x.all!.diff)} | ${baseCol(x)} | ${Math.round(x.all!.share * 100)}% |`);
      }
    }
    console.log('');
  }
}
