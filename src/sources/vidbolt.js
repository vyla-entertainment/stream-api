import { getTmdbInfo, fetchJson, USER_AGENT } from '../utils/helpers.js';

const BASE_URL = 'https://vidbolt.xyz';
const HEADERS = {
    'User-Agent': USER_AGENT,
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL,
    'Accept': '*/*'
};

function extractStreamData(obj, results = []) {
    if (!obj) return results;
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) extractStreamData(obj[i], results);
    } else if (typeof obj === 'object') {
        const url = obj.url || obj.file || obj.link || obj.src;
        if (typeof url === 'string' && url.startsWith('http') &&
            (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.mkv') || url.includes('.mpd') || url.includes('proxy/file'))) {
            results.push({
                url,
                quality: obj.quality || obj.label || obj.resolution || 'Auto'
            });
        }
        const values = Object.values(obj);
        for (let i = 0; i < values.length; i++) {
            if (typeof values[i] === 'object' && values[i] !== null) {
                extractStreamData(values[i], results);
            }
        }
    }
    return results;
}

function extractSubtitles(obj, subs = []) {
    if (!obj) return subs;
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) extractSubtitles(obj[i], subs);
    } else if (typeof obj === 'object') {
        const url = obj.url || obj.file || obj.src;
        if (typeof url === 'string' && (url.includes('.vtt') || url.includes('.srt') || obj.kind === 'captions' || obj.type === 'subtitle')) {
            subs.push({
                url,
                lang: obj.label || obj.language || obj.name || obj.lang || 'Unknown'
            });
        }
        const values = Object.values(obj);
        for (let i = 0; i < values.length; i++) {
            if (typeof values[i] === 'object' && values[i] !== null) {
                extractSubtitles(values[i], subs);
            }
        }
    }
    return subs;
}

async function scrapeFlax(info, id, s, e) {
    const isTv = s != null && e != null;
    const type = isTv ? 'tv' : 'movie';
    const title = encodeURIComponent(info.titles[0] || '');
    const year = info.year || '';
    const imdbId = info.imdbId ? info.imdbId.replace('tt', '') : '';

    let path = `/scrape/Flaxmovies/${type}/tt${imdbId}?tmdbId=${id}&title=${title}&year=${year}`;
    if (isTv) path += `&season=${s}&episode=${e}`;

    return fetchJson(`${BASE_URL}/api/proxy?path=${encodeURIComponent(path)}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
}

async function scrapeVidrock(id, s, e) {
    const url = s != null && e != null
        ? `https://sub.vdrk.site/v1/tv/${id}/${s}/${e}`
        : `https://sub.vdrk.site/v1/movie/${id}`;

    return fetchJson(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
}

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info?.imdbId) return null;

        let targets = [
            { name: 'Flaxmovies', fn: () => scrapeFlax(info, id, s, e) },
            { name: 'VidRock', fn: () => scrapeVidrock(id, s, e) }
        ];

        if (server && server !== 'all') {
            const cleanName = server.replace('VidBolt - ', '');
            targets = targets.filter(t => t.name === cleanName);
            if (!targets.length) targets = [
                { name: 'Flaxmovies', fn: () => scrapeFlax(info, id, s, e) },
                { name: 'VidRock', fn: () => scrapeVidrock(id, s, e) }
            ];
        }

        const settled = await Promise.allSettled(targets.map(async t => {
            const data = await t.fn();
            if (!data) throw new Error();
            return { name: t.name, data };
        }));

        const allUrls = [];
        const seen = new Set();

        for (const r of settled) {
            if (r.status !== 'fulfilled' || !r.value) continue;

            const streams = extractStreamData(r.value.data);
            const subtitles = extractSubtitles(r.value.data);

            for (const stream of streams) {
                if (seen.has(stream.url)) continue;
                seen.add(stream.url);

                let skipProxy = false;
                let reqHeaders = { ...HEADERS };

                if (stream.url.includes('proxy/file?url=')) {
                    skipProxy = true;
                    try {
                        const parsed = new URL(stream.url);
                        const h = parsed.searchParams.get('headers');
                        if (h) Object.assign(reqHeaders, JSON.parse(h));
                    } catch { }
                } else if (r.value.name === 'Flaxmovies') {
                    reqHeaders['Referer'] = 'https://flaxmovies.xyz/';
                    reqHeaders['Origin'] = 'https://flaxmovies.xyz';
                }

                let type = 'mp4';
                if (stream.url.includes('.m3u8')) type = 'hls';
                else if (stream.url.includes('.mpd')) type = 'dash';

                allUrls.push({
                    url: stream.url,
                    server: `VidBolt - ${r.value.name}`,
                    quality: stream.quality,
                    type,
                    headers: reqHeaders,
                    subtitles: subtitles.length ? subtitles : undefined,
                    skipProxy
                });
            }
        }

        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() {
    return ['VidBolt - Flaxmovies', 'VidBolt - VidRock'];
}