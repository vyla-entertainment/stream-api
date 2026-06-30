const VAPOR_BASE = 'https://api.dmvdriverseducation.org';
const VAPOR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchVapor(path) {
    const res = await fetch(`${VAPOR_BASE}${path}`, {
        headers: { 'User-Agent': VAPOR_UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return res.json();
}

function fixUrl(u) {
    return u?.replace('http://localhost:3030', VAPOR_BASE) ?? null;
}

function normalizeSources(data) {
    if (!data) return null;
    const seen = new Set();
    const urls = [];

    if (Array.isArray(data.sources) && data.sources.length > 0) {
        for (const src of data.sources) {
            if (!src?.url) continue;
            const fixed = fixUrl(src.url);
            if (!fixed || seen.has(fixed)) continue;
            seen.add(fixed);
            urls.push({ url: fixed });
        }
    }

    if (urls.length === 0) {
        const streamUrl = data.url || data.stream || data.source || data.file
            || (data.data && data.data.url);
        if (streamUrl) {
            const fixed = fixUrl(streamUrl);
            if (fixed) urls.push({ url: fixed });
        }
    }

    if (urls.length === 0) return null;
    return { url: urls[0].url, allUrls: urls };
}

export async function getStream({ id, s, e }) {
    const path = s && e
        ? `/v1/tv/${id}/seasons/${s}/episodes/${e}`
        : `/v1/movies/${id}`;
    const data = await fetchVapor(path);
    return normalizeSources(data);
}
