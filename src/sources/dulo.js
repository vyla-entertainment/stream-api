import { USER_AGENT, fetchJson } from '../utils/source_helpers.js';

const API_KEY = "WDNUNBUB3HR983Y9ISBADK4O82";
const BASE_URL = "https://dulo.tv";
const MOVIE_PROVIDERS = ["event-edge", "vidrock", "moviesapi", "uniquestream", "purstream", "goodstream", "xpass", "vixsrc", "vidnest"];
const TV_PROVIDERS = ["event-edge", "vidrock", "uniquestream", "videasy", "purstream", "xpass", "vixsrc", "vidnest"];
const BASE_HEADERS = { "X-API-Key": API_KEY, "Authorization": `Bearer ${API_KEY}`, "User-Agent": USER_AGENT, "Origin": BASE_URL, "Referer": `${BASE_URL}/` };

let sessionCookie = null, lastSessionFetch = 0;

async function getSession() {
    if (sessionCookie && Date.now() - lastSessionFetch < 1200000) return sessionCookie;
    try {
        const res = await fetch(`${BASE_URL}/api/session`, { headers: BASE_HEADERS, signal: AbortSignal.timeout(5000) });
        const cookie = res.headers.get('set-cookie');
        if (cookie) { sessionCookie = cookie.split(';')[0]; lastSessionFetch = Date.now(); return sessionCookie; }
    } catch { }
    return null;
}

export async function getStream({ id, s, e, server }) {
    const isTv = s != null && e != null;
    const type = isTv ? 'tv' : 'movie';
    const providers = isTv ? TV_PROVIDERS : MOVIE_PROVIDERS;
    const cookie = await getSession();
    let targets = providers;
    if (server && server !== 'all') {
        const cleanName = server.replace('Dulo - ', '').split(' ')[0];
        targets = providers.includes(cleanName) ? [cleanName] : [];
    }
    const settled = await Promise.allSettled(targets.map(async p => {
        const headers = cookie ? { ...BASE_HEADERS, 'Cookie': cookie } : BASE_HEADERS;
        const data = await fetchJson(`${BASE_URL}/api/sources/call?type=${type}&provider=${p}&tmdb=${id}${isTv ? `&season=${s}&episode=${e}` : ''}`, { headers, signal: AbortSignal.timeout(12000) });
        if (!data.sources?.length) throw new Error();
        return data.sources.map(src => ({ url: src.url, server: `Dulo - ${p}${src.title ? ` (${src.title})` : ''}`, type: src.type || (src.url.includes('.m3u8') ? 'hls' : 'mp4'), headers: src.headers || { "User-Agent": USER_AGENT, "Referer": src.url.includes('mediacache') ? "https://hls.uniquestream.net/" : BASE_HEADERS.Referer } }));
    }));
    const allUrls = [];
    for (const r of settled) if (r.status === 'fulfilled') allUrls.push(...r.value);
    return allUrls.length ? { allUrls } : null;
}

export async function getSources(args) {
    const res = await getStream(args);
    return res?.allUrls ? [...new Set(res.allUrls.map(u => u.server))] : [];
}