import { fetchJson } from '../utils/helpers.js';

const BASE_URL = 'https://nebula.work.gd/private/7f6b9d179ba7ecd77a39520e';

async function getImdbId(tmdbId, s, e) {
    const key = process.env.TMDB_API_KEY;
    if (!key) return null;
    try {
        const type = s != null && e != null ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${key}`;
        const res = await fetchJson(url);
        return res?.imdb_id || null;
    } catch {
        return null;
    }
}

export async function getStream({ id, s, e }) {
    try {
        const imdbId = await getImdbId(id, s, e);
        if (!imdbId) return null;

        const path = s != null && e != null
            ? `/stream/series/${imdbId}:${s}:${e}.json`
            : `/stream/movie/${imdbId}.json`;

        const response = await fetch(`${BASE_URL}${path}`, {
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (!data?.streams?.length) return null;

        const allUrls = data.streams
            .filter(stream => stream.url && stream.url.trim() !== '' && !stream.url.includes('hubcloud'))
            .map(stream => {
                const headers = stream.behaviorHints?.proxyHeaders?.request || {};

                let serverName = stream.name || 'Unknown';
                if (serverName.includes('\n')) serverName = serverName.split('\n')[0];

                const filename = stream.filename || stream.behaviorHints?.filename;
                if (filename) serverName += ` - ${filename}`;

                return {
                    url: stream.url,
                    server: `Nebula - ${serverName}`,
                    type: stream.url.includes('.m3u8') ? 'hls' : 'mp4',
                    headers: Object.keys(headers).length > 0 ? headers : undefined,
                    skipProxy: stream.behaviorHints?.notWebReady === false
                };
            }).filter(Boolean);

        return allUrls.length ? { allUrls } : null;
    } catch {
        return null;
    }
}