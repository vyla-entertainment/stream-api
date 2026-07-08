'use strict';

const BASE = "https://vidrift.in";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function getStream(args) {
    const { id, s, e, server: serverName } = args;
    const type = s != null && e != null ? "tv" : "movie";

    const endpoint = type === "tv"
        ? `${BASE}/api/source/tv/${id}/${s}/${e}?source=embed`
        : `${BASE}/api/source/movie/${id}?source=embed`;

    try {
        const res = await fetch(endpoint, {
            headers: {
                "User-Agent": UA,
                "Referer": BASE + "/",
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;
        const data = await res.json();

        if (!data.success || !data.streams || !data.streams.length) {
            return null;
        }

        const allUrls = data.streams.map(stream => {
            const finalUrl = stream.proxyUrl.startsWith('http')
                ? stream.proxyUrl
                : `${BASE}${stream.proxyUrl}`;

            return {
                url: finalUrl,
                server: `VidRift - Server ${stream.index + 1}`,
                type: "hls",
                headers: {
                    "User-Agent": UA,
                    "Referer": BASE + "/",
                    "Origin": BASE
                },
            };
        });

        if (serverName && serverName !== 'all') {
            const filtered = allUrls.filter(u => u.server === serverName);
            return filtered.length > 0 ? { allUrls: filtered } : null;
        }

        return { allUrls };
    } catch (err) {
        return null;
    }
}

export async function getSources(args) {
    const res = await getStream(args);
    if (!res || !res.allUrls) return ["VidRift - Server 1"];
    return res.allUrls.map(u => u.server);
}