// 「勝ち要素が多く負け要素が少ない側が勝ち、そういう将棋を指す人ほど段位が高い」という仮説を確かめる。
// 棋譜を URL で2つに分け、半分A で囲いごとに勝ち要素・負け要素（src/gameEvents.ts）を選び、
// 半分B で「勝ち要素の数 − 負け要素の数」を点数にして次を出す。
//   ① 点数ごとの勝率と、点数で勝敗を当てられる度合い（AUC）
//   ② 段位帯ごとに、勝ち要素・負け要素の数、勝ち要素の多い側が勝った割合、要素ごとの出る割合（級位者と高段者）
// 上限の手数より前に終わった局は除く。
// 使い方: node scripts/element-score.ts <build-index.ts で作った一覧.jsonl> [手数の上限=60] [囲いごとに選ぶ最低局数=5000]
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { gameEvents } from '../src/gameEvents.ts';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';

const [file, plyStr, castleMinStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/element-score.ts <index.jsonl> [手数の上限] [囲いごとに選ぶ最低局数]');
  process.exit(1);
}
const maxPly = Number(plyStr ?? 60);
const castleMin = Number(castleMinStr ?? 5000);
const BANDS = [...RANK_BANDS, '段級位なし'];

type Side = { band: number; castle: string; ev: number[]; win: boolean };
const ids = new Map<string, number>();
const names: string[] = [];
const id = (e: string) => {
  let i = ids.get(e);
  if (i === undefined) { i = names.length; ids.set(e, i); names.push(e); }
  return i;
};
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2; };
const train: Side[] = [];
const test: [Side, Side][] = [];

for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner || g.plies <= maxPly) continue;
  const sides = (['sente', 'gote'] as const).map((color) => {
    const me = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    return {
      band: BANDS.indexOf(rankBand(me.rank) ?? '段級位なし'), castle: me.castle,
      ev: [...gameEvents(me, opp, maxPly)].map(id), win: g.winner === color,
    };
  }) as [Side, Side];
  if (hash(g.url) === 0) train.push(...sides);
  else test.push(sides);
}

// 半分A: 囲いごと（局数が足りなければ全体）に、段位帯の偏りを除いた勝率差が |z| ≥ 3 の要素を選ぶ
type Cell = { win: number; loss: number };
function select(sides: Side[]): Map<number, number> {
  const games = BANDS.map(() => ({ win: 0, loss: 0 }));
  const feats = new Map<number, Cell[]>();
  for (const s of sides) {
    const r = s.win ? 'win' : 'loss';
    games[s.band][r]++;
    for (const e of s.ev) {
      if (!feats.has(e)) feats.set(e, BANDS.map(() => ({ win: 0, loss: 0 })));
      feats.get(e)![s.band][r]++;
    }
  }
  const out = new Map<number, number>();
  for (const [e, cells] of feats) {
    let wsum = 0, diff = 0, varsum = 0;
    cells.forEach((y, b) => {
      const t = games[b];
      const ny = y.win + y.loss, nn = t.win + t.loss - ny;
      if (ny < 30 || nn < 30) return;
      const py = y.win / ny, pn = (t.win - y.win) / nn, w = t.win + t.loss;
      wsum += w;
      diff += w * (py - pn);
      varsum += w * w * ((py * (1 - py)) / ny + (pn * (1 - pn)) / nn);
    });
    if (wsum && Math.abs(diff / Math.sqrt(varsum)) >= 3) out.set(e, diff / wsum);
  }
  return out;
}
const general = select(train);
const byCastle = new Map<string, Map<number, number>>();
const castleCounts = new Map<string, number>();
for (const s of train) castleCounts.set(s.castle, (castleCounts.get(s.castle) ?? 0) + 1);
for (const [c, n] of castleCounts) if (n >= castleMin) byCastle.set(c, select(train.filter((s) => s.castle === c)));

// 点数: 勝ち要素の数 − 負け要素の数（囲いごとの要素を使う版と、全体の要素だけを使う版）
const score = (s: Side, weights: Map<number, number>) => s.ev.reduce((t, e) => t + Math.sign(weights.get(e) ?? 0), 0);
const scoreOf = (s: Side) => score(s, byCastle.get(s.castle) ?? general);

