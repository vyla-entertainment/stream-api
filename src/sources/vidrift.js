'use strict';

const BASE = "https://vidrift.in";

const DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": `${BASE}/`,
    "Origin": BASE,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"
};

let cachedSecret = null;
let secretTimestamp = 0;
const SECRET_TTL_MS = 5 * 60 * 1000;

async function fetchVrSecret() {
    const now = Date.now();
    if (cachedSecret && (now - secretTimestamp) < SECRET_TTL_MS) {
        return cachedSecret;
    }

    try {
        const embedUrl = `${BASE}/embed/movie/550?primarycolor=7ef7c4`;
        const res = await fetch(embedUrl, {
            headers: {
                ...DEFAULT_HEADERS,
                "Accept": "text/html",
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) throw new Error(`Embed fetch failed: ${res.status}`);

        const html = await res.text();

        const patterns = [
            /const\s+VR_SECRET\s*=\s*['"`]([^'"`]+)['"`]/,
            /var\s+VR_SECRET\s*=\s*['"`]([^'"`]+)['"`]/,
            /VR_SECRET\s*=\s*['"`]([^'"`]+)['"`]/,
            /vr_sec_[a-zA-Z0-9_]+/,
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                cachedSecret = match[1] || match[0];
                secretTimestamp = now;
                console.log(`[VidRift] Extracted VR_SECRET: ${cachedSecret}`);
                return cachedSecret;
            }
        }

        throw new Error('VR_SECRET not found in embed page');
    } catch (err) {
        cachedSecret = 'vr_sec_v2_9kL8mN4qR2tX';
        secretTimestamp = now;
        return cachedSecret;
    }
}

function vrHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36).padStart(8, '0');
}

async function vrToken() {
    const secret = await fetchVrSecret();
    const t = Math.floor(Date.now() / 1000);
    return t + '-' + vrHash(t + ':' + secret);
}

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const type = s != null && e != null ? "tv" : "movie";

    const t = await vrToken();

    const endpoint = type === "tv"
        ? `${BASE}/api/source/tv/${id}/${s}/${e}?_t=${t}&source=embed`
        : `${BASE}/api/source/movie/${id}?_t=${t}&source=embed`;

    try {
        const res = await fetch(endpoint, {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;

        const data = await res.json();

        if (!data.success || !Array.isArray(data.streams) || !data.streams.length) {
            return null;
        }

        const allUrls = data.streams.map(stream => ({
            url: stream.proxyUrl.startsWith("http")
                ? stream.proxyUrl
                : `${BASE}${stream.proxyUrl}`,
            server: `VidRift - Server ${stream.index + 1}`,
            type: "hls",
            headers: DEFAULT_HEADERS
        }));

        if (serverName && serverName !== "all") {
            const filtered = allUrls.filter(x => x.server === serverName);
            return filtered.length ? { allUrls: filtered } : null;
        }

        return { allUrls };
    } catch {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res?.allUrls) return ["VidRift - Server 1"];
    return res.allUrls.map(x => x.server);
}