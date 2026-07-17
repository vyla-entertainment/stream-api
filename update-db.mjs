import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, "data", "api_keys.db");
const INPUT = path.join(__dirname, "db.json");

const db = new Database(DB_PATH);

const data = JSON.parse(
    fs.readFileSync(INPUT, "utf8")
);

db.transaction(() => {

    const existing = db.prepare(`
        SELECT key FROM api_keys
    `).all().map(x => x.key);

    const incoming = data.map(x => x.key);

    // Remove keys deleted from db.json
    for (const key of existing) {
        if (!incoming.includes(key)) {
            db.prepare(`
                DELETE FROM api_keys
                WHERE key = ?
            `).run(key);

            console.log(`Deleted ${key}`);
        }
    }

    // Insert/update keys
    const upsert = db.prepare(`
        INSERT INTO api_keys (
            key,
            type,
            rpm,
            active,
            created_at
        )
        VALUES (
            @key,
            @type,
            @rpm,
            @active,
            @created_at
        )
        ON CONFLICT(key) DO UPDATE SET
            type = excluded.type,
            rpm = excluded.rpm,
            active = excluded.active
    `);

    for (const row of data) {
        upsert.run({
            key: row.key,
            type: row.type ?? "standard",
            rpm: row.rpm ?? 100,
            active: row.active ?? 1,
            created_at: row.created_at ?? new Date().toISOString()
        });

        console.log(`Updated ${row.key}`);
    }

})();

console.log("Database synced from db.json");