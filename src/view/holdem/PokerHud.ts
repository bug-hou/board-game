import { Container, Graphics, Text } from 'pixi.js';
import { DESIGN_H, DESIGN_W, POKER_LAYOUT } from '../../config';
import { Easing, type TweenManager } from '../../core/tween';

/** 德州模式 HUD：顶栏提示 / 盲注 / 筹码、底池、结算横幅 */
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
    bar.rect(0, 0, DESIGN_W, 92).fill({ color: 0x042015, alpha: 0.55 });
    this.addChild(bar);

    this.messageText = new Text({
      text: '',
      style: {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xf3ecd8,
        dropShadow: { color: 0x000000, alpha: 0.55, blur: 4, distance: 2 },
      },
    });
    this.messageText.anchor.set(0.5);
    this.messageText.position.set(POKER_LAYOUT.message.x, POKER_LAYOUT.message.y);

    this.blindsText = new Text({
      text: '',
      style: {
        fontFamily: '"PingFang SC", sans-serif',
        fontSize: 14,
        fill: 0xbfd8c4,
        letterSpacing: 1,
      },
    });
    this.blindsText.anchor.set(0.5);
    this.blindsText.position.set(POKER_LAYOUT.blinds.x, POKER_LAYOUT.blinds.y);

    this.stackText = new Text({
      text: '',
      style: {
        fontFamily: '"PingFang SC", Arial, sans-serif',
        fontSize: 20,
        fontWeight: 'bold',
        fill: 0xe8c56a,
      },
    });
    this.stackText.anchor.set(1, 0.5);
    this.stackText.position.set(POKER_LAYOUT.stack.x, POKER_LAYOUT.stack.y);

    this.potText = new Text({
      text: '',
      style: {
        fontFamily: 'Georgia, Arial, serif',
        fontSize: 30,
        fontWeight: 'bold',
        fill: 0xffd86a,
        dropShadow: { color: 0x000000, alpha: 0.5, blur: 4, distance: 2 },
      },
    });
    this.potText.anchor.set(0.5);
    this.potText.position.set(POKER_LAYOUT.pot.x, POKER_LAYOUT.pot.y);

    // 横幅
    const bg = new Graphics();
    bg.roundRect(-210, -58, 420, 116, 18).fill({ color: 0x06281a, alpha: 0.93 });
    bg.roundRect(-210, -58, 420, 116, 18).stroke({ width: 3, color: 0xe8c56a, alpha: 0.9 });
    this.bannerTitle = new Text({
      text: '',
      style: { fontFamily: 'Georgia, serif', fontSize: 42, fontWeight: 'bold', fill: 0xe8c56a },
    });
    this.bannerTitle.anchor.set(0.5);
    this.bannerTitle.position.set(0, -26);
    this.bannerSub = new Text({
      text: '',
      style: { fontFamily: '"PingFang SC", sans-serif', fontSize: 18, fill: 0xf3ecd8 },
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
    this.stackText.text = `我的筹码  $${v}`;
  }

  setPot(v: number) {
    this.potText.text = v > 0 ? `底池  $${v}` : '';
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
