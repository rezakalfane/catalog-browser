import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";

export type EnvironmentSummary = {
  id: number;
  name: string;
  storeHash: string;
};

export type EnvironmentCredentials = EnvironmentSummary & {
  accessToken: string;
};

export type AppPreferences = {
  environmentId: number | null;
  channelId: number | null;
  categoryId: number | null;
  layout: "grid" | "list";
  density: number;
  sidebarWidth: number;
  drawerWidth: number;
};

type EnvironmentRow = {
  id: number;
  name: string;
  store_hash: string;
  encrypted_access_token: string;
};

let database: Database.Database | undefined;

function encryptionKey() {
  const rawKey = process.env.ENVIRONMENTS_ENCRYPTION_KEY;
  if (!rawKey) throw new Error("ENVIRONMENTS_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) throw new Error("ENVIRONMENTS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

function decrypt(value: string) {
  const [iv, authTag, encrypted] = value.split(".");
  if (!iv || !authTag || !encrypted) throw new Error("Stored environment token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

function getDatabase() {
  if (database) return database;
  const directory = join(process.cwd(), "data");
  mkdirSync(directory, { recursive: true });
  database = new Database(join(directory, "catalog.db"));
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS environments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store_hash TEXT NOT NULL UNIQUE,
      encrypted_access_token TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const columns = database.prepare("PRAGMA table_info(environments)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "sort_order")) {
    database.exec("ALTER TABLE environments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    database.exec("UPDATE environments SET sort_order = id");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      environment_id INTEGER,
      channel_id INTEGER,
      category_id INTEGER,
      layout TEXT NOT NULL DEFAULT 'grid',
      density INTEGER NOT NULL DEFAULT 3,
      sidebar_width INTEGER NOT NULL DEFAULT 260
    );
    INSERT OR IGNORE INTO app_preferences (id) VALUES (1);
    CREATE TABLE IF NOT EXISTS environment_preferences (
      environment_id INTEGER PRIMARY KEY,
      channel_id INTEGER,
      category_id INTEGER,
      FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
    );
    INSERT OR IGNORE INTO environment_preferences (environment_id, channel_id, category_id)
      SELECT environment_id, channel_id, category_id FROM app_preferences WHERE id = 1 AND environment_id IS NOT NULL;
    UPDATE app_preferences SET channel_id = NULL, category_id = NULL WHERE id = 1;
  `);
  const preferenceColumns = database.prepare("PRAGMA table_info(app_preferences)").all() as { name: string }[];
  if (!preferenceColumns.some((column) => column.name === "sidebar_width")) {
    database.exec("ALTER TABLE app_preferences ADD COLUMN sidebar_width INTEGER NOT NULL DEFAULT 260");
  }
  if (!preferenceColumns.some((column) => column.name === "drawer_width")) {
    database.exec("ALTER TABLE app_preferences ADD COLUMN drawer_width INTEGER NOT NULL DEFAULT 630");
  }
  migrateLegacyEnvironment(database);
  return database;
}

function migrateLegacyEnvironment(db: Database.Database) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM environments").get() as { count: number };
  const storeHash = process.env.BIGCOMMERCE_STOREHASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  if (existing.count || !storeHash || !accessToken) return;
  db.prepare("INSERT INTO environments (name, store_hash, encrypted_access_token) VALUES (?, ?, ?)")
    .run(`Store ${storeHash}`, storeHash, encrypt(accessToken));
}

function asSummary(row: EnvironmentRow): EnvironmentSummary {
  return { id: row.id, name: row.name, storeHash: row.store_hash };
}

export function listEnvironments() {
  const rows = getDatabase().prepare("SELECT id, name, store_hash, encrypted_access_token FROM environments ORDER BY sort_order, id").all() as EnvironmentRow[];
  return rows.map(asSummary);
}

export function getEnvironment(id?: number) {
  const db = getDatabase();
  const row = (id
    ? db.prepare("SELECT id, name, store_hash, encrypted_access_token FROM environments WHERE id = ?").get(id)
    : db.prepare("SELECT id, name, store_hash, encrypted_access_token FROM environments ORDER BY sort_order, id LIMIT 1").get()) as EnvironmentRow | undefined;
  return row ? { ...asSummary(row), accessToken: decrypt(row.encrypted_access_token) } : undefined;
}

export function createEnvironment(input: { name: string; storeHash: string; accessToken: string }) {
  const db = getDatabase();
  const order = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM environments").get() as { value: number };
  const result = db.prepare("INSERT INTO environments (name, store_hash, encrypted_access_token, sort_order) VALUES (?, ?, ?, ?)")
    .run(input.name.trim(), input.storeHash.trim(), encrypt(input.accessToken.trim()), order.value);
  return getEnvironment(Number(result.lastInsertRowid));
}

export function updateEnvironment(id: number, input: { name: string; storeHash: string; accessToken?: string }) {
  const db = getDatabase();
  const current = getEnvironment(id);
  if (!current) return undefined;
  const token = input.accessToken?.trim() || current.accessToken;
  db.prepare("UPDATE environments SET name = ?, store_hash = ?, encrypted_access_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(input.name.trim(), input.storeHash.trim(), encrypt(token), id);
  return getEnvironment(id);
}

export function deleteEnvironment(id: number) {
  const db = getDatabase();
  const deleted = db.prepare("DELETE FROM environments WHERE id = ?").run(id).changes > 0;
  if (deleted) {
    db.prepare("DELETE FROM environment_preferences WHERE environment_id = ?").run(id);
    db.prepare("UPDATE app_preferences SET environment_id = NULL WHERE environment_id = ?").run(id);
  }
  return deleted;
}

export function reorderEnvironments(ids: number[]) {
  const db = getDatabase();
  const update = db.prepare("UPDATE environments SET sort_order = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id, index) => update.run(index, id)))();
  return listEnvironments();
}

export function getPreferences(requestedEnvironmentId?: number): AppPreferences {
  const row = getDatabase().prepare("SELECT environment_id, channel_id, category_id, layout, density, sidebar_width, drawer_width FROM app_preferences WHERE id = 1").get() as {
    environment_id: number | null;
    channel_id: number | null;
    category_id: number | null;
    layout: string;
    density: number;
    sidebar_width: number;
    drawer_width: number;
  };
  const environmentId = requestedEnvironmentId ?? row.environment_id;
  const environmentPreference = environmentId
    ? getDatabase().prepare("SELECT channel_id, category_id FROM environment_preferences WHERE environment_id = ?").get(environmentId) as { channel_id: number | null; category_id: number | null } | undefined
    : undefined;
  return {
    environmentId,
    channelId: environmentPreference?.channel_id ?? null,
    categoryId: environmentPreference?.category_id ?? null,
    layout: row.layout === "list" ? "list" : "grid",
    density: Math.min(6, Math.max(2, row.density)),
    sidebarWidth: Math.min(420, Math.max(220, row.sidebar_width)),
    drawerWidth: Math.min(900, Math.max(380, row.drawer_width)),
  };
}

export function updatePreferences(input: Partial<AppPreferences>) {
  const current = getPreferences();
  const next = { ...current, ...input };
  const db = getDatabase();
  db.prepare("UPDATE app_preferences SET environment_id = ?, layout = ?, density = ?, sidebar_width = ?, drawer_width = ? WHERE id = 1")
    .run(next.environmentId, next.layout, next.density, next.sidebarWidth, next.drawerWidth);
  if (next.environmentId && (Object.hasOwn(input, "channelId") || Object.hasOwn(input, "categoryId"))) {
    const stored = db.prepare("SELECT channel_id, category_id FROM environment_preferences WHERE environment_id = ?").get(next.environmentId) as { channel_id: number | null; category_id: number | null } | undefined;
    const channelId = Object.hasOwn(input, "channelId") ? input.channelId ?? null : stored?.channel_id ?? null;
    const categoryId = Object.hasOwn(input, "categoryId") ? input.categoryId ?? null : stored?.category_id ?? null;
    db.prepare("INSERT INTO environment_preferences (environment_id, channel_id, category_id) VALUES (?, ?, ?) ON CONFLICT(environment_id) DO UPDATE SET channel_id = excluded.channel_id, category_id = excluded.category_id")
      .run(next.environmentId, channelId, categoryId);
    next.channelId = channelId;
    next.categoryId = categoryId;
  }
  return next;
}
