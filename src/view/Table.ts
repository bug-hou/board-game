import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, FONTS, LAYOUT, PENALTY } from '../config';

/** 牌桌背景与区域装饰（低饱和抹茶绿，不用赌场黑金） */
export class Table extends Container {
  constructor() {
    super();
    const g = new Graphics();
    // 毛毡底色（径向感：三层叠圆模拟）
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 620).fill(COLORS.felt);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 500).fill(COLORS.feltLight);

    // 装饰弧线
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 470).stroke({ width: 3, color: COLORS.gold, alpha: 0.35 });
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 456).stroke({ width: 1.5, color: COLORS.gold, alpha: 0.22 });

    this.addChild(g);

    const slogan = new Text({
      text: '越接近 21 点越好 · 超过就爆牌',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 22,
        fontWeight: 'bold',
        fill: COLORS.gold,
        letterSpacing: 4,
      },
    });
    slogan.anchor.set(0.5);
    slogan.alpha = 0.5;
    slogan.position.set(DESIGN_W / 2, 348);
    this.addChild(slogan);

    const dealerTag = this.makeZoneTag('发 牌 方', LAYOUT.dealer.x, LAYOUT.dealer.y - 108);
    const playerTag = this.makeZoneTag('我', LAYOUT.player.x, LAYOUT.player.y + 108);
    this.addChild(dealerTag, playerTag);

    this.addChild(this.makeBetCircle());
    this.addChild(this.makeShoeBox());
  }

  private makeZoneTag(text: string, x: number, y: number) {
    const t = new Text({
      text,
      style: {
        fontFamily: FONTS.cn,
        fontSize: 20,
        fill: COLORS.gold,
        letterSpacing: 6,
      },
    });
    t.anchor.set(0.5);
    t.alpha = 0.5;
    t.position.set(x, y);
    return t;
  }

  /** 虚线惩罚圈 */
  private makeBetCircle() {
    const g = new Graphics();
    const { x, y } = LAYOUT.betCircle;
    const r = 46;
    const seg = 14;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2 / seg) * 0.62;
      g.arc(x, y, r, a0, a1).stroke({ width: 2.5, color: COLORS.gold, alpha: 0.6 });
    }
    const label = new Text({
      text: PENALTY.unit,
      style: {
        fontFamily: FONTS.cn,
        fontSize: 15,
        fontWeight: 'bold',
        fill: COLORS.gold,
        letterSpacing: 3,
      },
    });
    label.anchor.set(0.5);
    label.alpha = 0.55;
    label.position.set(x, y + 62);
    const wrapper = new Container();
    wrapper.addChild(g, label);
    return wrapper;
  }

  /** 牌靴底座 */
  private makeShoeBox() {
    const g = new Graphics();
    const { x, y } = LAYOUT.shoe;
    g.roundRect(x - 62, y - 78, 116, 152, 10).fill({ color: COLORS.feltDark, alpha: 0.85 });
    g.roundRect(x - 62, y - 78, 116, 152, 10).stroke({ width: 2, color: COLORS.gold, alpha: 0.4 });
    return g;
  }
}
