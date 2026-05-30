const BASE_URL = 'https://www.fsonic.net';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

export const SKIP_VERIFY = true;
export const MULTI_URL = true;

async function fetchImdbId(tmdbId) {
    const k = process.env.TMDB_API_KEY;
    if (!k) return null;
    try {
        const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${k}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const d = await res.json();
        return d.imdb_id || null;
    } catch {
        return null;
    }
}

function pickBestUrls(json) {
    const allGroups = [];

    const sources = json.data?.file?.sources ?? [];
    if (sources.length) allGroups.push(sources);

    const alternatives = json.data?.file?.alternatives ?? [];
    for (const group of alternatives) {
        if (group?.length) allGroups.push(group);
    }

    const urls = [];
    for (const group of allGroups) {
        const sorted = [...group]
            .filter(s => s?.src)
            .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        if (sorted.length) {
            const best = sorted[0];
            const url = best.src.startsWith('http') ? best.src : `https://fsharetv.co${best.src}`;
            urls.push(url);
        }
    }

    return [...new Set(urls)];
}

async function findWatchSlug(imdbId, title, year) {
    try {
        const query = encodeURIComponent(title);
        const res = await fetch(`${BASE_URL}/movie/search/${query}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const matches = [...html.matchAll(/href="(\/watch\/[^"]+)"/g)];
        if (!matches.length) return null;
        const yearStr = String(year);
        for (const m of matches) {
            if (m[1].includes(yearStr)) return m[1];
        }
        return matches[0][1];
    } catch {
        return null;
    }
}

async function extractInitParams(watchSlug) {
    try {
        const res = await fetch(`${BASE_URL}${watchSlug}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const match = html.match(/ng-init="init\('([^']+)',\s*'[^']+',\s*'([^']+)'/);
        if (!match) return null;
        return { token: match[1], trailer: match[2] };
    } catch {
        return null;
    }
}

async function fetchTmdbDetails(tmdbId) {
    const k = process.env.TMDB_API_KEY;
    if (!k) return null;
    try {
        const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${k}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const d = await res.json();
        return { imdbId: d.imdb_id || null, title: d.title || null, year: d.release_date ? d.release_date.slice(0, 4) : null };
    } catch {
        return null;
    }
}

export async function getStream(id, s) {
    if (s != null) return null;
    try {
        const details = await fetchTmdbDetails(id);
        if (!details?.title) return null;

        const watchSlug = await findWatchSlug(details.imdbId, details.title, details.year);
        if (!watchSlug) return null;

        const params = await extractInitParams(watchSlug);
        if (!params) return null;

        const apiUrl = `${BASE_URL}/api/source/${params.token}?trailer=${params.trailer}&type=watch`;

        const res = await fetch(apiUrl, {
            headers: {
                ...HEADERS,
                'Accept': 'application/json, text/plain, */*',
                'Referer': `${BASE_URL}${watchSlug}`,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;

        const json = await res.json();
        if (json.status !== 'ok') return null;

        const urls = pickBestUrls(json);
        if (!urls.length) return null;

        const refererHeaders = {
            ...HEADERS,
            'Referer': 'https://fsharetv.co/',
        };

        return {
            allUrls: urls.map(url => ({ url, headers: refererHeaders, skipProxy: false })),
        };
    } catch (e) {
        return null;
    }
}