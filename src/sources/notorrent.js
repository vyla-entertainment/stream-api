'use strict';

const NOTORRENT_API = "https://addon-osvh.onrender.com";

function cleanText(str) {
    if (!str) return "";
    return str.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, "").trim();
}

function extractQuality(titleText) {
    const match = (titleText || "").match(/(\d{3,4}p)/);
    if (match) return match[0];
    if ((titleText || "").toUpperCase().includes("FREE")) return "Auto";
    return "Auto";
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const tmdbKey = "338a47b75eab45d9e64e67088f910f93";
        const isTv = s != null && e != null;
        
        const tmdbUrl = isTv
            ? `https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbKey}&append_to_response=external_ids`
            : `https://api.themoviedb.org/3/movie/${id}?api_key=${tmdbKey}&append_to_response=external_ids`;

        const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(5000) });
        if (!tmdbRes.ok) return null;
        const data = await tmdbRes.json();
        const imdbId = data?.external_ids?.imdb_id || data?.imdb_id;
        if (!imdbId) return null;

        const apiUrl = isTv
            ? `${NOTORRENT_API}/stream/series/${imdbId}:${s}:${e}.json`
            : `${NOTORRENT_API}/stream/movie/${imdbId}.json`;

        const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
        if (!apiRes.ok) return null;
        const apiData = await apiRes.json();

        if (!apiData?.streams) return null;

        const allUrls = apiData.streams
            .filter(item => !item.externalUrl && item.url && !item.url.includes("github.com") && !item.url.includes("googleusercontent"))
            .map(item => {
                const quality = extractQuality(cleanText(item.title));
                const headers = item.behaviorHints?.headers || item.behaviorHints?.proxyHeaders?.request || {};
                return {
                    url: item.url,
                    quality,
                    server: `NoTorrent - ${item.name || 'Server'}`,
                    type: item.url.includes(".m3u8") ? "hls" : "mp4",
                    headers: Object.keys(headers).length ? headers : { 'User-Agent': 'Mozilla/5.0' },
                };
            });

        return allUrls.length > 0 ? { allUrls } : null;
    } catch {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return [];
    return [...new Set(res.allUrls.map(u => u.server))];
}