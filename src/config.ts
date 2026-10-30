/** 设计分辨率，stage 按窗口等比缩放居中 */
export const DESIGN_W = 1280;
export const DESIGN_H = 800;

/** 图集里牌的原始尺寸 */
export const TEX_CARD_W = 200;
export const TEX_CARD_H = 280;
/** 显示缩放：100 x 140 */
export const CARD_SCALE = 0.5;
export const CARD_W = TEX_CARD_W * CARD_SCALE;
export const CARD_H = TEX_CARD_H * CARD_SCALE;

/** 牌水平重叠间距 */
export const CARD_GAP = 54;

/** 关键坐标（设计分辨率下） */
export const LAYOUT = {
  shoe: { x: 1148, y: 96 },          // 牌靴位置（发牌起点）
  dealer: { x: 640, y: 210 },        // 庄家手牌中心
  player: { x: 640, y: 470 },        // 玩家手牌中心
  betCircle: { x: 300, y: 688 },     // 下注圈
  chipRackX: 900,                    // 筹码架起始 x
  chipRackY: 726,                    // 筹码架 y
  balance: { x: 28, y: 22 },         // 余额标签
  message: { x: 640, y: 60 },        // 顶部消息
  actionButtons: { x: 1076, y: 430, gap: 64 }, // 操作按钮竖排
};

export const COLORS = {
  feltDark: '#0a2e1f',
  felt: '#155c3c',
  feltLight: '#1d6b48',
  gold: '#e8c56a',
  goldDim: 'rgba(232,197,106,0.5)',
  white: '#ffffff',
  text: '#f3ecd8',
  danger: '#e05555',
  success: '#6fd08c',
};

/** 筹码面额与配色（21 点） */
export const CHIP_DEFS = [
  { value: 10, ring: 0xd8503f, inner: 0xc23a2c, text: '#ffffff' },
  { value: 50, ring: 0x3f7fd8, inner: 0x2a5fb0, text: '#ffffff' },
  { value: 100, ring: 0x33333d, inner: 0x1f1f28, text: '#f0d878' },
] as const;

export const START_BALANCE = 1000;

/* ---------------- 德州扑克 ---------------- */

/** 德州筹码面额与配色 */
export const POKER_CHIP_DEFS = [
  { value: 5, ring: 0xe6dcc0, inner: 0xc9bfa0, text: '#3a3220' },
  { value: 10, ring: 0xd8503f, inner: 0xc23a2c, text: '#ffffff' },
  { value: 25, ring: 0x3f9d5a, inner: 0x2c7442, text: '#ffffff' },
  { value: 50, ring: 0x3f7fd8, inner: 0x2a5fb0, text: '#ffffff' },
  { value: 100, ring: 0x33333d, inner: 0x1f1f28, text: '#f0d878' },
  { value: 500, ring: 0x8b4fbf, inner: 0x6b3596, text: '#ffffff' },
] as const;

export const POKER_START_STACK = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

/** 德州模式关键坐标（设计分辨率下） */
export const POKER_LAYOUT = {
  table: { cx: 640, cy: 320, rx: 462, ry: 185 }, // 牌桌椭圆
  deck: { x: 1168, y: 150 },                     // 发牌起点
  board: { x: 640, y: 320, gap: 92, scale: 0.85 }, // 公共牌
  pot: { x: 640, y: 402 },                       // 底池文字
  hero: { x: 640, y: 500, scale: 0.9, gap: 104 }, // 玩家底牌
  seat: { scale: 0.62, gap: 34 },                // 对手座位牌缩放
  chipRack: { x: 440, y: 706, gap: 80, scale: 0.82 },
  raiseStack: { x: 640, y: 655 },                // 加注筹码落点
  actionBar: { x: 640, y: 762, gap: 14, w: 128, h: 46 },
  message: { x: 640, y: 34 },
  blinds: { x: 640, y: 72 },
  exit: { x: 84, y: 36 },
  stack: { x: 1196, y: 36 },
};
