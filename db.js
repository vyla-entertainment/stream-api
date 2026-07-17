import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'api_keys.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

export async function ensureApiKeysTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'standard',
            rpm INTEGER NOT NULL DEFAULT 100,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

export async function fetchDisabledApiKeys() {
    return db.prepare(`
        SELECT key
        FROM api_keys
        WHERE active = 0
    `).all();
}

export async function fetchActiveApiKeys() {
    return db.prepare(`
        SELECT key, type, rpm
        FROM api_keys
        WHERE active = 1
    `).all();
}

export async function ensurePublicKey() {
    const existing = db.prepare(`
        SELECT key FROM api_keys WHERE key = 'public_api_key'
    `).get();

    if (!existing) {
        db.prepare(`
            INSERT INTO api_keys (key, type, rpm, active)
            VALUES ('public_api_key', 'public', 10, 1)
        `).run();
    }
}

export default db;