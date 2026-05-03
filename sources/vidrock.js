'use strict';

const { webcrypto } = require('crypto');
const crypto = webcrypto;

const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
const BASE_URL = 'https://vidrock.net/';
const SUB_BASE_URL = 'https://sub.vdrk.site';
const PROXY_PREFIX = 'https://proxy.vidrock.store/';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL,
    'Origin': BASE_URL,
};

async function encryptItemId(itemId) {
    const textEncoder = new TextEncoder();
    const keyData = textEncoder.encode(PASSPHRASE);
    const iv = textEncoder.encode(PASSPHRASE.substring(0, 16));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-CBC' }, false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, textEncoder.encode(itemId));
    const base64 = Buffer.from(new Uint8Array(encrypted)).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function fetchPage(url) {
    try {
        const response = await fetch(url, { headers: { ...HEADERS, Referer: BASE_URL }, referrer: BASE_URL });
        if (response.status !== 200) return null;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) return await response.json();
        return await response.text();
    } catch {
        return null;
    }
}

async function resolveUrl(url) {
    if (!url.includes('hls2.vdrk.site')) return url;
    try {
        const data = await fetchPage(url);
        if (!data || !Array.isArray(data)) return null;
        for (const obj of data) {
            if (!obj.url) continue;
            if (obj.url.startsWith(PROXY_PREFIX)) {
                const encodedPath = obj.url.slice(PROXY_PREFIX.length);
                return decodeURIComponent(encodedPath.replace(/^\//, ''));
            }
            return obj.url;
        }
        return null;
    } catch {
        return null;
    }
}

async function getStream(id, s, e) {
    console.log('[vidrock] getStream called', id, s, e);
    try {
        const type = s ? 'tv' : 'movie';
        const itemId = s ? `${id}_${s}_${e || 1}` : `${id}`;
        const encrypted = await encryptItemId(itemId);
        const pageUrl = `${BASE_URL}api/${type}/${encrypted}`;
        const data = await fetchPage(pageUrl);
        if (!data || typeof data !== 'object') return null;

        for (const stream of Object.values(data)) {
            if (!stream?.url) continue;
            const resolved = await resolveUrl(stream.url);
            if (!resolved) continue;
            if (await isBlocked(resolved)) continue;
            return resolved;
        }

        return null;
    } catch {
        return null;
    }
}

async function isBlocked(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, {
            headers: HEADERS,
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) return true;
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('text/html')) return true;
        const text = await res.text();
        if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('blocked')) return true;
        return false;
    } catch {
        return true;
    }
}

async function getSubtitles(id, s, e) {
    try {
        const type = s ? 'tv' : 'movie';
        const subUrl = type === 'tv'
            ? `${SUB_BASE_URL}/v2/tv/${id}/${s}/${e}`
            : `${SUB_BASE_URL}/v2/movie/${id}`;
        const response = await fetch(subUrl, { headers: { ...HEADERS, Referer: BASE_URL } });
        if (response.status !== 200) return [];
        const subsData = await response.json();
        return subsData.map(sub => ({ label: sub.label, url: sub.file, format: 'vtt' }));
    } catch {
        return [];
    }
}

const PROXY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6884.98 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://lok-lok.cc',
    'Referer': 'https://lok-lok.cc/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'sec-ch-ua': '"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

function absolutizeM3u8(body, baseUrl) {
    const base = new URL(baseUrl);
    const baseDir = base.origin + base.pathname.replace(/\/[^/]*$/, '/');

    return body.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        if (/^https?:\/\//i.test(trimmed)) return line;
        if (trimmed.startsWith('/')) return base.origin + trimmed;
        return baseDir + trimmed;
    }).join('\n');
}

function isSegmentUrl(url) {
    try {
        const u = new URL(url);
        return /\.(ts|aac|mp4|m4s|vtt|webvtt)(\?|$)/i.test(u.pathname) ||
            (!u.pathname.endsWith('.m3u8') && !u.pathname.endsWith('.m3u') && u.hostname !== 'storrrrrrm.site');
    } catch {
        return false;
    }
}

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    if (isSegmentUrl(url)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Location', url);
        res.statusCode = 302;
        return res.end();
    }

    const upstream = await fetchUpstream(url, 0, PROXY_HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const raw = Buffer.concat(chunks).toString('utf8');
        const absolutized = absolutizeM3u8(raw, url);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewriteM3u8(absolutized, url, '&vr=1'));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...PROXY_HEADERS };

export { getStream, getSubtitles, proxyStream, VERIFY_HEADERS, HEADERS, BASE_URL };