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

let _selfBase = null;
export function setSelfBase(base) { _selfBase = base; }

async function proxyFetch(url, asJson = false) {
    if (_selfBase) {
        const proxied = `${_selfBase}/api?url=${encodeURIComponent(url)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`;
        const res = await fetch(proxied);
        if (!res || res.status !== 200) return null;
        return asJson ? res.json() : res.text();
    }
    const res = await fetch(url, { headers: HEADERS });
    if (!res || res.status !== 200) return null;
    return asJson ? res.json() : res.text();
}

function buildApiUrl(id, s, e) {
    if (s && e) return `${BASE_URL}/api/tv/${id}/${s}/${e}`;
    return `${BASE_URL}/api/movie/${id}`;
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

export async function getStream(id, s, e, clientIP = null, selfBase = null) {
    if (selfBase) _selfBase = selfBase;
    try {
        const apiUrl = buildApiUrl(id, s, e);
        const apiData = await proxyFetch(apiUrl, true);
        if (!apiData?.src) return null;

        const embedUrl = apiData.src.startsWith('http') ? apiData.src : BASE_URL + apiData.src;
        const html = await proxyFetch(embedUrl, false);
        if (!html) return null;

        const tokenData = extractTokenData(html);
        if (!tokenData) return null;

        const masterUrl = buildMasterUrl(tokenData);

        const playlistText = await proxyFetch(masterUrl, false);
        if (!playlistText) return null;

        const cleaned = playlistText.trim();
        if (!cleaned.startsWith('#EXTM3U')) return null;

        const variantUrl = getBestVariantUrl(cleaned, masterUrl);
        return variantUrl ?? masterUrl;
    } catch {
        return null;
    }
}

function getBestVariantUrl(content, masterUrl) {
    const lines = content.split('\n');
    let bestRes = 0;
    let bestUrl = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
        const res = resMatch ? parseInt(resMatch[1], 10) : 0;
        let urlLine = lines[i + 1]?.trim();
        if (!urlLine || urlLine.startsWith('#')) continue;
        if (urlLine.includes('localhost') || urlLine.includes('127.0.0.1')) continue;
        if (res > bestRes) {
            bestRes = res;
            bestUrl = urlLine.startsWith('http') ? urlLine : new URL(urlLine, masterUrl).href;
        }
    }
    return bestUrl;
}