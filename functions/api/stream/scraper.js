const EMBED_BASE = "https://02pcembed.site";
const HLS_PROXY = "https://madvid3.xyz/api/hls-proxy?url=";

function rewriteUrl(url) {
    if (!url) return null;
    if (url.startsWith("/")) url = EMBED_BASE + url;
    if (url.includes("02pcembed.site/v1/proxy")) {
        return HLS_PROXY + encodeURIComponent(url);
    }
    return url;
}

function isErrorSource(url) {
    try {
        const inner = JSON.parse(decodeURIComponent(decodeURIComponent(url.replace(HLS_PROXY, ""))));
        return inner?.url === "error";
    } catch {
        return false;
    }
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1") {
    const endpoint = mediaType === "movie"
        ? `/v1/movies/${tmdbId}`
        : `/v1/tv/${tmdbId}/seasons/${season}/episodes/${episode}`;

    let data;
    try {
        const res = await fetch(`${EMBED_BASE}${endpoint}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
                "Sec-Ch-Ua": '"Chromium";v="146", "Microsoft Edge";v="146", "Not/A)Brand";v="24"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
            },
        });
        if (!res.ok) return { sources: [], subtitles: [] };
        data = await res.json();
    } catch {
        return { sources: [], subtitles: [] };
    }

    const seen = new Set();
    const sources = [];

    for (const source of data.sources ?? []) {
        const url = rewriteUrl(source.url);
        if (!url || seen.has(url) || isErrorSource(url)) continue;
        seen.add(url);
        sources.push({ url, quality: source.quality ?? "Auto", type: source.type ?? "hls" });
    }

    const subtitles = (data.subtitles ?? []).map(sub => ({
        url: rewriteUrl(sub.url),
        label: sub.label,
        format: sub.format ?? "vtt",
    })).filter(s => s.url);

    return { sources, subtitles };
}