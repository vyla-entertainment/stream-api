const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestHead({ request }) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) return new Response(null, { status: 400, headers: CORS });
    try {
        const upstream = await fetch(url, { method: 'HEAD', headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://madvid3.xyz/", "Origin": "https://madvid3.xyz" } });
        return new Response(null, { status: upstream.ok ? 200 : upstream.status, headers: CORS });
    } catch {
        return new Response(null, { status: 502, headers: CORS });
    }
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) return Response.json({ error: "Missing url" }, { status: 400, headers: CORS });

    let upstream;
    try {
        upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
            }
        });
    } catch (e) {
        return Response.json({ error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ error: "Upstream returned " + upstream.status }, { status: 502, headers: CORS });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";

    if (!contentType.includes("video") && !contentType.includes("octet")) {
        return Response.json({ error: "Upstream returned non-video content: " + contentType }, { status: 502, headers: CORS });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": "video/mp4",
            "Content-Disposition": 'attachment; filename="vyla-download.mp4"',
            "Content-Length": upstream.headers.get("content-length") || "",
        }
    });
}