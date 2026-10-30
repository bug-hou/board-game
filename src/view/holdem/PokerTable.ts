import { Container, Graphics } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, POKER_LAYOUT } from '../../config';

/** 德州扑克牌桌：椭圆毛毡 + 木质外圈 + 中央标识 */
export class PokerTable extends Container {
  constructor() {
    super();
    const { cx, cy, rx, ry } = POKER_LAYOUT.table;

    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);

    // 桌边（木质）
    g.ellipse(cx, cy, rx + 30, ry + 30).fill({ color: 0x4a2f1c });
    g.ellipse(cx, cy, rx + 30, ry + 30).stroke({ width: 3, color: 0x8a5a30, alpha: 0.8 });
    g.ellipse(cx, cy, rx + 14, ry + 14).fill({ color: 0x60381f });

    // 毛毡
    g.ellipse(cx, cy, rx, ry).fill(COLORS.felt);
    g.ellipse(cx, cy, rx - 16, ry - 16).fill(COLORS.feltLight);
    g.ellipse(cx, cy, rx - 30, ry - 26).stroke({ width: 2, color: 0xe8c56a, alpha: 0.28 });

    this.addChild(g);
  }
}
