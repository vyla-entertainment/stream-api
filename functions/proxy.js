const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

async function decryptToken(token, secret) {
    const raw = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const iv = raw.slice(0, 16);
    const cipher = raw.slice(16);
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
        { name: "AES-CBC" },
        false,
        ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
    return new TextDecoder().decode(plain);
}

async function encryptUrl(url, secret) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32)),
        { name: "AES-CBC" },
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(url));
    const combined = new Uint8Array(16 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 16);
    return btoa(String.fromCharCode(...combined)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
    const { searchParams, origin } = new URL(request.url);
    const token = searchParams.get("t");
    const secret = env.PROXY_SECRET;

    if (!token) return new Response("Bad request", { status: 400, headers: CORS });
    if (!secret) return new Response("Server misconfigured", { status: 500, headers: CORS });

    let url;
    try {
        url = await decryptToken(token, secret);
    } catch {
        return new Response("Invalid token", { status: 403, headers: CORS });
    }

    const upHeaders = { "User-Agent": "Mozilla/5.0", Referer: "https://google.com" };
    const range = request.headers.get("range");
    if (range) upHeaders["Range"] = range;

    try {
        const upstream = await fetch(url, { headers: upHeaders });
        const contentType = upstream.headers.get("content-type") ?? "";

        if (contentType.includes("mpegurl") || url.endsWith(".m3u8")) {
            const text = await upstream.text();
            let rewritten = text.replace(/URI="([^"]+)"/g, async (_, u) => {
                const abs = new URL(u, url).href;
                return `URI="${origin}/proxy?t=${await encryptUrl(abs, secret)}"`;
            });

            const lines = text.split("\n");
            const rewrittenLines = await Promise.all(
                lines.map(async (line) => {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith("#")) {
                        const abs = new URL(trimmed, url).href;
                        return `${origin}/proxy?t=${await encryptUrl(abs, secret)}`;
                    }
                    return line;
                })
            );

            let manifest = rewrittenLines.join("\n");
            manifest = await (async () => {
                const uriMatches = [...manifest.matchAll(/URI="([^"]+)"/g)];
                for (const match of uriMatches) {
                    const abs = new URL(match[1], url).href;
                    const enc = await encryptUrl(abs, secret);
                    manifest = manifest.replace(match[0], `URI="${origin}/proxy?t=${enc}"`);
                }
                return manifest;
            })();

            return new Response(manifest, {
                status: upstream.status,
                headers: { ...CORS, "content-type": contentType },
            });
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