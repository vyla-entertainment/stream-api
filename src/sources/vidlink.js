import { fetchJson, USER_AGENT } from '../utils/source_helpers.js';

const BASE = "https://vidlink.pro";
const HEADERS = { 'User-Agent': USER_AGENT, Origin: BASE, Referer: `${BASE}/` };

export async function getStream({ id, s, e }) {
    try {
        const encData = await fetchJson(`https://enc-dec.app/api/enc-vidlink?text=${id}`, { signal: AbortSignal.timeout(6000) });
        if (encData?.status !== 200 || !encData?.result) return null;
        const data = await fetchJson(s ? `${BASE}/api/b/tv/${encData.result}/${s}/${e || 1}` : `${BASE}/api/b/movie/${encData.result}`, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        const stream = data?.stream;
        if (!stream) return null;
        if (stream.type === 'file' && stream.qualities) {
            let picked = null;
            for (const q of ['1080', '720', '480', '360']) if (stream.qualities[q]?.url) { picked = stream.qualities[q].url; break; }
            if (!picked) picked = stream.qualities[Object.keys(stream.qualities)[0]]?.url;
            if (picked) return { allUrls: [{ url: picked, type: 'mp4', audio: 'sub', server: 'Vidlink', skipHlsCheck: true, skipCache: true }] };
        } else if (stream.playlist) {
            return { allUrls: [{ url: stream.playlist, type: 'hls', audio: 'sub', server: 'Vidlink', skipHlsCheck: true, skipCache: true }] };
        }
        return null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}