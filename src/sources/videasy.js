import { getTmdbInfo, fetchJson, fetchText, USER_AGENT } from '../utils/helpers.js';

const WINGS_BASE = "https://api.wingsdatabase.com";
const HEADERS = { "Accept": "*/*", "Origin": "https://player.videasy.to", "Referer": "https://player.videasy.to/", "User-Agent": USER_AGENT };
const SERVERS = [
    { id: 'jett', name: 'Jett' },
    { id: 'cdn', name: 'Yoru' },
    { id: 'tejo', name: 'Tejo' },
    { id: 'neon2', name: 'Neon' },
    { id: 'ym', name: 'Sage' },
    { id: 'downloader2', name: 'Cypher' },
    { id: 'm4uhd', name: 'Breach' },
    { id: 'hdmovie', name: 'Vyse' },
    { id: 'meine', name: 'Killjoy' },
    { id: 'lamovie', name: 'Omen' },
    { id: 'superflix', name: 'Raze' }
];

export async function getStream({ id, s, e, server }) {
    try {
        const isTv = s != null && e != null;
        const info = await getTmdbInfo(id, isTv ? 'tv' : 'movie');
        if (!info?.titles?.length) return null;

        const seedData = await fetchJson(`${WINGS_BASE}/seed?mediaId=${id}`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
        const seed = seedData?.seed;
        if (!seed) return null;

        const encTitle = encodeURIComponent(encodeURIComponent(info.titles[0]));
        let targets = SERVERS;

        if (server && server !== 'all') {
            const cleanName = server.replace('VidEasy - ', '');
            targets = SERVERS.filter(sv => sv.name === cleanName);
            if (!targets.length) targets = SERVERS;
        }

        const settled = await Promise.allSettled(targets.map(async srv => {
            if (srv.id === 'cdn' && isTv) throw new Error();

            let url = `${WINGS_BASE}/${srv.id}/sources-with-title?title=${encTitle}&mediaType=${isTv ? 'tv' : 'movie'}&year=${info.year || ''}&tmdbId=${id}&imdbId=${info.imdbId || "tt0000000"}&enc=2&seed=${seed}`;
            if (isTv) url += `&episodeId=${e}&seasonId=${s}`;

            const encText = await fetchText(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
            const decJson = await fetchJson("https://enc-dec.app/api/dec-videasy", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encText, id: String(id), seed }),
                signal: AbortSignal.timeout(10000)
            });

            if (decJson.status !== 200 || !decJson.result) throw new Error();

            let sourcesArray = [];
            let subsArray = [];

            if (Array.isArray(decJson.result)) {
                sourcesArray = decJson.result;
            } else if (decJson.result.sources && Array.isArray(decJson.result.sources)) {
                sourcesArray = decJson.result.sources;
                if (decJson.result.subtitles && Array.isArray(decJson.result.subtitles)) {
                    subsArray = decJson.result.subtitles.map(sub => ({
                        url: sub.url || sub.file,
                        lang: sub.language || sub.lang || sub.label || 'Unknown'
                    })).filter(sub => sub.url);
                }
            } else {
                sourcesArray = [decJson.result];
            }

            return sourcesArray.map(res => {
                const streamUrl = res.url || res.file || res.link || res.playlist || res.stream;
                return streamUrl ? {
                    url: streamUrl,
                    quality: res.quality || "Auto",
                    server: `VidEasy - ${srv.name}`,
                    type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                    headers: HEADERS,
                    subtitles: subsArray.length > 0 ? subsArray : undefined,
                    skipProxy: false,
                    skipVerify: true,
                    skipHlsCheck: true
                } : null;
            }).filter(Boolean);
        }));

        const allUrls = [];
        for (const r of settled) {
            if (r.status === 'fulfilled' && r.value) allUrls.push(...r.value);
        }

        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() {
    return SERVERS.map(s => `VidEasy - ${s.name}`);
}