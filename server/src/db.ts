/**
 * SQLite 连接与建表。
 *
 * 所有 SQL 一律用预编译语句 + 绑定参数，不做字符串拼接，杜绝 SQL 注入。
 */
import Database from 'better-sqlite3';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_FILE = process.env.DB_PATH ?? 'data/family.db';
const absPath = resolve(process.cwd(), DB_FILE);
mkdirSync(dirname(absPath), { recursive: true });

export const db = new Database(absPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  nickname    TEXT NOT NULL,
  avatar      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS families (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

-- 访客分享链接：临时邀请别人来玩用，与被邀请人是否注册无关
CREATE TABLE IF NOT EXISTS invites (
  token       TEXT PRIMARY KEY,
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  label       TEXT,
  expires_at  INTEGER NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 0,
  used_count  INTEGER NOT NULL DEFAULT 0,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_family ON invites(family_id);

-- 临时玩家：通过分享链接进来，不属于家庭成员表
CREATE TABLE IF NOT EXISTS guests (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  invite_token TEXT,
  nickname    TEXT NOT NULL,
  avatar      TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guests_family ON guests(family_id);
`);

// —— 在线房间 ——
// config 存 JSON，各游戏的专属配置直接塞进去，加配置不用改表
db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  family_id   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,
  host_id     TEXT NOT NULL,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'waiting',
  config      TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_family ON rooms(family_id, status);

CREATE TABLE IF NOT EXISTS room_seats (
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seat_index  INTEGER NOT NULL,
  user_id     TEXT,
  guest_id    TEXT,
  nickname    TEXT NOT NULL,
  avatar      TEXT,
  role        TEXT NOT NULL DEFAULT 'player',
  ready       INTEGER NOT NULL DEFAULT 0,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (room_id, seat_index)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seat_user ON room_seats(room_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seat_guest ON room_seats(room_id, guest_id) WHERE guest_id IS NOT NULL;
`);

// 老库补列：免密登录的恢复码
const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userCols.some((c) => c.name === 'recovery_code')) {
  db.exec('ALTER TABLE users ADD COLUMN recovery_code TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_recovery ON users(recovery_code) WHERE recovery_code IS NOT NULL');

/** 家庭码字符集：去掉 0/O/1/I 等易混淆字符，避免口头传错 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FAMILY_CODE_LEN = 6;

/** 生成 6 位家庭码，冲突时由调用方重试 */
export function randomFamilyCode(): string {
  let s = '';
  for (let i = 0; i < FAMILY_CODE_LEN; i += 1) {
    s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return s;
}

/** 恢复码：8 位分两组，让人好抄好念（格式 ABCD-EFGH） */
export function randomRecoveryCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

/** 32 字节随机串，用于会话 token / 邀请 token / 访客 token */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}
