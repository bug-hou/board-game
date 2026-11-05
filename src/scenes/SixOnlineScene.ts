import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { CARD_SCALE, COLORS, DESIGN_H, DESIGN_W, FONTS, LAYOUT } from '../config';
import { BACK_TEXTURE_NAME, cardTexture } from '../core/atlas';
import { TweenManager } from '../core/tween';
import { ButtonView } from '../view/ButtonView';
import { CardView } from '../view/CardView';
import type { Scene } from './Scene';
import type { SixAction, SixView } from '../../lib/types';

export interface SixOnlineOptions {
  onAct: (action: SixAction) => void;
  onExit: () => void;
}

interface SlotDef {
  title: string;
  cap: number;
  x: number;
}

/** 三个槽位：按 1 / 2 / 3 张切分 6 张手牌 */
const SLOTS: SlotDef[] = [
  { title: '① 单张比大小', cap: 1, x: 258 },
  { title: '② 十点半', cap: 2, x: 640 },
  { title: '③ 炸金花', cap: 3, x: 1022 },
];

const SLOT_Y = 560;
const SLOT_W = 344;
const SLOT_H = 142;
const HAND_Y = 692;
const BUTTON_Y = 766;
const GROUP_KEYS = ['single', 'pair', 'triple'] as const;

function makeText(text: string, size: number, color: number, bold = false): Text {
  return new Text({
    text,
    style: {
      fontFamily: FONTS.cn,
      fontSize: size,
      fontWeight: bold ? 'bold' : 'normal',
      fill: color,
    },
  });
}

/**
 * 六张牌联机牌桌：前端只负责「把 6 张牌分进三个槽位」的草稿与渲染，
 * 发牌、加倍表态、开牌、牌型比较与结算全在服务端（server/src/games/six-session.ts）。
 *
 * 草稿用「手牌下标」表示，提交时拼成 order，客户端拿不到也改不了别人的牌。
 */
export class SixOnlineScene implements Scene {
  readonly view = new Container();

  private tweens: TweenManager;
  private scoreLayer = new Container();
  private resultLayer = new Container();
  private myLayer = new Container();
  private infoLayer = new Container();
  private logLayer = new Container();
  private buttons = new Map<string, ButtonView>();
  private scoreTexts: Text[] = [];
  private resultTexts: Text[] = [];
  private infoText!: Text;
  private infoSub!: Text;
  private doubleText!: Text;
  private resultFoot!: Text;
  private logText!: Text;

  /** 三个槽位里的手牌下标；只在本地保存，未提交前服务端不知道 */
  private draft: number[][] = [[], [], []];
  private selected: number | null = null;
  private draftRound = -1;
  private myKey = '';
  private current: SixView | null = null;
  private destroyed = false;

  constructor(
    app: Application,
    private opts: SixOnlineOptions,
  ) {
    this.tweens = new TweenManager(app.ticker);
    this.buildScene();
  }

  // ---------- 构建 ----------

  private buildScene(): void {
    this.view.addChild(this.buildTable());
    this.view.addChild(this.infoLayer, this.resultLayer, this.scoreLayer, this.myLayer, this.logLayer);
    this.buildInfo();
    this.buildResultTexts();
    this.buildScoreBar();
    this.buildButtons();

    const exit = new ButtonView({
      label: '返回房间',
      width: 118,
      height: 40,
      color: COLORS.wood,
      fontSize: 15,
    });
    exit.position.set(DESIGN_W - 96, 34);
    exit.on('pointerup', () => this.opts.onExit());
    this.view.addChild(exit);
  }

