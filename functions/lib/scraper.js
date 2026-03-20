const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BASE = "https://player.vidzee.wtf";

async function getJson(url, headers = {}) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, ...headers },
        });
        return res.json();
    } catch {
        return null;
    }
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function decryptLink(linkB64) {
    try {
        const raw = atob(linkB64);
        const [ivB64, cipherB64] = raw.split(":");
        const iv = b64ToBytes(ivB64);
        const cipher = b64ToBytes(cipherB64);
        const keyStr = atob("YWxvb2tlcGFyYXRoZXdpdGhsYXNzaQ==").padEnd(32, "\0");
        const keyBytes = new TextEncoder().encode(keyStr);
        const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
        const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher);
        return new TextDecoder().decode(plain).replace(/\0/g, "").trim();
    } catch {
        return null;
    }
}

async function fetchServer(mediaType, tmdbId, season, episode, sr) {
    const url = `${BASE}/api/server?id=${tmdbId}&sr=${sr}` +
        (mediaType === "tv" ? `&ss=${season}&ep=${episode}` : "");
    return getJson(url, { Referer: BASE });
}

async function verify(url) {
    try {
        const res = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": UA, Referer: "https://google.com" },
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
        });
        return [200, 206, 302].includes(res.status);
    } catch {
        return false;
    }
}

export async function scrape(mediaType, tmdbId, season = "1", episode = "1") {
    const results = await Promise.allSettled(
        Array.from({ length: 14 }, (_, i) => fetchServer(mediaType, tmdbId, season, episode, i + 1))
    );

    const seen = new Set();
    const sources = [];

    await Promise.allSettled(results.map(async (r) => {
        if (r.status !== "fulfilled" || !r.value?.url) return;
        await Promise.allSettled(r.value.url.map(async (stream) => {
            const dec = await decryptLink(stream?.link ?? "");
            if (!dec?.startsWith("http") || seen.has(dec)) return;
            seen.add(dec);
            if (await verify(dec)) {
                sources.push({ url: dec, quality: "Auto", type: "hls" });
            }
        }));
    }));

    return sources;
}

export async function scrapeStream(mediaType, tmdbId, season = "1", episode = "1", onSource) {
    const seen = new Set();

    await Promise.allSettled(
        Array.from({ length: 14 }, async (_, i) => {
            const data = await fetchServer(mediaType, tmdbId, season, episode, i + 1);
            if (!data?.url) return;
            await Promise.allSettled(data.url.map(async (stream) => {
                const dec = await decryptLink(stream?.link ?? "");
                if (!dec?.startsWith("http") || seen.has(dec)) return;
                seen.add(dec);
                if (await verify(dec)) {
                    await onSource({ url: dec, quality: "Auto", type: "hls" });
                }
            }));
        })
    );
}