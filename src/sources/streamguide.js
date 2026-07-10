import { fetchJson, USER_AGENT, getTmdbInfo, tmdbToAnilist } from '../utils/source_helpers.js';

const BASE_URL = 'https://streamguide.cfd';
const HEADERS = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
const HONEYPOT_HOSTS = ['nomorflix.icu', 'www.nomorflix.icu'];
const QUALITY_RANK = ['4k', '2160p', '1080p', '720p', '480p', '360p'];
const SOURCES = ['Crius', 'Theia', 'Persephone', 'Leto', 'Hemera', 'Helios', 'Selene', 'Apollo', 'Astraeus', 'Zeus', 'Boreas', 'Hecate', 'Hera', 'Nike', 'Tyche', 'Poseidon', 'Hades', 'Mnemosyne', 'Cronus', 'Ares', 'Iris', 'Athena', 'Hermes'];

function isHoneypot(url) {
    if (!url) return true;
    try { return HONEYPOT_HOSTS.includes(new URL(url).hostname); } catch { return true; }
}

function extractHls(data) {
    const sources = data?.providers?.flatMap(p => p.sources ?? []) ?? [];
    const valid = sources.filter(st => st.url && !isHoneypot(st.url) && (st.type === 'hls' || st.url.includes('.m3u8') || st.url.includes('/x/') || st.url.includes('/Cffi-stream/')));
    if (!valid.length) return null;
    return valid.sort((a, b) => { const ai = QUALITY_RANK.indexOf((a.quality || '').toLowerCase()); const bi = QUALITY_RANK.indexOf((b.quality || '').toLowerCase()); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi); })[0].url;
}

export async function getStream({ id, s, e }) {
    const ep = e ? parseInt(e, 10) : 1;
    let tryAnime = false, anilistId = null;
    if (s) {
        const info = await getTmdbInfo(id, 'tv', s);
        if (info.isAnime) { anilistId = await tmdbToAnilist(id, 'tv', s, info.titles, info.year); if (anilistId) tryAnime = true; }
    }
    const trySourceUrl = async (url) => {
        const json = await fetchJson(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        const file = extractHls(json);
        if (file) return file;
        throw new Error();
    };
    if (tryAnime) {
        const file = await Promise.any(SOURCES.map(src => trySourceUrl(`${BASE_URL}/${src}/anime/${anilistId}/${ep}?mal=${anilistId}&verify=false`))).catch(() => null);
        if (file) return { url: file, headers: HEADERS, skipProxy: false };
    }
    const file = await Promise.any(SOURCES.map(src => trySourceUrl(s ? `${BASE_URL}/${src}/tv/${id}/${s}/${ep}?verify=false` : `${BASE_URL}/${src}/movie/${id}?verify=false`))).catch(() => null);
    return file ? { url: file, headers: HEADERS, skipProxy: false } : null;
}