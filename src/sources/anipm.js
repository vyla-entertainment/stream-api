import { getTmdbInfo, fetchJson } from '../utils/helpers.js';

const BASE_URL = "https://ani.pm";

function cleanTitle(t) { return t ? t.toLowerCase().replace(/[^a-z0-9]/g, '') : ''; }

async function searchCatalog(query) {
    try {
        const data = await fetchJson(`${BASE_URL}/api/anime/catalog?q=${encodeURIComponent(query)}&page=1`, { signal: AbortSignal.timeout(6000) });
        return Array.isArray(data?.items) ? data.items : [];
    } catch { return []; }
}

async function resolveEntry(titles, year) {
    const orderedTitles = titles.length > 1 ? [...titles].reverse() : titles;
    let best = null, bestScore = -1;
    for (const title of orderedTitles) {
        const items = await searchCatalog(title);
        const targetClean = cleanTitle(title);
        for (const item of items) {
            const itemTitles = [item.title, item.native].filter(Boolean).map(cleanTitle);
            let score = 0;
            if (itemTitles.some(t => t === targetClean)) score += 5;
            else if (itemTitles.some(t => t.includes(targetClean) || targetClean.includes(t))) score += 3;
            else continue;
            if (item.type === 'TV') score += 4;
            else if (item.type === 'Movie' || item.type === 'Special' || item.type === 'ONA') score -= 2;
            if (year && item.year) {
                const diff = Math.abs(item.year - year);
                if (diff === 0) score += 3;
                else if (diff === 1) score += 1;
                else if (diff > 2) score -= 3;
            }
            if (score > bestScore) { bestScore = score; best = item; }
        }
        if (bestScore >= 9) break;
    }
    return best;
}

export async function getStream({ id, s, e, audio }) {
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;
        const entry = await resolveEntry(info.titles, info.year);
        if (!entry) return null;
        const episodeNum = e || 1;
        const params = new URLSearchParams({ title: entry.title || '', ep: String(episodeNum) });
        if (entry.year) params.set('year', entry.year);
        if (entry.anilistId) params.set('anilistId', entry.anilistId);
        if (entry.malId) params.set('malId', entry.malId);
        const servers = await fetchJson(`${BASE_URL}/api/anime/src/servers?${params}`, { signal: AbortSignal.timeout(10000) });
        if (!servers) return null;
        const audiosToTry = audio === "all" ? ["sub", "dub"] : (audio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        for (const aud of audiosToTry) {
            const list = servers[aud];
            if (!Array.isArray(list) || !list.length) continue;
            const allUrls = list.filter(srv => (srv.kind === "hls" || srv.kind === "file") && srv.url)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .map(srv => ({ url: srv.url.startsWith('/') ? `${BASE_URL}${srv.url}` : srv.url, type: srv.kind === "hls" ? "hls" : "mp4", audio: aud, server: srv.provider ? `AniPM-${srv.provider}` : "AniPM", headers: { Referer: `${BASE_URL}/`, Origin: BASE_URL }, skipProxy: false }));
            if (allUrls.length) return { allUrls };
        }
        return null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}