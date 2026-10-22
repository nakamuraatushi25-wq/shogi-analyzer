// KIF の対局者欄（例：「二段 KEN0057」「1級 free_palestine_007」「KEN0057」）を段級位と名前に分ける
export type PlayerHeader = { name: string; rank: string | null };

const RANK_RE = /^([1-9１-９一二三四五六七八九十]+[段級]|初段)$/;

export function parsePlayer(value: string | undefined): PlayerHeader {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && RANK_RE.test(parts[0])) return { rank: parts[0], name: parts.slice(1).join(' ') };
  return { rank: null, name: parts.join(' ') };
}
