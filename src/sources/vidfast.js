'use strict';

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const ENC_API = "https://enc-dec.app/api";
const BASE = "https://vidfast.pro";

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    Referer: `${BASE}/`,
    'X-Requested-With': 'XMLHttpRequest',
};

const SERVER_TRY_ORDER = ['vEdge', 'vFast', 'Beta', 'Bravo'];

async function decrypt(text) {
    try {
        const res = await fetch(`${ENC_API}/dec-vidfast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || data?.result === undefined) return null;
        return data.result;
    } catch {
        return null;
    }
}

async function getEncryptedParts(tmdbId, type, s, e) {
    const pageUrl = s
        ? `${BASE}/tv/${tmdbId}/${s}/${e || 1}/`
        : `${BASE}/movie/${tmdbId}/`;

    let html;
    try {
        const res = await fetch(pageUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        html = await res.text();
    } catch {
        return null;
    }

    const match = html.match(/\\"en\\":\\"(.*?)\\"/);
    if (!match) return null;
    const text = match[1];

    try {
        const res = await fetch(`${ENC_API}/enc-vidfast?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.status !== 200 || !data?.result) return null;
        return data.result;
    } catch {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e } = args;
    try {
        const parts = await getEncryptedParts(id, s ? 'tv' : 'movie', s, e);
        if (!parts?.servers || !parts?.stream || !parts?.token) return null;

        const reqHeaders = { ...HEADERS, 'X-CSRF-Token': parts.token };

        let serversRes;
        try {
            serversRes = await fetch(parts.servers, { method: 'POST', headers: reqHeaders, signal: AbortSignal.timeout(10000) });
        } catch {
            return null;
        }
        if (!serversRes.ok) return null;
        const serversEncrypted = await serversRes.text();

        const serversDecrypted = await decrypt(serversEncrypted);
        if (!Array.isArray(serversDecrypted) || serversDecrypted.length === 0) return null;

        const ordered = [
            ...SERVER_TRY_ORDER.map(name => serversDecrypted.find(sv => sv.name === name)).filter(Boolean),
            ...serversDecrypted.filter(sv => !SERVER_TRY_ORDER.includes(sv.name)),
        ];

        for (const server of ordered.slice(0, 4)) {
            if (!server?.data) continue;

            let streamRes;
            try {
                streamRes = await fetch(`${parts.stream}/${server.data}`, { method: 'POST', headers: reqHeaders, signal: AbortSignal.timeout(10000) });
            } catch {
                continue;
            }
            if (!streamRes.ok) continue;
            const streamEncrypted = await streamRes.text();

            const streamDecrypted = await decrypt(streamEncrypted);
            if (!streamDecrypted?.url) continue;

            const isHls = streamDecrypted.url.includes('type=hls') || streamDecrypted.url.includes('.m3u8');

            return {
                allUrls: [{
                    url: streamDecrypted.url,
                    type: isHls ? 'hls' : 'mp4',
                    audio: 'sub',
                    server: `Vidfast-${server.name}`,
                    headers: streamDecrypted.noReferrer ? undefined : { Referer: `${BASE}/` },
                    skipProxy: false,
                    subtitles: Array.isArray(streamDecrypted.tracks)
                        ? streamDecrypted.tracks.map(t => ({ url: t.file, label: t.label }))
                        : [],
                }],
            };
        }

        return null;
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const stream = await getStream(args);
    if (!stream || !stream.allUrls) return [];
    return [...new Set(stream.allUrls.map(u => u.server))];
}