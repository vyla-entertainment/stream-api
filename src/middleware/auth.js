import dotenv from 'dotenv';
import crypto from 'crypto';

import { ensureApiKeysTable, fetchActiveApiKeys, fetchDisabledApiKeys, ensurePublicKey } from '../../db.js';

dotenv.config();

const BYPASS_AUTH = true;

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

let authInitialized = false;

export async function initAuth() {
    if (authInitialized) return;
    authInitialized = true;

    await ensureApiKeysTable();
    await ensurePublicKey();
    await loadKeysFromDB();

    setInterval(() => {
        loadKeysFromDB().catch(console.error);
    }, KEY_REFRESH_INTERVAL_MS);
}

const TOKEN_SECRET = process.env.TOKEN_SECRET;
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
    throw new Error('TOKEN_SECRET must be set and at least 32 characters');
}

const TOKEN_TTL_MS = 30 * 60 * 1000;
const REFRESH_GRACE_MS = 10 * 60 * 1000;
const TOKEN_VERSION = 'v1';

function signPayload(payload) {
    return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
}

function buildToken(expires, type, sourceKey, issuedAt) {
    const payload = `${TOKEN_VERSION}.${expires}.${type}.${sourceKey}.${issuedAt}`;
    const sig = signPayload(payload);
    return `${TOKEN_VERSION}.${expires}.${type}.${sourceKey}.${issuedAt}.${sig}`;
}

export function issueSessionToken(type = 'player', sourceKey = '') {
    const now = Date.now();
    const expires = now + TOKEN_TTL_MS;
    return buildToken(expires, type, sourceKey, now);
}

export function validateSessionToken(token) {
    if (!token || typeof token !== 'string' || token.length > 512) return false;

    try {
        const parts = token.split('.');
        if (parts.length !== 6) return false;

        const [version, expires, type, sourceKey, issuedAt, sig] = parts;

        if (version !== TOKEN_VERSION) return false;
        if (!/^\d+$/.test(expires) || !/^\d+$/.test(issuedAt)) return false;

        const expiresNum = Number(expires);
        const issuedAtNum = Number(issuedAt);

        if (issuedAtNum > Date.now()) return false;
        if (expiresNum - issuedAtNum !== TOKEN_TTL_MS) return false;

        const payload = `${version}.${expires}.${type}.${sourceKey}.${issuedAt}`;
        const expected = signPayload(payload);

        const sigBuf = Buffer.from(sig, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expectedBuf.length) return false;
        if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

        if (Date.now() > expiresNum) return false;

        return { type, sourceKey, expires: expiresNum, issuedAt: issuedAtNum };
    } catch {
        return false;
    }
}

export function refreshSessionToken(token) {
    if (!token || typeof token !== 'string' || token.length > 512) return null;

    try {
        const parts = token.split('.');
        if (parts.length !== 6) return null;

        const [version, expires, type, sourceKey, issuedAt, sig] = parts;

        if (version !== TOKEN_VERSION) return null;
        if (!/^\d+$/.test(expires) || !/^\d+$/.test(issuedAt)) return null;

        const expiresNum = Number(expires);
        const issuedAtNum = Number(issuedAt);

        if (issuedAtNum > Date.now()) return null;
        if (expiresNum - issuedAtNum !== TOKEN_TTL_MS) return null;

        const payload = `${version}.${expires}.${type}.${sourceKey}.${issuedAt}`;
        const expected = signPayload(payload);

        const sigBuf = Buffer.from(sig, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expectedBuf.length) return null;
        if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

        if (Date.now() > expiresNum + REFRESH_GRACE_MS) return null;

        if (type !== 'player') {
            const entry = API_KEYS.get(sourceKey);
            if (!entry || entry.type !== type || DISABLED_KEYS.has(sourceKey)) return null;
        }

        return issueSessionToken(type, sourceKey);
    } catch {
        return null;
    }
}

function parseKey(apiKey) {
    if (!apiKey) return null;
    return apiKey.includes(':') ? apiKey.split(':').pop().trim() : apiKey;
}

function isLocalRequest(req) {
    const ip = req.socket.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function authenticateRequest(req) {
    if (BYPASS_AUTH && isLocalRequest(req)) {
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
            error: 'Missing API key. Provide via Authorization or X-API-Key. You can get one at https://docs.vyla.cc/authentication'
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
}, 60_000).unref();