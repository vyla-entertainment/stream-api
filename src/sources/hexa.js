'use strict';

import crypto from 'node:crypto';

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const ENC_API = "https://enc-dec.app/api";
const DOMAINS = ['hexa.su', 'flixer.su'];

function buildHeaders(domain, apiKey, capToken) {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        Referer: `https://${domain}/`,
        Accept: 'text/plain',
        'X-Fingerprint-Lite': 'e9136c41504646444',
        'X-Api-Key': apiKey,
        'X-Cap-Token': capToken,
    };
}

async function getChallengeToken() {
    try {
        const res = await fetch(`${ENC_API}/enc-hexa`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || !data?.result?.token) return null;
        return data.result.token;
    } catch {
        return null;
    }
}

async function decrypt(text, key) {
    try {
        const res = await fetch(`${ENC_API}/dec-hexa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, key }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || !data?.result) return null;
        return data.result;
    } catch {
        return null;
    }
}

async function fetchFromDomain(domain, apiKey, capToken, type, tmdbId, s, e) {
    const url = s
        ? `https://theemoviedb.${domain}/api/tmdb/tv/${tmdbId}/season/${s}/episode/${e || 1}/images`
        : `https://theemoviedb.${domain}/api/tmdb/movie/${tmdbId}/images`;

    try {
        const res = await fetch(url, { headers: buildHeaders(domain, apiKey, capToken), signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const encrypted = await res.text();
        if (!encrypted) return null;
        return await decrypt(encrypted, apiKey);
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const capToken = await getChallengeToken();
        if (!capToken) return null;

        let decrypted = null;
        for (const domain of DOMAINS) {
            decrypted = await fetchFromDomain(domain, apiKey, capToken, s ? 'tv' : 'movie', id, s, e);
            if (decrypted?.sources?.length) break;
        }

        if (!decrypted?.sources?.length) return null;

        const allUrls = decrypted.sources
            .filter(src => src.url)
            .map(src => {
                const isHls = src.url.includes('.m3u8');
                return {
                    url: src.url,
                    type: isHls ? 'hls' : 'mp4',
                    audio: 'sub',
                    server: `Hexa-${src.server || 'unknown'}`,
                    headers: undefined,
                    skipProxy: false,
                };
            });

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