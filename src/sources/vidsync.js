'use strict';

import { getTmdbInfo } from '../utils/helpers.js';

const API_BASE = "https://enc-dec.app/api";
const DOMAIN = "https://vidsync.xyz";

const HEADERS = {
    "Accept": "*/*",
    "Origin": DOMAIN,
    "Referer": DOMAIN + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
};

const SERVERS = ["cinevault", "cinedub", "cinebox", "cineflix", "cinevip", "cinecloud", "cine4k"];

async function fetchServerStream(srv, title, type, year, id, s, e, turnstileToken) {
    try {
        const encTitle = encodeURIComponent(title).replace(/%20/g, '+');
        
        let url = `${DOMAIN}/api/stream/fetch?title=${encTitle}&type=${type}&releaseYear=${year}&mediaId=${id}&serverName=${srv}`;
        if (type === 'tv') {
            url += `&season=${s}&episode=${e}`;
        }

        const res = await fetch(url, {
            headers: { ...HEADERS, "X-Cf-Turnstile": turnstileToken },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;
        const encryptedText = await res.text();

        const decRes = await fetch(`${API_BASE}/dec-vidsync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: encryptedText, id: id.toString() }),
            signal: AbortSignal.timeout(10000)
        });

        const decJson = await decRes.json();
        if (decJson.status !== 200 || !decJson.result) return null;

        const streams = Array.isArray(decJson.result) ? decJson.result : [decJson.result];
        
        return streams.map(stream => ({
            url: stream.url || stream.file,
            server: `VidSync - ${srv}`,
            quality: stream.quality || "Auto",
            type: (stream.url || stream.file || "").includes(".m3u8") ? "hls" : "mp4",
            headers: { ...HEADERS, "Origin": DOMAIN },
            skipProxy: false,
            skipVerify: true,
            skipHlsCheck: true
        }));
    } catch (err) {
        return null;
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverParam } = args;
    try {
        const isTv = s != null && e != null;
        const type = isTv ? 'tv' : 'movie';

        const info = await getTmdbInfo(id, type);
        if (!info || !info.titles?.length) return null;

        const turnstileRes = await fetch(`${API_BASE}/enc-vidsync`, { signal: AbortSignal.timeout(5000) });
        const turnstileJson = await turnstileRes.json();
        if (turnstileJson.status !== 200 || !turnstileJson.result?.token) return null;
        const turnstileToken = turnstileJson.result.token;

        let targets = SERVERS;
        if (serverParam && serverParam !== 'all') {
            const clean = serverParam.replace('VidSync - ', '');
            targets = SERVERS.includes(clean) ? [clean] : SERVERS;
        }

        const settled = await Promise.allSettled(
            targets.map(srv => fetchServerStream(srv, info.titles[0], type, info.year, id, s, e, turnstileToken))
        );

        const allUrls = settled
            .filter(r => r.status === 'fulfilled' && r.value)
            .flatMap(r => r.value);

        if (allUrls.length === 0) return null;

        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    return SERVERS.map(s => `VidSync - ${s}`);
}