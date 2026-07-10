import { fetchJson } from '../utils/helpers.js';

const API = "https://addon-osvh.onrender.com";

function extractQuality(t) { return t.match(/(\d{3,4}p)/)?.[0] || (t.toUpperCase().includes("FREE") ? "Auto" : "Auto"); }

export async function getStream({ id, s, e }) {
    try {
        const tmdbData = await fetchJson(`https://api.themoviedb.org/3/${s ? 'tv' : 'movie'}/${id}?api_key=338a47b75eab45d9e64e67088f910f93&append_to_response=external_ids`, { signal: AbortSignal.timeout(5000) });
        const imdbId = tmdbData?.external_ids?.imdb_id || tmdbData?.imdb_id;
        if (!imdbId) return null;
        const apiData = await fetchJson(s ? `${API}/stream/series/${imdbId}:${s}:${e}.json` : `${API}/stream/movie/${imdbId}.json`, { signal: AbortSignal.timeout(10000) });
        if (!apiData?.streams) return null;
        const allUrls = [];
        for (const item of apiData.streams) {
            if (!item.externalUrl && item.url && !item.url.includes("github.com") && !item.url.includes("googleusercontent")) {
                const headers = item.behaviorHints?.headers || item.behaviorHints?.proxyHeaders?.request || { 'User-Agent': 'Mozilla/5.0' };
                allUrls.push({ url: item.url, quality: extractQuality(item.title || ""), server: `NoTorrent - ${item.name || 'Server'}`, type: item.url.includes(".m3u8") ? "hls" : "mp4", headers: Object.keys(headers).length ? headers : { 'User-Agent': 'Mozilla/5.0' } });
            }
        }
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const res = await getStream(args);
    return res?.allUrls ? [...new Set(res.allUrls.map(u => u.server))] : [];
}