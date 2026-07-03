'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const ENC_API = "https://enc-dec.app/api";
const BASE = "https://vidlink.pro";

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    Origin: BASE,
    Referer: `${BASE}/`,
};

async function encryptTmdbId(tmdbId) {
    try {
        const res = await fetch(`${ENC_API}/enc-vidlink?text=${tmdbId}`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || !data?.result) return null;
        return data.result;
    } catch {
        return null;
    }
}

function bestQualityUrl(qualities) {
    if (!qualities) return null;
    const order = ['1080', '720', '480', '360'];
    for (const q of order) {
        if (qualities[q]?.url) return { url: qualities[q].url, quality: q };
    }
    const keys = Object.keys(qualities);
    if (keys.length) return { url: qualities[keys[0]].url, quality: keys[0] };
    return null;
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const encrypted = await encryptTmdbId(id);
        if (!encrypted) return null;

        const type = s ? 'tv' : 'movie';
        const url = s
            ? `${BASE}/api/b/tv/${encrypted}/${s}/${e || 1}`
            : `${BASE}/api/b/movie/${encrypted}`;

        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const data = await res.json();

        const stream = data?.stream;
        if (!stream) return null;

        const allUrls = [];

        if (stream.type === 'file' && stream.qualities) {
            const picked = bestQualityUrl(stream.qualities);
            if (picked) {
                allUrls.push({
                    url: picked.url,
                    type: 'mp4',
                    audio: 'sub',
                    server: 'Vidlink',
                    headers: undefined,
                    skipHlsCheck: true,
                    skipCache: true,
                });
            }
        } else if (stream.playlist) {
            allUrls.push({
                url: stream.playlist,
                type: 'hls',
                audio: 'sub',
                server: 'Vidlink',
                headers: undefined,
                skipHlsCheck: true,
                skipCache: true,
            });
        }

        if (allUrls.length === 0) return null;
        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}