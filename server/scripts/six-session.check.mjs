/** 六张牌联机会话全流程检查：cd server && npx tsx scripts/six-session.check.mjs */
import assert from 'node:assert/strict';
import { SixSession } from '../src/games/six-session.ts';

const ACTORS = ['a', 'b', 'c'];
const order = [0, 1, 2, 3, 4, 5];
const s = new SixSession([
  { actorId: 'a', name: '小明', avatar: null },
  { actorId: 'b', name: '小红', avatar: null },
  { actorId: 'c', name: '妈妈', avatar: null },
]);
const submitAll = () => ACTORS.forEach((id) => s.apply(id, { type: 'submit', order }));
const whoTurn = () => ACTORS[s.viewFor('a').doubleTurn];

// 开局：只发自己的 6 张暗牌，别人的手牌一律不下发；首局头家是 0 号位
const v0 = s.viewFor('a');
assert.equal(v0.game, 'six');
assert.equal(v0.roundNo, 1);
assert.equal(v0.phase, 'grouping');
assert.equal(v0.leader, 0);
assert.equal(v0.you, 0);
assert.equal(v0.multiplier, 1);
assert.equal(v0.players[0].hand.length, 6);
assert.equal(v0.players[1].hand, null);
assert.equal(v0.players[2].hand, null);
assert.equal(v0.players[1].groups, null);
assert.equal(v0.legal.canSubmit, true);
assert.equal(s.viewFor(null).you, -1);
assert.deepEqual(v0.weights, { single: 1, pair: 3, triple: 5 });

// 下标必须是不重复的 0..5 排列，伪造手牌会被拒
assert.equal(s.apply('a', { type: 'submit', order: [0, 0, 1, 2, 3, 4] }).ok, false);
assert.equal(s.apply('a', { type: 'submit', order: [0, 1, 2, 3, 4, 9] }).ok, false);
assert.equal(s.apply('a', { type: 'submit', order: [0, 1, 2, 3, 4] }).ok, false);
assert.equal(s.apply('观众', { type: 'submit', order }).ok, false);
assert.equal(s.apply('a', { type: '不存在的动作' }).ok, false);

// 一人锁定后仍在分组阶段，且别人看不到他的分组
assert.equal(s.apply('a', { type: 'submit', order }).ok, true);
assert.equal(s.apply('a', { type: 'submit', order }).ok, false);
const vMid = s.viewFor('b');
assert.equal(vMid.phase, 'grouping');
assert.equal(vMid.players[0].submitted, true);
assert.equal(vMid.players[0].hand, null);
assert.equal(vMid.players[0].groups, null);
assert.equal(s.hasResult(), false);

// 全员锁定 → 进入加倍表态，不直接开牌；从头家开始依次表态
s.apply('b', { type: 'submit', order: [5, 4, 3, 2, 1, 0] });
s.apply('c', { type: 'submit', order: [2, 3, 4, 5, 0, 1] });
const vd = s.viewFor('a');
assert.equal(vd.phase, 'doubling');
assert.equal(s.hasResult(), false);
assert.equal(vd.doubleTurn, vd.leader);
assert.equal(vd.legal.canDouble, true);
assert.equal(vd.legal.canPass, true);
assert.equal(s.apply('b', { type: 'double' }).ok, false); // 不能抢答

// 头家不加倍，后面两人仍各自加倍 → 2 次加倍 = 4 倍
assert.equal(s.apply('a', { type: 'pass' }).ok, true);
assert.equal(s.viewFor('a').players[0].doubleDecided, true);
assert.equal(s.viewFor('a').players[0].doubles, 0);
assert.equal(s.viewFor('a').doubleTurn, 1);
assert.equal(s.apply('b', { type: 'double' }).ok, true);
assert.equal(s.apply('c', { type: 'double' }).ok, true);
assert.equal(s.hasResult(), true);

const vEnd = s.viewFor('b');
assert.equal(vEnd.phase, 'showdown');
assert.ok(vEnd.players.every((p) => p.groups !== null));
assert.equal(vEnd.result.groups.length, 3);
assert.equal(vEnd.result.doubleCount, 2);
assert.equal(vEnd.result.multiplier, 4);
assert.equal(vEnd.players.reduce((x, p) => x + (p.delta ?? 0), 0), 0);
assert.ok(vEnd.players.every((p) => (p.delta ?? 0) % 4 === 0));
for (const p of vEnd.players) assert.equal(p.score, p.delta);
assert.equal(s.apply('a', { type: 'submit', order }).ok, false);

// 下一局头家 = 本局净分最高者（并列取座位号靠前）
const maxDelta = Math.max(...vEnd.players.map((p) => p.delta));
assert.equal(vEnd.players[vEnd.result.nextLeader].delta, maxDelta);
s.startRound();
const v2 = s.viewFor('a');
assert.equal(v2.roundNo, 2);
assert.equal(v2.leader, vEnd.result.nextLeader);
assert.equal(v2.phase, 'grouping');
assert.equal(v2.result, null);
assert.equal(v2.players[0].hand.length, 6);
assert.equal(v2.players[1].hand, null);
assert.deepEqual(v2.players.map((p) => p.score), vEnd.players.map((p) => p.score));
assert.ok(v2.players.every((p) => p.delta === null && !p.submitted && p.doubles === 0));

// 房主「本局先跳过」在分组阶段按默认顺序替他分组
assert.equal(s.skipHand('b'), true);
assert.equal(s.viewFor('b').players[1].submitted, true);
assert.equal(s.skipHand('b'), false);
s.apply('a', { type: 'submit', order });
s.apply('c', { type: 'submit', order });

// 全员加倍 → 头家获得第二次机会，再算一次加倍：3 + 1 = 4 次 = 8 倍
assert.equal(s.viewFor('a').phase, 'doubling');
let guard = 0;
while (s.viewFor('a').phase === 'doubling' && guard++ < 10) {
  assert.equal(s.apply(whoTurn(), { type: 'double' }).ok, true);
}
const v2End = s.viewFor('a');
assert.equal(v2End.phase, 'showdown');
assert.equal(v2End.result.doubleCount, 4);
assert.equal(v2End.result.multiplier, 8);
assert.equal(v2End.players.reduce((x, p) => x + (p.delta ?? 0), 0), 0);

// 第二次机会也可以放弃：3 次加倍 = 6 倍
s.startRound();
submitAll();
assert.equal(s.viewFor('a').phase, 'doubling');
for (let i = 0; i < 3; i++) assert.equal(s.apply(whoTurn(), { type: 'double' }).ok, true);
const vBonus = s.viewFor('a');
assert.equal(vBonus.leaderBonusPending, true);
assert.equal(vBonus.doubleTurn, vBonus.leader);
assert.equal(s.apply(ACTORS[vBonus.leader], { type: 'pass' }).ok, true);
const v3End = s.viewFor('a');
assert.equal(v3End.result.doubleCount, 3);
assert.equal(v3End.result.multiplier, 6);

// 加倍阶段房主也能替轮到的人跳过（按不加倍处理）
s.startRound();
submitAll();
const before = s.viewFor('a');
const stuck = before.doubleTurn;
assert.equal(s.skipHand(ACTORS[stuck]), true);
assert.equal(s.viewFor('a').players[stuck].doubleDecided, true);
assert.equal(s.viewFor('a').players[stuck].doubles, 0);

console.log('✓ SixSession 全流程检查通过（暗牌 / 分组 / 依次加倍 / 头家再翻倍 / 倍率守恒 / 头家轮换 / 跳过）');
