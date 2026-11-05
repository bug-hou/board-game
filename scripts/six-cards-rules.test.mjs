/** 六张牌分组玩法规则内核测试：node --experimental-strip-types --test scripts/six-cards-rules.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_WEIGHTS,
  compareZjh,
  evalHalfPoint,
  evalSingle,
  evalZjh,
  multiplierOf,
  settleRound,
  splitByOrder,
  zjhWinners,
} from '../src/game/six-cards/rules.ts';

const c = (suit, rank) => ({ suit, rank });
const S = (rank) => c('spade', rank);
const H = (rank) => c('heart', rank);
const D = (rank) => c('diamond', rank);

function groups(single, pair, triple) {
  return { single, pair, triple };
}

/** 六张固定手牌，方便构造不同分组 */
const HAND = [S('a'), H('k'), D('10'), S('j'), H('5'), D('2')];

test('splitByOrder 校验下标排列并按 1/2/3 切分', () => {
  const g = splitByOrder(HAND, [0, 1, 2, 3, 4, 5]);
  assert.equal(g.single, HAND[0]);
  assert.deepEqual(g.pair, [HAND[1], HAND[2]]);
  assert.deepEqual(g.triple, [HAND[3], HAND[4], HAND[5]]);
  assert.equal(splitByOrder(HAND, [0, 0, 1, 2, 3, 4]), null);
  assert.equal(splitByOrder(HAND, [0, 1, 2, 3, 4, 6]), null);
  assert.equal(splitByOrder(HAND, [0, 1, 2, 3, 4]), null);
});

test('单张比大小：A 最大，同点数不同花色判平', () => {
  assert.ok(evalSingle(S('a')).rank > evalSingle(H('k')).rank);
  assert.equal(evalSingle(S('k')).rank, evalSingle(D('k')).rank);
});

test('十点半：J/Q/K 半点、A 一点、超 10.5 爆牌', () => {
  assert.deepEqual(
    { total: evalHalfPoint([S('j'), H('q')]).total, busted: false },
    { total: 1, busted: false },
  );
  assert.equal(evalHalfPoint([S('10'), H('k')]).total, 10.5);
  assert.equal(evalHalfPoint([S('10'), H('k')]).busted, false);
  assert.equal(evalHalfPoint([S('a'), H('9')]).total, 10);
  assert.equal(evalHalfPoint([S('a'), H('10')]).total, 11);
  assert.equal(evalHalfPoint([S('a'), H('10')]).busted, true);
  assert.equal(evalHalfPoint([S('10'), H('10')]).busted, true);
});

test('炸金花牌型识别：豹子/同花顺/金花/顺子/对子/散牌', () => {
  assert.equal(evalZjh([S('a'), H('a'), D('a')]).category, 'baozi');
  assert.equal(evalZjh([S('q'), S('k'), S('a')]).category, 'straightFlush');
  assert.equal(evalZjh([S('a'), S('k'), S('9')]).category, 'flush');
  assert.equal(evalZjh([S('q'), H('k'), D('a')]).category, 'straight');
  assert.equal(evalZjh([S('7'), H('7'), D('k')]).category, 'pair');
  assert.equal(evalZjh([S('a'), H('9'), D('4')]).category, 'high');
});

test('A23 是最小的顺子，QKA 最大', () => {
  const a23 = evalZjh([S('a'), H('3'), D('2')]);
  const qka = evalZjh([S('q'), H('k'), D('a')]);
  const s234 = evalZjh([S('2'), H('3'), D('4')]);
  assert.equal(a23.category, 'straight');
  assert.ok(compareZjh(qka, s234) > 0);
  assert.ok(compareZjh(s234, a23) > 0);
});

test('牌型大小：豹子 > 同花顺 > 金花 > 顺子 > 对子 > 散牌，同级不比花色', () => {
  const evals = [
    evalZjh([S('9'), H('9'), D('9')]),
    evalZjh([S('5'), S('4'), S('3')]),
    evalZjh([S('a'), S('k'), S('8')]),
    evalZjh([S('5'), H('4'), D('3')]),
    evalZjh([S('2'), H('2'), D('a')]),
    evalZjh([S('a'), H('k'), D('8')]),
  ];
  for (let i = 0; i < evals.length - 1; i++) {
    assert.ok(compareZjh(evals[i], evals[i + 1]) > 0, `第 ${i} 组应大于第 ${i + 1} 组`);
  }
  assert.equal(compareZjh(evalZjh([S('a'), H('k'), D('8')]), evalZjh([H('a'), S('k'), D('8')])), 0);
  assert.equal(compareZjh(evalZjh([S('9'), H('9'), D('9')]), evalZjh([H('9'), D('9'), S('9')])), 0);
});

test('235 克星：不同花色生效，同花不生效', () => {
  assert.equal(evalZjh([S('2'), H('3'), D('5')]).special235, true);
  assert.equal(evalZjh([S('2'), S('3'), S('5')]).special235, false);
  assert.equal(evalZjh([S('2'), S('3'), S('5')]).category, 'flush');
});

