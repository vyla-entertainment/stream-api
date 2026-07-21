import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, "data", "api_keys.db");
const INPUT = path.join(__dirname, "db.json");

const db = new DatabaseSync(DB_PATH);

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

db.exec('BEGIN TRANSACTION');
try {
    const existing = db.prepare(`
        SELECT key FROM api_keys
    `).all().map(x => x.key);

    const incoming = data.map(x => x.key);

    for (const key of existing) {
        if (!incoming.includes(key)) {
            db.prepare(`
                DELETE FROM api_keys
                WHERE key = ?
            `).run(key);

            console.log(`Deleted ${key}`);
        }
    }

    const upsert = db.prepare(`
        INSERT INTO api_keys (
            key,
            type,
            rpm,
            active,
            created_at
        )
        VALUES (
            ?,
            ?,
            ?,
            ?,
            ?
        )
        ON CONFLICT(key) DO UPDATE SET
            type = excluded.type,
            rpm = excluded.rpm,
            active = excluded.active
    `);

    for (const row of data) {
        upsert.run(
            row.key,
            row.type ?? "standard",
            row.rpm ?? 100,
            row.active ?? 1,
            row.created_at ?? new Date().toISOString()
        );

        console.log(`Updated ${row.key}`);
    }
    db.exec('COMMIT');
} catch (err) {
    db.exec('ROLLBACK');
    throw err;
}

console.log("Database synced from db.json");