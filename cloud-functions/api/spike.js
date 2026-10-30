/**
 * 一致性 spike：验证 EdgeOne Pages Blob 的强一致读是否立即可见、耗时多少。
 *
 * 仅用于联机方案的可行性验证，验证通过后可删除。
 *
 * GET  /api/spike?room=xxx            -> 同时用 eventual 与 strong 读一次，对比两者结果
 * POST /api/spike?room=xxx            -> 带乐观锁写一次（body: { writerId, expectVersion }）
 */

/**
 * SDK 包名在官方文档两处不一致（概览页写 @tencent，Blob 专页写 @edgeone），
 * 两个包在 npm 上都存在。这里按顺序探测，取第一个能 export getStore 的。
 */
const SDK_CANDIDATES = ['@edgeone/pages-blob', '@tencent/pages-blob'];

let sdkPromise = null;
async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const errors = [];
      for (const name of SDK_CANDIDATES) {
        try {
          const mod = await import(name);
          if (typeof mod.getStore === 'function') return { name, getStore: mod.getStore };
          errors.push(`${name}: 未导出 getStore`);
        } catch (e) {
          errors.push(`${name}: ${e && e.message ? e.message : e}`);
        }
      }
      throw new Error(`pages-blob SDK 均不可用 -> ${errors.join(' | ')}`);
    })();
  }
  return sdkPromise;
}

const NS = 'bj-spike';
let stores = null;
async function getStores() {
  if (!stores) {
    const sdk = await loadSdk();
    stores = {
      sdkName: sdk.name,
      strong: sdk.getStore({ name: NS, consistency: 'strong' }),
      eventual: sdk.getStore({ name: NS, consistency: 'eventual' }),
    };
  }
  return stores;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

/** 房间码做白名单过滤，避免作为 Blob key 时被穿越目录 */
function safeRoom(raw) {
  return String(raw || 'demo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'demo';
}

const keyOf = (room) => `rooms/${room}.json`;

async function timed(fn) {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const room = safeRoom(url.searchParams.get('room'));

  let store;
  try {
    store = await getStores();
  } catch (e) {
    return json({ ok: false, reason: String(e && e.message ? e.message : e) }, 500);
  }

  // ---- 读：同时走 eventual 与 strong，直接对比 ----
  if (request.method === 'GET') {
    const ev = await timed(() => store.eventual.get(keyOf(room), { type: 'json' }));
    const st = await timed(() => store.strong.get(keyOf(room), { type: 'json' }));

    const norm = (s) => (s ? { n: s.n, version: s.version, lastWriter: s.lastWriter, updatedAt: s.updatedAt } : null);
    return json({
      ok: true,
      op: 'read',
      room,
      sdkName: store.sdkName,
      serverTime: Date.now(),
      eventual: { state: norm(ev.value), ms: ev.ms },
      strong: { state: norm(st.value), ms: st.ms },
      // 两者不一致 = 边缘缓存还没刷新，强一致是必需的
      same: JSON.stringify(norm(ev.value)) === JSON.stringify(norm(st.value)),
    });
  }

  // ---- 写：带乐观锁 ----
  if (request.method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, reason: 'body 不是合法 JSON' }, 400);
    }

    const writerId = String(body.writerId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'anon';
    const expectVersion = Number(body.expectVersion);

    const read = await timed(() => store.strong.get(keyOf(room), { type: 'json' }));
    const cur = read.value;

    if (!cur) {
      const fresh = { n: 1, version: 1, lastWriter: writerId, updatedAt: Date.now() };
      const w = await timed(() => store.strong.setJSON(keyOf(room), fresh));
      return json({ ok: true, op: 'create', room, sdkName: store.sdkName, readMs: read.ms, writeMs: w.ms, state: fresh });
    }

    if (Number.isFinite(expectVersion) && expectVersion !== cur.version) {
      // 乐观锁冲突：把最新状态回给客户端，让它重取重试
      return json({
        ok: true,
        op: 'conflict',
        room,
        sdkName: store.sdkName,
        readMs: read.ms,
        conflict: true,
        expected: expectVersion,
        state: cur,
      });
    }

    const nextState = {
      n: cur.n + 1,
      version: cur.version + 1,
      lastWriter: writerId,
      updatedAt: Date.now(),
    };
    const w = await timed(() => store.strong.setJSON(keyOf(room), nextState));
    return json({ ok: true, op: 'write', room, sdkName: store.sdkName, readMs: read.ms, writeMs: w.ms, conflict: false, state: nextState });
  }

  return json({ ok: false, reason: 'method not allowed' }, 405);
}
