'use strict';

const { webcrypto } = require('crypto');
const crypto = webcrypto;

const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
const BASE_URL = 'https://vidrock.net/';
const SUB_BASE_URL = 'https://sub.vdrk.site';
const PROXY_PREFIX = 'https://proxy.vidrock.store/';

let lastDebugInfo = null;

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
    const debugInfo = { url, timestamp: Date.now() };
    try {
        console.log(`[VIDROCK] Fetching page: ${url}`);
        const response = await fetch(url, { headers: { ...HEADERS, Referer: BASE_URL }, referrer: BASE_URL });
        debugInfo.status = response.status;
        debugInfo.contentType = response.headers.get('content-type');

        if (response.status !== 200) {
            debugInfo.error = `HTTP ${response.status}`;
            lastDebugInfo = debugInfo;
            console.error(`[VIDROCK] Failed to fetch page: ${url} - HTTP ${response.status}`);
            return null;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            debugInfo.responseType = 'json';
            debugInfo.responseSize = JSON.stringify(data).length;
            lastDebugInfo = debugInfo;
            console.log(`[VIDROCK] Successfully fetched JSON from: ${url}`);
            return data;
        }

        const text = await response.text();
        debugInfo.responseType = 'text';
        debugInfo.responseSize = text.length;
        debugInfo.preview = text.substring(0, 200);
        lastDebugInfo = debugInfo;
        console.log(`[VIDROCK] Successfully fetched text from: ${url}`);
        return text;
    } catch (err) {
        debugInfo.error = err.message;
        debugInfo.stack = err.stack;
        lastDebugInfo = debugInfo;
        console.error(`[VIDROCK] Exception fetching page ${url}:`, err);
        return null;
    }
}

async function fetchSubtitles(tmdbId, type, s, e) {
    try {
        const subUrl = type === 'tv'
            ? `${SUB_BASE_URL}/v2/tv/${tmdbId}/${s}/${e}`
            : `${SUB_BASE_URL}/v2/movie/${tmdbId}`;
        const response = await fetch(subUrl, { headers: { ...HEADERS, Referer: BASE_URL } });
        if (response.status !== 200) return [];
        const subsData = await response.json();
        return subsData.map(sub => ({ label: sub.label, url: sub.file, format: 'vtt' }));
    } catch {
        return [];
    }
}

async function getStream(id, s, e) {
    const debugInfo = { id, s, e, timestamp: Date.now() };

    try {
        console.log(`[VIDROCK] Getting stream for ID: ${id}, S: ${s}, E: ${e}`);

        const type = s ? 'tv' : 'movie';
        const itemId = s ? `${id}_${s}_${e || 1}` : `${id}`;
        debugInfo.type = type;
        debugInfo.itemId = itemId;

        const encrypted = await encryptItemId(itemId);
        debugInfo.encrypted = encrypted;

        const pageUrl = `${BASE_URL}api/${type}/${encrypted}`;
        debugInfo.pageUrl = pageUrl;

        const data = await fetchPage(pageUrl);
        debugInfo.fetchResult = !!data;

        if (!data || typeof data !== 'object') {
            debugInfo.error = `Invalid response data: ${typeof data}`;
            lastDebugInfo = debugInfo;
            console.error(`[VIDROCK] Invalid response data from: ${pageUrl}`);
            return null;
        }

        const candidates = Object.values(data).filter(s => s && s.url);
        debugInfo.candidatesFound = candidates.length;
        debugInfo.candidates = candidates.map(c => ({ url: c.url, hasUrl: !!c.url }));

        if (candidates.length === 0) {
            debugInfo.error = 'No valid candidates found in response';
            lastDebugInfo = debugInfo;
            console.error(`[VIDROCK] No valid candidates found in response from: ${pageUrl}`);
            return null;
        }

        for (let i = 0; i < candidates.length; i++) {
            const stream = candidates[i];
            debugInfo.currentAttempt = i;
            debugInfo.currentStream = stream.url;

            console.log(`[VIDROCK] Testing candidate ${i + 1}/${candidates.length}: ${stream.url}`);

            const resolved = await resolveUrl(stream.url);
            debugInfo.resolved = resolved;

            if (!resolved) {
                debugInfo.resolutionFailed = true;
                console.log(`[VIDROCK] Failed to resolve URL: ${stream.url}`);
                continue;
            }

            const ok = await testUrl(resolved);
            debugInfo.testResult = ok;

            if (ok) {
                debugInfo.success = true;
                debugInfo.finalUrl = resolved;
                lastDebugInfo = debugInfo;
                console.log(`[VIDROCK] Successfully found working stream: ${resolved}`);
                return resolved;
            } else {
                debugInfo.testFailed = true;
                console.log(`[VIDROCK] URL test failed: ${resolved}`);
            }
        }

        debugInfo.error = 'All candidates failed verification';
        lastDebugInfo = debugInfo;
        console.error(`[VIDROCK] All ${candidates.length} candidates failed verification`);
        return null;
    } catch (err) {
        debugInfo.error = err.message;
        debugInfo.stack = err.stack;
        lastDebugInfo = debugInfo;
        console.error(`[VIDROCK] Exception in getStream:`, err);
        return null;
    }
}

