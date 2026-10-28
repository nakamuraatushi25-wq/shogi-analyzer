// 手筋・囲いの急所への利き・守り駒が崩れる順番を数え、勝ち負けと段位帯で比べる。
// 囲いを組み終えた局面（ふつうは仕掛けの直前）から一定の手数までに起きたことを要素として局ごとに数え、
//   - その要素があった局となかった局の勝率の差（段位帯の偏りを除いたもの）。棋譜を URL で2つに分けた両方で確かめる
//   - 段位帯ごとの、その要素があった局の割合
// を出す。一定の手数より前に終わった局は、要素が寄せそのものになるので除く。
// 最後に、手筋を局全体で何回使ったか（自分の100手あたり）と歩切れの割合を段位帯ごとに出す。
// 使い方: node scripts/tesuji.ts <build-index.ts で作った一覧.jsonl> [囲いの局面からの手数=40] [最低局数=300]
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { RANK_BANDS, rankBand } from '../src/ranks.ts';
import { TECHNIQUES } from '../src/techniques.ts';

const [file, winStr, minStr] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node scripts/tesuji.ts <index.jsonl> [囲いの局面からの手数] [最低局数]');
  process.exit(1);
}
const window = Number(winStr ?? 40);
const minGames = Number(minStr ?? 300);
const BANDS = [...RANK_BANDS, '段級位なし'];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2; };

type Watch = { king: number; key: number[]; samples: [number, number, number][]; outnumbered: number | null; kingMoved: number | null; defenders: [string, number, number | null, number | null][] };
const NAME: Record<string, string> = { KI: '金', GI: '銀' };
const bucket = (v: number, edges: number[], labels: string[]) => labels[edges.findIndex((e) => v <= e)] ?? labels[labels.length - 1];

// 1局の片側から要素を取り出す。group は表の見出し
function features(me: any, opp: any, castlePly: number): [string, string][] {
  const end = castlePly + window;
  const out: [string, string][] = [];
  for (const name of new Set<string>(me.tesuji.filter(([p]: [number]) => p <= end).map(([, n]: [number, string]) => n))) out.push(['手筋', name]);
  const w: Watch | null = me.watch, ow: Watch | null = opp.watch;
  if (!w || !ow) return out;
  // 急所への利き（囲いの局面から20手後）
  const at = (x: Watch) => x.samples.find(([p]) => p === castlePly + 20);
  const mine = at(w), theirs = at(ow);
  const lv = ['0', '1', '2', '3以上'];
  if (mine) {
    out.push(['急所への利き（20手後）', `自分の急所に相手の利きが ${bucket(mine[1], [0, 1, 2], lv)}`]);
    out.push(['急所への利き（20手後）', `自分の急所で相手の利きが自分の利きより ${mine[1] > mine[2] ? '多い' : '少ないか同じ'}`]);
  }
  if (theirs) out.push(['急所への利き（20手後）', `相手の急所に自分の利きが ${bucket(theirs[1], [0, 1, 2], lv)}`]);
  const over = (x: Watch) => (x.outnumbered === null || x.outnumbered > end ? `${window}手以内にはない` : bucket(x.outnumbered - castlePly, [10, 20], ['10手以内', '11〜20手', `21〜${window}手`]));
  out.push(['急所で利きが負けた時期（囲いの局面から）', `自分の急所: ${over(w)}`]);
  out.push(['急所で利きが負けた時期（囲いの局面から）', `相手の急所: ${over(ow)}`]);

  // 守り駒が崩れる順番。玉との距離は囲いの局面の玉の位置から（1 = 玉の隣）
  if (w.defenders.length) {
    const king = [Math.floor(w.king / 10), w.king % 10];
    const evs: { ply: number; label: string; captured: boolean; type: string }[] = [];
    for (const [type, sq, moved, captured] of w.defenders) {
      const near = Math.max(Math.abs(Math.floor(sq / 10) - king[0]), Math.abs((sq % 10) - king[1])) === 1 ? '玉の隣の' : '2マス先の';
      const first = [moved, captured].filter((p): p is number => p !== null && p <= end);
      if (!first.length) continue;
      const ply = Math.min(...first);
      evs.push({ ply, label: `${near}${NAME[type]}`, captured: captured === ply, type: NAME[type] });
    }
    evs.sort((a, b) => a.ply - b.ply);
    const kingFirst = w.kingMoved !== null && w.kingMoved <= end && (!evs.length || w.kingMoved < evs[0].ply);
    if (kingFirst) out.push(['守り駒が崩れる順番', '守り駒より先に玉が動いた']);
    else if (!evs.length) out.push(['守り駒が崩れる順番', `${window}手以内に守り駒が1枚も動かない`]);
    else out.push(['守り駒が崩れる順番', `最初に崩れた守り駒: ${evs[0].label}${evs[0].captured ? 'を取られた' : 'が動いた'}`]);
    const lost = w.defenders.map(([type, , , c]) => [type, c] as const).filter(([, c]) => c !== null && c <= end).sort((a, b) => a[1]! - b[1]!);
    out.push(['守り駒を取られた枚数', `${window}手以内に ${bucket(lost.length, [0, 1], ['0枚', '1枚', '2枚以上'])}`]);
    if (lost.length >= 2) out.push(['守り駒を取られた順番', `${NAME[lost[0][0]]}→${NAME[lost[1][0]]}`]);
    if (lost.length) out.push(['最初に守り駒を取られた時期', bucket(lost[0][1]! - castlePly, [10, 20], ['10手以内', '11〜20手', `21〜${window}手`])]);
  }
  return out;
}
type Cell = { win: number; loss: number };
const newCells = () => [0, 1, 2].map(() => BANDS.map(() => ({ win: 0, loss: 0 })));
const games = newCells();
const feats = new Map<string, { group: string; cells: Cell[][] }>();
// 局全体での手筋の回数と自分の手数（段位帯ごと）、歩切れ
const usage = BANDS.map(() => ({ moves: 0, sides: 0, counts: {} as Record<string, number>, pawnless: 0, afterFight: 0 }));
let used = 0;

