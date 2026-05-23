const TMDB_BASE = 'https://api.themoviedb.org/3';
const LM_DOMAINS = ['https://www.lookmovie2.to', 'https://lookmovie2.to', 'https://lookmovie.foundation'];

export const SKIP_VERIFY = true;
export const MULTI_URL = true;
export const VERIFY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function searchLookMovie(type, title, year, clientIP) {
    const endpoint = type === 'shows' ? 'shows' : 'movies';
    for (const base of LM_DOMAINS) {
        try {
            const headers = {
                ...VERIFY_HEADERS,
                'Accept': 'application/json, text/plain, */*',
                'Referer': `${base}/`,
                'Origin': base,
                'X-Requested-With': 'XMLHttpRequest'
            };
            if (clientIP) headers['X-Forwarded-For'] = clientIP;

            const res = await fetch(
                `${base}/api/v1/${endpoint}/do-search/?q=${encodeURIComponent(title)}`,
                { headers, signal: AbortSignal.timeout(5000) }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const results = data?.result;
            if (!results?.length) continue;

            let exact = results.find(r => String(r.year) === String(year));
            if (!exact) exact = results.find(r => r.title?.toLowerCase() === title.toLowerCase());

            const match = exact ?? results[0];
            if (match) return { match, base };
        } catch { }
    }
    return null;
}

async function getPlayPageData(base, slug, type, clientIP) {
    const path = type === 'shows' ? 'shows' : 'movies';
    try {
        const headers = {
            ...VERIFY_HEADERS,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `${base}/`,
        };
        if (clientIP) headers['X-Forwarded-For'] = clientIP;

        const res = await fetch(
            `${base}/${path}/play/${slug}`,
            { headers, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const html = await res.text();

        const hashMatch = html.match(/['"]?hash['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
        const expiresMatch = html.match(/['"]?expires['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
        if (!hashMatch || !expiresMatch) return null;
        return { html, hash: hashMatch[1], expires: expiresMatch[1] };
    } catch {
        return null;
    }
}

async function getEpisodeId(html, s, e) {
    const parts = html.split(/id_episode['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
    for (let i = 1; i < parts.length; i += 2) {
        const id = parts[i];
        const context = (parts[i - 1].slice(-300) + parts[i + 1].slice(0, 300));
        const epM = context.match(/['"]?episode['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
        const seM = context.match(/['"]?season['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
        if (epM && seM && String(epM[1]) === String(e) && String(seM[1]) === String(s)) {
            return id;
        }
    }

    try {
        const arrMatch = html.match(/seasons\s*=\s*(\[.+?\])\s*;/s);
        if (arrMatch) {
            const seasons = JSON.parse(arrMatch[1]);
            const season = seasons.find(x => String(x?.meta?.season) === String(s) || String(x?.season) === String(s));
            if (season) {
                const eps = season.episodes;
                const ep = Array.isArray(eps)
                    ? eps.find(x => String(x.episode) === String(e))
                    : (eps?.[String(e)] || Object.values(eps || {}).find(x => String(x.episode) === String(e)));
                if (ep) return ep.id_episode ?? ep.id ?? null;
            }
        }
    } catch { }

    try {
        const strMatch = html.match(/seasons\s*=\s*['"](.+?)['"]\s*;/s);
        if (strMatch) {
            const raw = strMatch[1].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            const seasons = JSON.parse(raw);
            const season = seasons.find(x => String(x?.meta?.season) === String(s) || String(x?.season) === String(s));
            if (season) {
                const eps = season.episodes;
                const ep = Array.isArray(eps)
                    ? eps.find(x => String(x.episode) === String(e))
                    : (eps?.[String(e)] || Object.values(eps || {}).find(x => String(x.episode) === String(e)));
                if (ep) return ep.id_episode ?? ep.id ?? null;
            }
        }
    } catch { }

    const attrMatch = html.match(new RegExp(`data-season=["']${s}["'][^>]*?data-episode=["']${e}["'][^>]*?data-id=["'](\\d+)["']`, 'i')) ||
        html.match(new RegExp(`data-episode=["']${e}["'][^>]*?data-season=["']${s}["'][^>]*?data-id=["'](\\d+)["']`, 'i'));
    if (attrMatch) return attrMatch[1];

    return null;
}

async function getMovieId(html) {
    const match = html.match(/['"]?(?:id_movie|movieId)['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
    return match ? match[1] : null;
}

async function getStreams(base, type, id, hash, expires, clientIP) {
    try {
        const endpoint = type === 'shows'
            ? `episode-access?id_episode=${id}`
            : `movie-access?id_movie=${id}`;

        const headers = {
            ...VERIFY_HEADERS,
            'Accept': 'application/json, text/plain, */*',
            'Referer': `${base}/`,
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (clientIP) headers['X-Forwarded-For'] = clientIP;

        const res = await fetch(
            `${base}/api/v1/security/${endpoint}&hash=${hash}&expires=${expires}`,
            { headers, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.success && !data?.streams) return null;
        const streams = data?.streams || data;
        if (!streams) return null;
        const allUrls = Object.entries(streams)
            .filter(([k, v]) => v && typeof v === 'string' && v.startsWith('http') && !k.toLowerCase().includes('auto'))
            .map(([, v]) => ({ url: v, skipHlsCheck: true }));
        if (!allUrls.length) return null;
        return { allUrls };
    } catch {
        return null;
    }
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

        const searchRes = await searchLookMovie(isTV ? 'shows' : 'movies', title, year, clientIP);
        if (!searchRes) return null;
        const { match, base } = searchRes;
        const slug = match.slug;
        if (!slug) return null;

        const pageData = await getPlayPageData(base, slug, isTV ? 'shows' : 'movies', clientIP);
        if (!pageData) return null;
        const { html, hash, expires } = pageData;

        if (isTV) {
            const streamId = await getEpisodeId(html, s, e);
            if (!streamId) return null;
            return await getStreams(base, 'shows', streamId, hash, expires, clientIP);
        } else {
            const movieId = match.id_movie || match.id || await getMovieId(html);
            if (!movieId) return null;
            return await getStreams(base, 'movies', movieId, hash, expires, clientIP);
        }

    } catch {
        return null;
    }
}