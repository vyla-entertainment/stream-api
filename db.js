import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('Unexpected pool error', err);
});

export async function ensureApiKeysTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS public.api_keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'standard',
            rpm INTEGER NOT NULL DEFAULT 100,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
}

export async function fetchDisabledApiKeys() {
    const result = await pool.query(`
        SELECT key
        FROM api_keys
        WHERE active = false
    `);

    return result.rows;
}

export async function fetchActiveApiKeys() {
    const result = await pool.query(`
        SELECT key, type, rpm
        FROM api_keys
        WHERE active = true
    `);

    return result.rows;
}

export async function ensurePublicKey() {
    const existing = await pool.query(`
        SELECT key FROM public.api_keys WHERE key = 'public_api_key'
    `);

    if (existing.rows.length === 0) {
        await pool.query(`
            INSERT INTO public.api_keys (key, type, rpm, active)
            VALUES ('public_api_key', 'public', 10, true)
        `);
    }
}

export default pool;