import { createHash, createDecipheriv } from 'crypto';

const BASE = 'https://sf.streammafia.to';

function deriveKey(secret) {
    return createHash('sha256').update(secret).digest();
}

function decrypt(payload) {
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    const key = deriveKey('Z9#rL!v2K*5qP&7mXw');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function getStream(id, season, episode) {
    const debug = [];

    const baseHeaders = {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': BASE + '/',
        'Origin': BASE,
        'x-content-id': String(id),
    };

    let sessionRes;
    try {
        sessionRes = await fetch(`${BASE}/api/session`, {
            method: 'POST',
            headers: baseHeaders,
            body: null,
        });
        debug.push({ step: 'session', status: sessionRes.status, ok: sessionRes.ok });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'session', error: err.message, debug }));
    }

    if (!sessionRes.ok) {
        throw new Error(JSON.stringify({ step: 'session', status: sessionRes.status, debug }));
    }

    const setCookie = sessionRes.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0] || '';
    debug.push({ step: 'cookie', cookie });

    const headers = { ...baseHeaders, Cookie: cookie };

    await new Promise(r => setTimeout(r, 100));

    let tokenRes;
    try {
        tokenRes = await fetch(`${BASE}/api/token`, { headers });
        debug.push({ step: 'token_fetch', status: tokenRes.status, ok: tokenRes.ok });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'token_fetch', error: err.message, debug }));
    }

    if (!tokenRes.ok) {
        throw new Error(JSON.stringify({ step: 'token_fetch', status: tokenRes.status, debug }));
    }

    let tokenJson;
    try {
        tokenJson = await tokenRes.json();
        debug.push({ step: 'token_parse', token: tokenJson?.token });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'token_parse', error: err.message, debug }));
    }

    const token = tokenJson?.token;
    if (!token) {
        throw new Error(JSON.stringify({ step: 'token_missing', tokenJson, debug }));
    }

    headers['x-api-token'] = token;

    const pageUrl = (!season && !episode)
        ? `${BASE}/api/movie/?id=${id}`
        : `${BASE}/api/?tv=${id}&season=${season}&episode=${episode}`;

    debug.push({ step: 'page_url', url: pageUrl });

    let pageRes;
    try {
        pageRes = await fetch(pageUrl, { headers });
        debug.push({ step: 'page_fetch', status: pageRes.status, ok: pageRes.ok });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'page_fetch', error: err.message, debug }));
    }

    if (!pageRes.ok) {
        const body = await pageRes.text().catch(() => '');
        throw new Error(JSON.stringify({ step: 'page_fetch', status: pageRes.status, body, debug }));
    }

    let encrypted;
    try {
        encrypted = await pageRes.json();
        debug.push({ step: 'page_json', keys: Object.keys(encrypted) });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'page_json', error: err.message, debug }));
    }

    let api;
    try {
        api = decrypt(encrypted);
        debug.push({ step: 'decrypt', status: api?.status, hasStream: !!api?.stream, hlsUrl: api?.stream?.hls_streaming });
    } catch (err) {
        throw new Error(JSON.stringify({ step: 'decrypt', error: err.message, encrypted, debug }));
    }

    const url = api?.stream?.hls_streaming || api?.stream?.download?.[0]?.url;
    debug.push({ step: 'result', url });

    if (!url) {
        throw new Error(JSON.stringify({ step: 'no_url', api, debug }));
    }

    return { url, headers: { Referer: BASE + '/', Origin: BASE } };
}

export const VERIFY_HEADERS = {
    Referer: BASE + '/',
    Origin: BASE,
};