test('235 只淘汰豹子，其余牌正常比', () => {
  const killer = evalZjh([S('2'), H('3'), D('5')]);
  const baozi = evalZjh([S('k'), H('k'), D('k')]);
  const straightFlush = evalZjh([S('5'), S('4'), S('3')]);

  // 只有豹子和 235 → 豹子被吃掉，235 赢
  assert.deepEqual(zjhWinners([baozi, killer]), [1]);
  // 另有同花顺时，豹子出局后由同花顺赢，235 仍是最小散牌
  assert.deepEqual(zjhWinners([baozi, killer, straightFlush]), [2]);
  // 235 对普通散牌仍是最小散牌
  assert.deepEqual(zjhWinners([killer, evalZjh([S('a'), H('k'), D('8')])]), [1]);
  // 两个 235 并列
  assert.deepEqual(zjhWinners([killer, killer, baozi]), [0, 1]);
});

test('逐组结算：三组权重 1/3/5，分数总和恒为 0', () => {
  assert.deepEqual(GROUP_WEIGHTS, { single: 1, pair: 3, triple: 5 });
  const a = groups(S('a'), [S('10'), H('k')], [S('a'), H('a'), D('a')]);
  const b = groups(S('2'), [S('a'), H('2')], [S('2'), H('3'), D('4')]);
  const r = settleRound([a, b]);
  assert.equal(r.groups.single.winners[0], 0);
  assert.equal(r.groups.pair.winners[0], 0);
  assert.equal(r.groups.triple.winners[0], 0);
  assert.deepEqual(r.delta, [9, -9]);
  assert.equal(r.delta.reduce((x, y) => x + y, 0), 0);
});

test('全员并列或全员爆牌时该组不记分', () => {
  const g = (single, pair, triple) => groups(single, pair, triple);
  const same = g(S('a'), [S('10'), H('k')], [S('7'), H('7'), D('7')]);
  const r = settleRound([same, same]);
  assert.equal(r.groups.single.push, true);
  assert.equal(r.groups.pair.push, true);
  assert.equal(r.groups.triple.push, true);
  assert.deepEqual(r.delta, [0, 0]);

  const bust = g(S('2'), [S('10'), H('10')], [S('7'), H('7'), D('7')]);
  const r2 = settleRound([bust, bust]);
  assert.equal(r2.groups.pair.push, true);
});

test('多人并列赢家时输家的分数由赢家均分且守恒', () => {
  const winner = groups(S('a'), [S('10'), H('k')], [S('a'), H('a'), D('a')]);
  const loser = groups(S('2'), [S('a'), H('2')], [S('2'), H('3'), D('4')]);
  const r = settleRound([winner, winner, loser]);
  assert.equal(r.delta.reduce((x, y) => x + y, 0), 0);
  assert.ok(r.delta[2] < 0);
  assert.ok(r.delta[0] > 0 && r.delta[1] > 0);
});

test('多个输家时分数仍守恒，赢家拿走全部输家付出的分', () => {
  const winner = groups(S('a'), [S('10'), H('k')], [S('a'), H('a'), D('a')]);
  const loser = groups(S('2'), [S('a'), H('2')], [S('2'), H('3'), D('4')]);
  const r = settleRound([winner, loser, loser]);
  assert.equal(r.delta.reduce((x, y) => x + y, 0), 0);
  assert.deepEqual(r.delta, [18, -9, -9]);
  assert.equal(r.groups.triple.winners[0], 0);
});

test('加倍倍率：1 次 2 倍、2 次 4 倍、3 次 6 倍，无人加倍 1 倍', () => {
  assert.equal(multiplierOf(0), 1);
  assert.equal(multiplierOf(1), 2);
  assert.equal(multiplierOf(2), 4);
  assert.equal(multiplierOf(3), 6);
  assert.equal(multiplierOf(4), 8);
});

test('本局倍率对三组一视同仁，翻完仍然守恒', () => {
  const winner = groups(S('a'), [S('10'), H('k')], [S('a'), H('a'), D('a')]);
  const loser = groups(S('2'), [S('a'), H('2')], [S('2'), H('3'), D('4')]);
  const base = settleRound([winner, loser, loser]);
  const doubled = settleRound([winner, loser, loser], 6);
  assert.deepEqual(base.delta, [18, -9, -9]);
  assert.deepEqual(doubled.delta, base.delta.map((d) => d * 6));
  assert.equal(doubled.delta.reduce((x, y) => x + y, 0), 0);
  // 牌型判定不受倍率影响
  assert.deepEqual(doubled.groups.triple.winners, base.groups.triple.winners);
});

test('235 反杀豹子会体现在第三组结算里', () => {
  const baozi = groups(S('k'), [S('10'), H('k')], [S('k'), H('k'), D('k')]);
  const killer = groups(S('2'), [S('a'), H('2')], [S('2'), H('3'), D('5')]);
  const r = settleRound([baozi, killer]);
  assert.deepEqual(r.groups.triple.winners, [1]);
  assert.equal(r.groups.triple.marks[1], 'win');
  assert.ok(r.groups.triple.note.includes('235'));
});
