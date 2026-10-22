// 局面の出来事（取った・取られた駒と場所、敵陣・自陣に入った駒と場所、最初のぶつかり、どちらが先か、何手目か）を
// 「要素」として文字列で表す。build-index.ts の一覧の captures / invasions から作る
const BASE: Record<string, string> = { TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI' };
const CLASS: Record<string, string> = { HI: '飛角', KA: '飛角', KI: '金銀', GI: '金銀', KE: '桂香', KY: '桂香', FU: '歩' };
const NAMES: Record<string, string> = { HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' };
const cls = (p: string) => CLASS[BASE[p] ?? p];
const name = (p: string) => NAMES[BASE[p] ?? p];
// 筋を自分から見て右（1〜3筋）・中央（4〜6筋）・左（7〜9筋）に分ける
const side = (sq: number) => ['右', '中央', '左'][Math.floor((Math.floor(sq / 10) - 1) / 3)];
const zone = (sq: number) => ['敵陣', '中段', '自陣'][Math.floor(((sq % 10) - 1) / 3)];
// 相手から見た座標を自分から見た座標にする
const flip = (sq: number) => (10 - Math.floor(sq / 10)) * 10 + (10 - (sq % 10));
const plyBucket = (ply: number, maxPly: number) => (ply <= 30 ? '30手まで' : ply <= 45 ? '31〜45手' : `46〜${maxPly}手`);

// 1局・1人分の要素を集める。me と opp は build-index.ts の一覧の sente / gote
export function gameEvents(me: any, opp: any, maxPly: number): Set<string> {
  const ev = new Set<string>();
  const mine = me.captures.filter((c: any) => c[0] <= maxPly);
  const theirs = opp.captures.filter((c: any) => c[0] <= maxPly);
  for (const [, sq, captured] of mine) {
    if ((BASE[captured] ?? captured) === 'FU') continue;
    ev.add(`${name(captured)}を取った`);
    ev.add(`${zone(sq)}の${side(sq)}で${cls(captured)}を取った`);
  }
  for (const [, osq, captured] of theirs) {
    if ((BASE[captured] ?? captured) === 'FU') continue;
    const sq = flip(osq);
    ev.add(`${name(captured)}を取られた`);
    ev.add(`${zone(sq)}の${side(sq)}で${cls(captured)}を取られた`);
  }
  for (const [ply, sq, piece, drop] of me.invasions) {
    if (ply > maxPly) continue;
    ev.add(drop ? `敵陣の${side(sq)}に${cls(piece)}を打った` : `${cls(piece)}が敵陣の${side(sq)}に入った`);
  }
  for (const [ply, osq, piece, drop] of opp.invasions) {
    if (ply > maxPly) continue;
    const sq = flip(osq);
    ev.add(drop ? `自陣の${side(sq)}に${cls(piece)}を打ち込まれた` : `相手の${cls(piece)}が自陣の${side(sq)}に入った`);
  }
  // 最初のぶつかり（歩・角以外を最初に取った手）の場所と、どちらが取ったか
  const big = (c: any) => !['FU', 'KA', 'UM'].includes(c[2]);
  const m = mine.find(big);
  const t = theirs.find(big);
  if (m || t) {
    const meFirst = m && (!t || m[0] < t[0]);
    const sq = meFirst ? m[1] : flip(t[1]);
    ev.add(`最初のぶつかり: ${meFirst ? '自分が取った' : '相手が取った'}（${zone(sq)}の${side(sq)}）`);
    ev.add(`最初のぶつかり: ${plyBucket(meFirst ? m[0] : t[0], maxPly)}`);
  } else ev.add('最初のぶつかり: なし');
  // 順番: 金銀を先に取ったのはどちらか、敵陣に先に入ったのはどちらか（歩を除く）
  const gm = mine.find((c: any) => cls(c[2]) === '金銀');
  const gt = theirs.find((c: any) => cls(c[2]) === '金銀');
  if (gm || gt) ev.add(`金銀を先に取った: ${gm && (!gt || gm[0] < gt[0]) ? '自分' : '相手'}`);
  if (gt) ev.add(`金銀を初めて取られた: ${plyBucket(gt[0], maxPly)}`);
  if (gm) ev.add(`金銀を初めて取った: ${plyBucket(gm[0], maxPly)}`);
  const im = me.invasions.find((v: any) => v[0] <= maxPly && v[2] !== 'FU');
  const it = opp.invasions.find((v: any) => v[0] <= maxPly && v[2] !== 'FU');
  if (im || it) ev.add(`敵陣に先に入った（歩以外）: ${im && (!it || im[0] < it[0]) ? '自分' : '相手'}`);
  if (it) ev.add(`自陣に初めて入られた（歩以外）: ${plyBucket(it[0], maxPly)}`);
  return ev;
}
