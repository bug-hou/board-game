import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, FONTS, LAYOUT, PENALTY } from '../config';
import { Easing, TweenManager } from '../core/tween';

/** HUD：剩余惩罚份额、本轮惩罚、顶部消息、手牌点数标签、结算横幅 */
export class Hud extends Container {
  private balanceText: Text;
  private betText: Text;
  private messageText: Text;
  private banner: Container;
  private bannerText: Text;
  private bannerSub: Text;
  private scoreLabels = new Map<string, { label: Text; bg: Graphics }>();

  constructor(private tweens: TweenManager) {
    super();
    const g = new Graphics();
    g.roundRect(LAYOUT.balance.x, LAYOUT.balance.y, 240, 64, 12).fill({ color: COLORS.feltDark, alpha: 0.85 });
    g.roundRect(LAYOUT.balance.x, LAYOUT.balance.y, 240, 64, 12).stroke({ width: 1.5, color: COLORS.gold, alpha: 0.45 });
    this.addChild(g);

    this.balanceText = this.makeInfoText(`还能扛  ${PENALTY.unit}0`, LAYOUT.balance.x + 18, LAYOUT.balance.y + 10, 20);
    this.betText = this.makeInfoText(`本轮  ${PENALTY.unit}0`, LAYOUT.balance.x + 18, LAYOUT.balance.y + 36, 15);
    this.addChild(this.balanceText, this.betText);

    this.messageText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 26,
        fontWeight: 'bold',
        fill: COLORS.text,
        dropShadow: { color: 0x000000, alpha: 0.45, blur: 4, distance: 2 },
      },
    });
    this.messageText.anchor.set(0.5);
    this.messageText.position.set(LAYOUT.message.x, LAYOUT.message.y);
    this.addChild(this.messageText);

    // 结算横幅
    this.banner = new Container();
    const bannerBg = new Graphics();
    bannerBg.roundRect(-190, -58, 380, 116, 18).fill({ color: COLORS.feltDark, alpha: 0.93 });
    bannerBg.roundRect(-190, -58, 380, 116, 18).stroke({ width: 3, color: COLORS.gold, alpha: 0.9 });
    this.bannerText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 42,
        fontWeight: 'bold',
        fill: COLORS.gold,
      },
    });
    this.bannerText.anchor.set(0.5);
    this.bannerText.position.set(0, -28);
    this.bannerSub = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 18,
        fill: COLORS.text,
      },
    });
    this.bannerSub.anchor.set(0.5);
    this.bannerSub.position.set(0, 26);
    this.banner.addChild(bannerBg, this.bannerText, this.bannerSub);
    this.banner.position.set(DESIGN_W / 2, DESIGN_H * 0.42);
    this.banner.visible = false;
    this.banner.alpha = 0;
    this.addChild(this.banner);
  }

  private makeInfoText(text: string, x: number, y: number, size: number) {
    const t = new Text({
      text,
      style: {
        fontFamily: FONTS.cn,
        fontSize: size,
        fontWeight: 'bold',
        fill: COLORS.text,
      },
    });
    t.position.set(x, y);
    return t;
  }

  setBalance(v: number) {
    this.balanceText.text = `还能扛  ${v} ${PENALTY.unit}`;
  }

  setBet(v: number) {
    this.betText.text = `本轮  ${v} ${PENALTY.unit}`;
  }

  showMessage(text: string) {
    this.messageText.text = text;
    this.messageText.alpha = 0;
    this.tweens.to(this.messageText, { alpha: 1 }, { duration: 260, ease: Easing.quadOut });
  }

  /** 手牌点数标签（key 区分庄家/玩家） */
  showScore(key: string, x: number, y: number, text: string, highlight = false) {
    let entry = this.scoreLabels.get(key);
    if (!entry) {
      const label = new Text({
        text: '',
        style: {
          fontFamily: FONTS.num,
          fontSize: 18,
          fontWeight: 'bold',
          fill: COLORS.white,
        },
      });
      label.anchor.set(0.5);
      const bg = new Graphics();
      entry = { label, bg };
      this.scoreLabels.set(key, entry);
      // 背景与文字平级挂到 Hud，避免向 Text 添加子节点（v8 已弃用）
      this.addChild(bg, label);
    }
    const { label, bg } = entry;
    label.text = text;

    const visible = text.length > 0;
    label.visible = visible;
    bg.visible = visible;
    if (!visible) return;

    // 按文字宽度画背景胶囊
    const w = Math.max(44, label.width + 26);
    bg.clear();
    bg.roundRect(x - w / 2, y - 15, w, 30, 15).fill({
      color: highlight ? COLORS.danger : COLORS.feltDark,
      alpha: 0.9,
    });
    bg.roundRect(x - w / 2, y - 15, w, 30, 15).stroke({ width: 1.5, color: COLORS.gold, alpha: 0.6 });
    label.position.set(x, y);
  }

  hideScore(key: string) {
    const entry = this.scoreLabels.get(key);
    if (!entry) return;
    entry.label.visible = false;
    entry.bg.visible = false;
  }

  /** 结算横幅 */
  showBanner(title: string, sub: string, color: number) {
    this.bannerText.text = title;
    this.bannerSub.text = sub;
    (this.bannerText.style as Text['style']).fill = color;
    this.banner.visible = true;
    this.banner.alpha = 0;
    this.banner.scale.set(0.8);
    this.tweens.to(this.banner, { alpha: 1 }, { duration: 220, ease: Easing.quadOut });
    this.tweens.to(this.banner.scale, { x: 1, y: 1 }, { duration: 320, ease: Easing.backOut });
  }

  hideBanner() {
    this.banner.visible = false;
    this.banner.alpha = 0;
  }
}
