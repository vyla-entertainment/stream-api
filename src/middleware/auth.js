import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const BYPASS_LOCALHOST = false;

const API_KEYS = new Map();
const rateLimitMap = new Map();

function loadKeysFromEnv() {
    API_KEYS.clear();

    const entries = process.env.API_KEYS?.split(',') ?? [];

    for (const entry of entries) {
        const [key, type = 'standard', rpm = '100'] = entry
            .trim()
            .split(':')
            .map(v => v.trim());

        if (!key) continue;

        API_KEYS.set(key, {
            type,
            rpm: Number(rpm) || 100
        });
    }
}

loadKeysFromEnv();

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function issueSessionToken(type = 'player') {
    const expires = Date.now() + TOKEN_TTL_MS;
    const payload = `${expires}.${type}`;
    const sig = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(payload)
        .digest('hex');

    return `${expires}.${type}.${sig}`;
}

export function validateSessionToken(token) {
    if (!token) return false;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        const [expires, type, sig] = parts;

        if (Date.now() > Number(expires)) return false;

        const payload = `${expires}.${type}`;
        const expected = crypto
            .createHmac('sha256', TOKEN_SECRET)
            .update(payload)
            .digest('hex');

        if (sig.length !== expected.length) return false;

        return crypto.timingSafeEqual(
            Buffer.from(sig, 'hex'),
            Buffer.from(expected, 'hex')
        )
            ? type
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

    const sessionToken = req.headers['x-session-token']?.trim();

    if (sessionToken) {
        const tokenType = validateSessionToken(sessionToken);

        if (tokenType) {
            return {
                valid: true,
                error: null,
                type: tokenType,
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
            error: 'Missing API key. Provide via Authorization or X-API-Key.'
        };
    }

    const entry = API_KEYS.get(cleanKey);

    if (!entry) {
        return {
            valid: false,
            error: 'Invalid API key'
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
        return !isStreamProxy(req, pathname);
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
            error: 'Invalid API key'
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
            error: 'Rate limit exceeded',
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