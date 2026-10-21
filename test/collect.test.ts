import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collect, emptyState, isWantedGame } from '../src/collect/lishogi.ts';
import { parsePlayer } from '../src/players.ts';

const sample = readFileSync(new URL('./fixtures/lishogi-sample.kif', import.meta.url), 'utf8');

function fakeLishogi(users: Record<string, object>, games: Record<string, string>) {
  const calls: string[] = [];
  let first429 = true;
  const fetchFn = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const user = /\/api\/user\/([^/?]+)$/.exec(url)?.[1];
    if (user) {
      if (user === 'busy' && first429) {
        first429 = false;
        return new Response('', { status: 429 });
      }
      const u = users[decodeURIComponent(user)];
      return u ? Response.json(u) : new Response('', { status: 404 });
    }
    const g = /\/api\/games\/user\/([^/?]+)\?/.exec(url)?.[1];
    return new Response(games[decodeURIComponent(g!)] ?? '');
  }) as typeof fetch;
  return { fetchFn, calls };
}

const human = (games: number) => ({ perfs: { realTime: { games } } });

test('対戦相手をたどり、BOT と対局数の少ない人を飛ばし、同じ局は1回だけ保存する', async () => {
  const { fetchFn } = fakeLishogi(
    {
      KEN0057: human(800), piero1: human(50), takosu2577777: human(300), tenho333: human(5),
      YAMADA0_0: { title: 'BOT', ...human(900) }, free_palestine_007: human(100),
    },
    { KEN0057: sample, piero1: sample.split('\n\n\n')[0] },
  );
  const saved: Record<string, number> = {};
  const state = await collect({
    seeds: ['KEN0057'], maxPlayers: 10, gamesPerPlayer: 100, fetch: fetchFn, sleep: async () => {},
    onPlayer: (u, kifs) => { saved[u] = kifs.length; },
  });
  assert.equal(saved.KEN0057, 5);
  assert.equal(saved.piero1, 0);
  assert.equal(state.seenGames.length, 5);
  assert.deepEqual(state.skipped.sort(), ['YAMADA0_0', 'tenho333']);
  assert.equal(state.queue.length, 0);
});

test('429 が返ったら待ってやり直す', async () => {
  const { fetchFn, calls } = fakeLishogi({ busy: human(100) }, { busy: '' });
  const waits: number[] = [];
  const state = await collect({
    seeds: ['busy'], maxPlayers: 1, gamesPerPlayer: 10, fetch: fetchFn, sleep: async (ms) => { waits.push(ms); },
    state: emptyState(),
  });
  assert.ok(waits.includes(60_000));
  assert.equal(calls.filter((c) => c.endsWith('/api/user/busy')).length, 2);
  assert.deepEqual(state.done, ['busy']);
});

test('平手のレート戦で終局したものだけを対象にする', () => {
  const game = sample.split('\n\n\n')[0];
  assert.equal(isWantedGame(game), true);
  assert.equal(isWantedGame(game.replace('Rated', 'Casual')), false);
  assert.equal(isWantedGame(game.replace('手合割：平手', '手合割：香落ち')), false);
});

test('対局者欄を段級位と名前に分ける', () => {
  assert.deepEqual(parsePlayer('二段 KEN0057'), { rank: '二段', name: 'KEN0057' });
  assert.deepEqual(parsePlayer('1級 free_palestine_007'), { rank: '1級', name: 'free_palestine_007' });
  assert.deepEqual(parsePlayer('KEN0057'), { rank: null, name: 'KEN0057' });
});
