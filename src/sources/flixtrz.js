export const SKIP_VERIFY = true;
export const MULTI_URL = true;

const BASE = 'https://flixtrz.com/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

let cachedProviders = null;
let cacheTs = 0;
const PROVIDER_CACHE_TTL = 60 * 60 * 1000;

async function fetchProviders() {
    if (cachedProviders && Date.now() - cacheTs < PROVIDER_CACHE_TTL) {
        return cachedProviders;
    }
    const res = await fetch(`${BASE}/providers`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const list = await res.json();
    cachedProviders = list.map(p => p.id);
    cacheTs = Date.now();
    return cachedProviders;
}

function extractStream(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return { url: raw, headers: {} };
    const url = raw.url || raw.stream || raw.src || raw.link || null;
    if (!url) return null;
    const headers = raw.headers || {};
    return { url, headers };
}

function collectUrls(data) {
    const out = [];
    if (!data) return out;

    const candidates = [];

    if (Array.isArray(data.sources)) candidates.push(...data.sources);
    if (Array.isArray(data.streams)) candidates.push(...data.streams);
    if (data.url) candidates.push(data);
    if (data.stream) candidates.push(data);

    for (const c of candidates) {
        const extracted = extractStream(c);
        if (!extracted?.url?.startsWith('http')) continue;
        out.push({
            url: extracted.url,
            headers: Object.keys(extracted.headers).length ? extracted.headers : undefined,
            quality: c.quality || c.resolution || 'auto',
        });
    }
    return out;
}

export async function getStream(id, s, e) {
    const isTV = s && e;
    const allUrls = [];

    const providers = await fetchProviders();
    if (!providers || providers.length === 0) return null;

    await Promise.allSettled(
        providers.map(async (providerId) => {
            try {
                const url = isTV
                    ? `${BASE}/tv/${id}/seasons/${s}/episodes/${e}/by/${providerId}`
                    : `${BASE}/movies/${id}/by/${providerId}`;
                const res = await fetch(url, {
                    headers: { 'User-Agent': UA },
                    signal: AbortSignal.timeout(10000),
                });
                if (!res.ok) return;
                const data = await res.json();
                for (const src of collectUrls(data)) {
                    allUrls.push(src);
                }
            } catch { }
        })
    );

    if (allUrls.length === 0) return null;

    return {
        url: allUrls[0].url,
        headers: allUrls[0].headers,
        allUrls,
    };
}