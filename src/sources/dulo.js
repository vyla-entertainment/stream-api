// dulo if u want this disabled hmu

'use strict';

const API_KEY = "WDNUNBUB3HR983Y9ISBADK4O82";
const BASE_URL = "https://dulo.tv";

const MOVIE_PROVIDERS = ["event-edge", "vidrock", "moviesapi", "uniquestream", "purstream", "goodstream", "xpass", "vixsrc", "vidnest"];
const TV_PROVIDERS = ["event-edge", "vidrock", "uniquestream", "videasy", "purstream", "xpass", "vixsrc", "vidnest"];

const BASE_HEADERS = {
    "X-API-Key": API_KEY,
    "Authorization": `Bearer ${API_KEY}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Origin": BASE_URL,
    "Referer": `${BASE_URL}/`
};

let sessionCookie = null;
let lastSessionFetch = 0;

async function getSession() {
    if (sessionCookie && Date.now() - lastSessionFetch < 1000 * 60 * 20) {
        return sessionCookie;
    }

    try {
        const res = await fetch(`${BASE_URL}/api/session`, {
            headers: BASE_HEADERS,
            signal: AbortSignal.timeout(5000)
        });
        const cookie = res.headers.get('set-cookie');
        if (cookie) {
            sessionCookie = cookie.split(';')[0];
            lastSessionFetch = Date.now();
            return sessionCookie;
        }
    } catch (e) { }
    return null;
}

async function fetchFromProvider(provider, type, id, s, e, cookie) {
    let url = `${BASE_URL}/api/sources/call?type=${type}&provider=${provider}&tmdb=${id}`;
    if (type === 'tv') url += `&season=${s}&episode=${e}`;

    const headers = { ...BASE_HEADERS };
    if (cookie) headers['Cookie'] = cookie;

    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.sources || !data.sources.length) return null;

        return data.sources.map(src => ({
            url: src.url,
            server: `Dulo - ${provider}${src.title ? ` (${src.title})` : ''}`,
            type: src.type || (src.url.includes('.m3u8') ? 'hls' : 'mp4'),
            headers: src.headers || {
                "User-Agent": BASE_HEADERS["User-Agent"],
                "Referer": src.url.includes('mediacache') ? "https://hls.uniquestream.net/" : BASE_HEADERS["Referer"]
            },
            skipVerify: true,
            skipHlsCheck: true,
            skipProxy: false
        }));
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const isTv = s != null && e != null;
    const type = isTv ? 'tv' : 'movie';
    const providers = isTv ? TV_PROVIDERS : MOVIE_PROVIDERS;

    const cookie = await getSession();

    let targets = providers;
    if (serverName && serverName !== 'all') {
        const cleanName = serverName.replace('Dulo - ', '').split(' ')[0];
        targets = providers.includes(cleanName) ? [cleanName] : [];
    }

    const settled = await Promise.allSettled(
        targets.map(p => fetchFromProvider(p, type, id, s, e, cookie))
    );

    const allUrls = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .flatMap(r => r.value);

    if (allUrls.length === 0) return null;

    return { allUrls };
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return [];
    return [...new Set(res.allUrls.map(u => u.server))];
}