const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

function decodeUrl(url) {
    try {
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = url;
            url = decodeURIComponent(url);
            if (url === prev) break;
        }
    } catch { }
    return url;
}

function getHeaders(url) {
    const isHakunaya = url.includes("hakunaymatata");
    return {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
        ...(isHakunaya
            ? {
                Referer: "https://lok-lok.cc/",
                Origin: "https://lok-lok.cc",
            }
            : {}),
    };
}

async function fetchWithFallback(url, headers) {
    const tries = [
        () => fetch(url, { headers }),
        () => fetch(url, { headers: { ...headers, Referer: "" } }),
        () => fetch(url, { headers: { ...headers, Origin: "" } }),
    ];

    for (const fn of tries) {
        try {
            const res = await fn();
            if (res.ok) return res;
        } catch { }
    }

    throw new Error("All fetch attempts failed");
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
    const { searchParams } = new URL(request.url);

    let encodedUrl = searchParams.get("url");
    const filename = searchParams.get("filename") || "video.mp4";
    const info = searchParams.get("info");

    if (!encodedUrl) {
        return Response.json(
            { success: false, error: "Missing url param" },
            { status: 400, headers: CORS }
        );
    }

    const decoded = decodeUrl(encodedUrl);

    let finalUrl;
    try {
        finalUrl = new URL(decoded).href;
    } catch {
        return Response.json(
            { success: false, error: "Invalid URL" },
            { status: 400, headers: CORS }
        );
    }

    const headers = getHeaders(finalUrl);

    if (info === "1") {
        try {
            const head = await fetch(finalUrl, {
                method: "HEAD",
                headers,
            });

            return Response.json(
                {
                    success: head.ok,
                    status: head.status,
                    url: finalUrl,
                    content_type: head.headers.get("content-type"),
                    content_length: head.headers.get("content-length"),
                },
                { headers: CORS }
            );
        } catch (e) {
            return Response.json(
                { success: false, error: e.message },
                { headers: CORS }
            );
        }
    }

    let upstream;
    try {
        upstream = await fetchWithFallback(finalUrl, headers);
    } catch (e) {
        return Response.json(
            { success: false, error: e.message },
            { status: 502, headers: CORS }
        );
    }

    const contentType =
        upstream.headers.get("content-type") || "application/octet-stream";

    const isHLS = finalUrl.includes(".m3u8");

    if (isHLS) {
        const text = await upstream.text();

        const fixed = text
            .split("\n")
            .map((line) => {
                if (!line || line.startsWith("#")) return line;
                if (line.startsWith("http")) {
                    return `/api/download?url=${encodeURIComponent(line)}`;
                }
                const base = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
                return `/api/download?url=${encodeURIComponent(base + line)}`;
            })
            .join("\n");

        return new Response(fixed, {
            headers: {
                ...CORS,
                "Content-Type": "application/vnd.apple.mpegurl",
            },
        });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            ...CORS,
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "public, max-age=3600",
        },
    });
}