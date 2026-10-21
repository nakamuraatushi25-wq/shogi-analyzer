import { compare, summarize, type Deviation, type FeatureStats } from './baseline.ts';
import { extractFeatures, type FeatureVector, type Phase } from './features.ts';
import { classifyOpening } from './opening.ts';
import type { Color, Game } from './types.ts';

// 比較の単位。同じ戦型で同じ側（例：対抗形の振り飛車側）の局どうしを比べる
export function groupKey(game: Game, color: Color): string {
  const o = classifyOpening(game);
  const me = color === 'sente' ? o.sente : o.gote;
  return `${o.opening}｜${me.rookStyle}`;
}

export type Sample = { key: string; win: boolean; rates: FeatureVector };

// player を指定するとその対局者の側だけ、指定しなければ両者を取り出す
export function samplesFrom(games: Game[], phase: Phase, player?: string): Sample[] {
  const out: Sample[] = [];
  for (const game of games) {
    if (game.result.winner === null) continue;
    const f = extractFeatures(game);
    for (const color of ['sente', 'gote'] as const) {
      const name = game.headers[color === 'sente' ? '先手' : '後手'] ?? '';
      if (player !== undefined && !name.split(/\s+/).includes(player)) continue;
      out.push({ key: groupKey(game, color), win: game.result.winner === color, rates: f[color].rates[phase] });
    }
  }
  return out;
}

// 戦型ごとの「勝ち局の基準値」
export function buildWinBaseline(samples: Sample[]): Map<string, FeatureStats> {
  const groups = new Map<string, FeatureVector[]>();
  for (const s of samples) {
    if (!s.win) continue;
    groups.set(s.key, [...(groups.get(s.key) ?? []), s.rates]);
  }
  return new Map([...groups].map(([k, v]) => [k, summarize(v)]));
}

export type GroupReport = { key: string; games: number; wins: number; deviations: Deviation[] };

// ユーザーの局を戦型ごとにまとめ、勝ち局の基準からズレの大きい特徴量を返す
export function reportAgainstBaseline(user: Sample[], baseline: Map<string, FeatureStats>, top = 3): GroupReport[] {
  const groups = new Map<string, Sample[]>();
  for (const s of user) groups.set(s.key, [...(groups.get(s.key) ?? []), s]);
  const reports: GroupReport[] = [];
  for (const [key, ss] of groups) {
    const base = baseline.get(key);
    if (!base) continue;
    reports.push({
      key,
      games: ss.length,
      wins: ss.filter((s) => s.win).length,
      deviations: compare(summarize(ss.map((s) => s.rates)), base).slice(0, top),
    });
  }
  return reports.sort((a, b) => b.games - a.games);
}
