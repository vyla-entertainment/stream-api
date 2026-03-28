const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "public, max-age=300, s-maxage=900",
};

const PROVIDERS = [
    "vidlink",
    "moviedownloader",
    "vixsrc",
    "vidsrc",
    "uembed",
    "vidrock",
    "rgshows",
    "vidzee",
    "embed02",
];

function getSourceHeaders(url) {
    if (url.includes("hakunaymatata")) return { Referer: "https://lok-lok.cc/", Origin: "https://lok-lok.cc" };
    if (url.includes("tripplestream.online") || url.includes("hlmv-files")) return { Referer: "https://www.rgshows.ru/", Origin: "https://www.rgshows.ru" };
    if (url.includes("vixsrc.to") || url.includes("/playlist/")) return { Referer: "https://vixsrc.to/", Origin: "https://vixsrc.to" };
    if (url.includes("vdrk.site") || url.includes("vidrock")) return { Referer: "https://vidrock.net/", Origin: "https://vidrock.net" };
    if (url.includes("madvid3.xyz")) return { Referer: "https://madvid3.xyz/", Origin: "https://madvid3.xyz" };
    if (url.includes("goodstream.cc")) return { Referer: "https://goodstream.cc/", Origin: "https://goodstream.cc" };
    try { const o = new URL(url).origin; return { Referer: o + "/", Origin: o }; } catch { return {}; }
}

function unwrapEmbedUrl(url) {
    if (!url.includes("madvid3.xyz") && !url.includes("02pcembed.site")) return url;
    try {
        const u = new URL(url);
        const inner = u.searchParams.get("url");
        if (!inner) return url;
        const inner2 = new URL(decodeURIComponent(inner));
        const data = inner2.searchParams.get("data");
        if (!data) return url;
        const parsed = JSON.parse(decodeURIComponent(data));
        return parsed.url || url;
    } catch { return url; }
}

function dedupeKey(url) {
    const real = unwrapEmbedUrl(url);
    try {
        const u = new URL(real);
        if (/^tmstr\d+\./.test(u.hostname)) return "tmstr:" + u.pathname;
        if (u.hostname.includes("hakunaymatata")) {
            u.searchParams.delete("sign");
            u.searchParams.delete("t");
            return u.toString();
        }
        return real;
    } catch { return real; }
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams, origin } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    }

    const scrapeBase = `${origin}/api/scrape?type=movie&id=${encodeURIComponent(id)}`;

    const results = await Promise.allSettled(
        PROVIDERS.map(provider =>
            fetch(`${scrapeBase}&provider=${provider}`)
                .then(r => r.ok ? r.json() : { sources: [], subtitles: [] })
                .catch(() => ({ sources: [], subtitles: [] }))
        )
    );

    const allSources = [];
    const allSubtitles = [];
    const seenSourceKeys = new Set();
    const seenSubUrls = new Set();

    for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { sources = [], subtitles = [] } = result.value;

        for (const s of sources) {
            if (!s.url || s.url === "error" || s.url === "null" || !s.url.startsWith("http")) continue;
            const key = dedupeKey(s.url);
            if (seenSourceKeys.has(key)) continue;
            seenSourceKeys.add(key);
            const realUrl = unwrapEmbedUrl(s.url);
            const realHeaders = getSourceHeaders(realUrl);
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(realUrl)}&headers=${encodeURIComponent(btoa(JSON.stringify(realHeaders)))}`;
            allSources.push({ ...s, url: realUrl, vlc_url: proxyUrl });
        }

        for (const s of subtitles) {
            if (!s.url || !s.url.startsWith("http")) continue;
            if (seenSubUrls.has(s.url)) continue;
            seenSubUrls.add(s.url);
            allSubtitles.push(s);
        }
    }

    const QUALITY_PRIORITY = { "2160p": 9, "1440p": 8, "1080p": 7, "720p": 6, "480p": 5, "360p": 4, "240p": 3, hd: 2, auto: 1, unknown: 0 };
    const qualityRank = q => QUALITY_PRIORITY[(q ?? "").toLowerCase()] ?? 0;
    const sorted = [...allSources].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

    return Response.json(
        { success: sorted.length > 0, results_found: sorted.length, sources: sorted, subtitles: allSubtitles },
        { headers: CORS }
    );
}