  private buildTable(): Container {
    const box = new Container();
    const g = new Graphics();
    g.rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.feltDark);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 620).fill(COLORS.felt);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 500).fill(COLORS.feltLight);
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 470).stroke({ width: 3, color: COLORS.gold, alpha: 0.35 });
    g.circle(DESIGN_W / 2, DESIGN_H * 0.42, 456).stroke({ width: 1.5, color: COLORS.gold, alpha: 0.22 });
    box.addChild(g);

    // 牌靴装饰
    const shoe = new Graphics();
    shoe.roundRect(LAYOUT.shoe.x - 62, LAYOUT.shoe.y - 78, 116, 152, 10)
      .fill({ color: COLORS.feltDark, alpha: 0.85 });
    shoe.roundRect(LAYOUT.shoe.x - 62, LAYOUT.shoe.y - 78, 116, 152, 10)
      .stroke({ width: 2, color: COLORS.gold, alpha: 0.4 });
    box.addChild(shoe);
    const back = new Sprite(cardTexture(BACK_TEXTURE_NAME));
    back.anchor.set(0.5);
    back.scale.set(CARD_SCALE * 0.72);
    back.position.set(LAYOUT.shoe.x, LAYOUT.shoe.y);
    back.rotation = -0.06;
    box.addChild(back);
    return box;
  }

  private buildInfo(): void {
    this.infoText = makeText('', 28, COLORS.gold, true);
    this.infoText.anchor.set(0.5);
    this.infoText.position.set(DESIGN_W / 2, 240);
    this.infoSub = makeText('', 17, COLORS.textDim);
    this.infoSub.anchor.set(0.5);
    this.infoSub.position.set(DESIGN_W / 2, 286);
    this.doubleText = makeText('', 17, COLORS.text);
    this.doubleText.anchor.set(0.5);
    this.doubleText.position.set(DESIGN_W / 2, 348);
    this.infoLayer.addChild(this.infoText, this.infoSub, this.doubleText);

    this.logText = makeText('', 13, COLORS.textDim);
    this.logText.alpha = 0.8;
    this.logText.position.set(28, 142);
    this.logLayer.addChild(this.logText);
  }

  private buildResultTexts(): void {
    const bg = new Graphics();
    bg.roundRect(250, 158, 780, 286, 18).fill({ color: COLORS.feltDark, alpha: 0.92 });
    bg.roundRect(250, 158, 780, 286, 18).stroke({ width: 2, color: COLORS.gold, alpha: 0.55 });
    this.resultLayer.addChild(bg);

    for (let i = 0; i < 3; i++) {
      const head = makeText('', 19, COLORS.gold, true);
      head.position.set(278, 180 + i * 88);
      const detail = makeText('', 14, COLORS.text);
      detail.position.set(278, 210 + i * 88);
      this.resultTexts.push(head, detail);
    }
    this.resultFoot = makeText('', 16, COLORS.gold, true);
    this.resultFoot.position.set(278, 412);
    this.resultLayer.addChild(...this.resultTexts, this.resultFoot);
    this.resultLayer.visible = false;
  }

  private buildScoreBar(): void {
    // 最多 6 人，先建好文字槽，之后只改内容与位置
    for (let i = 0; i < 6; i++) {
      const t = makeText('', 15, COLORS.text, true);
      t.anchor.set(0.5, 0);
      this.scoreTexts.push(t);
      this.scoreLayer.addChild(t);
    }
  }

  private buildButtons(): void {
    const mk = (key: string, label: string, color: number, onClick: () => void) => {
      const b = new ButtonView({ label, width: 132, height: 44, fontSize: 18, color });
      b.visible = false;
      b.on('pointerup', () => {
        if (b.enabled) onClick();
      });
      this.buttons.set(key, b);
      this.view.addChild(b);
    };
    mk('auto', '自动分', COLORS.wood, () => this.autoFill());
    mk('clear', '清空', COLORS.wood, () => {
      this.draft = [[], [], []];
      this.selected = null;
      this.refreshMyArea();
    });
    mk('submit', '锁定分组', COLORS.gold, () => this.submit());
    mk('double', '加 倍', COLORS.coral, () => this.opts.onAct({ type: 'double' }));
    mk('pass', '不加倍', COLORS.wood, () => this.opts.onAct({ type: 'pass' }));
  }

  // ---------- 视图同步 ----------

  update(view: SixView): void {
    if (this.destroyed) return;
    if (view.roundNo !== this.draftRound) {
      this.draftRound = view.roundNo;
      this.draft = [[], [], []];
      this.selected = null;
      this.myKey = '';
    }
    this.current = view;
    this.syncScoreBar(view);
    this.syncInfo(view);
    this.syncResult(view);
    this.syncMyArea(view);
    this.syncButtons();
    this.logText.text = view.log.slice(-4).join('\n');
  }

  private syncScoreBar(view: SixView): void {
    const n = view.players.length;
    const span = Math.min(190, 1080 / Math.max(1, n));
    const startX = DESIGN_W / 2 - ((n - 1) * span) / 2;
    this.scoreTexts.forEach((t, i) => {
      const p = view.players[i];
      if (!p) {
        t.text = '';
        return;
      }
      let mark: string;
      if (view.phase === 'showdown') {
        mark = p.delta === null ? '' : p.delta > 0 ? ` +${p.delta}` : p.delta < 0 ? ` ${p.delta}` : ' ±0';
      } else if (view.phase === 'doubling') {
        mark = p.doubles > 0 ? ` 加倍×${p.doubles}` : p.doubleDecided ? ' 不加倍' : ' 待表态';
      } else {
        mark = p.id === view.leader ? ' ★头家' : '';
        mark += p.submitted ? ' ✓已锁定' : ' ·分组中';
      }
      t.text = `${p.id === view.you ? '★ ' : ''}${p.name}\n${p.score} 分${mark}`;
      (t.style as Text['style']).fill = p.id === view.you ? COLORS.gold : COLORS.text;
      t.position.set(startX + i * span, 34);
    });
  }

  private syncInfo(view: SixView): void {
    if (view.phase === 'showdown') {
      this.infoLayer.visible = false;
      return;
    }
    this.infoLayer.visible = true;
    const me = view.players.find((p) => p.id === view.you);
    if (!me) {
      this.infoText.text = '观战中';
      this.infoSub.text = '等大家分好组、表态加倍，再一起开牌';
      this.doubleText.text = '';
      return;
    }

    if (view.phase === 'doubling') {
      const turnName = view.doubleTurn === null ? '' : view.players[view.doubleTurn]?.name ?? '';
      const isMine = view.doubleTurn === view.you;
      this.infoText.text = view.leaderBonusPending
        ? `全员加倍！${view.players[view.leader].name} 还有一次机会`
        : `第 ${view.roundNo} 局 · 依次表态加倍`;
      this.infoSub.text = `当前 ${view.multiplier} 倍 · 头家 ${view.players[view.leader].name} · ${
        turnName ? `轮到 ${turnName}${isMine ? '（你）' : ''}` : '表态结束'
      }`;
      this.doubleText.text = view.players
        .map((p) => `${p.name} ${p.doubles > 0 ? `加倍×${p.doubles}` : p.doubleDecided ? '不加倍' : '…'}`)
        .join('    ');
      return;
    }

    this.doubleText.text = '';
    const waiting = view.players.filter((p) => !p.submitted).length;
    this.infoText.text = me.submitted
      ? '分组已锁定，等其他人'
      : `第 ${view.roundNo} 局 · 把 6 张牌分进三个位置`;
    this.infoSub.text = me.submitted
      ? `还有 ${waiting} 人没锁好`
      : `单张 ${view.weights.single} 分 · 十点半 ${view.weights.pair} 分 · 炸金花 ${view.weights.triple} 分 · 头家 ${view.players[view.leader].name}`;
  }

  private syncResult(view: SixView): void {
    this.resultLayer.visible = view.phase === 'showdown' && !!view.result;
    if (!this.resultLayer.visible || !view.result) return;
    const names = view.players.map((p) => p.name);
    view.result.groups.forEach((g, i) => {
      const winnerNames = g.winners.map((id) => names[id] ?? '?').join('、');
      this.resultTexts[i * 2].text = `${g.name} · ${g.weight} 分    ${g.push ? '平局不记分' : `${winnerNames} 赢`}`;
      this.resultTexts[i * 2 + 1].text = names
        .map((n, j) => `${n} ${g.labels[j] ?? '-'}${g.marks[j] === 'win' ? ' ✓' : ''}`)
        .join('    ');
    });
    this.resultFoot.text = `本局 ${view.result.multiplier} 倍（${view.result.doubleCount} 次加倍） · 下一局由 ${names[view.result.nextLeader] ?? '?'} 第一个表态`;
  }

  /** 只有局号/阶段/草稿变化时重画牌区，避免每次广播都闪一下 */
  private syncMyArea(view: SixView): void {
    const me = view.players.find((p) => p.id === view.you);
    const key = [
      view.roundNo,
      view.phase,
      me?.groups ? 'locked' : 'draft',
      this.draft.map((s) => s.join(',')).join('|'),
      this.selected ?? 'n',
      me?.hand?.map((c) => `${c.suit}_${c.rank}`).join(',') ?? '',
    ].join('#');
    if (key === this.myKey) return;
    this.myKey = key;
    this.renderMyArea();
  }

  private clearLayer(layer: Container): void {
    for (const child of layer.removeChildren()) child.destroy({ children: true });
  }

  private renderMyArea(): void {
    this.clearLayer(this.myLayer);
    const view = this.current;
    if (!view) return;
    const me = view.players.find((p) => p.id === view.you);
    const hand = me?.hand ?? null;
    const lockedGroups = me?.groups ?? null;
    const editable = view.phase === 'grouping' && view.legal.canSubmit && !lockedGroups;

    // 三个槽位框
    SLOTS.forEach((slot, i) => {
      const g = new Graphics();
      g.roundRect(slot.x - SLOT_W / 2, SLOT_Y - SLOT_H / 2, SLOT_W, SLOT_H, 14)
        .fill({ color: COLORS.feltDark, alpha: 0.72 });
      g.roundRect(slot.x - SLOT_W / 2, SLOT_Y - SLOT_H / 2, SLOT_W, SLOT_H, 14)
        .stroke({ width: 2, color: this.selected !== null && editable ? COLORS.gold : COLORS.matcha, alpha: 0.75 });
      if (editable) {
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointerup', () => this.putIntoSlot(i));
      }
      this.myLayer.addChild(g);

      const label = makeText(`${slot.title}  ${view.weights[GROUP_KEYS[i]]} 分`, 15, COLORS.textDim, true);
      label.anchor.set(0.5, 0);
      label.position.set(slot.x, SLOT_Y - SLOT_H / 2 + 8);
      this.myLayer.addChild(label);

      const capacity = slot.cap;
      const filled = lockedGroups
        ? (i === 0 ? [lockedGroups.single] : i === 1 ? lockedGroups.pair : lockedGroups.triple)
        : this.draft[i].map((idx) => hand?.[idx] ?? null);

      for (let k = 0; k < capacity; k++) {
        const card = filled[k] ?? null;
        const cx = slot.x + (k - (capacity - 1) / 2) * 86;
        const cy = SLOT_Y + 12;
        if (!card) {
          const empty = new Graphics();
          empty.roundRect(cx - 30, cy - 42, 60, 84, 8)
            .stroke({ width: 1.5, color: COLORS.gold, alpha: 0.3 });
          this.myLayer.addChild(empty);
          continue;
        }
        const cv = new CardView(this.tweens, card, true);
        cv.scale.set(0.58);
        cv.position.set(cx, cy);
        if (editable) {
          cv.eventMode = 'static';
          cv.cursor = 'pointer';
          const idx = this.draft[i][k];
          cv.on('pointerup', () => this.takeOut(i, idx));
        }
        this.myLayer.addChild(cv);
      }
    });

    if (!hand) {
      const tip = makeText(view.you < 0 ? '观战中 · 等大家开牌' : '等牌桌发牌…', 18, COLORS.textDim);
      tip.anchor.set(0.5);
      tip.position.set(DESIGN_W / 2, HAND_Y);
      this.myLayer.addChild(tip);
      return;
    }

    // 待分配的手牌
    if (!lockedGroups) {
      const used = new Set(this.draft.flat());
      const rest = hand.map((_, i) => i).filter((i) => !used.has(i));
      const gap = 96;
      const startX = DESIGN_W / 2 - ((rest.length - 1) * gap) / 2;
      rest.forEach((idx, k) => {
        const cx = startX + k * gap;
        const cy = HAND_Y - (this.selected === idx ? 14 : 0);
        if (this.selected === idx) {
          const halo = new Graphics();
          halo.roundRect(cx - 33, cy - 46, 66, 92, 8)
            .stroke({ width: 3, color: COLORS.gold, alpha: 0.95 });
          this.myLayer.addChild(halo);
        }
        const cv = new CardView(this.tweens, hand[idx], true);
        cv.scale.set(0.62);
        cv.position.set(cx, cy);
        if (editable) {
          cv.eventMode = 'static';
          cv.cursor = 'pointer';
          cv.on('pointerup', () => {
            this.selected = this.selected === idx ? null : idx;
            this.refreshMyArea();
          });
        }
        this.myLayer.addChild(cv);
      });
      if (!rest.length && editable) {
        const tip = makeText('牌都分好了，锁定后进入加倍表态', 16, COLORS.textDim);
        tip.anchor.set(0.5);
        tip.position.set(DESIGN_W / 2, HAND_Y);
        this.myLayer.addChild(tip);
      }
    } else {
      const tip = makeText(
        view.phase === 'showdown'
          ? '已开牌 · 结果见上方'
          : view.phase === 'doubling'
            ? '分组已锁定 · 正在依次表态加倍'
            : '分组已锁定 · 等其他人',
        16,
        COLORS.textDim,
      );
      tip.anchor.set(0.5);
      tip.position.set(DESIGN_W / 2, HAND_Y);
      this.myLayer.addChild(tip);
    }
  }

  // ---------- 分组交互 ----------

  /** 草稿变了就立刻重画牌区并刷新按钮可用性 */
  private refreshMyArea(): void {
    this.myKey = '';
    this.renderMyArea();
    this.syncButtons();
  }

  private putIntoSlot(slot: number): void {
    if (this.selected === null) return;
    if (this.draft[slot].length >= SLOTS[slot].cap) return;
    this.draft[slot].push(this.selected);
    this.selected = null;
    this.refreshMyArea();
  }

  private takeOut(slot: number, idx: number): void {
    if (idx === undefined) return;
    this.draft[slot] = this.draft[slot].filter((i) => i !== idx);
    this.selected = idx;
    this.refreshMyArea();
  }

  private autoFill(): void {
    const view = this.current;
    const me = view?.players.find((p) => p.id === view.you);
    if (!me?.hand) return;
    const used = new Set(this.draft.flat());
    const rest = me.hand.map((_, i) => i).filter((i) => !used.has(i));
    let k = 0;
    SLOTS.forEach((slot, i) => {
      while (this.draft[i].length < slot.cap && k < rest.length) {
        this.draft[i].push(rest[k++]);
      }
    });
    this.selected = null;
    this.refreshMyArea();
  }

  private draftComplete(): boolean {
    return SLOTS.every((slot, i) => this.draft[i].length === slot.cap);
  }

  private submit(): void {
    if (!this.draftComplete()) return;
    this.opts.onAct({
      type: 'submit',
      order: [...this.draft[0], ...this.draft[1], ...this.draft[2]],
    });
  }

  private syncButtons(): void {
    const view = this.current;
    const me = view?.players.find((p) => p.id === view?.you);
    const editable = !!view && view.phase === 'grouping' && view.legal.canSubmit && !me?.groups;
    const doubling = !!view && view.phase === 'doubling' && view.legal.canDouble;
    const visible = editable ? ['auto', 'clear', 'submit'] : doubling ? ['double', 'pass'] : [];
    const w = 132;
    const gap = 18;
    const total = visible.length * w + Math.max(0, visible.length - 1) * gap;
    visible.forEach((key, i) => {
      const b = this.buttons.get(key)!;
      b.visible = true;
      b.setEnabled(true);
      b.position.set(DESIGN_W / 2 - total / 2 + w / 2 + i * (w + gap), BUTTON_Y);
      if (key === 'submit') b.setEnabled(this.draftComplete());
      if (key === 'clear') b.setEnabled(this.draft.some((s) => s.length > 0));
      if (key === 'auto') b.setEnabled(!this.draftComplete());
    });
    for (const [key, b] of this.buttons) {
      if (!visible.includes(key)) b.visible = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearLayer(this.myLayer);
    this.view.destroy({ children: true });
  }
}
