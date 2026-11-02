import { Container, Graphics } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, POKER_LAYOUT } from '../../config';

/** 德州牌桌：浅木色外圈 + 低饱和抹茶绿毛毡 */
export class PokerTable extends Container {
  constructor() {
    super();
    const { cx, cy, rx, ry } = POKER_LAYOUT.table;

    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);

    // 桌边（浅木）
    g.ellipse(cx, cy, rx + 30, ry + 30).fill({ color: COLORS.woodDeep });
    g.ellipse(cx, cy, rx + 30, ry + 30).stroke({ width: 3, color: COLORS.wood, alpha: 0.8 });
    g.ellipse(cx, cy, rx + 14, ry + 14).fill({ color: COLORS.wood });

    // 毛毡
    g.ellipse(cx, cy, rx, ry).fill(COLORS.felt);
    g.ellipse(cx, cy, rx - 16, ry - 16).fill(COLORS.feltLight);
    g.ellipse(cx, cy, rx - 30, ry - 26).stroke({ width: 2, color: COLORS.gold, alpha: 0.28 });

    this.addChild(g);
  }
}
