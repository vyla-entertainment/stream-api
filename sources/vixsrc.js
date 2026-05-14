const BASE_URL = 'https://vixsrc.to';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
};

export const VERIFY_HEADERS = { ...HEADERS };
export const SKIP_VERIFY = false;
export const MULTI_URL = false;

function buildApiUrl(id, s, e) {
    if (s && e) return `${BASE_URL}/api/tv/${id}/${s}/${e}`;
    return `${BASE_URL}/api/movie/${id}`;
}

async function fetchApi(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res || res.status !== 200) return null;
        return res.json();
    } catch {
        return null;
    }
}

async function fetchEmbedPage(src) {
    try {
        const url = src.startsWith('http') ? src : BASE_URL + src;
        const res = await fetch(url, { headers: HEADERS });
        if (!res || res.status !== 200) return null;
        return res.text();
    } catch {
        return null;
    }
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
    try {
        const res = await fetch(masterUrl, { headers: HEADERS });
        if (!res || res.status !== 200) return null;
        return res.text();
    } catch {
        return null;
    }
}

function getBestVariantUrl(content, masterUrl) {
    const lines = content.split('\n');
    let bestRes = 0;
    let bestUrl = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
        const res = resMatch ? parseInt(resMatch[1], 10) : 0;
        const urlLine = lines[i + 1]?.trim();
        if (!urlLine || urlLine.startsWith('#')) continue;
        if (res > bestRes) {
            bestRes = res;
            bestUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterUrl).href;
        }
    }
    return bestUrl;
}

export async function getStream(id, s, e) {
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

        const variantUrl = getBestVariantUrl(playlist, masterUrl);
        return variantUrl ?? masterUrl;
    } catch {
        return null;
    }
}

export async function proxyStream(url, res, { fetchUpstream, rewriteM3u8 }) {
    const upstream = await fetchUpstream(url, 0, HEADERS);
    const ct = (upstream.headers['content-type'] || '').toLowerCase();
    const isM3u8 = ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(url);
    if (isM3u8) {
        const chunks = [];
        for await (const c of upstream) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(rewriteM3u8(body, url, '&vx=1'));
    }
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
}