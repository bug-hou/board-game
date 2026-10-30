import { Container } from 'pixi.js';
import { POKER_LAYOUT } from '../../config';
import { ButtonView } from '../ButtonView';
import type { LegalActions } from '../../game/holdem/engine';

type Slot = 'fold' | 'call' | 'raise' | 'allin' | 'confirm' | 'cancel' | 'next';

const LABELS: Record<Slot, string> = {
  fold: '弃 牌',
  call: '跟 注',
  raise: '加 注',
  allin: '全 下',
  confirm: '确 认',
  cancel: '取 消',
  next: '下一手',
};

const COLORS: Record<Slot, number> = {
  fold: 0xb9564c,
  call: 0x6fd08c,
  raise: 0xe0a455,
  allin: 0xc06fd0,
  confirm: 0x6fd08c,
  cancel: 0x9a8f72,
  next: 0xe8c56a,
};

/** 底部操作栏：弃牌 / 过牌·跟注 / 加注 / 全下，以及加注确认、下一手 */
export class ActionBar extends Container {
  onFold: () => void = () => {};
  onCall: () => void = () => {};
  onRaise: () => void = () => {};
  onAllIn: () => void = () => {};
  onConfirmRaise: () => void = () => {};
  onCancelRaise: () => void = () => {};
  onNext: () => void = () => {};

  private buttons = new Map<Slot, ButtonView>();

  constructor() {
    super();
    (['fold', 'call', 'raise', 'allin'] as Slot[]).forEach((s) => {
      const b = this.make(s, COLORS[s]);
      b.on('pointerup', () => {
        if (!b.enabled) return;
        if (s === 'fold') this.onFold();
        else if (s === 'call') this.onCall();
        else if (s === 'raise') this.onRaise();
        else this.onAllIn();
      });
    });
    const confirm = this.make('confirm', COLORS.confirm);
    confirm.on('pointerup', () => confirm.enabled && this.onConfirmRaise());
    const cancel = this.make('cancel', COLORS.cancel);
    cancel.on('pointerup', () => cancel.enabled && this.onCancelRaise());
    const next = this.make('next', COLORS.next);
    next.on('pointerup', () => next.enabled && this.onNext());
    this.visible = false;
  }

  private make(slot: Slot, color: number) {
    const b = new ButtonView({
      label: LABELS[slot],
      color,
      width: POKER_LAYOUT.actionBar.w,
      height: POKER_LAYOUT.actionBar.h,
      fontSize: 19,
    });
    b.visible = false;
    this.buttons.set(slot, b);
    this.addChild(b);
    return b;
  }

  private place(slots: Slot[]) {
    const { x: cx, y, gap, w } = POKER_LAYOUT.actionBar;
    const total = slots.length * w + (slots.length - 1) * gap;
    slots.forEach((s, i) => {
      const b = this.buttons.get(s)!;
      b.position.set(cx - total / 2 + w / 2 + i * (w + gap), y);
      b.visible = true;
      b.setEnabled(true);
    });
    for (const [key, b] of this.buttons) {
      if (!slots.includes(key)) b.visible = false;
    }
    this.visible = true;
  }

  /** 显示主操作，根据是否可过牌决定第二个按钮文案 */
  showMain(legal: LegalActions, stack: number) {
    const callBtn = this.buttons.get('call')!;
    callBtn.setLabel(legal.canCheck ? '过 牌' : `跟注 $${legal.toCall}`);
    this.place(['fold', 'call', 'raise', 'allin']);
    this.buttons.get('raise')!.setEnabled(legal.canRaise);
    this.buttons.get('call')!.setEnabled(legal.canCheck || stack > 0);
    this.buttons.get('allin')!.setEnabled(stack > 0 && !legal.canCheck);
  }

  /** 加注确认模式 */
  showRaiseMode(canConfirm: boolean) {
    this.place(['confirm', 'cancel']);
    this.buttons.get('confirm')!.setEnabled(canConfirm);
  }

  showNext(label = '下一手') {
    this.buttons.get('next')!.setLabel(label);
    this.place(['next']);
  }

  hide() {
    this.visible = false;
    for (const b of this.buttons.values()) b.visible = false;
  }
}
