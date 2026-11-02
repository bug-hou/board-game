import { Container, Graphics, Text } from 'pixi.js';
import { FONTS } from '../config';

export interface ChipStyle {
  value: number;
  ring: number;
  inner: number;
  text: string;
  /** 自定义面额文字（惩罚规则待定，21 点用「?」占位） */
  label?: string;
}

const CHIP_R = 27;

/** 圆形代币：外环条纹 + 内圈 + 面额（不是赌场筹码） */
export class ChipView extends Container {
  readonly value: number;
  readonly radius = CHIP_R;
  private readonly body: Graphics;

  constructor(style: ChipStyle) {
    super();
    this.value = style.value;
    this.body = new Graphics();

    this.body.circle(0, 0, CHIP_R).fill(style.ring);
    // 边缘条纹
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = Math.cos(a) * (CHIP_R - 5);
      const cy = Math.sin(a) * (CHIP_R - 5);
      this.body.roundRect(cx - 3.4, cy - 5, 6.8, 10, 2).fill(0xffffff);
    }
    this.body.circle(0, 0, CHIP_R - 9).fill(style.inner);
    this.body.circle(0, 0, CHIP_R - 9).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    this.addChild(this.body);

    const label = new Text({
      text: style.label ?? String(style.value),
      style: {
        fontFamily: style.label ? FONTS.cn : FONTS.num,
        fontSize: style.label ? 19 : 18,
        fontWeight: 'bold',
        fill: style.text,
        stroke: { color: 0x000000, width: 2, alpha: 0.25 },
      },
    });
    label.anchor.set(0.5);
    this.addChild(label);
  }
}
