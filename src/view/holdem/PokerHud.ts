import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, DESIGN_H, DESIGN_W, FONTS, POKER_LAYOUT } from '../../config';
import { Easing, type TweenManager } from '../../core/tween';

/** 德州模式 HUD：顶栏提示 / 盲注 / 份额、本轮池、结算横幅 */
export class PokerHud extends Container {
  private messageText: Text;
  private blindsText: Text;
  private stackText: Text;
  private potText: Text;
  private banner = new Container();
  private bannerTitle: Text;
  private bannerSub: Text;

  constructor(private tweens: TweenManager) {
    super();

    const bar = new Graphics();
    bar.rect(0, 0, DESIGN_W, 92).fill({ color: COLORS.feltDark, alpha: 0.55 });
    this.addChild(bar);

    this.messageText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 24,
        fontWeight: 'bold',
        fill: COLORS.text,
        dropShadow: { color: 0x000000, alpha: 0.4, blur: 4, distance: 2 },
      },
    });
    this.messageText.anchor.set(0.5);
    this.messageText.position.set(POKER_LAYOUT.message.x, POKER_LAYOUT.message.y);

    this.blindsText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 14,
        fill: COLORS.textDim,
        letterSpacing: 1,
      },
    });
    this.blindsText.anchor.set(0.5);
    this.blindsText.position.set(POKER_LAYOUT.blinds.x, POKER_LAYOUT.blinds.y);

    this.stackText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 20,
        fontWeight: 'bold',
        fill: COLORS.gold,
      },
    });
    this.stackText.anchor.set(1, 0.5);
    this.stackText.position.set(POKER_LAYOUT.stack.x, POKER_LAYOUT.stack.y);

    this.potText = new Text({
      text: '',
      style: {
        fontFamily: FONTS.cn,
        fontSize: 28,
        fontWeight: 'bold',
        fill: COLORS.gold,
        dropShadow: { color: 0x000000, alpha: 0.4, blur: 4, distance: 2 },
      },
    });
    this.potText.anchor.set(0.5);
    this.potText.position.set(POKER_LAYOUT.pot.x, POKER_LAYOUT.pot.y);

    // 横幅
    const bg = new Graphics();
    bg.roundRect(-210, -58, 420, 116, 18).fill({ color: COLORS.feltDark, alpha: 0.93 });
    bg.roundRect(-210, -58, 420, 116, 18).stroke({ width: 3, color: COLORS.gold, alpha: 0.9 });
    this.bannerTitle = new Text({
      text: '',
      style: { fontFamily: FONTS.cn, fontSize: 38, fontWeight: 'bold', fill: COLORS.gold },
    });
    this.bannerTitle.anchor.set(0.5);
    this.bannerTitle.position.set(0, -26);
    this.bannerSub = new Text({
      text: '',
      style: { fontFamily: FONTS.cn, fontSize: 18, fill: COLORS.text },
    });
    this.bannerSub.anchor.set(0.5);
    this.bannerSub.position.set(0, 26);
    this.banner.addChild(bg, this.bannerTitle, this.bannerSub);
    this.banner.position.set(DESIGN_W / 2, DESIGN_H * 0.44);
    this.banner.visible = false;
    this.banner.alpha = 0;

    this.addChild(this.messageText, this.blindsText, this.stackText, this.potText, this.banner);
  }

  setMessage(text: string) {
    this.messageText.text = text;
    this.messageText.alpha = 0;
    this.tweens.to(this.messageText, { alpha: 1 }, { duration: 240, ease: Easing.quadOut });
  }

  setBlinds(sb: number, bb: number) {
    this.blindsText.text = `盲注  ${sb} / ${bb}`;
  }

  setStack(v: number) {
    this.stackText.text = `我的份额  ${v}`;
  }

  setPot(v: number) {
    this.potText.text = v > 0 ? `本轮池  ${v}` : '';
  }

  showBanner(title: string, sub: string, color: number) {
    this.bannerTitle.text = title;
    this.bannerSub.text = sub;
    (this.bannerTitle.style as { fill: number }).fill = color;
    this.banner.visible = true;
    this.banner.alpha = 0;
    this.banner.scale.set(0.82);
    this.tweens.to(this.banner, { alpha: 1 }, { duration: 220, ease: Easing.quadOut });
    this.tweens.to(this.banner.scale, { x: 1, y: 1 }, { duration: 300, ease: Easing.backOut });
  }

  hideBanner() {
    this.banner.visible = false;
    this.banner.alpha = 0;
  }
}
