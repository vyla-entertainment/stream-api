import { fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const BASE_URL = 'https://vidnest.fun';
const API_BASE_URL = 'https://new.vidnest.fun';
const REQUEST_HEADERS = { 'User-Agent': USER_AGENT, 'Accept': 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': `${BASE_URL}/`, 'Origin': BASE_URL };
const CDN_PROXY_HEADERS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0', 'accept': '*/*', 'accept-language': 'en-US,en;q=0.5', 'origin': 'https://megaplay.buzz', 'referer': 'https://megaplay.buzz/' };

export const CDN_HEADERS = [
    { pattern: /letsgocdn\d+\.shop/i, headers: { 'Referer': BASE_URL, 'Origin': BASE_URL, 'User-Agent': USER_AGENT } },
    { pattern: /cdn\.mewstream\.buzz/i, headers: { 'Referer': BASE_URL, 'Origin': BASE_URL, 'User-Agent': USER_AGENT } }
];

const ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
const REV_MAP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) REV_MAP[ALPHABET.charCodeAt(i)] = i;

function decrypt(payload) {
    const len = payload.length;
    const bytes = new Uint8Array(len);
    let j = 0;
    for (let i = 0; i < len; i += 4) {
        const c0 = REV_MAP[payload.charCodeAt(i)] ?? 64;
        const c1 = REV_MAP[payload.charCodeAt(i + 1)] ?? 64;
        const c2 = REV_MAP[payload.charCodeAt(i + 2)] ?? 64;
        const c3 = REV_MAP[payload.charCodeAt(i + 3)] ?? 64;
        bytes[j++] = (c0 << 2) | (c1 >> 4);
        if (c2 !== 64) bytes[j++] = ((c1 & 15) << 4) | (c2 >> 2);
        if (c3 !== 64) bytes[j++] = ((c2 & 3) << 6) | c3;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, j)));
}

async function tmdbToAnilist(tmdbId, season) {
    try {
        const data = await fetchJson(`https://api.ani.zip/mappings?tmdb_id=${tmdbId}&type=tv&season=${season || 1}`, { signal: AbortSignal.timeout(6000) });
        return data?.mappings?.[0]?.anilist_id || null;
    } catch { return null; }
}

const SERVER_KEYS = ['hollymoviehd', 'allmovies', 'catflix', 'purstream', 'lamda', 'vidlink', 'klikxxi'];

export async function getStream({ id, s, e, audio }) {
    if (s) {
        const k = process.env.TMDB_API_KEY;
        const showData = k ? await fetchJson(`https://api.themoviedb.org/3/tv/${id}?api_key=${k}`, { signal: AbortSignal.timeout(5000) }).catch(() => null) : null;
        if (showData?.genres?.some(g => g.id === 16)) {
            const anilistId = await tmdbToAnilist(id, s);
            if (anilistId) {
                try {
                    const json = await fetchJson(`${API_BASE_URL}/hianime/anime/${anilistId}/${e || 1}/${audio === 'dub' ? 'dub' : 'sub'}`, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(15000) });
                    const data = json.encrypted ? decrypt(json.data) : json.data;
                    const file = data?.sources?.[0]?.file;
                    if (file) return { url: `https://megacloud.animanga.fun/proxy?url=${encodeURIComponent(file)}&headers=${encodeURIComponent(JSON.stringify(CDN_PROXY_HEADERS))}`, headers: REQUEST_HEADERS };
                } catch { }
            }
        }
    }
    if (audio === 'dub') return null;
    const segment = s ? `tv/${id}/${s}/${e || 1}` : `movie/${id}`;
    const settled = await Promise.allSettled(SERVER_KEYS.map(async server => {
        const json = await fetchJson(`${API_BASE_URL}/${server}/${segment}`, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(10000) });
        const data = json.encrypted ? decrypt(json.data) : json.data;
        const file = data?.sources?.[0]?.file ?? data?.streams?.[0]?.url ?? data?.url?.[0]?.link ?? data?.data?.stream?.playlist;
        if (file) return { url: file, server, headers: REQUEST_HEADERS };
        throw new Error();
    }));
    const allUrls = [];
    for (const r of settled) if (r.status === 'fulfilled') allUrls.push(r.value);
    return allUrls.length ? { allUrls } : null;
}

export async function getSources(args) {
    const res = await getStream(args);
    return res?.allUrls ? res.allUrls.map(u => u.server) : [];
}

export const VERIFY_HEADERS = { ...REQUEST_HEADERS };