import { getTmdbInfo, fetchJson, USER_AGENT } from '../utils/source_helpers.js';

const BASE_URL = 'https://movienig.ht';

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info?.titles?.length || !info.imdbId) return null;

        const title = encodeURIComponent(info.titles[0]);
        const url = isTv
            ? `${BASE_URL}/api/stream/v1/tv/${id}/${s}/${e}?title=${title}&year=${info.year || ''}&imdbId=${info.imdbId}`
            : `${BASE_URL}/api/stream/v1/movie/${id}?title=${title}&year=${info.year || ''}&imdbId=${info.imdbId}`;

        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/event-stream' }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;

        const text = await res.text();
        const allUrls = [];
        const regex = /event:\s*done\s*data:\s*({.+?})\s*(?:\n\n|$)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            try {
                const payload = JSON.parse(match[1]);
                if (!payload.sources?.length) continue;
                const srvName = payload.server || 'Unknown';

                if (server && server !== 'all') {
                    const cleanServer = server.replace('MovieNight - ', '');
                    if (!srvName.toLowerCase().includes(cleanServer.toLowerCase())) continue;
                }

                const subtitles = [];
                if (payload.subtitles?.length) {
                    for (const sub of payload.subtitles) {
                        if (!sub.url) continue;
                        let subUrl = sub.url;
                        if (subUrl.includes('?u=')) {
                            const uParam = new URL(subUrl, BASE_URL).searchParams.get('u');
                            if (uParam) subUrl = Buffer.from(uParam, 'base64').toString('utf8');
                        } else if (!subUrl.startsWith('http')) {
                            subUrl = `${BASE_URL}${subUrl}`;
                        }
                        subtitles.push({ url: subUrl, lang: sub.display || sub.label || sub.lang || 'Unknown' });
                    }
                }

                for (const src of payload.sources) {
                    if (!src.url) continue;
                    let finalUrl = src.url;

                    if (finalUrl.includes('?u=')) {
                        const uParam = new URL(finalUrl, BASE_URL).searchParams.get('u');
                        if (uParam) finalUrl = Buffer.from(uParam, 'base64').toString('utf8');
                    } else if (!finalUrl.startsWith('http')) {
                        finalUrl = `${BASE_URL}${finalUrl}`;
                    }

                    let type = 'mp4';
                    if (src.type === 'dash' || finalUrl.includes('.mpd')) type = 'dash';
                    else if (src.type === 'hls' || finalUrl.includes('.m3u8')) type = 'hls';

                    allUrls.push({
                        url: finalUrl,
                        type,
                        server: `MovieNight - ${srvName}`,
                        quality: src.quality || 'Auto',
                        subtitles: subtitles.length ? subtitles : undefined,
                        skipProxy: false
                    });
                }
            } catch { }
        }

        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() {
    try {
        const data = await fetchJson(`${BASE_URL}/api/servers`, { signal: AbortSignal.timeout(5000) });
        if (data?.servers) return data.servers.map(s => `MovieNight - ${s.label}`);
    } catch { }
    return ['MovieNight'];
}