async function resolveUrl(url) {
    const debugInfo = { originalUrl: url, timestamp: Date.now() };

    if (!url.includes('hls2.vdrk.site')) {
        debugInfo.direct = true;
        console.log(`[VIDROCK] URL does not need resolution: ${url}`);
        return url;
    }

    try {
        console.log(`[VIDROCK] Resolving URL: ${url}`);
        const secondData = await fetchPage(url);
        debugInfo.secondFetchResult = !!secondData;

        if (!secondData || !Array.isArray(secondData)) {
            debugInfo.error = `Invalid second response: ${typeof secondData}`;
            lastDebugInfo = { ...lastDebugInfo, resolveDebug: debugInfo };
            console.error(`[VIDROCK] Invalid second response from: ${url}`);
            return null;
        }

        debugInfo.arrayLength = secondData.length;
        debugInfo.items = secondData.map(obj => ({ hasUrl: !!obj.url, url: obj.url, startsWithProxy: obj.url?.startsWith(PROXY_PREFIX) }));

        for (let i = 0; i < secondData.length; i++) {
            const obj = secondData[i];
            debugInfo.currentItem = i;

            if (!obj.url) {
                debugInfo.noUrl = true;
                continue;
            }

            if (obj.url.startsWith(PROXY_PREFIX)) {
                const encodedPath = obj.url.slice(PROXY_PREFIX.length);
                const decoded = decodeURIComponent(encodedPath.replace(/^\//, ''));
                debugInfo.proxyDecoded = decoded;
                debugInfo.success = true;
                lastDebugInfo = { ...lastDebugInfo, resolveDebug: debugInfo };
                console.log(`[VIDROCK] Successfully resolved proxy URL: ${decoded}`);
                return decoded;
            }

            debugInfo.directUrl = obj.url;
            debugInfo.success = true;
            lastDebugInfo = { ...lastDebugInfo, resolveDebug: debugInfo };
            console.log(`[VIDROCK] Successfully resolved direct URL: ${obj.url}`);
            return obj.url;
        }

        debugInfo.error = 'No valid URLs found in array';
        lastDebugInfo = { ...lastDebugInfo, resolveDebug: debugInfo };
        console.error(`[VIDROCK] No valid URLs found in response from: ${url}`);
        return null;
    } catch (err) {
        debugInfo.error = err.message;
        debugInfo.stack = err.stack;
        lastDebugInfo = { ...lastDebugInfo, resolveDebug: debugInfo };
        console.error(`[VIDROCK] Exception resolving URL ${url}:`, err);
        return null;
    }
}

async function testUrl(url) {
    const debugInfo = { url, timestamp: Date.now() };

    try {
        console.log(`[VIDROCK] Testing URL: ${url}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
            method: 'HEAD',
            headers: { ...HEADERS, 'Referer': 'https://lok-lok.cc/', 'Origin': 'https://lok-lok.cc/' },
            signal: controller.signal
        });

        clearTimeout(timeout);
        debugInfo.status = res.status;
        debugInfo.ok = res.ok;
        debugInfo.success = res.ok;

        console.log(`[VIDROCK] URL test result: ${res.ok} (status: ${res.status})`);
        return res.ok;
    } catch (err) {
        debugInfo.error = err.message;
        debugInfo.stack = err.stack;
        debugInfo.success = false;
        console.error(`[VIDROCK] URL test failed for ${url}:`, err);
        return false;
    }
}

async function getSubtitles(id, s, e) {
    const type = s ? 'tv' : 'movie';
    return fetchSubtitles(id, type, s, e);
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

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    const upstream = await fetchUpstream(url, 0, PROXY_HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewriteM3u8(body, url, '&vr=1'));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...PROXY_HEADERS };

function getLastDebugInfo() {
    return lastDebugInfo;
}

export { getStream, getSubtitles, proxyStream, VERIFY_HEADERS, HEADERS, BASE_URL, getLastDebugInfo };