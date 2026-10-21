import { readFileSync } from 'node:fs';
import { parseKif, splitKifGames } from '../src/kif.ts';
import { classifyOpening } from '../src/opening.ts';
const text = readFileSync(process.argv[2], 'utf8');
for (const chunk of splitKifGames(text)) {
  const g = parseKif(chunk);
  const r = classifyOpening(g);
  console.log(g.headers['場所'], g.result, r.opening, '| 先手', r.sente.rookStyle, r.sente.castle, JSON.stringify(r.sente.king), '| 後手', r.gote.rookStyle, r.gote.castle, JSON.stringify(r.gote.king), '| castlePly', r.castlePly, 'kaku', r.bishopExchange);
}
