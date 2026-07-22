import { getTmdbInfo, USER_AGENT } from '../utils/helpers.js';

const BASE_URL = 'https://opstream.fun';
const API_BASE = `${BASE_URL}/api/resolve`;

const API_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/x-ndjson; charset=utf-8',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
};

const STREAM_HEADERS = {
    'User-Agent': USER_AGENT,
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
};

export async function getStream({ id, s, e }) {
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        
        if (!info?.titles?.length || !info.imdbId) return null;

        const params = new URLSearchParams({
            type: isTv ? 'tv' : 'movie',
            tmdbId: id,
            title: info.titles[0],
            year: info.year || '',
            imdbId: info.imdbId,
            progress: '1'
        });

        if (isTv) {
            params.append('season', s);
            params.append('episode', e);
        }

        const res = await fetch(`${API_BASE}?${params}`, { 
            headers: API_HEADERS, 
            signal: AbortSignal.timeout(15000) 
        });
        
        if (!res.ok) return null;

        const text = await res.text();
        const lines = text.split('\n');
        
        let streamData = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const json = JSON.parse(trimmed);
                if (json.t === 'done' && json.data) {
                    streamData = json.data;
                    break;
                }
            } catch { continue; }
        }

        if (!streamData) return null;

        const subtitles = (streamData.captions || []).map(c => ({
            url: c.url.startsWith('http') ? c.url : `${BASE_URL}${c.url}`,
            lang: c.label || 'Unknown'
        }));

        const allUrls = [];

        if (streamData.qualities && streamData.qualities.length > 0) {
            for (const q of streamData.qualities) {
                let finalUrl = q.url;
                if (!finalUrl.startsWith('http')) {
                    finalUrl = `${BASE_URL}${finalUrl}`;
                }

                const isDash = finalUrl.includes('.mpd');
                const isHls = finalUrl.includes('.m3u8');

                allUrls.push({
                    url: finalUrl,
                    server: `OpStream - ${q.label}`,
                    type: isDash ? 'dash' : (isHls ? 'hls' : 'mp4'),
                    headers: STREAM_HEADERS,
                    subtitles,
                    skipProxy: true
                });
            }
        } else if (streamData.url) {
            let finalUrl = streamData.url;
            if (finalUrl.includes('?u=')) {
                try {
                    const uParam = new URL(finalUrl, BASE_URL).searchParams.get('u');
                    if (uParam) finalUrl = Buffer.from(uParam, 'base64').toString('utf8');
                } catch {}
            } else if (!finalUrl.startsWith('http')) {
                finalUrl = `${BASE_URL}${finalUrl}`;
            }

            const isDash = streamData.kind === 'dash' || finalUrl.includes('.mpd');
            const isHls = streamData.kind === 'hls' || finalUrl.includes('.m3u8');

            allUrls.push({
                url: finalUrl,
                server: 'OpStream',
                type: isDash ? 'dash' : (isHls ? 'hls' : 'mp4'),
                headers: STREAM_HEADERS,
                subtitles,
                skipProxy: true
            });
        }

        if (allUrls.length === 0) return null;

        return { allUrls };
    } catch { return null; }
}

export async function getSources() {
    return ['OpStream'];
}