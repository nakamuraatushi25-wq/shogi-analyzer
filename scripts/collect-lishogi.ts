// lishogi から人間同士のレート戦の棋譜を集める。手元の PC で動かす想定。
//
//   node scripts/collect-lishogi.ts --seeds KEN0057,mikan33 --players 50 --games 200 --out data/lishogi
//
// 途中で止めても、同じ --out でもう一度実行すれば続きから再開する。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { collect, emptyState, type CollectState } from '../src/collect/lishogi.ts';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '' },
    players: { type: 'string', default: '50' },
    games: { type: 'string', default: '200' },
    out: { type: 'string', default: 'data/lishogi' },
    delay: { type: 'string', default: '1000' },
  },
});

const out = values.out!;
const statePath = join(out, 'state.json');
mkdirSync(join(out, 'players'), { recursive: true });
const state: CollectState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : emptyState();
const seeds = values.seeds!.split(',').map((s) => s.trim()).filter(Boolean);
if (seeds.length === 0 && state.queue.length === 0) {
  console.error('--seeds に最初の対局者名を1人以上指定してください');
  process.exit(1);
}

await collect({
  seeds,
  maxPlayers: Number(values.players),
  gamesPerPlayer: Number(values.games),
  delayMs: Number(values.delay),
  state,
  log: (m) => console.log(m),
  onPlayer: (username, kifs, s) => {
    if (kifs.length > 0) writeFileSync(join(out, 'players', `${username}.kif`), kifs.join('\n\n') + '\n');
    writeFileSync(statePath, JSON.stringify(s));
  },
});
console.log(`完了: 処理済み ${state.done.length}人 / 待ち ${state.queue.length}人 / 棋譜 ${state.seenGames.length}局`);
