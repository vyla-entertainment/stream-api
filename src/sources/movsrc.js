const MOVSRC_API = 'https://api.dmvdriverseducation.org';

export const SKIP_VERIFY = true;

function extractFromProxyUrl(proxyUrl) {
    try {
        const u = new URL(proxyUrl);
        const dataParam = u.searchParams.get('data');
        if (dataParam) {
            const decoded = JSON.parse(decodeURIComponent(dataParam));
            return { url: decoded.url, headers: decoded.headers || null };
        }
    } catch { }
    return { url: proxyUrl, headers: null };
}

function rewriteUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
        const u = new URL(rawUrl);
        const path = u.pathname + u.search;
        return MOVSRC_API + path;
    } catch {
        if (rawUrl.startsWith('/')) return MOVSRC_API + rawUrl;
        return rawUrl;
    }
}

export async function getStream(id, s, e) {
    const url = s && e
        ? `${MOVSRC_API}/v1/tv/${id}/seasons/${s}/episodes/${e}`
        : `${MOVSRC_API}/v1/movies/${id}`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    const sources = data?.sources;
    if (!Array.isArray(sources) || !sources.length) return null;

    const order = ['1080p', '720p', '480p', '360p'];
    let best = null;
    for (const q of order) {
        best = sources.find(src => src.quality === q);
        if (best) break;
    }
    if (!best) best = sources[0];

    const rewritten = rewriteUrl(best.url);
    if (!rewritten) return null;

    const { url: innerUrl, headers: innerHeaders } = extractFromProxyUrl(rewritten);

    const result = {
        url: innerUrl,
        headers: innerHeaders,
    };

    const allUrls = sources
        .map(src => {
            const rw = rewriteUrl(src.url);
            if (!rw) return null;
            const { url: u, headers: h } = extractFromProxyUrl(rw);
            return { url: u, headers: h };
        })
        .filter(Boolean);

    if (allUrls.length > 1) {
        result.allUrls = allUrls;
    }

    return result;
}