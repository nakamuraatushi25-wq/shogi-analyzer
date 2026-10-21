// 使い方: node scripts/report.ts <基準にする棋譜.kif> <ユーザーの棋譜.kif> <ユーザー名>
import { readFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { buildWinBaseline, reportAgainstBaseline, samplesFrom } from '../src/analyze.ts';

const [basePath, userPath, player] = process.argv.slice(2);
const load = (p: string) => splitKifGames(readFileSync(p, 'utf8')).map(parseKif);
const baseline = buildWinBaseline(samplesFrom(load(basePath), 'middle'));
for (const r of reportAgainstBaseline(samplesFrom(load(userPath), 'middle', player), baseline)) {
  console.log(`${r.key}  ${r.games}局（${r.wins}勝）`);
  for (const d of r.deviations) {
    console.log(`  ${d.feature}: あなた ${d.user.toFixed(3)} / 勝ち局平均 ${d.baseline.toFixed(3)} (z=${d.z.toFixed(1)})`);
  }
}
