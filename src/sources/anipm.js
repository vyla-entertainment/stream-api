'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const BASE = "https://ani.pm";

function cleanTitle(t) {
    if (!t) return '';
    return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function searchCatalog(query) {
    try {
        const res = await fetch(`${BASE}/api/anime/catalog?q=${encodeURIComponent(query)}&page=1`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.items) ? data.items : [];
    } catch {
        return [];
    }
}

async function resolveEntry(titles, year) {
    const orderedTitles = titles.length > 1 ? [...titles].reverse() : titles;

    let best = null;
    let bestScore = -1;

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

async function fetchServers(entry, episodeNum) {
    const params = new URLSearchParams({
        title: entry.title || '',
        ep: String(episodeNum),
    });
    if (entry.year) params.set('year', entry.year);
    if (entry.anilistId) params.set('anilistId', entry.anilistId);
    if (entry.malId) params.set('malId', entry.malId);

    try {
        const res = await fetch(`${BASE}/api/anime/src/servers?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function resolveUrl(url) {
    if (!url) return null;
    if (url.startsWith('/')) return `${BASE}${url}`;
    return url;
}

export async function getStream(args) {
    const { id, s, e, audio: prefAudio } = args;
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;

        const entry = await resolveEntry(info.titles, info.year);
        if (!entry) return null;

        const episodeNum = e || 1;
        const servers = await fetchServers(entry, episodeNum);
        if (!servers) return null;

        const audiosToTry = prefAudio === "all" ? ["sub", "dub"] : (prefAudio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);

        for (const aud of audiosToTry) {
            const list = servers[aud];
            if (!Array.isArray(list) || list.length === 0) continue;

            const allUrls = list
                .filter(s => (s.kind === "hls" || s.kind === "file") && s.url)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .map(s => ({
                    url: resolveUrl(s.url),
                    type: s.kind === "hls" ? "hls" : "mp4",
                    audio: aud,
                    server: s.provider ? `AniPM-${s.provider}` : "AniPM",
                    headers: { Referer: `${BASE}/` },
                    skipProxy: true
                }))
                .filter(s => s.url);

            if (allUrls.length > 0) return { allUrls };
        }

        return null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}