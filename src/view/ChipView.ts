import { Container, Graphics, Text } from 'pixi.js';

export interface ChipStyle {
  value: number;
  ring: number;
  inner: number;
  text: string;
}

const CHIP_R = 27;

/** 圆形筹码：外环白色条纹 + 内圈 + 面额 */
export class ChipView extends Container {
  readonly value: number;
  readonly radius = CHIP_R;
  private readonly body: Graphics;

  constructor(style: ChipStyle) {
    super();
    this.value = style.value;
    this.body = new Graphics();

    this.body.circle(0, 0, CHIP_R).fill(style.ring);
    // 边缘白色条纹
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = Math.cos(a) * (CHIP_R - 5);
      const cy = Math.sin(a) * (CHIP_R - 5);
      this.body.roundRect(cx - 3.4, cy - 5, 6.8, 10, 2).fill(0xffffff);
    }
    this.body.circle(0, 0, CHIP_R - 9).fill(style.inner);
    this.body.circle(0, 0, CHIP_R - 9).stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 });
    this.addChild(this.body);

    const label = new Text({
      text: String(style.value),
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: style.text,
        stroke: { color: 0x000000, width: 2, alpha: 0.35 },
      },
    });
    label.anchor.set(0.5);
    this.addChild(label);
  }
}