// AUC: 勝った側の点数が負けた側より高い確率（同点は半分）
function auc(pairs: [number, boolean][]) {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  let rankSum = 0, nPos = 0, i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j][0] === sorted[i][0]) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (sorted[k][1]) { rankSum += avg; nPos++; }
    i = j;
  }
  const nNeg = sorted.length - nPos;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

const pct = (c: Cell) => `${Math.round((c.win / (c.win + c.loss)) * 100)}%`;
const total = (c: Cell) => c.win + c.loss;
console.log(`# 勝ち要素・負け要素の点数と勝敗・段級位（${maxPly}手目まで、${maxPly}手を超えて続いた局）\n`);
console.log(`- 要素を選んだ半分A: ${train.length / 2} 局。確かめた半分B: ${test.length} 局`);
console.log(`- 全体で選んだ要素: 勝ち ${[...general.values()].filter((v) => v > 0).length}、負け ${[...general.values()].filter((v) => v < 0).length}`);
console.log(`- 囲いごとに選んだ囲い（半分Aで ${castleMin} 人分以上）: ${[...byCastle.keys()].join('、')}\n`);

// ① 点数ごとの勝率
const sidesB = test.flat();
const bins = [-99, -6, -3, -1, 0, 1, 3, 6, 99];
const binLabel = (i: number) => (i === 0 ? `${bins[1] - 1}以下` : i === bins.length - 2 ? `+${bins[i]}以上` : bins[i] + 1 === bins[i + 1] ? `${bins[i] > 0 ? '+' : ''}${bins[i]}` : `${bins[i] > 0 ? '+' : ''}${bins[i]}〜${bins[i + 1] - 1 > 0 ? '+' : ''}${bins[i + 1] - 1}`);
const binOf = (v: number) => bins.findIndex((b, i) => v >= b && v < bins[i + 1]);
const binTable = BANDS.map(() => bins.slice(1).map(() => ({ win: 0, loss: 0 })));
const allBins = bins.slice(1).map(() => ({ win: 0, loss: 0 }));
for (const s of sidesB) {
  const b = binOf(scoreOf(s));
  allBins[b][s.win ? 'win' : 'loss']++;
  binTable[s.band][b][s.win ? 'win' : 'loss']++;
}
console.log('## ① 点数（勝ち要素の数 − 負け要素の数）ごとの勝率（半分B）\n');
console.log(`| 点数 | 全体 | ${BANDS.join(' | ')} | この点数の人の割合 |`);
console.log(`|---|---|${BANDS.map(() => '---').join('|')}|---|`);
allBins.forEach((c, i) => {
  console.log(`| ${binLabel(i)} | ${total(c) ? pct(c) : '・'} | ${BANDS.map((_, b) => (total(binTable[b][i]) >= 300 ? pct(binTable[b][i]) : '・')).join(' | ')} | ${Math.round((total(c) / sidesB.length) * 100)}% |`);
});
const aucOf = (f: (s: Side) => number, sides = sidesB) => auc(sides.map((s) => [f(s), s.win]));
console.log('\n点数で勝敗を当てられる度合い（AUC。0.5 は当て推量、1.0 は全部当たる）\n');
console.log('| 段位帯 | 囲いごとの要素 | 全体の要素だけ | 局数 |');
console.log('|---|---|---|---|');
console.log(`| 全体 | ${aucOf(scoreOf).toFixed(3)} | ${aucOf((s) => score(s, general)).toFixed(3)} | ${sidesB.length / 2} |`);
BANDS.forEach((band, b) => {
  const sub = sidesB.filter((s) => s.band === b);
  if (sub.length < 1000) return;
  console.log(`| ${band} | ${aucOf(scoreOf, sub).toFixed(3)} | ${aucOf((s) => score(s, general), sub).toFixed(3)} | ${sub.length} 人分 |`);
});

