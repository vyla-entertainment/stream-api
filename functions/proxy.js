const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams, origin } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) return new Response("Missing required query param: url", { status: 400, headers: CORS });

    const upHeaders = { "User-Agent": "Mozilla/5.0", Referer: "https://google.com" };
    const range = request.headers.get("range");
    if (range) upHeaders["Range"] = range;

    try {
        const upstream = await fetch(url, { headers: upHeaders });
        const contentType = upstream.headers.get("content-type") ?? "";

        if (contentType.includes("mpegurl") || url.endsWith(".m3u8")) {
            const text = await upstream.text();
            let rewritten = text.replace(/URI="([^"]+)"/g, (_, u) => {
                return `URI="${origin}/proxy?url=${encodeURIComponent(new URL(u, url).href)}"`;
            });
            rewritten = rewritten.split("\n").map((line) => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("#")) {
                    return `${origin}/proxy?url=${encodeURIComponent(new URL(trimmed, url).href)}`;
                }
                return line;
            }).join("\n");
            return new Response(rewritten, { status: upstream.status, headers: { ...CORS, "content-type": contentType } });
        }

        const respHeaders = { ...CORS };
        for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
            const val = upstream.headers.get(key);
            if (val) respHeaders[key] = val;
        }
        return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 502, headers: CORS });
    }
}