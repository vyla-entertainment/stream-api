const BASE_URL = 'https://vixsrc.to';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
};

const PLAYLIST_HEADERS = {
    'User-Agent': HEADERS['User-Agent'],
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
};

function buildApiUrl(id, s, e) {
    if (s && e) return `${BASE_URL}/api/tv/${id}/${s}/${e}`;
    return `${BASE_URL}/api/movie/${id}`;
}

async function fetchApi(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status !== 200) return null;
        return res.json();
    } catch {
        return null;
    }
}

async function fetchEmbedPage(src) {
    try {
        const url = src.startsWith('http') ? src : BASE_URL + src;
        const res = await fetch(url, { headers: HEADERS });
        if (res.status !== 200) return null;
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
        const res = await fetch(masterUrl, { headers: PLAYLIST_HEADERS });
        if (res.status !== 200) return null;
        return res.text();
    } catch {
        return null;
    }
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

        return masterUrl;
    } catch {
        return null;
    }
}

export const VERIFY_HEADERS = { ...PLAYLIST_HEADERS };