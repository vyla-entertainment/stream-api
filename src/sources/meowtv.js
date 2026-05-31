'use strict';

const API_BASE = 'https://api.meowtv.ru';
const REFERER = 'https://meowtv.ru';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

export const SKIP_VERIFY = true;
export const VERIFY_HEADERS = { 'User-Agent': UA, 'Referer': REFERER, 'Origin': REFERER };

const HEADERS = { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER, 'Origin': REFERER };
const OUT_HEADERS = { 'User-Agent': UA, 'Referer': REFERER, 'Origin': REFERER };
const SECRET = '9b7e3d1a4f6c2e8d0a5f1c7b3e9d4a6f';

async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solveAltcha(challenge, salt, algorithm, maxNumber) {
    for (let i = 0; i <= (maxNumber || 1000000); i++) {
        if (i % 10000 === 0) await new Promise(r => setTimeout(r, 0));
        const hash = await sha256hex(salt + i);
        if (hash === challenge) return i;
    }
    return null;
}

async function decrypt(payload) {
    const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SECRET + payload.n)));
    const raw = atob(payload.d);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ key[i % key.length];
    return JSON.parse(new TextDecoder().decode(bytes));
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000),
        ...opts,
    });
    if (!res.ok) return null;
    return res.json();
}

async function getTicket() {
    const challenge = await apiFetch('/altcha/challenge', { method: 'GET' });
    if (!challenge) return null;

    const number = await solveAltcha(
        challenge.challenge,
        challenge.salt,
        challenge.algorithm,
        challenge.maxnumber
    );
    if (number === null) return null;

    const altcha = btoa(JSON.stringify({
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number,
        salt: challenge.salt,
        signature: challenge.signature,
    }));

    const data = await apiFetch('/streams/ticket', {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ altcha }),
    });
    return data?.ticket ?? null;
}

async function fetchStream(path, ticket) {
    const payload = await apiFetch(path, {
        headers: { ...HEADERS, 'x-stream-ticket': ticket },
    });
    if (!payload?.n || !payload?.d) return null;
    return decrypt(payload);
}

export async function getStream(id, s, e) {
    const ticket = await getTicket();
    if (!ticket) return null;

    const isTV = !!s;
    const servers = ['tik', 'nou', 'lux'];
    const allUrls = [];

    for (const server of servers) {
        try {
            const path = isTV
                ? `/streams/tv/${id}/${s}/${e}?s=${encodeURIComponent(server)}`
                : `/streams/movie/${id}?s=${encodeURIComponent(server)}`;

            const data = await fetchStream(path, ticket);
            if (!data) continue;

            if (typeof data?.url === 'string' && data.url.startsWith('http')) {
                allUrls.push({ url: data.url, headers: { ...OUT_HEADERS, ...(data.headers || {}) } });
            } else if (Array.isArray(data?.streams)) {
                for (const lang of ['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam']) {
                    const stream = data.streams.find(x => (x.language || '').toLowerCase() === lang.toLowerCase());
                    if (stream?.url?.startsWith('http')) {
                        allUrls.push({ url: stream.url, headers: { ...OUT_HEADERS, ...(stream.headers || {}) } });
                    }
                }
            }
        } catch { }
    }

    if (!allUrls.length) return null;
    return { ...allUrls[0], allUrls };
}