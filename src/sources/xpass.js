import { fetchJson, fetchText, USER_AGENT } from '../utils/source_helpers.js';

const BASE = "https://play.xpass.top";
const HEADERS = { "accept": "*/*", "accept-language": "en-US,en;q=0.9", "cache-control": "no-cache", "pragma": "no-cache", "User-Agent": USER_AGENT, "Origin": BASE, "Referrer": `${BASE}/`, "Cookie": "auth_token=de21073d24bca9b50f189b402ac870734cf945f2085cb7e1a4fc453fcfe4f57e" };

export async function getStream({ id, s, e, server }) {
    const isTv = s && e && s !== 'null' && e !== 'null';
    const hdrs = { ...HEADERS, referer: `${BASE}/e/${isTv ? 'tv' : 'movie'}/${id}?autostart=true` };
    try {
        let sources = [];
        if (!isTv) {
            const text = await fetchText(`${BASE}/e/movie/${id}?autostart=true`, { headers: hdrs, signal: AbortSignal.timeout(7000) });
            const match = text.match(/var backups=(\[[\s\S]*?\])/);
            if (match) sources = JSON.parse(match[1]);
        } else {
            sources = await fetchJson(`${BASE}/data/tv/${id}/${s}/${e}?autostart=true&force=true`, { headers: hdrs, signal: AbortSignal.timeout(7000) });
        }
        if (!sources?.length) return null;
        if (server && server !== 'all') {
            const exact = sources.find(src => src.name === server.replace('XPass - ', ''));
            if (exact) sources = [exact]; else return null;
        }
        const allUrls = [];
        for (const source of sources) {
            if (!source.url) continue;
            try {
                const mdata = await fetchJson(`${BASE}${source.url}`, { headers: hdrs, signal: AbortSignal.timeout(5000) });
                if (!mdata?.playlist?.[0]?.sources) continue;
                const targetStream = mdata.playlist[0].sources.find(st => st.type === 'hls') || mdata.playlist[0].sources[0];
                if (targetStream?.file) allUrls.push({ server: `XPass - ${source.name}`, type: targetStream.type === 'hls' ? 'hls' : 'mp4', url: targetStream.file, headers: { "Origin": HEADERS.Origin, "Referer": HEADERS.Referrer, "User-Agent": HEADERS["User-Agent"] } });
            } catch { }
        }
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? stream.allUrls.map(u => u.server) : [];
}