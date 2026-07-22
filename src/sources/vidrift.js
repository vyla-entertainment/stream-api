'use strict';

const BASE = "https://embed.vidrift.in";

const DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": `${BASE}/`,
    "Origin": BASE,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
};

function decodeStreams(encodedStr) {
    try {
        const base64Str = encodedStr.replace(/-/g, '+').replace(/_/g, '/');

        const binaryStr = typeof atob === 'function'
            ? atob(base64Str)
            : Buffer.from(base64Str, 'base64').toString('binary');

        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }

        const key = bytes[0];
        let decodedStr = '';
        for (let i = 1; i < bytes.length; i++) {
            decodedStr += String.fromCharCode(bytes[i] ^ key);
        }

        return JSON.parse(decodedStr);
    } catch (e) {
        return [];
    }
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const type = s != null && e != null ? "tv" : "movie";

    const endpoint = type === "tv"
        ? `${BASE}/embed/tv/${id}/${s}/${e}`
        : `${BASE}/embed/movie/${id}`;

    try {
        const res = await fetch(endpoint, {
            headers: {
                ...DEFAULT_HEADERS,
                "Accept": "text/html",
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;

        const html = await res.text();

        const match = html.match(/var\s+_s\s*=\s*['"]([^'"]+)['"]/);
        if (!match) return null;

        const encodedStreams = match[1];
        const streamsData = decodeStreams(encodedStreams);

        if (!Array.isArray(streamsData) || !streamsData.length) {
            return null;
        }

        const allUrls = streamsData.map((stream, index) => ({
            url: stream.url.startsWith("http")
                ? stream.url
                : `${BASE}${stream.url}`,
            server: stream.label || `VidRift - Server ${index + 1}`,
            type: "hls",
            headers: DEFAULT_HEADERS
        }));

        if (serverName && serverName !== "all") {
            const filtered = allUrls.filter(x => x.server === serverName);
            return filtered.length ? { allUrls: filtered } : null;
        }

        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res?.allUrls) return ["VidRift - Server 1"];
    return res.allUrls.map(x => x.server);
}