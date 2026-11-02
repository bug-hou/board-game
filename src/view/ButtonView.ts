import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONTS } from '../config';

interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
}

/** 桌面按钮：悬停变亮、按下缩小、禁用变灰 */
export class ButtonView extends Container {
  enabled = true;
  private bg: Graphics;
  private labelText: Text;
  private baseColor: number;
  private w: number;
  private h: number;

  constructor(opts: ButtonOptions) {
    super();
    this.w = opts.width ?? 132;
    this.h = opts.height ?? 48;
    this.baseColor = opts.color ?? COLORS.coral;

    this.bg = new Graphics();
    this.labelText = new Text({
      text: opts.label,
      style: {
        fontFamily: FONTS.cn,
        fontSize: opts.fontSize ?? 20,
        fontWeight: 'bold',
        fill: COLORS.ink,
      },
    });
    this.labelText.anchor.set(0.5);
    this.addChild(this.bg, this.labelText);

    this.redraw(1);
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.on('pointerover', () => this.redraw(1.12));
    this.on('pointerout', () => this.redraw(1));
    this.on('pointerdown', () => {
      this.scale.set(0.94);
    });
    const up = () => this.scale.set(1);
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
  }

  private redraw(mul: number) {
    const c = this.enabled ? this.baseColor : COLORS.disabled;
    this.bg.clear();
    this.bg.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 12).fill(c);
    this.bg
      .roundRect(-this.w / 2 + 2, -this.h / 2 + 2, this.w - 4, this.h - 4, 10)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 * mul });
    this.labelText.alpha = this.enabled ? 1 : 0.55;
  }

  setLabel(text: string) {
    this.labelText.text = text;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.cursor = on ? 'pointer' : 'default';
    this.redraw(1);
  }
}