// ② 段位帯ごとの将棋の中身。自分の段位帯で分け、勝った側・負けた側それぞれの勝ち要素・負け要素の数を出す
const count = (s: Side, sign: number) => {
  const w = byCastle.get(s.castle) ?? general;
  return s.ev.filter((e) => Math.sign(w.get(e) ?? 0) === sign).length;
};
console.log('\n## ② 段位帯ごとの勝ち要素・負け要素の数（半分B、1人1局あたり）\n');
console.log('| 段位帯 | 人数 | 勝ち要素（勝った側） | 負け要素（勝った側） | 勝ち要素（負けた側） | 負け要素（負けた側） | 勝ち要素（全体） | 負け要素（全体） |');
console.log('|---|---|---|---|---|---|---|---|');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
BANDS.forEach((band, b) => {
  const sub = sidesB.filter((s) => s.band === b);
  if (sub.length < 1000) return;
  const won = sub.filter((s) => s.win), lost = sub.filter((s) => !s.win);
  const f = (xs: Side[], sign: number) => mean(xs.map((s) => count(s, sign))).toFixed(2);
  console.log(`| ${band} | ${sub.length} | ${f(won, 1)} | ${f(won, -1)} | ${f(lost, 1)} | ${f(lost, -1)} | ${f(sub, 1)} | ${f(sub, -1)} |`);
});

// 同じ段位帯同士の対局で、勝ち要素の多い側が勝った割合と、両者の点差の大きさ
console.log('\n### 同じ段位帯同士の対局\n');
console.log('| 段位帯 | 局数 | 点数の高い側が勝った割合（同点を除く） | 同点の割合 | 両者の点差の平均 | 1局の要素の数（両者合計） |');
console.log('|---|---|---|---|---|---|');
BANDS.forEach((band, b) => {
  const games = test.filter(([x, y]) => x.band === b && y.band === b);
  if (games.length < 500) return;
  let higherWon = 0, decided = 0, tie = 0, gap = 0, elems = 0;
  for (const [x, y] of games) {
    const d = scoreOf(x) - scoreOf(y);
    gap += Math.abs(d);
    elems += count(x, 1) + count(x, -1) + count(y, 1) + count(y, -1);
    if (d === 0) { tie++; continue; }
    decided++;
    if ((d > 0) === x.win) higherWon++;
  }
  console.log(`| ${band} | ${games.length} | ${Math.round((higherWon / decided) * 100)}% | ${Math.round((tie / games.length) * 100)}% | ${(gap / games.length).toFixed(2)} | ${(elems / games.length).toFixed(1)} |`);
});

// 要素ごとの出る割合を、級位者（6級以下・5〜1級）と高段者（三段以上）で比べる
const groupOf = (b: number) => (b <= 1 ? '級位者' : b >= 3 && b <= 4 ? '高段者' : null);
const freq: Record<string, Map<number, number>> = { 級位者: new Map(), 高段者: new Map() };
const nSides: Record<string, number> = { 級位者: 0, 高段者: 0 };
for (const s of sidesB) {
  const g = groupOf(s.band);
  if (!g) continue;
  nSides[g]++;
  for (const e of s.ev) freq[g].set(e, (freq[g].get(e) ?? 0) + 1);
}
const rows = [...general.entries()].map(([e, w]) => {
  const k = (freq['級位者'].get(e) ?? 0) / nSides['級位者'];
  const h = (freq['高段者'].get(e) ?? 0) / nSides['高段者'];
  return { e, w, k, h };
});
console.log(`\n### 要素の出る割合：級位者（${nSides['級位者']} 人分）と高段者（三段以上、${nSides['高段者']} 人分）\n`);
for (const [title, sign] of [['勝ち要素', 1], ['負け要素', -1]] as const) {
  console.log(`\n#### ${title}（差の大きい順）\n`);
  console.log('| 要素 | 勝率差 | 級位者 | 高段者 | 高段者 − 級位者 |');
  console.log('|---|---|---|---|---|');
  for (const r of rows.filter((x) => Math.sign(x.w) === sign).sort((a, b) => Math.abs(b.h - b.k) - Math.abs(a.h - a.k)).slice(0, 12)) {
    const d = Math.round((r.h - r.k) * 1000) / 10;
    console.log(`| ${names[r.e]} | ${r.w > 0 ? '+' : ''}${(r.w * 100).toFixed(1)} | ${(r.k * 100).toFixed(1)}% | ${(r.h * 100).toFixed(1)}% | ${d > 0 ? '+' : ''}${d.toFixed(1)} |`);
  }
}
