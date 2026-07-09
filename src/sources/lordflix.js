import crypto from 'node:crypto';
import { fetchJson, fetchText, USER_AGENT } from '../utils/source_helpers.js';

const HEADERS = { 'Accept': '*/*', 'Origin': 'https://lordflix.org', 'Referer': 'https://lordflix.org/', 'User-Agent': USER_AGENT };
const API = 'https://snowhouse.lordflix.club';
const ENC_API = 'https://enc-dec.app/api';

function solveChallengeSync(challenge) {
    for (let n = 0; n <= challenge.maxnumber; n++) {
        if (crypto.createHash('sha256').update(challenge.salt + n).digest('hex') === challenge.challenge) return n;
    }
    return null;
}

export async function getStream({ id, s, e }) {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return null;
    try {
        const infoData = await fetchJson(`https://api.themoviedb.org/3/${s ? 'tv' : 'movie'}/${id}?api_key=${tmdbKey}&append_to_response=external_ids`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
        const title = infoData.title || infoData.name;
        const imdbId = infoData.external_ids?.imdb_id;
        if (!title || !imdbId) return null;
        const year = (infoData.release_date || infoData.first_air_date || '').split('-')[0];
        const serversData = await fetchJson(`${API}/servers`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
        const servers = (serversData?.servers || []).map(sv => sv.name).filter(Boolean);
        if (!servers.length) return null;
        const settled = await Promise.allSettled(servers.map(async server => {
            const serverUrl = `${API}/?title=${encodeURIComponent(title)}&type=${s ? 'series' : 'movie'}&year=${year}&imdb=${imdbId}&tmdb=${id}&server=${server}${s ? `&season=${parseInt(s)}&episode=${parseInt(e)}` : ''}`;
            const encBridge = await fetchJson(`${ENC_API}/enc-lordflix?url=${encodeURIComponent(serverUrl)}`, { signal: AbortSignal.timeout(8000) });
            if (encBridge.status !== 200 || !encBridge.result?.url) throw new Error();
            const challenge = await fetchJson(`${API}/challenge`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
            const number = solveChallengeSync(challenge);
            if (number === null) throw new Error();
            const attest = Buffer.from(JSON.stringify({ algorithm: challenge.algorithm, challenge: challenge.challenge, number, salt: challenge.salt, signature: challenge.signature })).toString('base64');
            const remoteEncData = await fetchText(encBridge.result.url, { headers: { ...HEADERS, 'x-attest': attest }, signal: AbortSignal.timeout(8000) });
            const finalJson = await fetchJson(`${ENC_API}/dec-lordflix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: remoteEncData }), signal: AbortSignal.timeout(8000) });
            const topStream = finalJson?.result?.stream?.[0];
            if (topStream?.type === 'hls' && topStream.playlist) return { url: topStream.playlist, server, headers: HEADERS };
            throw new Error();
        }));
        const allUrls = [];
        for (const r of settled) if (r.status === 'fulfilled') allUrls.push(r.value);
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources() {
    try {
        const data = await fetchJson(`${API}/servers`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
        return (data?.servers || []).map(s => `Lordflix[${s.name}]`);
    } catch { return []; }
}