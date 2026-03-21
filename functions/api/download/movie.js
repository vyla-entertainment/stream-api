const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

const PROVIDERS = [
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

function buildFfmpegCommand(url, headers, filename) {
    const safe = (filename || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    const parts = [
        headers.Referer ? `Referer: ${headers.Referer}\\r\\n` : "",
        headers.Origin ? `Origin: ${headers.Origin}\\r\\n` : "",
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36\\r\\n`,
    ].filter(Boolean).join("");
    return `ffmpeg -headers "${parts}" -i "${url}" -c copy -bsf:a aac_adtstoasc ${safe}`;
}

function buildDownloadUrl(url, headers, filename) {
    if (url.includes("hakunaymatata")) {
        return "https://02movie.com/api/download?url=" + encodeURIComponent(url) + "&filename=" + encodeURIComponent(filename);
    }
    const h = Object.keys(headers).length
        ? "&headers=" + encodeURIComponent(btoa(JSON.stringify(headers)))
        : "";
    return `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}${h}`;
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

function enrichSource(s, index, prefix) {
    const realUrl = unwrapEmbedUrl(s.url);
    const isHLS = s.type === "hls" || realUrl.includes(".m3u8") || realUrl.includes("/playlist/");
    const realHeaders = getSourceHeaders(realUrl);
    const filename = `${prefix}_${s.quality || "unknown"}_${index + 1}.mp4`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(realUrl)}&headers=${encodeURIComponent(btoa(JSON.stringify(realHeaders)))}`;
    return {
        provider: s.provider,
        quality: s.quality || "unknown",
        type: s.type,
        url: realUrl,
        is_hls: isHLS,
        referer: realHeaders.Referer || null,
        ffmpeg_command: buildFfmpegCommand(realUrl, realHeaders, filename),
        download_url: isHLS ? null : buildDownloadUrl(realUrl, realHeaders, filename),
        vlc_url: proxyUrl,
    };
}

function normalizeVixsrcSubtitle(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete("token");
        u.searchParams.delete("expires");
        u.searchParams.delete("edge");
        return u.toString();
    } catch { return url; }
}

function unwrapSubtitleUrl(url) {
    if (!url.includes("madvid3.xyz") && !url.includes("02pcembed.site")) {
        if (url.includes("vixsrc.to") && url.includes("type=subtitle")) {
            return normalizeVixsrcSubtitle(url);
        }
        return url;
    }
    try {
        const u = new URL(url);
        const inner = u.searchParams.get("url");
        if (!inner) return url;
        const inner2 = new URL(decodeURIComponent(inner));
        const data = inner2.searchParams.get("data");
        if (!data) return url;
        const parsed = JSON.parse(decodeURIComponent(data));
        const realUrl = parsed.url || url;
        if (realUrl.includes("vixsrc.to") && realUrl.includes("type=subtitle")) {
            return normalizeVixsrcSubtitle(realUrl);
        }
        return realUrl;
    } catch { return url; }
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
            allSources.push(s);
        }

        for (const s of subtitles) {
            if (!s.url || !s.url.startsWith("http")) continue;
            const real = unwrapSubtitleUrl(s.url);
            if (seenSubUrls.has(real)) continue;
            seenSubUrls.add(real);
            allSubtitles.push(s);
        }
    }

    const QUALITY_PRIORITY = { "2160p": 9, "1440p": 8, "1080p": 7, "720p": 6, "480p": 5, "360p": 4, "240p": 3, hd: 2, auto: 1, unknown: 0 };
    const qualityRank = q => QUALITY_PRIORITY[(q ?? "").toLowerCase()] ?? 0;
    const sorted = [...allSources].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

    const results2 = sorted.map((s, i) => enrichSource(s, i, id));

    return new Response(JSON.stringify({
        success: results2.length > 0,
        tmdb_id: id,
        results_found: results2.length,
        sources: results2,
        subtitles: allSubtitles,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
}