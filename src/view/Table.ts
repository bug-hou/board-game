import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, LAYOUT } from '../config';

/** 牌桌背景与区域装饰 */
export class Table extends Container {
  constructor() {
    super();
    const g = new Graphics();
    // 毛毡底色（径向感：三层叠圆模拟）
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 620).fill(COLORS.felt);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 500).fill(COLORS.feltLight);

    // 金色装饰弧线
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 470).stroke({ width: 3, color: 0xe8c56a, alpha: 0.4 });
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 456).stroke({ width: 1.5, color: 0xe8c56a, alpha: 0.25 });

    this.addChild(g);

    // 中央标语弧线文字（用两行静态文字近似）
    const slogan = new Text({
      text: 'BLACKJACK  PAYS  3  TO  2',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 26,
        fontWeight: 'bold',
        fill: 0xe8c56a,
        letterSpacing: 4,
      },
    });
    slogan.anchor.set(0.5);
    slogan.alpha = 0.55;
    slogan.position.set(DESIGN_W / 2, 348);
    this.addChild(slogan);

    const dealerTag = this.makeZoneTag('庄  家', LAYOUT.dealer.x, LAYOUT.dealer.y - 108);
    const playerTag = this.makeZoneTag('玩  家', LAYOUT.player.x, LAYOUT.player.y + 108);
    this.addChild(dealerTag, playerTag);

    this.addChild(this.makeBetCircle());
    this.addChild(this.makeShoeBox());
  }

  private makeZoneTag(text: string, x: number, y: number) {
    const t = new Text({
      text,
      style: {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: 20,
        fill: 0xe8c56a,
        letterSpacing: 6,
      },
    });
    t.anchor.set(0.5);
    t.alpha = 0.5;
    t.position.set(x, y);
    return t;
  }

  /** 虚线下注圈 */
  private makeBetCircle() {
    const g = new Graphics();
    const { x, y } = LAYOUT.betCircle;
    const r = 46;
    const seg = 14;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2 / seg) * 0.62;
      g.arc(x, y, r, a0, a1).stroke({ width: 2.5, color: 0xe8c56a, alpha: 0.65 });
    }
    const label = new Text({
      text: 'BET',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: 0xe8c56a,
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
    g.roundRect(x - 62, y - 78, 116, 152, 10).fill({ color: 0x06281a, alpha: 0.85 });
    g.roundRect(x - 62, y - 78, 116, 152, 10).stroke({ width: 2, color: 0xe8c56a, alpha: 0.4 });
    return g;
  }
}
