'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

export const SKIP_VERIFY = true;
export const MULTI_URL = false;

const ENC_API = "https://enc-dec.app/api";
const BASE = "https://kisskh.do";

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    Accept: 'application/json',
};

function cleanTitle(t) {
    if (!t) return '';
    return t.toLowerCase().replace(/\(\d{4}\)/g, '').replace(/[^a-z0-9]/g, '');
}

async function searchDrama(query) {
    try {
        const res = await fetch(`${BASE}/api/DramaList/Search?q=${encodeURIComponent(query)}`, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function resolveDrama(titles, year) {
    const orderedTitles = titles.length > 1 ? [...titles].reverse() : titles;

    for (const title of orderedTitles) {
        const results = await searchDrama(title);
        const targetClean = cleanTitle(title);

        let best = null;
        let bestScore = -1;
        for (const item of results) {
            const parts = (item.title || '').split(/\s*-\s*/).map(cleanTitle);
            let score = 0;
            if (parts.some(p => p === targetClean)) score += 5;
            else if (parts.some(p => p.includes(targetClean) || targetClean.includes(p))) score += 3;
            else continue;

            if (score > bestScore) { bestScore = score; best = item; }
        }

        if (best && bestScore >= 5) return best;
    }
    return null;
}

async function fetchDramaDetail(dramaId) {
    try {
        const res = await fetch(`${BASE}/api/DramaList/Drama/${dramaId}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function findEpisodeId(detail, episodeNum) {
    if (!detail || !Array.isArray(detail.episodes)) return null;
    const match = detail.episodes.find(ep => Math.floor(ep.number) === Number(episodeNum));
    return match ? match.id : null;
}

async function encKey(episodeId, type) {
    try {
        const res = await fetch(`${ENC_API}/enc-kisskh?text=${episodeId}&type=${type}`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || !data?.result) return null;
        return data.result;
    } catch {
        return null;
    }
}

async function decryptSubUrl(rawUrl) {
    try {
        const res = await fetch(`${ENC_API}/dec-kisskh?url=${encodeURIComponent(rawUrl)}`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const info = await getTmdbInfo(id, s ? 'tv' : 'movie', s);
        if (!info) return null;

        const drama = await resolveDrama(info.titles, info.year);
        if (!drama) return null;

        const detail = await fetchDramaDetail(drama.id);
        if (!detail) return null;

        const episodeNum = e || 1;
        const episodeId = findEpisodeId(detail, episodeNum);
        if (!episodeId) return null;

        const vidKey = await encKey(episodeId, 'vid');
        if (!vidKey) return null;

        let videoRes;
        try {
            videoRes = await fetch(`${BASE}/api/DramaList/Episode/${episodeId}.png?err=false&ts=&time=&kkey=${vidKey}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        } catch {
            return null;
        }
        if (!videoRes.ok) return null;
        const videoData = await videoRes.json();
        if (!videoData?.Video) return null;

        let subtitles = [];
        const subKey = await encKey(episodeId, 'sub');
        if (subKey) {
            try {
                const subRes = await fetch(`${BASE}/api/Sub/${episodeId}?kkey=${subKey}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
                if (subRes.ok) {
                    const subList = await subRes.json();
                    if (Array.isArray(subList)) {
                        subtitles = subList.map(sub => ({
                            url: sub.src,
                            label: sub.label,
                            lang: sub.land,
                            default: !!sub.default,
                        }));
                    }
                }
            } catch { }
        }

        const isHls = videoData.Video.includes('.m3u8');

        return {
            allUrls: [{
                url: videoData.Video,
                type: isHls ? 'hls' : 'mp4',
                audio: 'sub',
                server: 'KissKH',
                headers: undefined,
                skipProxy: false,
                subtitles,
            }],
        };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}