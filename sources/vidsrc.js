'use strict';

const BASE_URL = 'https://vsembed.ru';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Referer': BASE_URL + '/',
};

const PLAYER_DOMAINS = {
    '{v1}': 'neonhorizonworkshops.com',
    '{v2}': 'wanderlynest.com',
    '{v3}': 'orchidpixelgardens.com',
    '{v4}': 'cloudnestra.com',
};

const PROXY_HEADERS = {
    'Referer': 'https://cloudnestra.com/',
    'Origin': 'https://cloudnestra.com',
    'User-Agent': HEADERS['User-Agent'],
};

const STEP_TIMEOUT_MS = 7000;

function makeAbort(ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, clear: () => clearTimeout(t) };
}

async function fetchHtml(url, extraHeaders = {}, outerSignal = null) {
    if (url.startsWith('//')) url = 'https:' + url;
    const { signal, clear } = makeAbort(STEP_TIMEOUT_MS);
    const combined = outerSignal ? AbortSignal.any([outerSignal, signal]) : signal;
    try {
        const res = await fetch(url, {
            headers: { ...HEADERS, ...extraHeaders },
            signal: combined,
            redirect: 'follow',
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return await res.text();
    } finally {
        clear();
    }
}

function extractIframeSrc(html) {
    return html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
}

function extractProrcp(html) {
    return html.match(/src:\s*['"]([^'"]*\/prorcp\/[^'"]+)['"]/i)?.[1] ?? null;
}

function rcpToProrcp(rcpUrl) {
    return rcpUrl.replace('/rcp/', '/prorcp/');
}

function extractM3u8Urls(html) {
    const fileField = html.match(/file\s*:\s*["']([^"']+)["']/i)?.[1];
    if (!fileField) return null;
    const urls = fileField.split(/\s+or\s+/i).map(template => {
        let url = template;
        for (const [placeholder, domain] of Object.entries(PLAYER_DOMAINS)) {
            url = url.replace(placeholder, domain);
        }
        return (url.includes('{') || url.includes('}')) ? null : url;
    }).filter(Boolean);
    return urls.length ? urls : null;
}

async function getStream(id, s, e) {
    const controller = new AbortController();
    const { signal } = controller;

    try {
        const pageUrl = s
            ? `${BASE_URL}/embed/tv?tmdb=${id}&season=${s}&episode=${e}`
            : `${BASE_URL}/embed/movie?tmdb=${id}`;

        let html1;
        try {
            html1 = await fetchHtml(pageUrl, {}, signal);
        } catch (err) {
            throw new Error(`vidsrc step1 (${pageUrl}): ${err.message}`);
        }

        let rcpUrl = extractIframeSrc(html1);
        if (!rcpUrl) throw new Error('vidsrc step1: no iframe src found');
        if (rcpUrl.startsWith('//')) rcpUrl = 'https:' + rcpUrl;

        let html2;
        try {
            html2 = await fetchHtml(rcpUrl, { 'Referer': BASE_URL + '/' }, signal);
        } catch (err) {
            throw new Error(`vidsrc step2 (${rcpUrl}): ${err.message}`);
        }

        let prorcp = extractProrcp(html2);

        let playerUrl;
        if (prorcp) {
            const base = rcpUrl.slice(0, rcpUrl.indexOf('/', rcpUrl.indexOf('//') + 2));
            playerUrl = prorcp.startsWith('http') ? prorcp : base + prorcp;
        } else {
            playerUrl = rcpToProrcp(rcpUrl);
        }

        let html3;
        try {
            html3 = await fetchHtml(playerUrl, { 'Referer': rcpUrl }, signal);
        } catch (err) {
            throw new Error(`vidsrc step3 (${playerUrl}): ${err.message}`);
        }

        const urls = extractM3u8Urls(html3);
        if (!urls?.length) throw new Error(`vidsrc step3: no m3u8 url found in player JS`);

        return urls[0];
    } finally {
        controller.abort();
    }
}

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    const upstream = await fetchUpstream(url, 0, PROXY_HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.end(rewriteM3u8(body, url, '&vs=1'));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...PROXY_HEADERS };

export { getStream, proxyStream, VERIFY_HEADERS };
export { PROXY_HEADERS as HEADERS };