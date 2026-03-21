import { scrape } from "../../_lib/scraper.js";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "public, max-age=300, s-maxage=900",
};

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

function deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(s => {
        const real = unwrapEmbedUrl(s.url);
        if (!real || real === "error" || real === "null" || !real.startsWith("http")) return false;
        const key = dedupeKey(s.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return Response.json({ success: false, error: "Missing id" }, { status: 400, headers: CORS });
    }

    const { sources, subtitles } = await scrape("movie", id);

    const deduped = deduplicateSources(sources);

    const mapped = deduped.map(s => {
        const realUrl = unwrapEmbedUrl(s.url);
        const realHeaders = getSourceHeaders(realUrl);
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(realUrl)}&headers=${encodeURIComponent(btoa(JSON.stringify(realHeaders)))}`;
        return { ...s, url: realUrl, vlc_url: proxyUrl };
    });

    return Response.json(
        { success: mapped.length > 0, results_found: mapped.length, sources: mapped, subtitles },
        { headers: CORS }
    );
}