// 段級位を段位帯に分ける。lishogi の表記は「1級」「初段」「二段」など
const DAN = ['初', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const RANK_BANDS = ['6級以下', '5〜1級', '初段〜二段', '三段〜四段', '五段以上'] as const;
export type RankBand = (typeof RANK_BANDS)[number];

export function rankBand(rank: string | null): RankBand | null {
  if (!rank) return null;
  const kyu = /^(\d+)級$/.exec(rank);
  if (kyu) return Number(kyu[1]) >= 6 ? '6級以下' : '5〜1級';
  const dan = /^(.)段$/.exec(rank);
  if (!dan) return null;
  const d = DAN.indexOf(dan[1]) + 1;
  if (d <= 0) return null;
  return d <= 2 ? '初段〜二段' : d <= 4 ? '三段〜四段' : '五段以上';
}

// 段級位を数にする（1級 = 0、初段 = 1、2級 = -1）。段級位の差を出すのに使う
export function rankValue(rank: string | null): number | null {
  if (!rank) return null;
  const kyu = /^(\d+)級$/.exec(rank);
  if (kyu) return 1 - Number(kyu[1]);
  const dan = /^(.)段$/.exec(rank);
  if (!dan) return null;
  const d = DAN.indexOf(dan[1]) + 1;
  return d > 0 ? d : null;
}
