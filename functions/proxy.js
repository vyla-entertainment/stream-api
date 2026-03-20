const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestHead() {
    return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams, pathname } = new URL(request.url);

    if (pathname.endsWith("/download")) {
        return handleDownload(searchParams);
    }

    return handleProxy(searchParams);
}

async function handleDownload(searchParams) {
    const encodedUrl = searchParams.get("url");
    const filename = searchParams.get("filename") || "download.mp4";

    if (!encodedUrl) {
        return Response.json({ error: "Missing url" }, { status: 400, headers: CORS });
    }

    const decoded = decodeURIComponent(encodedUrl);

    let upstream;
    try {
        upstream = await fetch(decoded, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://02movie.com/",
                "Origin": "https://02movie.com",
            },
            cf: {
                cacheTtl: 3600,
                cacheEverything: true
            }
        });
    } catch (e) {
        return Response.json({ error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ error: "Upstream returned " + upstream.status }, { status: 502, headers: CORS });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length") || "";

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            ...(contentLength && { "Content-Length": contentLength }),
            "Cache-Control": "public, max-age=3600"
        },
    });
}

async function handleProxy(searchParams) {
    const url = searchParams.get("url");

    if (!url) {
        return Response.json({ error: "Missing url" }, { status: 400, headers: CORS });
    }

    const headersParam = searchParams.get("headers");
    let extraHeaders = {};
    if (headersParam) {
        try {
            extraHeaders = JSON.parse(atob(headersParam));
        } catch {
            try {
                extraHeaders = JSON.parse(decodeURIComponent(headersParam));
            } catch {
                extraHeaders = {};
            }
        }
    }

    let upstream;
    try {
        upstream = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://madvid3.xyz/",
                "Origin": "https://madvid3.xyz",
                ...extraHeaders,
            },
            cf: {
                cacheTtl: 3600,
                cacheEverything: true
            }
        });
    } catch (e) {
        return Response.json({ error: "Fetch failed: " + e.message }, { status: 502, headers: CORS });
    }

    if (!upstream.ok) {
        return Response.json({ error: "Upstream returned " + upstream.status }, { status: 502, headers: CORS });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": contentType,
            "Content-Disposition": 'attachment; filename="vyla-download.mp4"',
            "Content-Length": upstream.headers.get("content-length") || "",
            "Cache-Control": "public, max-age=3600"
        },
    });
}
