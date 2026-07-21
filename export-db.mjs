import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, "data", "api_keys.db");
const OUTPUT = path.join(__dirname, "db.json");

const db = new DatabaseSync(DB_PATH);

const keys = db.prepare(`
    SELECT *
    FROM api_keys
`).all();

fs.writeFileSync(
    OUTPUT,
    JSON.stringify(keys, null, 4)
);

console.log(`Exported ${keys.length} API keys to db.json`);