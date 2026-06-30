import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

const sql = neon(DATABASE_URL);

export async function ensureApiKeysTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS api_keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'standard',
            rpm INTEGER NOT NULL DEFAULT 100,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
}

export async function fetchActiveApiKeys() {
    const rows = await sql`
        SELECT key, type, rpm
        FROM api_keys
        WHERE active = true
    `;

    return rows;
}

export default sql;