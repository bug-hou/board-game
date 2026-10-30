/**
 * 一次性生成 52 张扑克牌 + 1 张牌背的精灵图集。
 * 产物：public/atlas/cards.png 与 public/atlas/cards.json（TexturePacker JSON hash 格式，
 * PixiJS 的 spritesheet 解析器可直接 Assets.load 使用）。
 *
 * 运行：npm run atlas
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/atlas');

const CARD_W = 200;
const CARD_H = 280;
const COLS = 13;
const ROWS = 5; // 4 行花色 + 1 行放牌背

const SUITS = [
  { key: 'spade', symbol: '♠', color: '#1b1b22', pip: '♠' },
  { key: 'heart', symbol: '♥', color: '#d02b34', pip: '♥' },
  { key: 'diamond', symbol: '♦', color: '#d02b34', pip: '♦' },
  { key: 'club', symbol: '♣', color: '#1b1b22', pip: '♣' },
];
const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];
const RANK_LABEL = { a: 'A', j: 'J', q: 'Q', k: 'K' };

/** 注册一套可用的字体，跨平台取第一个命中的文件 */
function registerFonts() {
  const candidates = [
    { family: 'CardSans', file: '/System/Library/Fonts/Supplemental/Arial Bold.ttf', weight: 'bold' },
    { family: 'CardSans', file: '/System/Library/Fonts/Helvetica.ttc', weight: 'bold' },
    { family: 'CardSans', file: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', weight: 'bold' },
    { family: 'CardSans', file: 'C:\\Windows\\Fonts\\arialbd.ttf', weight: 'bold' },
    { family: 'CardSans', file: '/System/Library/Fonts/Supplemental/Arial.ttf', weight: 'normal' },
    { family: 'CardSans', file: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', weight: 'normal' },
    { family: 'CardSans', file: 'C:\\Windows\\Fonts\\arial.ttf', weight: 'normal' },
  ];
  for (const c of candidates) {
    if (existsSync(c.file)) {
      GlobalFonts.registerFromPath(c.file, c.family);
      return c.family;
    }
  }
  throw new Error('未找到可用字体，请安装 Arial / DejaVu Sans');
}

const FONT = registerFonts();

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCorner(ctx, rank, suit) {
  const label = RANK_LABEL[rank] ?? rank;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = `bold ${label === '10' ? 40 : 46}px "${FONT}"`;
  ctx.fillText(label, 26, 16);

  ctx.font = `38px "${FONT}"`;
  ctx.fillText(suit.symbol, 26, 66);
}

function drawPips(ctx, rank, suit) {
  // 数字牌按标准扑克布局摆放花色符号，J/Q/K 走人像式中央图案
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (rank === 'a') {
    ctx.font = `110px "${FONT}"`;
    ctx.fillText(suit.pip, CARD_W / 2, CARD_H / 2);
    return;
  }

  if (rank === 'j' || rank === 'q' || rank === 'k') {
    const cx = CARD_W / 2;
    const cy = CARD_H / 2;
    ctx.save();
    roundRect(ctx, 44, 74, CARD_W - 88, CARD_H - 148, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fill();
    ctx.strokeStyle = suit.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = suit.color;
    ctx.font = `bold 78px "${FONT}"`;
    ctx.fillText(RANK_LABEL[rank], cx, cy - 16);
    ctx.font = `44px "${FONT}"`;
    ctx.fillText(suit.pip, cx, cy + 46);
    return;
  }

  const n = Number(rank);
  const layout = {
    2: [[0.5, 0.5, 1]],
    3: [[0.5, 0.28, 1], [0.5, 0.5, 1], [0.5, 0.72, 1]],
    4: [[0.3, 0.28, 1], [0.7, 0.28, 1], [0.3, 0.72, -1], [0.7, 0.72, -1]],
    5: [[0.3, 0.28, 1], [0.7, 0.28, 1], [0.5, 0.5, 1], [0.3, 0.72, -1], [0.7, 0.72, -1]],
    6: [[0.3, 0.24, 1], [0.7, 0.24, 1], [0.3, 0.5, 1], [0.7, 0.5, 1], [0.3, 0.76, -1], [0.7, 0.76, -1]],
    7: [[0.3, 0.24, 1], [0.7, 0.24, 1], [0.5, 0.37, 1], [0.3, 0.5, 1], [0.7, 0.5, 1], [0.3, 0.76, -1], [0.7, 0.76, -1]],
    8: [[0.3, 0.24, 1], [0.7, 0.24, 1], [0.5, 0.37, 1], [0.3, 0.5, 1], [0.7, 0.5, 1], [0.5, 0.63, -1], [0.3, 0.76, -1], [0.7, 0.76, -1]],
    9: [[0.3, 0.22, 1], [0.7, 0.22, 1], [0.3, 0.4, 1], [0.7, 0.4, 1], [0.5, 0.5, 1], [0.3, 0.6, -1], [0.7, 0.6, -1], [0.3, 0.78, -1], [0.7, 0.78, -1]],
    10: [[0.3, 0.22, 1], [0.7, 0.22, 1], [0.5, 0.31, 1], [0.3, 0.42, 1], [0.7, 0.42, 1], [0.3, 0.58, -1], [0.7, 0.58, -1], [0.5, 0.69, -1], [0.3, 0.8, -1], [0.7, 0.8, -1]],
  }[n];

  ctx.font = `46px "${FONT}"`;
  for (const [fx, fy, flip] of layout) {
    const px = 34 + fx * (CARD_W - 68);
    const py = 52 + fy * (CARD_H - 104);
    ctx.save();
    ctx.translate(px, py);
    if (flip === -1) ctx.rotate(Math.PI);
    ctx.fillText(suit.pip, 0, 0);
    ctx.restore();
  }
}

function drawCardFace(ctx, rank, suit) {
  ctx.fillStyle = '#fbfaf6';
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 15);
  ctx.stroke();

  ctx.fillStyle = suit.color;
  drawCorner(ctx, rank, suit);

  ctx.save();
  ctx.translate(CARD_W, CARD_H);
  ctx.rotate(Math.PI);
  drawCorner(ctx, rank, suit);
  ctx.restore();

  ctx.fillStyle = suit.color;
  drawPips(ctx, rank, suit);
}

function drawCardBack(ctx) {
  ctx.save();
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 16);
  ctx.clip();

  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, '#1f4f8f');
  grad.addColorStop(1, '#12305c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1.5;
  for (let i = -CARD_H; i < CARD_W; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + CARD_H, CARD_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + CARD_H, 0);
    ctx.lineTo(i, CARD_H);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, 12, 12, CARD_W - 24, CARD_H - 24, 12);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();

  ctx.fillStyle = 'rgba(31,79,143,0.96)';
  roundRect(ctx, 26, 26, CARD_W - 52, CARD_H - 52, 8);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold 62px "${FONT}"`;
  ctx.fillText('♠', CARD_W / 2, CARD_H / 2 - 8);
  ctx.font = `bold 15px "${FONT}"`;
  ctx.fillText('BLACKJACK', CARD_W / 2, CARD_H / 2 + 40);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 15);
  ctx.stroke();
}

function main() {
  const width = COLS * CARD_W;
  const height = ROWS * CARD_H;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const frames = {};

  SUITS.forEach((suit, row) => {
    RANKS.forEach((rank, col) => {
      const x = col * CARD_W;
      const y = row * CARD_H;
      ctx.save();
      ctx.translate(x, y);
      drawCardFace(ctx, rank, suit);
      ctx.restore();

      frames[`${suit.key}_${rank}`] = {
        frame: { x, y, w: CARD_W, h: CARD_H },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: CARD_W, h: CARD_H },
        sourceSize: { w: CARD_W, h: CARD_H },
      };
    });
  });

  // 牌背放在最后一行的第一个格子
  ctx.save();
  ctx.translate(0, 4 * CARD_H);
  drawCardBack(ctx);
  ctx.restore();
  frames.back = {
    frame: { x: 0, y: 4 * CARD_H, w: CARD_W, h: CARD_H },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: CARD_W, h: CARD_H },
    sourceSize: { w: CARD_W, h: CARD_H },
  };

  const json = {
    frames,
    animations: {},
    meta: {
      image: 'cards.png',
      format: 'RGBA8888',
      size: { w: width, h: height },
      scale: '1',
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'cards.png'), canvas.toBuffer('image/png'));
  writeFileSync(resolve(OUT_DIR, 'cards.json'), JSON.stringify(json));

  console.log(`图集已生成：${OUT_DIR}/cards.png  ${width}x${height}  共 ${Object.keys(frames).length} 帧`);
}

main();
