// 盤上の座標は 筋(file) 1-9, 段(rank) 1-9。先手から見た KIF の表記そのまま。
export type Color = 'sente' | 'gote';

export type PieceType =
  | 'FU' | 'KY' | 'KE' | 'GI' | 'KI' | 'KA' | 'HI' | 'OU'
  | 'TO' | 'NY' | 'NK' | 'NG' | 'UM' | 'RY';

export type Square = { file: number; rank: number };

export type Piece = { color: Color; type: PieceType };

export type Move =
  | { kind: 'move'; ply: number; from: Square; to: Square; piece: PieceType; promote: boolean }
  | { kind: 'drop'; ply: number; to: Square; piece: PieceType };

export type GameResult = {
  // 勝った側。投了・詰み・切れ負けなどから判定。分からなければ null
  winner: Color | null;
  reason: string | null;
};

export type Game = {
  headers: Record<string, string>;
  moves: Move[];
  result: GameResult;
};
