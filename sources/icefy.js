const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124';

export const KEY_HEADERS = {
    'User-Agent': UA,
    'Referer': 'https://icefy.top',
    'Origin': 'https://icefy.top',
};

export const BASES = [
    'https://abc-cdn4-optestre.icefy.top',
    'https://streams.icefy.top',
];

export const UA_EXPORT = UA;

async function fetchRaw(url, redirects = 0) {
    if (redirects > 5) throw new Error('icefy: redirect loop');
    const res = await fetch(url, {
        headers: KEY_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), url).href;
        return fetchRaw(next, redirects + 1);
    }
    return res;
}

async function fetchFromBase(id, s, e, base) {
    const endpoint = s
        ? `${base}/tv/${id}/${s}/${e || 1}`
        : `${base}/movie/${id}`;

    const res = await fetchRaw(endpoint);

    if (res.status === 429) throw new Error('icefy: rate limited');
    if (res.status >= 400) throw new Error(`icefy: cdn returned ${res.status}`);

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`icefy: expected JSON but got ${ct}`);

    const json = await res.json();
    if (!json?.stream) throw new Error('icefy: missing stream field');

    return json.stream;
}

export async function getStream(id, s, e, base) {
    if (base) {
        return fetchFromBase(id, s, e, base);
    }
    for (const b of BASES) {
        try {
            return await fetchFromBase(id, s, e, b);
        } catch {
            continue;
        }
    }
    throw new Error('icefy: all bases failed');
}

export async function proxyKey(keyUrl) {
    const upstream = await fetchRaw(keyUrl);
    if (upstream.status >= 400) throw new Error('icefy key: upstream ' + upstream.status);
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

export const VERIFY_HEADERS = null;

export async function proxyStream() {
    throw new Error('icefy: proxyStream should never be called');
}