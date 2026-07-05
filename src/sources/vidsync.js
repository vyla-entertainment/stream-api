'use strict';

const VIDSYNC_HEADERS = {
    'Accept': '*/*',
    'Origin': 'https://vidsync.xyz',
    'Referer': 'https://vidsync.xyz/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
};

const VIDSYNC_API = 'https://vidsync.xyz';
const MULTI_DECRYPT_API = 'https://enc-dec.app/api';
const VIDSYNC_SERVERS = ['cinevault', 'cinedub', 'cinebox', 'cineflix', 'cinevip', 'cinecloud', 'cine4k'];

const DEBUG = true;

async function timedFetch(label, url, options = {}) {
    const start = Date.now();
    try {
        const res = await fetch(url, options);
        const text = await res.clone().text().catch(() => null);

        return res;
    } catch (err) {
        throw err;
    }
}

async function getTurnstileToken() {
    const url = `${MULTI_DECRYPT_API}/enc-vidsync`;

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            ...VIDSYNC_HEADERS,
            'Accept': 'application/json'
        }
    });

    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id: tmdbId, s: season, e: episode } = args;

    const mediaType = season ? 'tv' : 'movie';
    const seasonNum = season ? parseInt(season) : null;
    const episodeNum = episode ? parseInt(episode) : null;

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        return null;
    }

    let info;

    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';

        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbKey}`;

        const res = await timedFetch('tmdb_fetch', url, {
            headers: {
                'User-Agent': VIDSYNC_HEADERS['User-Agent']
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!res?.ok) {
            return null;
        }

        const data = await res.json();

        info = {
            title: data.title || data.name || '',
            year: (data.release_date || data.first_air_date || '').split('-')[0]
        };

    } catch (err) {
        return null;
    }

    if (!info?.title) {
        return null;
    }

    const titleEnc = encodeURIComponent(info.title).replace(/%20/g, '+');

    const settled = await Promise.allSettled(
        VIDSYNC_SERVERS.map(async (server) => {

            const token = await getTurnstileToken();

            if (!token) {
                return null;
            }

            let fetchUrl =
                `${VIDSYNC_API}/api/stream/fetch?title=${titleEnc}` +
                `&type=${mediaType}&releaseYear=${info.year || ''}` +
                `&mediaId=${tmdbId}&serverName=${server}`;

            if (mediaType === 'tv') {
                fetchUrl += `&season=${seasonNum}&episode=${episodeNum}`;
            }

            const streamRes = await timedFetch(`stream_fetch_${server}`, fetchUrl, {
                headers: {
                    ...VIDSYNC_HEADERS,
                    'X-Cf-Turnstile': token
                },
                signal: AbortSignal.timeout(8000)
            });

            if (!streamRes?.ok) {
                return null;
            }

            const encText = await streamRes.text();

            if (!encText) {
                return null;
            }

            const decRes = await timedFetch(`decrypt_${server}`, `${MULTI_DECRYPT_API}/dec-vidsync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encText, id: tmdbId }),
                signal: AbortSignal.timeout(8000)
            });

            if (!decRes?.ok) {
                return null;
            }

            const finalJson = await decRes.json().catch(() => null);

            if (!finalJson || finalJson.status !== 200 || finalJson.result?.error) {
                return null;
            }

            const streamList = finalJson.result?.stream;

            if (!Array.isArray(streamList) || streamList.length === 0) {
                return null;
            }

            const topStream = streamList[0];

            if (topStream?.type === 'hls' && topStream?.playlist) {

                return {
                    url: topStream.playlist,
                    server,
                    headers: VIDSYNC_HEADERS
                };
            }

            return null;
        })
    );

    const validResults = settled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    if (validResults.length === 0) return null;

    return {
        allUrls: validResults
    };
}

export async function getSources(args) {
    return VIDSYNC_SERVERS.map(s => `VidSync[${s}]`);
}