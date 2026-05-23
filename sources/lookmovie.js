const BASE = 'https://lmscript.xyz';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const LM_BASE = 'https://www.lookmovie2.to';

export const SKIP_VERIFY = true;
export const MULTI_URL = true;
export const VERIFY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.lookmovie2.to/',
};

const HEADERS = { ...VERIFY_HEADERS };

async function searchMatch(type, title, tmdbId) {
    for (let page = 1; page <= 5; page++) {
        const res = await fetch(
            `${BASE}/v1/${type}?filters[q]=${encodeURIComponent(title)}&page=${page}`,
            { headers: HEADERS, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const items = data?.items;
        if (!items?.length) return null;
        const match = items.find(item =>
            String(item.tmdb_prefix) === String(tmdbId) ||
            String(item.tmdb_id) === String(tmdbId)
        );
        if (match) return match;
        if (data?._meta?.pageCount <= page) return null;
    }
    return null;
}

async function getShowSlug(title, year) {
    const res = await fetch(
        `${LM_BASE}/api/v1/shows/do-search/?q=${encodeURIComponent(title)}`,
        { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.result;
    if (!results?.length) return null;
    const match = results.find(r =>
        String(r.year) === String(year) ||
        r.title.toLowerCase() === title.toLowerCase()
    );
    return match?.slug || results[0]?.slug;
}

async function getHashAndExpires(slug) {
    const res = await fetch(
        `${LM_BASE}/shows/play/${slug}`,
        {
            headers: {
                ...HEADERS,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(10000)
        }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const hashMatch = html.match(/hash:\s*'([^']+)'/);
    const expiresMatch = html.match(/expires:\s*(\d+)/);
    if (!hashMatch || !expiresMatch) return null;
    return { hash: hashMatch[1], expires: expiresMatch[1] };
}

export async function getStream(id, s = null, e = null, clientIP = null, effectiveBase = '') {
    try {
        const tmdbKey = process.env.TMDB_API_KEY;
        if (!tmdbKey) return null;

        const isTV = s != null && e != null;

        const tmdbRes = await fetch(
            isTV
                ? `${TMDB_BASE}/tv/${id}?api_key=${tmdbKey}`
                : `${TMDB_BASE}/movie/${id}?api_key=${tmdbKey}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!tmdbRes.ok) return null;
        const tmdbData = await tmdbRes.json();
        const title = tmdbData?.title || tmdbData?.name;
        const year = (tmdbData?.first_air_date || tmdbData?.release_date || '').slice(0, 4);
        if (!title) return null;

        const match = await searchMatch(isTV ? 'shows' : 'movies', title, id);
        if (!match) return null;

        let streamId = null;

        if (isTV) {
            const showId = match.id_show ?? match.id;
            const showRes = await fetch(
                `${BASE}/v1/shows?expand=episodes&id=${showId}`,
                { headers: HEADERS, signal: AbortSignal.timeout(8000) }
            );
            if (!showRes.ok) return null;
            const showData = await showRes.json();
            const episodes = showData?.items?.[0]?.episodes ?? showData?.episodes ?? [];
            const ep = episodes.find(ep =>
                Number(ep.season) === Number(s) && Number(ep.episode) === Number(e)
            );
            if (!ep) return null;
            streamId = ep.id_episode ?? ep.id;

            const slug = match.slug ?? match.id_show ?? match.id;
            const slugRes = await getShowSlug(title, year);
            if (!slugRes) return null;

            const tokens = await getHashAndExpires(slugRes);
            if (!tokens) return null;

            const accessRes = await fetch(
                `${LM_BASE}/api/v1/security/episode-access?id_episode=${streamId}&hash=${tokens.hash}&expires=${tokens.expires}`,
                {
                    headers: {
                        ...HEADERS,
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    signal: AbortSignal.timeout(10000)
                }
            );
            if (!accessRes.ok) return null;
            const accessData = await accessRes.json();
            if (!accessData?.success) return null;

            const streams = accessData?.streams;
            if (!streams) return null;

            const allUrls = Object.entries(streams)
                .filter(([k, v]) => v && typeof v === 'string' && v.startsWith('http'))
                .map(([, v]) => v);
            if (!allUrls.length) return null;

            return { allUrls };

        } else {
            streamId = match.id_movie ?? match.id;

            const viewRes = await fetch(
                `${BASE}/v1/movies/view?expand=streams&id=${streamId}`,
                { headers: HEADERS, signal: AbortSignal.timeout(10000) }
            );
            if (!viewRes.ok) return null;
            const viewData = await viewRes.json();
            const streams = viewData?.streams;
            if (!streams) return null;

            const allUrls = Object.entries(streams)
                .filter(([k, v]) => /^\d+p$/.test(k) && v && typeof v === 'string' && v.startsWith('http'))
                .map(([, v]) => v);
            if (!allUrls.length) return null;

            return { allUrls };
        }

    } catch {
        return null;
    }
}