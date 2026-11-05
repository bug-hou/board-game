/**
 * 游戏注册表：前后端共用的一份游戏元数据。
 *
 * 每个游戏声明人数区间与自己的配置项，房间配置存成 JSON，
 * 以后给某个游戏加专属配置（比如德州的盲注、21 点的庄家池）都不用改表结构。
 */

export type GameId = 'blackjack' | 'holdem' | 'six';

export interface GameConfigField {
  /** 存进 rooms.config 的键名 */
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text';
  defaultValue: unknown;
  min?: number;
  max?: number;
  /** 还没实现的配置放这里，UI 置灰提示「敬请期待」 */
  comingSoon?: boolean;
}

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  desc: string;
  /** 最少几人能开局 */
  minPlayers: number;
  maxPlayers: number;
  supportsSpectate: boolean;
  /** 该游戏专属配置，先占位，规则定稿后启用 */
  configFields: GameConfigField[];
}

export const GAMES: GameMeta[] = [
  {
    id: 'blackjack',
    name: '21 点',
    emoji: '🃏',
    desc: '没有庄家，各自下注、随意要牌，全员确认后比谁最接近 21 点',
    minPlayers: 2,
    maxPlayers: 7,
    supportsSpectate: true,
    configFields: [
      { key: 'baseBet', label: '每局基础份数', type: 'number', defaultValue: 10, min: 1, max: 100 },
    ],
  },
  {
    id: 'holdem',
    name: '德州扑克',
    emoji: '🎴',
    desc: '两家底牌配五张公共牌，谁牌大谁收池',
    minPlayers: 2,
    maxPlayers: 9,
    supportsSpectate: true,
    configFields: [
      { key: 'smallBlind', label: '小盲', type: 'number', defaultValue: 10, min: 1, max: 1000, comingSoon: true },
      { key: 'bigBlind', label: '大盲', type: 'number', defaultValue: 20, min: 2, max: 2000, comingSoon: true },
    ],
  },
  {
    id: 'six',
    name: '六张牌',
    emoji: '🧩',
    desc: '每人 6 张牌自己分三份：比大小、十点半、炸金花',
    minPlayers: 2,
    maxPlayers: 6,
    supportsSpectate: true,
    configFields: [],
  },
];

export function gameMeta(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

export function isGameId(id: unknown): id is GameId {
  return typeof id === 'string' && GAMES.some((g) => g.id === id);
}
