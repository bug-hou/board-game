/** 六张牌联机会话全流程检查：cd server && npx tsx scripts/six-session.check.mjs */
import assert from 'node:assert/strict';
import { SixSession } from '../src/games/six-session.ts';

const s = new SixSession([
  { actorId: 'a', name: '小明', avatar: null },
  { actorId: 'b', name: '小红', avatar: null },
  { actorId: 'c', name: '妈妈', avatar: null },
]);
const order = [0, 1, 2, 3, 4, 5];

// 开局：只发自己的 6 张暗牌，别人的手牌一律不下发
const v0 = s.viewFor('a');
assert.equal(v0.game, 'six');
assert.equal(v0.roundNo, 1);
assert.equal(v0.phase, 'grouping');
assert.equal(v0.you, 0);
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

// 一人锁定后仍不摊牌，且别人看不到他的分组
assert.equal(s.apply('a', { type: 'submit', order }).ok, true);
assert.equal(s.apply('a', { type: 'submit', order }).ok, false);
const vMid = s.viewFor('b');
assert.equal(vMid.players[0].submitted, true);
assert.equal(vMid.players[0].hand, null);
assert.equal(vMid.players[0].groups, null);
assert.equal(vMid.players[1].hand.length, 6);
assert.equal(s.hasResult(), false);

// 全员锁定 → 一起开牌、三组分别结算
s.apply('b', { type: 'submit', order: [5, 4, 3, 2, 1, 0] });
s.apply('c', { type: 'submit', order: [2, 3, 4, 5, 0, 1] });
assert.equal(s.hasResult(), true);
const vEnd = s.viewFor('b');
assert.equal(vEnd.phase, 'showdown');
assert.ok(vEnd.players.every((p) => p.groups !== null));
assert.equal(vEnd.result.groups.length, 3);
assert.equal(vEnd.players.reduce((x, p) => x + (p.delta ?? 0), 0), 0);
for (const p of vEnd.players) assert.equal(p.score, p.delta);
assert.equal(s.apply('a', { type: 'submit', order }).ok, false);

// 下一局：分数累计、草稿清空、又能重新分组
const scores = vEnd.players.map((p) => p.score);
s.startRound();
const v2 = s.viewFor('a');
assert.equal(v2.roundNo, 2);
assert.equal(v2.phase, 'grouping');
assert.equal(v2.result, null);
assert.equal(v2.players[0].hand.length, 6);
assert.equal(v2.players[1].hand, null);
assert.deepEqual(v2.players.map((p) => p.score), scores);
assert.ok(v2.players.every((p) => p.delta === null && !p.submitted));

// 房主「本局先跳过」按默认顺序自动分组，不是代打
assert.equal(s.skipHand('b'), true);
assert.equal(s.viewFor('b').players[1].submitted, true);
assert.equal(s.skipHand('b'), false);

console.log('✓ SixSession 全流程检查通过（暗牌裁剪 / 分组校验 / 摊牌 / 守恒 / 下一局 / 跳过）');
