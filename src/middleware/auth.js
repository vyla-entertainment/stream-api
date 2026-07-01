import dotenv from 'dotenv';
import crypto from 'crypto';
import { ensureApiKeysTable, fetchActiveApiKeys, fetchDisabledApiKeys, ensurePublicKey } from '../../db.js';

dotenv.config();

const BYPASS_LOCALHOST = true;

const API_KEYS = new Map();
const DISABLED_KEYS = new Set();
const rateLimitMap = new Map();

const KEY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function setKeysFromRows(rows) {
    API_KEYS.clear();

    for (const row of rows) {
        API_KEYS.set(row.key, {
            type: row.type,
            rpm: Number(row.rpm) || 100
        });
    }
}

export async function loadKeysFromDB() {
    try {
        const [activeRows, disabledRows] = await Promise.all([
            fetchActiveApiKeys(),
            fetchDisabledApiKeys()
        ]);

        setKeysFromRows(activeRows);

        DISABLED_KEYS.clear();
        for (const row of disabledRows) {
            DISABLED_KEYS.add(row.key);
        }
    } catch (err) {
        if (API_KEYS.size === 0) {
            throw err;
        }
    }
}

export async function initAuth() {
    await ensureApiKeysTable();
    await ensurePublicKey();
    await loadKeysFromDB();

    setInterval(() => {
        loadKeysFromDB();
    }, KEY_REFRESH_INTERVAL_MS);
}

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function issueSessionToken(type = 'player', sourceKey = '') {
    const expires = Date.now() + TOKEN_TTL_MS;
    const payload = `${expires}.${type}.${sourceKey}`;
    const sig = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(payload)
        .digest('hex');

    return `${expires}.${type}.${sourceKey}.${sig}`;
}

export function validateSessionToken(token) {
    if (!token) return false;

    try {
        const parts = token.split('.');
        if (parts.length !== 4) return false;

        const [expires, type, sourceKey, sig] = parts;

        if (Date.now() > Number(expires)) return false;

        const payload = `${expires}.${type}.${sourceKey}`;
        const expected = crypto
            .createHmac('sha256', TOKEN_SECRET)
            .update(payload)
            .digest('hex');

        if (sig.length !== expected.length) return false;

        return crypto.timingSafeEqual(
            Buffer.from(sig, 'hex'),
            Buffer.from(expected, 'hex')
        )
            ? { type, sourceKey }
            : false;
    } catch {
        return false;
    }
}

function parseKey(apiKey) {
    if (!apiKey) return null;
    return apiKey.includes(':') ? apiKey.split(':').pop().trim() : apiKey;
}

function isLocalRequest(req) {
    const host = (req.headers.host || '').toLowerCase();
    const ip = req.socket.remoteAddress || '';

    return (
        host.startsWith('localhost:') ||
        host === 'localhost' ||
        host.startsWith('127.0.0.1:') ||
        host === '127.0.0.1' ||
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1'
    );
}

export function authenticateRequest(req) {
    if (BYPASS_LOCALHOST && isLocalRequest(req)) {
        return {
            valid: true,
            error: null,
            type: 'standard',
            bypassed: true
        };
    }

    let internalToken = null;
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        internalToken = url.searchParams.get('internal_token');
    } catch { }

    if (internalToken) {
        const decoded = validateSessionToken(internalToken);

        if (decoded && decoded.type === 'internal') {
            return {
                valid: true,
                error: null,
                type: 'standard',
                key: decoded.sourceKey || null,
                bypassed: false,
                internal: true
            };
        }

        return {
            valid: false,
            error: 'Invalid or expired internal token'
        };
    }

    const sessionToken = req.headers['x-session-token']?.trim();

    if (sessionToken) {
        const decoded = validateSessionToken(sessionToken);

        if (decoded) {
            return {
                valid: true,
                error: null,
                type: decoded.type,
                key: decoded.sourceKey || null,
                bypassed: false
            };
        }

        return {
            valid: false,
            error: 'Invalid or expired session token'
        };
    }

    const authHeader = req.headers.authorization;
    const rawKey =
        authHeader?.replace(/^Bearer\s+/i, '').trim() ||
        req.headers['x-api-key']?.trim();

    const cleanKey = parseKey(rawKey);

    if (!cleanKey) {
        return {
            valid: false,
            error: 'Missing API key. Provide via Authorization or X-API-Key. You can get one at https://vyla.mintlify.app/authentication'
        };
    }

    if (DISABLED_KEYS.has(cleanKey)) {
        return {
            valid: false,
            error: 'This API key has been disabled. If you believe this is an error, please contact support at https://vyla.cc/discord for assistance.'
        };
    }

    const entry = API_KEYS.get(cleanKey);

    if (!entry) {
        return {
            valid: false,
            error: 'Invalid API key. If you believe this is an error, please contact support at https://vyla.cc/discord for assistance.'
        };
    }

    return {
        valid: true,
        error: null,
        type: entry.type,
        key: cleanKey
    };
}

function isStreamProxy(req, pathname) {
    if (pathname !== '/api' && pathname !== '/api/') return false;

    const url = new URL(
        req.url,
        `http://${req.headers.host || 'localhost'}`
    );

    return (
        url.searchParams.has('url') ||
        url.searchParams.has('proxy')
    );
}

export function canAccess(type, req, pathname) {
    if (type === 'public') {
        if (pathname === '/movie' || pathname === '/api/movie' ||
            pathname === '/tv' || pathname === '/api/tv') {
            return false;
        }
        if (isStreamProxy(req, pathname)) {
            return false;
        }
        return true;
    }

    return (
        type === 'standard' ||
        type === 'partner' ||
        type === 'player'
    );
}

export function checkRateLimit(apiKey) {
    if (!apiKey) {
        return { allowed: true };
    }

    const cleanKey = parseKey(apiKey);
    const entry = API_KEYS.get(cleanKey);

    if (!entry) {
        return {
            allowed: false,
            error: 'Invalid API key. If you believe this is an error, please contact support at https://vyla.cc/discord for assistance.'
        };
    }

    const rpm = entry.rpm;
    const window = 60_000;
    const now = Date.now();

    let current = rateLimitMap.get(cleanKey);

    if (!current || now > current.resetAt) {
        current = {
            count: 0,
            resetAt: now + window
        };
    }

    if (current.count >= rpm) {
        rateLimitMap.set(cleanKey, current);

        return {
            allowed: false,
            error: 'Rate limit exceeded. If you believe this is an error, please contact support at https://vyla.cc/discord for assistance.',
            resetAt: current.resetAt,
            limit: rpm,
            window
        };
    }

    current.count++;

    rateLimitMap.set(cleanKey, current);

    return {
        allowed: true,
        remaining: rpm - current.count,
        resetAt: current.resetAt
    };
}

export function clearRateLimitCache() {
    rateLimitMap.clear();
}

setInterval(() => {
    const now = Date.now();

    for (const [key, value] of rateLimitMap) {
        if (now > value.resetAt) {
            rateLimitMap.delete(key);
        }
    }
}, 60_000);