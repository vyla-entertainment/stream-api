const BASE = 'https://toustream.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const SKIP_VERIFY = true;

export const CDN_HEADERS = [
    {
        pattern: /toustream\.xyz/,
        headers: {
            'Referer': 'https://toustream.xyz/',
            'Origin': 'https://toustream.xyz',
            'User-Agent': UA,
        },
    },
];

async function fetchServers(id, s, e) {
    const isMovie = !s || !e;
    const pagePath = isMovie ? `/tou/movies/${id}` : `/tou/tv/${id}/${s}/${e}`;
    try {
        const res = await fetch(`${BASE}${pagePath}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const servers = [];
        const re = /<div[^>]+data-server="([^"]+)"[^>]*>.*?<span class="order-badge">(\d+)<\/span>/gs;
        let m;
        while ((m = re.exec(html)) !== null) {
            servers.push({ name: m[1], order: parseInt(m[2], 10) });
        }
        servers.sort((a, b) => a.order - b.order);
        return servers.length ? servers.map(s => s.name) : null;
    } catch {
        return null;
    }
}

async function tryServer(apiPath, sv, referer) {
    const res = await fetch(`${BASE}${apiPath}?server=${sv}`, {
        headers: { 'Referer': referer, 'Accept': 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (!data?.streamUrl) throw new Error('no streamUrl');
    const url = data.streamUrl.startsWith('http') ? data.streamUrl : `${BASE}${data.streamUrl}`;

    const streamHeaders = {
        'Referer': 'https://toustream.xyz/',
        'Origin': 'https://toustream.xyz',
        'User-Agent': UA,
    };
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) streamHeaders['Cookie'] = setCookie.split(';')[0].trim();

    return { url, headers: streamHeaders, isHls: data.isHls === true };
}

async function isUrlReachable(url, headers) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function getStream(id, s, e, clientIP, absoluteBase, audio) {
    const isMovie = !s || !e;
    const apiPath = isMovie ? `/tou/get-source/movie/${id}` : `/tou/get-source/tv/${id}/${s}/${e}`;
    const referer = `${BASE}/tou/${isMovie ? 'movies' : 'tv'}/${id}${isMovie ? '' : `/${s}/${e}`}`;

    const servers = await fetchServers(id, s, e);
    if (!servers) return null;

    const validServers = servers.filter(sv => /^[a-z]+$/i.test(sv));
    if (!validServers.length) return null;

    const results = await Promise.allSettled(validServers.map(sv => tryServer(apiPath, sv, referer)));

    const fulfilled = results
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter(Boolean);

    const hlsCandidates = fulfilled.filter(r => r.isHls);
    const rest = fulfilled.filter(r => !r.isHls);
    const ordered = [...hlsCandidates, ...rest];

    for (const candidate of ordered) {
        const { isHls, ...result } = candidate;
        const reachable = await isUrlReachable(result.url, result.headers);
        if (reachable) return { ...result, skipHlsCheck: true };
    }

    return null;
}