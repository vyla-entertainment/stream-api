'use strict';

import { webcrypto } from 'crypto';
const crypto = webcrypto;

const PLAYER_URL = 'https://player.vidzee.wtf';
const CORE_URL = 'https://core.vidzee.wtf';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36';

function makeHeaders(clientIp) {
    return {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': PLAYER_URL,
        'Origin': PLAYER_URL,
        ...(clientIp && { 'X-Forwarded-For': clientIp, 'X-Real-IP': clientIp }),
    };
}

const hlsHeaders = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': PLAYER_URL,
    'Origin': PLAYER_URL,
};

import CryptoJS from 'crypto-js';

async function deriveKey(e) {
    if (!e) return '';
    const atobPolyfill = (s) => {
        const t = Buffer.from(s.replace(/\s+/g, ''), 'base64');
        const a = new Uint8Array(t.length);
        for (let i = 0; i < t.length; i++) a[i] = t[i];
        return a;
    };
    const t = atobPolyfill(e);
    if (t.length <= 28) return '';
    const r = t.slice(0, 12);
    const a = t.slice(12, 28);
    const l = t.slice(28);
    const s = new Uint8Array(l.length + a.length);
    s.set(l, 0);
    s.set(a, l.length);
    const keyMat = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('c4a8f1d7e2b9a6c3d0f5e8a1b7c4d9e2'));
    const key = await crypto.subtle.importKey('raw', keyMat, { name: 'AES-GCM' }, false, ['decrypt']);
    const c = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r, tagLength: 128 }, key, s);
    return new TextDecoder().decode(c);
}

function decrypt(encryptedData, decryptionKey) {
    if (!encryptedData || !decryptionKey) return '';
    try {
        const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
        const [ivStr, cipherStr] = decoded.split(':');
        if (!ivStr || !cipherStr) return '';
        const iv = CryptoJS.enc.Base64.parse(ivStr);
        const key = CryptoJS.enc.Utf8.parse(decryptionKey.padEnd(32, '\0'));
        const result = CryptoJS.AES.decrypt(cipherStr, key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        return result.toString(CryptoJS.enc.Utf8) || '';
    } catch {
        return '';
    }
}

function fetchWithTimeout(url, headers, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { headers, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

async function getStream(id, s, e) {
    const type = s ? 'tv' : 'movie';
    const season = s || '1';
    const episode = e || '1';
    const headers = makeHeaders(null);

    const apiKeyResponse = await fetchWithTimeout(`${CORE_URL}/api-key`, headers, 5000);
    if (!apiKeyResponse.ok) throw new Error(`VidZee API key failed: ${apiKeyResponse.status}`);
    const apiKeyText = await apiKeyResponse.text();

    const decKey = await deriveKey(apiKeyText);
    if (!decKey) throw new Error('VidZee: failed to derive key');

    for (let sr = 0; sr < 14; sr++) {
        let data;
        try {
            let url = `${PLAYER_URL}/api/server?id=${id}&sr=${sr}`;
            if (type === 'tv') url += `&ss=${season}&ep=${episode}`;
            const res = await fetchWithTimeout(url, headers, 6000);
            if (!res.ok) continue;
            data = await res.json();
        } catch {
            continue;
        }

        if (!data || data.error || !Array.isArray(data.url) || !data.url.length) continue;

        for (const entry of data.url) {
            if (!entry.link) continue;
            try {
                const decrypted = await decrypt(entry.link, decKey);
                if (decrypted && decrypted.startsWith('http')) {
                    const check = await fetchWithTimeout(decrypted, hlsHeaders, 15000);
                    if (check.ok) return { url: decrypted, headers: hlsHeaders };
                }
            } catch {
                continue;
            }
        }
    }

    throw new Error('VidZee: no valid stream found');
}

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    let upstream;
    try {
        upstream = await fetchUpstream(url, 0, hlsHeaders);
    } catch (err) {
        res.statusCode = 502;
        return res.end(JSON.stringify({ error: 'fetchUpstream failed', detail: err.message, url }));
    }
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    if (upstream.statusCode >= 400) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8').slice(0, 500);
        res.statusCode = 502;
        return res.end(JSON.stringify({ error: 'upstream error', status: upstream.statusCode, body, url }));
    }
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        const base = url.split('?')[0];
        const dir = base.slice(0, base.lastIndexOf('/') + 1);
        const origin = new URL(url).origin;
        const rewritten = body.split('\n').map(line => {
            const t = line.trim();
            if (!t) return line;
            if (t.startsWith('#')) {
                return t.replace(/URI="([^"]+)"/g, (_match, uri) => {
                    const abs = uri.startsWith('http') ? uri : uri.startsWith('/') ? origin + uri : dir + uri;
                    return `URI="/api?url=${encodeURIComponent(abs)}&vz=1"`;
                });
            }
            const abs = t.startsWith('http') ? t : t.startsWith('/') ? origin + t : dir + t;
            if (abs.includes('tiktokcdn.com') || abs.includes('p16-sg') || abs.includes('p19-sg')) return `/api?url=${encodeURIComponent(abs)}&tt=1`;
            return `/api?url=${encodeURIComponent(abs)}&vz=1`;
        }).join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewritten);
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...hlsHeaders };

export { getStream, proxyStream, VERIFY_HEADERS, hlsHeaders, PLAYER_URL };
export const SKIP_VERIFY = true;