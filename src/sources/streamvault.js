'use strict';

const BASE = "https://streamvaultsrc.click";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    try {
        const isTv = s != null && e != null;
        const url = isTv
            ? `${BASE}/api/embed-streams/tv/${id}/${s}/${e}`
            : `${BASE}/api/embed-streams/movie/${id}`;

        const res = await fetch(url, {
            headers: {
                "User-Agent": UA,
                "Referer": `${BASE}/`,
                "Origin": BASE,
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) return null;
        const data = await res.json();
        if (!data.streams || data.streams.length === 0) return null;

        const allUrls = data.streams
            .filter(stream => stream.url)
            .map(stream => ({
                url: stream.url,
                server: `StreamVault - ${stream.name || 'Server'}`,
                type: (stream.type === "hls" || stream.url.includes(".m3u8")) ? "hls" : "mp4",
                headers: {
                    "User-Agent": UA,
                    "Referer": `${BASE}/`,
                    "Origin": BASE
                },
            }));

        if (serverName && serverName !== 'all') {
            const filtered = allUrls.filter(u => u.server === serverName);
            return filtered.length > 0 ? { allUrls: filtered } : null;
        }

        return allUrls.length > 0 ? { allUrls } : null;
    } catch {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return [];
    return [...new Set(res.allUrls.map(u => u.server))];
}