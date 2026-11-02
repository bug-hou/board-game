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
  dealer: { x: 640, y: 210 },        // 发牌方手牌中心
  player: { x: 640, y: 470 },        // 玩家手牌中心
  betCircle: { x: 300, y: 688 },     // 惩罚圈
  chipRackX: 900,                    // 惩罚筹码架起始 x
  chipRackY: 726,                    // 惩罚筹码架 y
  balance: { x: 28, y: 22 },         // 余额标签
  message: { x: 640, y: 60 },        // 顶部消息
  actionButtons: { x: 1076, y: 430, gap: 64 }, // 操作按钮竖排
};

/**
 * 主题色：暖木奶油（首页与面板）+ 低饱和抹茶绿（牌桌）。
 * 刻意不用黑金赌场配色，也没有货币符号。
 */
export const COLORS = {
  // —— 暖木奶油 ——
  cream: 0xfdf6ec,
  creamDeep: 0xf6e9d8,
  paper: 0xfffdf7,
  wood: 0xc9a87c,
  woodDeep: 0xa9855a,
  ink: 0x4a3b2a,
  inkDim: 0x8c7b63,
  coral: 0xe88d67,
  coralDeep: 0xd2704a,
  matcha: 0x7a9e7e,
  matchaDeep: 0x5c7f63,

  // —— 牌桌 ——
  feltDark: 0x2e5343,
  felt: 0x3a6a54,
  feltLight: 0x4a8065,
  gold: 0xead9b4,      // 牌桌上的装饰线（奶油色，不是赌场金）
  goldDim: 0xead9b4,
  white: 0xffffff,
  text: 0xfdf6ec,
  textDim: 0xd9ebdd,

  // —— 状态 ——
  danger: 0xe0655c,
  success: 0x74c08a,
  warn: 0xe8a85c,
  disabled: 0xb9ac96,
};

/** 字体：统一收口，避免各 view 各写一份 */
export const FONTS = {
  cn: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  num: 'Arial, sans-serif',
};

/** 惩罚占位：具体规则待定，先用「份」作为中性单位（1 份 = 1 个惩罚动作） */
export const PENALTY = {
  unit: '份',
  label: '自定义惩罚',
  hint: '具体惩罚规则待定',
};

/** 惩罚池：首页展示用，规则定稿前只展示不生效 */
export const PENALTY_POOL = ['深蹲', '俯卧撑', '平板支撑', '高抬腿'];

/** 惩罚筹码（21 点）：规则待定，先用一个占位筹码 */
export const CHIP_DEFS = [
  { value: 10, ring: 0xe88d67, inner: 0xd2704a, text: '#fff7ef', label: '?' },
] as const;

export const START_BALANCE = 1000;

/* ---------------- 德州扑克 ---------------- */

/** 德州惩罚筹码配色（与赌博筹码刻意区分的暖色系） */
export const POKER_CHIP_DEFS = [
  { value: 5, ring: 0xf0e2c8, inner: 0xd8c4a0, text: '#6b5638' },
  { value: 10, ring: 0xe88d67, inner: 0xd2704a, text: '#fff7ef' },
  { value: 25, ring: 0x7a9e7e, inner: 0x5c7f63, text: '#fdf6ec' },
  { value: 50, ring: 0x8fb4d8, inner: 0x5f88ad, text: '#fdf6ec' },
  { value: 100, ring: 0x6b6257, inner: 0x4a4238, text: '#f2e2b4' },
  { value: 500, ring: 0xb98ac4, inner: 0x8f5f9e, text: '#fdf6ec' },
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