for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line) continue;
  const g = JSON.parse(line);
  if (!g.winner) continue;
  for (const color of ['sente', 'gote'] as const) {
    const me = g[color];
    const b = BANDS.indexOf(rankBand(me.rank) ?? '段級位なし');
    const u = usage[b];
    u.sides++;
    u.moves += Math.ceil((g.plies - (color === 'sente' ? 0 : 1)) / 2);
    for (const [, name] of me.tesuji) u.counts[name] = (u.counts[name] ?? 0) + 1;
    u.pawnless += me.pawnless[0];
    u.afterFight += me.pawnless[1];
  }
  if (g.castlePly === null || g.plies <= g.castlePly + window) continue;
  used++;
  const half = hash(g.url);
  for (const color of ['sente', 'gote'] as const) {
    const me = g[color];
    const opp = g[color === 'sente' ? 'gote' : 'sente'];
    const r = g.winner === color ? 'win' : 'loss';
    const b = BANDS.indexOf(rankBand(me.rank) ?? '段級位なし');
    for (const h of [half, 2]) games[h][b][r]++;
    for (const [group, name] of features(me, opp, g.castlePly)) {
      const key = `${group}\t${name}`;
      if (!feats.has(key)) feats.set(key, { group, cells: newCells() });
      for (const h of [half, 2]) feats.get(key)!.cells[h][b][r]++;
    }
  }
}

