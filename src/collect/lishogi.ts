import { splitKifGames } from '../kif.ts';
import { parsePlayer } from '../players.ts';

// lishogi の公開 API から、人間同士のレート戦（平手）の棋譜を集める。
// 種になる対局者から始めて、対戦相手をたどって対象を広げる。

const API = 'https://lishogi.org';
const USER_AGENT = 'shogi-analyzer (+https://github.com/nakamuraatushi25-wq/shogi-analyzer)';

export type CollectState = {
  queue: string[];
  done: string[];
  skipped: string[];
  // 取得済みの対局URL。相手側から同じ局を取り直さないため
  seenGames: string[];
};

export type CollectOptions = {
  seeds: string[];
  // このセッションで新たに処理する対局者数の上限
  maxPlayers: number;
  gamesPerPlayer: number;
  // レート戦をこれより少なくしか指していない対局者は飛ばす
  minRatedGames?: number;
  // リクエストの間隔。lishogi の負荷にならないよう1件ずつ順番に投げる
  delayMs?: number;
  state?: CollectState;
  onPlayer?: (username: string, kifs: string[], state: CollectState) => Promise<void> | void;
  log?: (message: string) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type LishogiUser = {
  id: string;
  username: string;
  title?: string;
  disabled?: boolean;
  tosViolation?: boolean;
  perfs?: { realTime?: { games: number } };
};

export function emptyState(seeds: string[] = []): CollectState {
  return { queue: [...seeds], done: [], skipped: [], seenGames: [] };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 収集対象にする局：人間同士の平手のレート戦で、終局まで指されたもの
// BOT は対局者欄に「BOT 名前」と称号付きで出る
export function isWantedGame(kif: string): boolean {
  return /手合割[：:]\s*平手/.test(kif) && !/^[先後]手[：:]\s*BOT\s/m.test(kif) && /棋戦[：:].*Rated/.test(kif) && /^\s*\d+\s+(投了|詰み|切れ負け|時間切れ)/m.test(kif);
}

function header(kif: string, key: string): string | undefined {
  const m = new RegExp(`^${key}[：:](.*)$`, 'm').exec(kif);
  return m?.[1].trim();
}

export async function collect(opts: CollectOptions): Promise<CollectState> {
  const fetchFn = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const delay = opts.delayMs ?? 1000;
  const minGames = opts.minRatedGames ?? 20;
  const log = opts.log ?? (() => {});
  const state = opts.state ?? emptyState();
  for (const s of opts.seeds) if (!state.queue.includes(s) && !state.done.includes(s)) state.queue.push(s);

  const known = new Set([...state.queue, ...state.done, ...state.skipped].map((u) => u.toLowerCase()));
  const seen = new Set(state.seenGames);

  async function get(url: string, accept: string): Promise<Response> {
    for (;;) {
      await sleep(delay);
      const res = await fetchFn(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
      // lishogi は混雑時に 429 を返す。1分待ってから同じリクエストをやり直す
      if (res.status === 429) {
        log('429 Too Many Requests: 60秒待ちます');
        await sleep(60_000);
        continue;
      }
      return res;
    }
  }

  let processed = 0;
  while (state.queue.length > 0 && processed < opts.maxPlayers) {
    const username = state.queue.shift()!;
    processed++;

    const userRes = await get(`${API}/api/user/${encodeURIComponent(username)}`, 'application/json');
    if (!userRes.ok) {
      log(`${username}: ユーザー情報を取得できません (${userRes.status})`);
      state.skipped.push(username);
      continue;
    }
    const user = (await userRes.json()) as LishogiUser;
    const rated = user.perfs?.realTime?.games ?? 0;
    if (user.title === 'BOT' || user.disabled || user.tosViolation || rated < minGames) {
      log(`${username}: 対象外（BOT・停止中・レート戦${rated}局）`);
      state.skipped.push(username);
      continue;
    }

    const gamesRes = await get(
      `${API}/api/games/user/${encodeURIComponent(username)}?rated=true&max=${opts.gamesPerPlayer}&clocks=true&evals=true`,
      'text/plain',
    );
    if (!gamesRes.ok) {
      log(`${username}: 棋譜を取得できません (${gamesRes.status})`);
      state.skipped.push(username);
      continue;
    }

    const kifs: string[] = [];
    for (const kif of splitKifGames(await gamesRes.text())) {
      const url = header(kif, '場所');
      if (!url || seen.has(url) || !isWantedGame(kif)) continue;
      seen.add(url);
      state.seenGames.push(url);
      kifs.push(kif);
      for (const key of ['先手', '後手']) {
        const name = parsePlayer(header(kif, key)).name;
        if (name && !known.has(name.toLowerCase())) {
          known.add(name.toLowerCase());
          state.queue.push(name);
        }
      }
    }
    state.done.push(username);
    log(`${username}: ${kifs.length}局を保存（待ち ${state.queue.length}人）`);
    await opts.onPlayer?.(username, kifs, state);
  }
  return state;
}
