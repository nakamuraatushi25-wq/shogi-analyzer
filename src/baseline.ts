import type { FeatureVector } from './features.ts';

// 1つの比較グループ（例：四間飛車側・勝ち局・初段帯）の各特徴量の平均と標準偏差
export type FeatureStats = { n: number; mean: FeatureVector; std: FeatureVector };

export function summarize(samples: FeatureVector[]): FeatureStats {
  const keys = new Set(samples.flatMap((s) => Object.keys(s)));
  const mean: FeatureVector = {};
  const std: FeatureVector = {};
  const n = samples.length;
  for (const k of keys) {
    const xs = samples.map((s) => s[k] ?? 0);
    const m = xs.reduce((a, b) => a + b, 0) / n;
    const v = n > 1 ? xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : 0;
    mean[k] = m;
    std[k] = Math.sqrt(v);
  }
  return { n, mean, std };
}

export type Deviation = { feature: string; user: number; baseline: number; z: number };

/**
 * ユーザーの平均値が基準グループからどれだけ離れているかを、特徴量ごとの z スコアで返す（|z| の大きい順）。
 *
 * ユーザーの局数が少ないと平均がぶれて z が大きく出すぎるので、
 * 基準の平均へ priorGames 局ぶん引き寄せてから比べる（局数が増えるほど補正は弱くなる）。
 */
export function compare(user: FeatureStats, baseline: FeatureStats, priorGames = 10): Deviation[] {
  const out: Deviation[] = [];
  const keys = new Set([...Object.keys(user.mean), ...Object.keys(baseline.mean)]);
  for (const k of keys) {
    const sd = baseline.std[k] ?? 0;
    if (sd === 0) continue;
    const b = baseline.mean[k] ?? 0;
    const raw = user.mean[k] ?? 0;
    const shrunk = (raw * user.n + b * priorGames) / (user.n + priorGames);
    // 1局あたりのばらつきを、ユーザーの局数ぶんの平均のばらつきに直す
    const z = (shrunk - b) / (sd / Math.sqrt(Math.max(user.n, 1)));
    out.push({ feature: k, user: raw, baseline: b, z });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
