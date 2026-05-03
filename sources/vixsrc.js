'use strict';

const BASE_URL = 'https://vixsrc.to';

const REFERER = BASE_URL + '/';
const ORIGIN = BASE_URL;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': REFERER,
    'Origin': ORIGIN,
};

const PLAYLIST_HEADERS = {
    'User-Agent': HEADERS['User-Agent'],
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': REFERER,
    'Origin': ORIGIN,
};

function buildApiUrl(id, s, e) {
    if (s && e) return `${BASE_URL}/api/tv/${id}/${s}/${e}`;
    return `${BASE_URL}/api/movie/${id}`;
}

async function fetchApi(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status !== 200) return null;
    return res.json();
}

async function fetchEmbedPage(src) {
    const url = src.startsWith('http') ? src : BASE_URL + src;
    const res = await fetch(url, { headers: HEADERS });
    if (res.status !== 200) return null;
    return res.text();
}

function extractTokenData(html) {
    const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
    const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
    const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];
    const lang = html.match(/lang(?:uage)?["']\s*:\s*["']([a-z]{2,5})/i)?.[1] ?? 'en';

    if (!token || !expires || !playlist) return null;
    if (parseInt(expires, 10) * 1000 - 60_000 < Date.now()) return null;

    return { token, expires, playlist, lang };
}

function buildMasterUrl({ token, expires, playlist, lang }) {
    const sep = playlist.includes('?') ? '&' : '?';
    return `${playlist}${sep}token=${token}&expires=${expires}&h=1&lang=${lang}`;
}

async function fetchPlaylist(masterUrl) {
    const res = await fetch(masterUrl, { headers: PLAYLIST_HEADERS });
    if (res.status !== 200) return null;
    return res.text();
}

async function getStream(id, s, e) {
    try {
        const apiUrl = buildApiUrl(id, s, e);
        const apiData = await fetchApi(apiUrl);
        if (!apiData?.src) return null;

        const html = await fetchEmbedPage(apiData.src);
        if (!html) return null;

        const tokenData = extractTokenData(html);
        if (!tokenData) return null;

        const masterUrl = buildMasterUrl(tokenData);

        const playlist = await fetchPlaylist(masterUrl);
        if (!playlist || !playlist.trim().startsWith('#EXTM3U')) return null;

        return masterUrl;
    } catch {
        return null;
    }
}

async function proxyStream(url, res, { fetchUpstream, rewriteM3u8, reqBase }) {
    const upstream = await fetchUpstream(url, 0, PLAYLIST_HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewriteM3u8(body, url, '&vl=1', reqBase));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}

const VERIFY_HEADERS = { ...PLAYLIST_HEADERS };

export { getStream, proxyStream, VERIFY_HEADERS, REFERER, ORIGIN, HEADERS, PLAYLIST_HEADERS };