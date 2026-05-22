const BASE_URL = 'https://vixsrc.to';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
};

export const VERIFY_HEADERS = { ...HEADERS };
export const SKIP_VERIFY = true;
export const MULTI_URL = false;

const FALLBACK_BASE = 'https://cjbutimtired.tuvnord.hk/strapi';

async function proxyFetch(url, asJson = false, selfBase = null) {
    const base = selfBase || FALLBACK_BASE;
    const target = `${base}/api?url=${encodeURIComponent(url)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`;
    try {
        const res = await fetch(target, {});
        if (!res || res.status !== 200) return null;
        if (asJson) {
            const text = await res.text();
            try { return JSON.parse(text); } catch { return null; }
        }
        return res.text();
    } catch {
        return null;
    }
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
    return `${playlist}${sep}type=video&rendition=1080p&token=${token}&expires=${expires}&edge=sc-u2-01&lang=${lang}`;
}

export async function getStream(id, s, e, clientIP = null, selfBase = null) {
    try {
        const apiUrl = buildApiUrl(id, s, e);
        const apiData = await proxyFetch(apiUrl, true, selfBase);
        if (!apiData?.src) return null;

        const embedUrl = apiData.src.startsWith('http') ? apiData.src : BASE_URL + apiData.src;
        const html = await proxyFetch(embedUrl, false, selfBase);
        if (!html) return null;

        const tokenData = extractTokenData(html);
        if (!tokenData) return null;

        const masterUrl = buildMasterUrl(tokenData);
        const base = selfBase || FALLBACK_BASE;
        const proxiedMaster = `${base}/api?url=${encodeURIComponent(masterUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`;

        return {
            url: proxiedMaster,
            headers: {},
            skipProxy: false,
        };
    } catch {
        return null;
    }
}