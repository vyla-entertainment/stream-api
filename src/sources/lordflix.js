'use strict';

const LORDFLIX_HEADERS = {
    'Accept': '*/*',
    'Origin': 'https://lordflix.org',
    'Referer': 'https://lordflix.org/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
};

const LORDFLIX_API = 'https://snowhouse.lordflix.club';
const MULTI_DECRYPT_API = 'https://enc-dec.app/api';

async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solveChallenge() {
    const res = await fetch(`${LORDFLIX_API}/challenge`, { headers: LORDFLIX_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res?.ok) return null;
    const challenge = await res.json();

    let number = null;
    for (let n = 0; n <= challenge.maxnumber; n++) {
        const digest = await sha256Hex(`${challenge.salt}${n}`);
        if (digest === challenge.challenge) { number = n; break; }
    }
    if (number === null) return null;

    const payload = {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        number,
        salt: challenge.salt,
        signature: challenge.signature,
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function getServers() {
    try {
        const res = await fetch(`${LORDFLIX_API}/servers`, { headers: LORDFLIX_HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res?.ok) return [];
        const json = await res.json();
        return (json?.servers || []).map(s => s.name).filter(Boolean);
    } catch { return []; }
}

export async function getStream(args) {
    const { id: tmdbId, s: season, e: episode } = args;
    const mediaType = season ? 'tv' : 'movie';
    const seasonNum = season ? parseInt(season) : null;
    const episodeNum = episode ? parseInt(episode) : null;

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return null;

    let info;
    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await fetch(
            `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbKey}&append_to_response=external_ids`,
            { headers: { 'User-Agent': LORDFLIX_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(8000) }
        );
        if (!res?.ok) return null;
        const data = await res.json();
        info = {
            title: data.title || data.name || '',
            year: (data.release_date || data.first_air_date || '').split('-')[0],
            imdbId: (data.external_ids && data.external_ids.imdb_id) || ''
        };
    } catch (err) {
        return null;
    }

    if (!info.title || !info.imdbId) return null;

    const servers = await getServers();
    if (!servers.length) return null;

    const typeParam = mediaType === 'tv' ? 'series' : 'movie';
    const titleEnc = encodeURIComponent(info.title);

    const settled = await Promise.allSettled(servers.map(async (server) => {
        let serverUrl = `${LORDFLIX_API}/?title=${titleEnc}&type=${typeParam}&year=${info.year || ''}` +
            `&imdb=${info.imdbId}&tmdb=${tmdbId}&server=${server}`;

        if (mediaType === 'tv') {
            serverUrl += `&season=${seasonNum}&episode=${episodeNum}`;
        }

        const encBridgeRes = await fetch(`${MULTI_DECRYPT_API}/enc-lordflix?url=${encodeURIComponent(serverUrl)}`, { signal: AbortSignal.timeout(8000) });
        if (!encBridgeRes?.ok) return null;
        const encBridgeJson = await encBridgeRes.json();
        if (!encBridgeJson || encBridgeJson.status !== 200 || !encBridgeJson.result) return null;

        const { url: proxyEncUrl } = encBridgeJson.result;
        if (!proxyEncUrl) return null;

        const attest = await solveChallenge();
        if (!attest) return null;

        const remoteEncRes = await fetch(proxyEncUrl, {
            headers: { ...LORDFLIX_HEADERS, 'x-attest': attest },
            signal: AbortSignal.timeout(8000)
        });
        if (!remoteEncRes?.ok) return null;
        const remoteEncData = await remoteEncRes.text();

        const decRes = await fetch(`${MULTI_DECRYPT_API}/dec-lordflix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: remoteEncData }),
            signal: AbortSignal.timeout(8000)
        });
        if (!decRes?.ok) return null;
        const finalJson = await decRes.json();
        if (!finalJson || finalJson.status !== 200 || !finalJson.result || finalJson.result.error) return null;

        const streamList = finalJson.result.stream;
        if (!Array.isArray(streamList) || streamList.length === 0) return null;

        const topStream = streamList[0];
        if (topStream.type === 'hls' && topStream.playlist) {
            return {
                url: topStream.playlist,
                server,
                headers: LORDFLIX_HEADERS,
            };
        }
        return null;
    }));

    const validResults = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    if (validResults.length === 0) return null;

    return {
        allUrls: validResults
    };
}

export async function getSources(args) {
    const servers = await getServers();
    return servers.map(s => `Lordflix[${s}]`);
}