const n = (c: Cell) => c.win + c.loss;
// 段位帯ごとの差（あり − なし）を局数で重みづけして平均する
function adjusted(cells: Cell[][], h: number) {
  let wsum = 0, diff = 0, varsum = 0, yes = 0, all = 0;
  BANDS.forEach((_, b) => {
    const y = cells[h][b], t = games[h][b];
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
  return { diff: diff / wsum, z: diff / Math.sqrt(varsum) };
}
const pt = (v: number) => `${v >= 0 ? '+' : ''}${(Math.round(v * 1000) / 10).toFixed(1)}`;
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
const SHOW_BANDS = RANK_BANDS.map((_, i) => i);
const share = (cells: Cell[][], b: number) => n(cells[2][b]) / n(games[2][b]);

console.log(`# 手筋・急所への利き・守り駒が崩れる順番（囲いの局面から${window}手まで、それより長く続いた ${used} 局）\n`);
console.log('「差」はその要素があった局の勝率 − なかった局の勝率（ポイント、段位帯の偏りを除いたもの）。');
console.log('「判定」: 棋譜を2つに分けた両方で同じ向き・|z| ≥ 2、全体で |z| ≥ 3 なら「勝ちやすい」「負けやすい」、そうでなければ「差なし」。');
console.log(`段位帯の列は、その要素があった局の割合。あった局・なかった局のどちらかが ${minGames} 局未満の要素は載せない。\n`);
const verdict = (all: { diff: number; z: number }, a: { diff: number; z: number } | null, b: { diff: number; z: number } | null) =>
  a && b && Math.abs(all.z) >= 3 && Math.sign(a.diff) === Math.sign(b.diff) && Math.abs(a.z) >= 2 && Math.abs(b.z) >= 2
    ? (all.diff > 0 ? '勝ちやすい' : '負けやすい') : '差なし';

// 仮説②の確かめ: 勝ちやすい要素は高段者ほど多く、負けやすい要素は高段者ほど少ないか
const lo = [0, 1], hi = [3, 4];
const avgShare = (cells: Cell[][], bands: number[]) => bands.reduce((s, b) => s + n(cells[2][b]), 0) / bands.reduce((s, b) => s + n(games[2][b]), 0);
const tally: Record<string, { agree: number; disagree: number }> = {};
const groups = [...new Set([...feats.values()].map((f) => f.group))];
for (const group of groups) {
  const rows = [...feats.entries()].filter(([, f]) => f.group === group)
    .map(([key, f]) => ({ name: key.split('\t')[1], f, all: adjusted(f.cells, 2), a: adjusted(f.cells, 0), b: adjusted(f.cells, 1) }))
    .filter((x) => x.all)
    .sort((x, y) => y.all!.diff - x.all!.diff);
  if (!rows.length) continue;
  console.log(`## ${group}\n`);
  console.log(`| 要素 | 差 | 半分A | 半分B | 判定 | ${SHOW_BANDS.map((b) => BANDS[b]).join(' | ')} | 高段者 − 級位者 |`);
  console.log(`|---|---|---|---|---|${SHOW_BANDS.map(() => '---').join('|')}|---|`);
  for (const x of rows) {
    const v = verdict(x.all!, x.a, x.b);
    const gap = avgShare(x.f.cells, hi) - avgShare(x.f.cells, lo);
    if (v !== '差なし') {
      const t = (tally[group] ??= { agree: 0, disagree: 0 });
      if ((v === '勝ちやすい') === (gap > 0)) t.agree++; else t.disagree++;
    }
    console.log(`| ${x.name} | ${pt(x.all!.diff)} | ${x.a ? pt(x.a.diff) : '・'} | ${x.b ? pt(x.b.diff) : '・'} | ${v} | ${SHOW_BANDS.map((b) => pct(share(x.f.cells, b))).join(' | ')} | ${pt(gap)} |`);
  }
  console.log('');
}

console.log('## 勝ちやすい要素は高段者に多く、負けやすい要素は高段者に少ないか\n');
console.log('「高段者 − 級位者」は三段以上と1級以下の、その要素があった局の割合の差。判定が「差なし」の要素は数えない。\n');
console.log('| 見出し | 向きが合う要素 | 向きが逆の要素 |');
console.log('|---|---|---|');
for (const [group, t] of Object.entries(tally)) console.log(`| ${group} | ${t.agree} | ${t.disagree} |`);
const tot = Object.values(tally).reduce((s, t) => ({ agree: s.agree + t.agree, disagree: s.disagree + t.disagree }), { agree: 0, disagree: 0 });
console.log(`| 合計 | ${tot.agree} | ${tot.disagree} |\n`);

console.log('## 手筋を局全体で使った回数（自分の100手あたり、全局）\n');
console.log(`| 手筋 | ${SHOW_BANDS.map((b) => BANDS[b]).join(' | ')} | 三段以上 ÷ 1級以下 |`);
console.log(`|---|${SHOW_BANDS.map(() => '---').join('|')}|---|`);
const rate = (name: string, bands: number[]) => (100 * bands.reduce((s, b) => s + (usage[b].counts[name] ?? 0), 0)) / bands.reduce((s, b) => s + usage[b].moves, 0);
for (const name of [...TECHNIQUES].sort((a, b) => rate(b, [0, 1, 2, 3, 4]) - rate(a, [0, 1, 2, 3, 4]))) {
  console.log(`| ${name} | ${SHOW_BANDS.map((b) => rate(name, [b]).toFixed(2)).join(' | ')} | ${(rate(name, hi) / rate(name, lo)).toFixed(2)} |`);
}
console.log(`| （仕掛けの後に歩切れだった手の割合） | ${SHOW_BANDS.map((b) => pct(usage[b].pawnless / usage[b].afterFight)).join(' | ')} | ・ |`);
console.log(`| （1局あたりの自分の手数） | ${SHOW_BANDS.map((b) => (usage[b].moves / usage[b].sides).toFixed(1)).join(' | ')} | ・ |`);
