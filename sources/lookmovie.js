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
                'Accept': 'application/json',
                'Referer': `${base}/`,
                'X-Requested-With': 'XMLHttpRequest'
            };
            if (clientIP) headers['X-Forwarded-For'] = clientIP;

            const res = await fetch(
                `${base}/api/v1/${endpoint}/do-search/?q=${encodeURIComponent(title)}`,
                { headers, signal: AbortSignal.timeout(4000) }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const results = data?.result;
            if (!results?.length) continue;

            const match = results.find(r => String(r.year) === String(year)) ??
                results.find(r => r.title?.toLowerCase() === title.toLowerCase()) ??
                results[0];

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

        const storageMatch = html.match(/window\[['"](?:movie|show)_storage['"]\]\s*=\s*\{([^}]+)\}/);
        if (!storageMatch) return null;
        const block = storageMatch[1];

        const hashMatch = block.match(/hash\s*:\s*['"]([^'"]+)['"]/);
        const expiresMatch = block.match(/expires\s*:\s*(\d+)/);
        if (!hashMatch || !expiresMatch) return null;

        return { html, hash: hashMatch[1], expires: expiresMatch[1] };
    } catch {
        return null;
    }
}

async function getMovieId(html) {
    const storageMatch = html.match(/window\[['"]movie_storage['"]\]\s*=\s*\{([^}]+)\}/);
    if (storageMatch) {
        const idMatch = storageMatch[1].match(/id_movie\s*:\s*(\d+)/);
        if (idMatch) return idMatch[1];
    }
    const match = html.match(/['"]?(?:id_movie|movieId)['"]?\s*[:=]\s*['"]?(\d+)['"]?/i);
    return match ? match[1] : null;
}

async function getEpisodeId(html, s, e) {
    const storageMatch = html.match(/window\[['"]show_storage['"]\]\s*=\s*\{([^}]+)\}/s);
    if (storageMatch) {
        const block = storageMatch[1];
        const seasonMatch = block.match(/seasons\s*:\s*(\[[\s\S]+?\])\s*[,}]/);
        if (seasonMatch) {
            try {
                const seasons = JSON.parse(seasonMatch[1]);
                const season = seasons.find(x => String(x?.season ?? x?.meta?.season) === String(s));
                if (season) {
                    const eps = season.episodes;
                    const ep = Array.isArray(eps)
                        ? eps.find(x => String(x.episode) === String(e))
                        : (eps?.[String(e)] || Object.values(eps || {}).find(x => String(x.episode) === String(e)));
                    if (ep) return String(ep.id_episode ?? ep.id);
                }
            } catch { }
        }
    }

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

async function getStreams(base, type, streamId, hash, expires, clientIP) {
    const isShow = type === 'shows';
    const accessEndpoint = isShow
        ? `${base}/api/v1/security/episode-access?id_episode=${streamId}&hash=${hash}&expires=${expires}`
        : `${base}/api/v1/security/movie-access?id_movie=${streamId}&hash=${hash}&expires=${expires}`;

    try {
        const headers = {
            ...VERIFY_HEADERS,
            'Accept': 'application/json',
            'Referer': `${base}/`,
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (clientIP) headers['X-Forwarded-For'] = clientIP;

        const res = await fetch(accessEndpoint, { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();

        const streams = data?.streams ?? data?.result?.streams ?? data?.data?.streams ?? data;
        if (!streams || typeof streams !== 'object') return null;

        const allUrls = Object.entries(streams)
            .filter(([, v]) => typeof v === 'string' && v.includes('.m3u8'))
            .map(([quality, url]) => ({ url, quality, skipProxy: false, skipHlsCheck: true }));

        if (!allUrls.length) return null;
        return { allUrls };
    } catch (err) {
        console.error('[lookmovie] getStreams error:', err.message);
        return null;
    }
}

export async function getStream(id, s = null, e = null, clientIP = null, effectiveBase = '') {
    try {
        const tmdbKey = process.env.TMDB_API_KEY;
        if (!tmdbKey) return null;

        const isTV = s != null && e != null;
        const typeStr = isTV ? 'shows' : 'movies';

        const tmdbRes = await fetch(
            isTV
                ? `${TMDB_BASE}/tv/${id}?api_key=${tmdbKey}`
                : `${TMDB_BASE}/movie/${id}?api_key=${tmdbKey}`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (!tmdbRes.ok) return null;
        const tmdbData = await tmdbRes.json();
        const title = tmdbData?.title || tmdbData?.name;
        const year = (tmdbData?.first_air_date || tmdbData?.release_date || '').slice(0, 4);
        if (!title) return null;

        const searchRes = await searchLookMovie(typeStr, title, year, clientIP);
        if (!searchRes) return null;
        const { match, base } = searchRes;

        const slug = match.slug;
        if (!slug) return null;

        const pageData = await getPlayPageData(base, slug, typeStr, clientIP);
        if (!pageData) return null;
        const { html, hash, expires } = pageData;

        let streamId = null;
        if (isTV) {
            streamId = await getEpisodeId(html, s, e);
        } else {
            streamId = match.id_movie || match.id || await getMovieId(html);
        }

        if (!streamId) return null;
        return await getStreams(base, typeStr, streamId, hash, expires, clientIP);

    } catch {
        return null;
    }
}